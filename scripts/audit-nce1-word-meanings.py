import argparse
import json
import re
from pathlib import Path


root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description="Audit the generated NCE1 token analysis.")
parser.add_argument(
    "--output",
    default="reports/nce1-word-meaning-audit.json",
    help="JSON report path relative to the project root.",
)
args = parser.parse_args()


def normalize_key(text):
    value = str(text or "").strip().lower().replace("\u2019", "'").replace("\u2018", "'")
    value = re.sub(r"[.!?\u3002\uff01\uff1f]+$", "", value)
    value = re.sub(r"[,\.!?;:\"'()\[\]{}\uff0c\u3002\uff01\uff1f\uff1b\uff1a\u2018\u2019\u201c\u201d]", "", value)
    return re.sub(r"\s+", " ", value)


def protect_abbreviations(text):
    value = re.sub(r"\b(Mr|Mrs|Ms|Dr|St)\.", r"\1<dot>", text)
    value = re.sub(r"\b([A-Z])\.([A-Z])\.([A-Z])\.", r"\1<dot>\2<dot>\3<dot>", value)
    value = re.sub(r"\b([A-Z])\.([A-Z])\.", r"\1<dot>\2<dot>", value)
    value = re.sub(r"\b(a|p)\.m\.", r"\1<dot>m<dot>", value, flags=re.I)
    return value.replace("U.S.", "U<dot>S<dot>")


def expand_for_practice(text):
    parts = [part.replace("<dot>", ".").strip() for part in re.split(r"(?<=[.!?])\s+", protect_abbreviations(text))]
    parts = [part for part in parts if part]
    return parts if len(parts) >= 2 and (len(text) >= 120 or len(parts) >= 3) else [text]


source = (root / "index.html").read_text(encoding="utf-8")
marker = "window.NCE_LESSON_DATA = "
lessons, _ = json.JSONDecoder().raw_decode(source[source.index(marker) + len(marker):])
package = json.loads((root / "content/nce1-token-analysis.v1.json").read_text(encoding="utf-8"))
catalog = package.get("sentences", {})

expected = {}
for lesson in lessons:
    for sentence in lesson.get("sentences", []):
        for english in expand_for_practice(sentence["english"]):
            expected.setdefault(normalize_key(english), english)

issues = []
placeholder_terms = ("\u5f85\u8865\u91ca\u4e49", "\u5f85\u4eba\u5de5\u590d\u6838", "\u5f85\u8865")
for key, english in expected.items():
    entry = catalog.get(key)
    if not entry:
        issues.append({"type": "missing_sentence", "sentence": english})
        continue
    expected_count = len(re.sub(r"[.!?\u3002\uff01\uff1f]+$", "", english.strip()).split())
    tokens = entry.get("tokens", [])
    if len(tokens) != expected_count:
        issues.append({"type": "token_count", "sentence": english, "expected": expected_count, "actual": len(tokens)})
    for index, token in enumerate(tokens):
        translation = str(token.get("translation", "")).strip()
        phonetic = str(token.get("phonetic", "")).strip()
        if not translation or any(term in translation for term in placeholder_terms):
            issues.append({"type": "translation", "sentence": english, "tokenIndex": index, "token": token})
        if not phonetic or not phonetic.startswith("/") or "*" in phonetic:
            issues.append({"type": "phonetic", "sentence": english, "tokenIndex": index, "token": token})
        if not token.get("posLabel") or not token.get("posFamily"):
            issues.append({"type": "part_of_speech", "sentence": english, "tokenIndex": index, "token": token})

report = {
    "summary": {
        "lessonCount": len(lessons),
        "sentenceCount": len(expected),
        "tokenCount": sum(len(entry.get("tokens", [])) for entry in catalog.values()),
        "issueCount": len(issues),
    },
    "analysisRuleVersion": package.get("analysisRuleVersion"),
    "issues": issues,
}
output_path = root / args.output
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report["summary"], ensure_ascii=False))
print(f"Report: {output_path}")
if issues:
    raise SystemExit(1)
