#!/usr/bin/env python3
"""Generate the static NCE2 enriched content package from the validated raw package."""

import argparse
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import ctranslate2
import eng_to_ipa as ipa
import sentencepiece as spm
import stanza


ROOT = Path(__file__).resolve().parents[1]
POS_CODES = {
    "NOUN": ("noun", "名词"), "PROPN": ("noun", "专有名词"),
    "PRON": ("pronoun", "代词"), "VERB": ("verb", "动词"),
    "AUX": ("verb", "助动词"), "ADJ": ("adjective", "形容词"),
    "ADV": ("adverb", "副词"), "ADP": ("preposition", "介词"),
    "CCONJ": ("conjunction", "并列连词"), "SCONJ": ("conjunction", "从属连词"),
    "DET": ("determiner", "限定词"), "NUM": ("numeral", "数词"),
    "INTJ": ("interjection", "感叹词"), "PART": ("particle", "小品词"),
    "X": ("particle", "词项")
}
ROLE_PRIORITY = [
    "subject", "indirect_object", "direct_object", "object_clause",
    "relative_clause", "condition_clause", "reason_clause", "time_clause",
    "concession_clause", "purpose_clause", "result_clause", "predicative",
    "object_complement", "predicate", "adverbial", "vocative", "independent_element"
]
CLAUSE_MARKERS = {
    "if": "condition_clause", "unless": "condition_clause",
    "because": "reason_clause", "since": "reason_clause",
    "when": "time_clause", "while": "time_clause", "before": "time_clause", "after": "time_clause",
    "although": "concession_clause", "though": "concession_clause",
    "so": "result_clause", "that": "object_clause"
}
TRIM_CHARS = ".,!?;:\"'()[]{}<>，。！？；：‘’“”"


def translate_batch(texts, translator, processor, batch_size=64):
    translated = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        tokens = [processor.encode(text, out_type=str) for text in batch]
        results = translator.translate_batch(tokens, beam_size=1, max_batch_size=batch_size)
        translated.extend(processor.decode(result.hypotheses[0]) for result in results)
        print(f"translated {min(start + batch_size, len(texts))}/{len(texts)}", flush=True)
    return translated


def normalize_chinese(text):
    value = re.sub(r"\s+", "", str(text or "").strip())
    return (value.replace(",", "，").replace("!", "！").replace("?", "？")
            .replace(";", "；").replace(":", "：").replace(".", "。"))


def ui_tokens(text):
    tokens = []
    for index, match in enumerate(re.finditer(r"\S+", text)):
        raw = match.group(0)
        core = raw.strip(TRIM_CHARS)
        if not core:
            continue
        core_offset = raw.find(core)
        trailing = raw[core_offset + len(core):]
        tokens.append({
            "index": len(tokens), "raw": raw, "core": core,
            "start": match.start() + core_offset,
            "end": match.start() + core_offset + len(core),
            "punctuation": trailing
        })
    return tokens


def intrinsic_role(word, sentence):
    relation = word.deprel or ""
    if relation.startswith(("nsubj", "csubj")):
        return "subject"
    if relation == "iobj":
        return "indirect_object"
    if relation == "obj":
        return "direct_object"
    if relation in {"ccomp"}:
        return "object_clause"
    if relation == "xcomp":
        return "object_complement"
    if relation == "acl:relcl":
        return "relative_clause"
    if relation == "advcl":
        markers = {child.text.lower() for child in sentence.words if child.head == word.id and child.deprel == "mark"}
        for marker in markers:
            if marker in CLAUSE_MARKERS:
                return CLAUSE_MARKERS[marker]
        return "adverbial"
    if relation.startswith(("obl", "advmod", "npadvmod")) or relation == "nmod:tmod":
        return "adverbial"
    if relation == "vocative":
        return "vocative"
    if relation in {"discourse", "parataxis"}:
        return "independent_element"
    if relation in {"aux", "aux:pass", "cop"}:
        return "predicate"
    if relation == "root":
        has_copula = any(child.head == word.id and child.deprel == "cop" for child in sentence.words)
        if has_copula and word.upos in {"ADJ", "NOUN", "PROPN", "PRON", "NUM"}:
            return "predicative"
        if word.upos in {"VERB", "AUX"}:
            return "predicate"
        return "independent_element"
    return None


def role_for_word(word, sentence):
    words = {item.id: item for item in sentence.words}
    current = word
    visited = set()
    while current and current.id not in visited:
        visited.add(current.id)
        role = intrinsic_role(current, sentence)
        if role:
            return role
        current = words.get(current.head)
    return "independent_element"


def analyze_sentence(doc, items):
    word_entries = []
    for sentence in doc.sentences:
        for token in sentence.tokens:
            roles = [role_for_word(word, sentence) for word in token.words]
            upos = [word.upos for word in token.words if word.upos != "PUNCT"]
            word_entries.append({
                "start": token.start_char, "end": token.end_char,
                "roles": roles, "upos": upos
            })

    token_roles = []
    token_pos = []
    for item in items:
        overlaps = [entry for entry in word_entries if entry["start"] < item["end"] and entry["end"] > item["start"]]
        roles = [role for entry in overlaps for role in entry["roles"]]
        upos = [code for entry in overlaps for code in entry["upos"]]
        role_counts = Counter(roles)
        role = next((candidate for candidate in ROLE_PRIORITY if role_counts[candidate]), "independent_element")
        pos = next((candidate for candidate in upos if candidate not in {"PUNCT"}), "X")
        token_roles.append(role)
        token_pos.append(pos)

    groups = []
    start = 0
    while start < len(token_roles):
        role = token_roles[start]
        end = start
        while end + 1 < len(token_roles) and token_roles[end + 1] == role:
            end += 1
        groups.append((role, start, end))
        start = end + 1
    return token_pos, groups


