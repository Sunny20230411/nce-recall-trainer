# NCE1 Scan Source Correction (Revision 6)

This revision uses the user's supplied HTML transcription as the source of truth.
It is a source-fidelity correction, not a claim of independent human verification
of the original scanned page images.

## Files

- `content/nce1-scan-correction.plan.v1.json`: immutable source digest, baseline
  identities, full replacement order and add/correct/retain decisions.
- `content/nce1-scan-correction-records/`: only changed/new analyses, translations,
  contextual word meanings, British IPA, structures, hints and teacher tips.
- `content/nce1-scan-correction.release.v1.json`: created only when every changed
  record passes validation; its absence leaves revision 5 fully operational.
- `scripts/scan-correction-content.mjs`: build-time merge. Unchanged analyses and
  the original NCE1/NCE2 source packages remain intact.
- `assets/source-corrections.js`: applies approved lesson replacements after
  revision 5 boundary splitting. Locally imported divergent lessons are not replaced.

## Production Rules

Preserve stable sentence IDs for matched wording corrections. Allocate new IDs for
new source sentences. Preserve token IDs through edit alignment and use revisioned
IDs for inserted tokens. Human-reviewed analyses cannot be changed by the merger.
API-generated content receives a separate model review. When the API quota was
exhausted, the remaining 161 records were authored directly by Codex and same-model
subtasks, self-checked, and cross-reviewed by the parent or a non-authoring subtask.
All content also undergoes structural validation. This is model/editorial review,
not human verification. Provenance is recorded per file rather than pretending
that Codex-authored records came from the external API.

Do not publish partial results. Do not run a model in the browser to infer grammar.
The approved teacher-tip standard remains `intent-driven-expression-1.2.0`.

## Learning Data

Historical run counts, scores and accuracy remain historical values. Old wrong
answers for removed/changed English are archived in `sourceCorrectionHistory`, not
reassigned to an unrelated sentence. Only exact unchanged English carries completed
question state into a new session; added/corrected English remains pending.
Whole saved sessions are backed up under `nce_practice_session_v3_before_content_r6`.
Migration is idempotent.

Word-book entries are not deleted. Where the same word remains in a stable corrected
sentence, update its contextual source. Otherwise retain it with a previous-edition
label and keep a pre-migration storage backup. It remains user-removable.

## Verification

1. `node scripts/finalize-nce1-scan-correction.mjs`
2. `node build.mjs`
3. `node scripts/test-nce1-scan-correction.mjs`
4. `node scripts/test-source-correction-migration.mjs`
5. `node scripts/export-sentence-split-packages.mjs --scan-correction`
6. `npm run validate:content -- content/scan-correction-update.nce1.enriched.v1.json`
7. `node scripts/test-understanding-assets.mjs`

The original revision 5 boundary tests use `withoutScanCorrection` to keep testing
the original immutable source. The revision 6 tests assert all 72 corrected lesson
texts reconstruct the supplied transcript, with no missing or reordered words.
