# Sentence Boundary Revision

This revision replaces 172 approved multi-utterance practice records with 344
explicitly authored child units. It does not split at `but`, `and` or `because`.
Speech attribution remains attached. Short standalone replies are legitimate units;
the minimum length guidance for fragments of long clauses does not merge them.

The original source index, analyses and teacher tips remain immutable historical
inputs. Publication compiles the boundary overlay before the browser loads it.
Unaffected IDs stay unchanged; new child IDs append `-part-01` / `-part-02` to the
parent ID. Child records retain parent identity and exact source text.

## Authored Source

`content/sentence-splits/*.v1.json` has this compact format:

```json
{
  "schemaVersion": "1.0.0",
  "revision": 5,
  "author": "doubao-seed-2-1-turbo-260628",
  "reviewMethod": "separate-model-request-not-human-verification",
  "reviewStatus": "model-reviewed-awaiting-user-review",
  "ruleVersion": "intent-driven-expression-1.2.0",
  "records": [
    {
      "parentSentenceId": "stable-parent-id",
      "parentEnglish": "Exact original text.",
      "children": [
        {
          "english": "Exact child text.",
          "chinese": "Natural contextual translation",
          "tip": "Sentence-specific expression-thinking teaching",
          "intent": "Communicative intent",
          "parts": [["Exact span", "Information relation", "Chinese meaning"]],
          "notes": [["Topic", "Chinese structural explanation"]],
          "structures": [["Exact span", "Syntactic role", "Chinese explanation"]]
        }
      ]
    }
  ]
}
```

Each parent has exactly two children, preserving the exact reviewed punctuation
and original order. Parts must reconstruct each child exactly. Structures use
literal spans of that child; syntactic roles and lexical POS remain separate.
The configured Doubao API receives existing translation, parts, notes, roles and
teacher tips. It retains usable content, realigns it to each child and only rewrites
or adds what is necessary. A separate request reviews the result. Content is not
populated by templates or inferred at answer time. Existing lexical meanings/POS
and contextual British phonetics are inherited by contiguous token offsets offline.

The full teaching standard remains `teacher-tip-standard.zh-CN.md`. Choose one or
two useful cognitive insights, not repeated translation or generic advice. Simple
responses can receive shorter guidance; do not invent Chinese-English contrasts.

Model records describe API authorship and separate model review, not human approval.
Codex-authored revisions, if explicitly made later, retain their own provenance.
Existing human records and Lesson 3 manual groups are preserved.

## Build And Release

`node scripts/generate-sentence-splits.mjs` resumes only missing reviewed parents,
using the server-only Ark configuration. Drafts and failures stay under
`reports/sentence-split-generation`. Fatal authentication, permission and model cap
errors stop requests; the generator does not switch models. `--force-parent=ID`
allows a targeted API correction without replacing other saved work.

`node build.mjs` requires all 172 parents, reconstructs every original sentence,
validates inherited tokens and teaching fields, and publishes 2,345 units:
NCE 1 = 1,127; NCE 2 = 1,218. The legacy index remains the historical baseline.
`content/understanding-source-index.effective.v1.json` is the generated revision-5
index used by published-content checks and exports. The optional local-only
`--allow-partial-splits` on the supplement builder cannot bypass the release build.

Run `node scripts/export-sentence-split-packages.mjs` and validate both generated
`content/sentence-split-update.COURSE.enriched.v1.json` files with
`node scripts/validate-content-package.mjs PATH` (equivalent to `npm run validate:content -- PATH`).
These exchange packages contain complete revised lessons only, not the untouched
course catalog; merge by stable lesson IDs rather than replacing a whole course.
Their token-coverage root is not a substitute for the authored detailed roles in
`understanding.structures`. Inherited token IDs retain original offsets.

Run the split contract/browser tests, full teacher-tip render/asset tests and
existing answer-correction/home tests before publishing. The browser applies only
the precompiled explicit parent-to-child mapping. It never finds sentence boundaries
or guesses new analysis at answer time.

## Learner History

For affected lessons, history migration retains run counts, aggregate accuracy,
progress, original full inputs and original wrong counts. Old parent mistakes and
new-word selections are projected onto child units and marked as inherited rather
than new errors; original entries are kept in `boundaryHistory`.

Ongoing sessions retain score, elapsed time and completed work. The current split
question restarts at its first child if unanswered; completed parents expand to
completed children. The old payload is backed up in
`nce_practice_session_v3_before_boundary_r5` before storing a migrated session.
Unchanged sessions/lessons are not migrated. Migration is idempotent and remains
usable in memory if browser storage cannot be written.