def phonetic_for(word):
    value = ipa.convert(word.lower()).strip()
    if not value or "*" in value:
        return "/—/"
    return f"/{value}/"


def letter_shape(text):
    return re.sub(r"[A-Za-z]+", lambda match: match.group(0)[0] + "_" * (len(match.group(0)) - 1), text)


def memory_note(lesson, english):
    scene = lesson.get("titleZh") or lesson["title"]
    if english.rstrip().endswith("?"):
        return f"回到“{scene}”里，想想他在追问什么。"[:48]
    if english.rstrip().endswith("!"):
        return f"回到“{scene}”的画面，把语气带出来。"[:48]
    if any(mark in english for mark in ["'", "‘", "“"]):
        return f"像课文人物当面开口，回想这句对白。"[:48]
    return f"沿着“{scene}”里的画面顺序往下想。"[:48]


def answer_note(chinese):
    compact = chinese.strip("。！？")
    return f"记住它：这句在课文里表达“{compact}”。"[:80]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(ROOT / "content/nce2.raw.v1.json"))
    parser.add_argument("--output", default=str(ROOT / "content/nce2.enriched.v1.json"))
    parser.add_argument("--translation-model", required=True)
    parser.add_argument("--stanza-dir", required=True)
    args = parser.parse_args()

    package = json.loads(Path(args.input).read_text(encoding="utf-8"))
    sentences = [sentence for lesson in package["lessons"] for sentence in lesson["sentences"]]
    english_texts = [sentence["english"] for sentence in sentences]

    processor = spm.SentencePieceProcessor(model_file=str(Path(args.translation_model) / "sentencepiece.model"))
    translator = ctranslate2.Translator(str(Path(args.translation_model) / "model"), device="cpu", compute_type="int8")
    chinese_texts = [normalize_chinese(text) for text in translate_batch(english_texts, translator, processor)]

    nlp = stanza.Pipeline(
        "en", model_dir=args.stanza_dir, processors="tokenize,pos,lemma,depparse",
        use_gpu=False, verbose=False, tokenize_no_ssplit=True
    )
    docs = nlp.bulk_process(english_texts)

    unique_words = sorted({item["core"].lower() for text in english_texts for item in ui_tokens(text)})
    word_meanings = dict(zip(unique_words, [normalize_chinese(text) for text in translate_batch(unique_words, translator, processor, 128)]))
    word_phonetics = {word: phonetic_for(word) for word in unique_words}

    cursor = 0
    for lesson in package["lessons"]:
        for sentence in lesson["sentences"]:
            chinese = chinese_texts[cursor]
            items = ui_tokens(sentence["english"])
            token_pos, group_spans = analyze_sentence(docs[cursor], items)
            sentence["chinese"] = chinese
            sentence["translationStatus"] = "generated"
            sentence["acceptedAnswers"] = [sentence["english"]]
            sentence["difficulty"] = min(5, max(1, (len(items) + 5) // 6))
            sentence["analysisSource"] = "ai"
            sentence["analysisStatus"] = "generated"
            sentence["analysisRuleVersion"] = "nce2-stanza-1.0.0"
            sentence["reviewNote"] = "复杂句建议人工复核" if len(items) > 24 or len(docs[cursor].sentences) > 1 else None
            sentence["tokens"] = []
            for item, upos in zip(items, token_pos):
                normalized = item["core"].lower().replace("’", "'")
                pos_code, pos_label = POS_CODES.get(upos, POS_CODES["X"])
                sentence["tokens"].append({
                    "tokenId": f"{sentence['sentenceId']}-token-{item['index']:03d}",
                    "tokenIndex": item["index"],
                    "displayText": item["core"],
                    "normalizedText": normalized,
                    "punctuation": item["punctuation"],
                    "phonetic": word_phonetics.get(normalized, "/—/"),
                    "posCode": pos_code,
                    "posLabel": pos_label,
                    "contextMeaning": word_meanings.get(normalized) or pos_label
                })
            sentence["groups"] = [{
                "groupId": f"{sentence['sentenceId']}-group-{index:03d}",
                "type": role,
                "label": None,
                "startToken": start,
                "endToken": end,
                "parentGroupId": None
            } for index, (role, start, end) in enumerate(group_spans)]
            sentence["hints"] = {
                "memoryNote": memory_note(lesson, sentence["english"]),
                "letterShape": letter_shape(sentence["english"]),
                "answerNote": answer_note(chinese)
            }
            cursor += 1

    package["stage"] = "enriched"
    package["generatorVersion"] = "nce2-enrichment-1.0.0"
    package["generatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    Path(args.output).write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(sentences)} enriched sentences to {args.output}")


if __name__ == "__main__":
    main()
