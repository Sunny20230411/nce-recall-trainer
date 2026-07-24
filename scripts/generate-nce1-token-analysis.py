#!/usr/bin/env python3
"""Generate static NCE1 token phonetics, POS labels, and contextual meanings."""

import argparse
import csv
import json
import re
from pathlib import Path

import eng_to_ipa as ipa
import stanza


ROOT = Path(__file__).resolve().parents[1]
POS_LABELS = {
    "NOUN": ("noun", "名词"),
    "PROPN": ("noun", "专有名词"),
    "PRON": ("pronoun", "代词"),
    "VERB": ("verb", "动词"),
    "AUX": ("verb", "助动词"),
    "ADJ": ("adjective", "形容词"),
    "ADV": ("adverb", "副词"),
    "ADP": ("preposition", "介词"),
    "CCONJ": ("conjunction", "并列连词"),
    "SCONJ": ("conjunction", "从属连词"),
    "DET": ("determiner", "限定词"),
    "NUM": ("numeral", "数词"),
    "INTJ": ("interjection", "感叹词"),
    "PART": ("particle", "小品词"),
    "X": ("particle", "单词"),
}
POS_PREFIXES = {
    "NOUN": ("n.",),
    "PROPN": ("n.",),
    "PRON": ("pron.",),
    "VERB": ("v.", "vt.", "vi."),
    "AUX": ("aux.", "v."),
    "ADJ": ("a.", "adj."),
    "ADV": ("adv.",),
    "ADP": ("prep.",),
    "CCONJ": ("conj.",),
    "SCONJ": ("conj.",),
    "DET": ("art.", "det."),
    "NUM": ("num.",),
    "INTJ": ("interj.", "int."),
}
MEANING_OVERRIDES = {
    "i": "我", "you": "你/您", "he": "他", "she": "她", "it": "它/这件事",
    "we": "我们", "they": "他们/她们", "me": "我", "him": "他", "her": "她/她的",
    "us": "我们", "them": "他们/她们", "my": "我的", "your": "你的/您的",
    "his": "他的", "our": "我们的", "their": "他们的", "its": "它的",
    "a": "一个", "an": "一个", "the": "这/那", "this": "这/这个", "that": "那/那个",
    "these": "这些", "those": "那些", "some": "一些", "any": "一些/任何", "no": "不/没有",
    "is": "是", "am": "是", "are": "是", "was": "曾是", "were": "曾是",
    "be": "是/处于", "been": "曾经是", "being": "正在处于",
    "have": "有", "has": "有", "had": "有/已经", "do": "做/助动词", "does": "做/助动词",
    "did": "做过/助动词", "can": "能/可以", "could": "能/可以", "may": "可能/可以",
    "might": "可能", "must": "必须", "shall": "将要", "should": "应该", "will": "将会",
    "would": "会/愿意", "to": "到/去/向", "of": "……的", "in": "在……里", "on": "在……上",
    "at": "在", "for": "为了/给", "from": "从", "with": "和/带着", "by": "由/乘坐",
    "and": "和/并且", "but": "但是", "or": "或者", "if": "如果", "because": "因为",
    "so": "所以/如此", "not": "不", "very": "非常", "too": "也/太", "there": "那里/有",
    "here": "这里/给你", "yes": "是的", "please": "请", "sir": "先生", "madam": "女士",
    "mr": "先生", "mrs": "太太", "miss": "小姐", "a.m": "上午", "p.m": "下午",
    "i'm": "我是", "you're": "你是", "he's": "他是/他有", "she's": "她是/她有",
    "it's": "它是/它有", "we're": "我们是", "they're": "他们是", "i've": "我已经",
    "you've": "你已经", "we've": "我们已经", "they've": "他们已经", "i'll": "我将会",
    "you'll": "你将会", "he'll": "他将会", "she'll": "她将会", "we'll": "我们将会",
    "they'll": "他们将会", "i'd": "我会/我曾", "you'd": "你会/你曾", "he'd": "他会/他曾",
    "she'd": "她会/她曾", "we'd": "我们会/我们曾", "they'd": "他们会/他们曾",
    "isn't": "不是", "aren't": "不是", "wasn't": "曾经不是", "weren't": "曾经不是",
    "don't": "不/不要", "doesn't": "不", "didn't": "没有", "can't": "不能",
    "couldn't": "不能", "won't": "不会", "wouldn't": "不会/不愿", "shouldn't": "不应该",
    "mustn't": "不准/禁止", "haven't": "还没有", "hasn't": "还没有", "hadn't": "此前没有",
    "there's": "有/那里是", "here's": "这是/给你", "that's": "那是", "what's": "是什么",
    "who's": "是谁", "where's": "在哪里", "how's": "怎么样", "let's": "让我们",
    "name's": "名字是", "what'll": "将会怎样", "who'll": "谁将会",
    "excuse": "原谅/打扰", "pardon": "请再说一遍", "sorry": "抱歉", "thank": "感谢",
    "good": "好的", "much": "很/非常", "look": "看", "cream": "奶油/冰淇淋",
    "about": "关于/大约", "after": "在……之后", "before": "在……之前", "up": "向上/起来",
    "down": "向下/下来", "make": "做/制作", "made": "做成/使", "get": "得到/变得",
    "got": "得到/变得", "last": "上一个/最后的", "well": "好/那么", "right": "对的/好吧",
    "take": "拿/带", "took": "拿了/带走", "put": "放", "give": "给", "gave": "给了",
    "find": "找到", "found": "找到了", "say": "说", "said": "说了", "tell": "告诉",
    "told": "告诉了", "leave": "离开/留下", "left": "离开了/左边",
}
PHONETIC_OVERRIDES = {
    "a": "/ə/", "an": "/ən/", "the": "/ðə/", "i": "/aɪ/", "mr": "/ˈmɪstə/",
    "mrs": "/ˈmɪsɪz/", "a.m": "/ˌeɪ ˈem/", "p.m": "/ˌpiː ˈem/",
}
TOKEN_METADATA_OVERRIDES = {
    "here's": ("verb", "动词短语"), "there's": ("verb", "动词短语"),
    "i'm": ("verb", "代词＋系动词"), "you're": ("verb", "代词＋系动词"),
    "he's": ("verb", "代词＋系动词"), "she's": ("verb", "代词＋系动词"),
    "it's": ("verb", "代词＋系动词"), "we're": ("verb", "代词＋系动词"),
    "they're": ("verb", "代词＋系动词"), "isn't": ("verb", "系动词否定"),
    "aren't": ("verb", "系动词否定"), "wasn't": ("verb", "系动词否定"),
    "weren't": ("verb", "系动词否定"), "don't": ("verb", "助动词否定"),
    "doesn't": ("verb", "助动词否定"), "didn't": ("verb", "助动词否定"),
    "can't": ("verb", "情态动词否定"), "couldn't": ("verb", "情态动词否定"),
    "won't": ("verb", "情态动词否定"), "wouldn't": ("verb", "情态动词否定"),
    "shouldn't": ("verb", "情态动词否定"), "mustn't": ("verb", "情态动词否定"),
    "haven't": ("verb", "助动词否定"), "hasn't": ("verb", "助动词否定"),
    "hadn't": ("verb", "助动词否定"), "let's": ("verb", "祈使结构"),
    "pardon": ("interjection", "感叹词"), "please": ("adverb", "副词"),
}
TRIM_CHARS = ".,!?;:\"'()[]{}<>，。！？；：‘’“”"


