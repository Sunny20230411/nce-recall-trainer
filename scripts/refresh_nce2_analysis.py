import argparse
import json
from pathlib import Path

import stanza

from enrich_nce2_content import POS_CODES, analyze_sentence, ui_tokens


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="content/nce2.enriched.v1.json")
    parser.add_argument("--output", default="content/nce2.enriched.v1.json")
    parser.add_argument("--stanza-dir", required=True)
    args = parser.parse_args()

    package = json.loads(Path(args.input).read_text(encoding="utf-8"))
    sentences = [sentence for lesson in package["lessons"] for sentence in lesson["sentences"]]
    texts = [sentence["english"] for sentence in sentences]
    nlp = stanza.Pipeline(
        "en",
        model_dir=args.stanza_dir,
        processors="tokenize,pos,lemma,depparse",
        use_gpu=False,
        verbose=False,
        tokenize_no_ssplit=True,
    )
    docs = nlp.bulk_process(texts)

    for index, (sentence, doc) in enumerate(zip(sentences, docs), start=1):
        items = ui_tokens(sentence["english"])
        token_pos, group_spans = analyze_sentence(doc, items)
        for token, upos in zip(sentence["tokens"], token_pos):
            pos_code, pos_label = POS_CODES.get(upos, POS_CODES["X"])
            token["posCode"] = pos_code
            token["posLabel"] = pos_label
        sentence["groups"] = [
            {
                "groupId": f"{sentence['sentenceId']}-group-{group_index:03d}",
                "type": role,
                "label": None,
                "startToken": start,
                "endToken": end,
                "parentGroupId": None,
            }
            for group_index, (role, start, end) in enumerate(group_spans)
        ]
        sentence["analysisRuleVersion"] = "nce2-stanza-1.0.1"
        if index % 100 == 0 or index == len(sentences):
            print(f"refreshed {index}/{len(sentences)}")

    package["generatorVersion"] = "nce2-enrichment-1.1.0-marian-stanza-1.0.1"
    Path(args.output).write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
