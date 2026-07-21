#!/usr/bin/env python3
"""Replace NCE2 sentence translations with a higher-quality Marian model."""

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import ctranslate2
from transformers import AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]


def normalize_chinese(text):
    value = re.sub(r"\s+", "", str(text or "").strip()).replace("▁", "")
    return (value.replace(",", "，").replace("!", "！").replace("?", "？")
            .replace(";", "；").replace(":", "：").replace(".", "。"))


def answer_note(chinese):
    compact = chinese.strip("。！？")
    return f"记住它：这句在课文里表达“{compact}”。"[:80]


def suspicious_translation(english, chinese):
    if not chinese or not re.search(r"[\u3400-\u9fff]", chinese):
        return True
    if len(chinese) > max(80, len(english) * 3):
        return True
    return bool(re.search(r"(.{2,8})\1\1", chinese))


def translate_all(texts, tokenizer, translator, batch_size=32):
    translated = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        source_tokens = [tokenizer.convert_ids_to_tokens(tokenizer.encode(text)) for text in batch]
        results = translator.translate_batch(
            source_tokens,
            beam_size=4,
            repetition_penalty=1.2,
            no_repeat_ngram_size=3,
            max_decoding_length=180,
            max_batch_size=batch_size
        )
        for result in results:
            token_ids = tokenizer.convert_tokens_to_ids(result.hypotheses[0])
            translated.append(normalize_chinese(tokenizer.decode(token_ids, skip_special_tokens=True)))
        print(f"retranslated {min(start + batch_size, len(texts))}/{len(texts)}", flush=True)
    return translated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(ROOT / "content/nce2.enriched.v1.json"))
    parser.add_argument("--output", default=str(ROOT / "content/nce2.enriched.v1.json"))
    parser.add_argument("--model", required=True)
    parser.add_argument("--tokenizer", default="Helsinki-NLP/opus-mt-en-zh")
    args = parser.parse_args()

    package = json.loads(Path(args.input).read_text(encoding="utf-8"))
    sentences = [sentence for lesson in package["lessons"] for sentence in lesson["sentences"]]
    english_texts = [sentence["english"] for sentence in sentences]
    tokenizer = AutoTokenizer.from_pretrained(args.tokenizer)
    translator = ctranslate2.Translator(args.model, device="cpu", compute_type="int8")
    chinese_texts = translate_all(english_texts, tokenizer, translator)

    flagged = 0
    for sentence, chinese in zip(sentences, chinese_texts):
        sentence["chinese"] = chinese
        sentence["translationStatus"] = "generated"
        sentence["hints"]["answerNote"] = answer_note(chinese)
        if suspicious_translation(sentence["english"], chinese):
            flagged += 1
            existing = sentence.get("reviewNote")
            note = "机器翻译输出需人工复核"
            sentence["reviewNote"] = f"{existing}；{note}" if existing and note not in existing else note

    package["generatorVersion"] = "nce2-enrichment-1.1.0-marian"
    package["generatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    Path(args.output).write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(sentences)} translations; flagged {flagged} for review")


if __name__ == "__main__":
    main()