def extract_json_assignment(source, name):
    marker = f"window.{name} = "
    start = source.index(marker) + len(marker)
    return json.JSONDecoder().raw_decode(source[start:])[0]


def extract_js_array(source, name):
    marker = f"window.{name} = "
    start = source.index(marker) + len(marker)
    depth = 0
    quote = None
    escaped = False
    end = None
    for index, char in enumerate(source[start:], start=start):
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {'"', "'"}:
            quote = char
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    if end is None:
        raise RuntimeError(f"Unterminated {name}")
    literal = source[start:end]
    literal = re.sub(r"(?m)([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)", r'\1"\2"\3', literal)
    return json.loads(literal)


def normalize_key(text):
    value = str(text or "").strip().lower().replace("’", "'").replace("‘", "'")
    value = re.sub(r"[.!?。！？]+$", "", value)
    value = re.sub(r"[,\.!?;:\"'()\[\]{}，。！？；：‘’“”]", "", value)
    return re.sub(r"\s+", " ", value)


def protect_abbreviations(text):
    value = re.sub(r"\b(Mr|Mrs|Ms|Dr|St)\.", r"\1<dot>", text)
    value = re.sub(r"\b([A-Z])\.([A-Z])\.([A-Z])\.", r"\1<dot>\2<dot>\3<dot>", value)
    value = re.sub(r"\b([A-Z])\.([A-Z])\.", r"\1<dot>\2<dot>", value)
    value = re.sub(r"\b(a|p)\.m\.", r"\1<dot>m<dot>", value, flags=re.I)
    return value.replace("U.S.", "U<dot>S<dot>")


def expand_for_practice(text):
    protected = protect_abbreviations(text)
    parts = [part.replace("<dot>", ".").strip() for part in re.split(r"(?<=[.!?])\s+", protected)]
    parts = [part for part in parts if part]
    if len(parts) < 2 or (len(text) < 120 and len(parts) < 3):
        return [text]
    return parts


def display_tokens(text):
    cleaned = re.sub(r"[.!?。！？]+$", "", text.strip())
    tokens = []
    for index, match in enumerate(re.finditer(r"\S+", cleaned)):
        raw = match.group(0)
        core = raw.strip(TRIM_CHARS)
        if not core:
            core = raw
        offset = raw.find(core)
        trailing = raw[offset + len(core):] if offset >= 0 else ""
        tokens.append({
            "order": index,
            "raw": raw,
            "core": core,
            "start": match.start() + max(offset, 0),
            "end": match.start() + max(offset, 0) + len(core),
            "punctuation": trailing,
        })
    return tokens


def load_dictionary(path):
    entries = {}
    with Path(path).open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            word = (row.get("word") or "").strip().lower()
            if word:
                entries[word] = row
    return entries


def clean_candidates(translation, upos):
    normalized = str(translation or "").replace("\\n", "\n")
    lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    prefixes = POS_PREFIXES.get(upos, ())
    matching = [line for line in lines if any(line.lower().startswith(prefix) for prefix in prefixes)]
    selected = matching or lines
    candidates = []
    for line in selected:
        line = re.sub(r"^\[[^\]]+\]\s*", "", line)
        line = re.sub(r"^(?:n|v|vt|vi|aux|pron|a|adj|adv|prep|conj|art|det|num|interj|int)\.\s*", "", line, flags=re.I)
        for part in re.split(r"[;,；，]", line):
            value = re.sub(r"\([^)]*\)", "", part).strip(" -/\t")
            value = re.sub(r"\.{2,}.*$", "", value).strip()
            if value and value not in candidates and len(value) <= 24:
                candidates.append(value)
    return candidates


def contextual_meaning(core, lemma, upos, chinese, dictionary):
    key = core.lower().replace("’", "'").replace("‘", "'").strip(TRIM_CHARS)
    if key in MEANING_OVERRIDES:
        return MEANING_OVERRIDES[key], "override"
    if key.endswith("'s"):
        base = key[:-2]
        if base == "name":
            return "名字是", "override"
        base_entry = dictionary.get(base)
        base_candidates = clean_candidates(base_entry.get("translation", "") if base_entry else "", "NOUN")
        return ((base_candidates[0] if base_candidates else base.title()) + "的/是"), "derived"
    if re.fullmatch(r"[£$]?\d[\d,]*(?:\.\d+)?", key):
        return "数字/金额", "derived"
    lemma_key = (lemma or "").lower().replace("’", "'").replace("‘", "'")
    entries = []
    for entry_key in (key, lemma_key):
        if entry_key and entry_key in dictionary and entry_key not in [item[0] for item in entries]:
            entries.append((entry_key, dictionary[entry_key]))
    candidates_by_entry = [(entry_key, clean_candidates(entry.get("translation", ""), upos)) for entry_key, entry in entries]
    compact_chinese = re.sub(r"\s+", "", chinese or "")
    contextual = [candidate for _, candidates in candidates_by_entry for candidate in candidates if candidate and candidate in compact_chinese]
    if contextual:
        return max(contextual, key=len), "dictionary-context"
    if upos == "PROPN":
        return "人名/地名", "derived"
    if lemma_key != key:
        lemma_candidates = next((candidates for entry_key, candidates in candidates_by_entry if entry_key == lemma_key), [])
        if lemma_candidates:
            return lemma_candidates[0], "dictionary-lemma"
    for _, candidates in candidates_by_entry:
        if candidates:
            return candidates[0], "dictionary"
    return "", "missing"


def phonetic_for(core, lemma, dictionary):
    key = core.lower().replace("’", "'").replace("‘", "'").strip(TRIM_CHARS)
    if key in PHONETIC_OVERRIDES:
        return PHONETIC_OVERRIDES[key]
    converted = ipa.convert(key).strip()
    if converted and "*" not in converted:
        return f"/{converted}/"
    if key.endswith("'s"):
        converted = ipa.convert(key[:-2]).strip()
        if converted and "*" not in converted:
            return f"/{converted}z/"
    entry = dictionary.get(key) or dictionary.get((lemma or "").lower())
    raw = (entry or {}).get("phonetic", "").strip()
    return f"/{raw}/" if raw else f"/{key}/"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dictionary", required=True)
    parser.add_argument("--stanza-dir", required=True)
    parser.add_argument("--output", default=str(ROOT / "content/nce1-token-analysis.v1.json"))
    args = parser.parse_args()

    source = (ROOT / "index.html").read_text(encoding="utf-8")
    lessons = extract_json_assignment(source, "NCE_LESSON_DATA")
    overrides = extract_js_array(source, "NCE_ZH_OVERRIDES")
    override_map = {int(item["lessonNo"]): item.get("sentences", []) for item in overrides}

    sentence_records = {}
    for lesson in lessons:
        chinese_items = override_map.get(int(lesson["lessonNo"]), [])
        for sentence_index, sentence in enumerate(lesson.get("sentences", [])):
            chinese = chinese_items[sentence_index] if sentence_index < len(chinese_items) else sentence.get("chinese", "")
            for english in expand_for_practice(sentence["english"]):
                sentence_records.setdefault(normalize_key(english), {"english": english, "chinese": chinese})

    dictionary = load_dictionary(args.dictionary)
    nlp = stanza.Pipeline(
        "en",
        model_dir=args.stanza_dir,
        processors="tokenize,pos,lemma",
        use_gpu=False,
        verbose=False,
        tokenize_no_ssplit=True,
    )
    records = list(sentence_records.values())
    docs = nlp.bulk_process([record["english"] for record in records])
    output_sentences = {}
    missing = []
    source_counts = {}

    for record, doc in zip(records, docs):
        word_entries = []
        for sentence in doc.sentences:
            for token in sentence.tokens:
                words = [word for word in token.words if word.upos != "PUNCT"]
                if not words:
                    continue
                preferred = next((word for word in words if word.upos not in {"PART", "X"}), words[0])
                word_entries.append({
                    "start": token.start_char,
                    "end": token.end_char,
                    "upos": preferred.upos,
                    "lemma": preferred.lemma or preferred.text,
                })

        tokens = []
        for item in display_tokens(record["english"]):
            overlaps = [entry for entry in word_entries if entry["start"] < item["end"] and entry["end"] > item["start"]]
            entry = max(overlaps, key=lambda candidate: min(candidate["end"], item["end"]) - max(candidate["start"], item["start"])) if overlaps else None
            upos = entry["upos"] if entry else "X"
            lemma = entry["lemma"] if entry else item["core"]
            normalized_core = item["core"].lower().replace("’", "'").replace("‘", "'").strip(TRIM_CHARS)
            pos_family, pos_label = TOKEN_METADATA_OVERRIDES.get(normalized_core, POS_LABELS.get(upos, POS_LABELS["X"]))
            meaning, meaning_source = contextual_meaning(item["core"], lemma, upos, record["chinese"], dictionary)
            if not meaning:
                missing.append({"sentence": record["english"], "token": item["core"], "upos": upos})
                meaning = "待人工复核"
            source_counts[meaning_source] = source_counts.get(meaning_source, 0) + 1
            tokens.append({
                "order": item["order"],
                "displayText": item["core"],
                "punctuation": item["punctuation"],
                "phonetic": phonetic_for(item["core"], lemma, dictionary),
                "translation": meaning,
                "posFamily": pos_family,
                "posLabel": pos_label,
                "meaningSource": meaning_source,
            })
        output_sentences[normalize_key(record["english"])] = {"tokens": tokens}

    package = {
        "courseId": "nce-1",
        "revision": 2,
        "analysisSource": "generated",
        "analysisRuleVersion": "nce1-token-ecdict-stanza-1.0.0",
        "dictionarySource": "ECDICT",
        "sentences": output_sentences,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated token analysis for {len(output_sentences)} sentences at {output_path}")
    print("Meaning sources:", json.dumps(source_counts, ensure_ascii=False, sort_keys=True))
    if missing:
        print(json.dumps(missing[:50], ensure_ascii=False, indent=2))
        raise SystemExit(f"Unresolved token meanings: {len(missing)}")


if __name__ == "__main__":
    main()
