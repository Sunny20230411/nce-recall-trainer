# Teacher Tips Pilot

## Editorial Standard 1.2.0

### NCE 2 Direct Editorial Completion

After the API account cap, the user requested no further external API use.
`content/nce2-editorial/lesson-NNN.v1.json` is the directly authored, per-lesson
source for the directly authored remaining analyses and editorial tip reviews.
Other NCE 2 records may retain their separately reviewed API provenance.
Each record binds a tip and any missing analysis to an existing stable sentence
ID. Parts and structures are explicit authored spans, not inferred in the browser.
Word meaning/POS tuples align one-to-one with stored whitespace tokens; the
assembler copies exact token text and uses the existing British IPA layer.

`node scripts/assemble-nce2-editorial.mjs` validates all supplied editorial records
before writing any output. It preserves existing API/human analysis, and only
recompiles base analyses owned by this editorial layer. Tip provenance distinguishes
the original author from Codex editorial review, not human approval. Content hashes
make unchanged editorial compilation idempotent. `--range=START:END` supports
validating a bounded lesson range during editing without touching other ranges.
The optional `--require-complete` requires all 1,217 records in the compact
editorial layer itself; it is not appropriate for a mixed API/editorial catalog.
Use the strict build below to validate combined course coverage instead.

To maintain content, edit the compact lesson source with apply_patch, assemble,
run strict NCE 2 build and coverage/UI tests, then inspect
`node scripts/report-nce2-understanding.mjs`. No generation or review API is needed
for this workflow. The API generator also skips these reviewed authored tips.

NCE 2 uses `scripts/generate-course-teacher-tips.mjs --course=nce2` with the same
standard and the approved editorial examples. The configured Ark model generates
drafts and receives a separate review request; this is not human verification.
Per-sentence files in `content/teacher-tips/nce2` preserve stable IDs, exact English,
source digests, model provenance, rule version and review notes. Draft caches and
failure reports live in `reports/teacher-tip-generation/nce2`. Reruns skip valid
reviewed tips; rejected tips receive correction attempts and are not published.
After initial generation, run the same generator with `--accuracy-review` for a
targeted second review of time ranges, valid alternative expressions and teaching
value. This pass stores separate review provenance and increments tip revisions.
The strict NCE 2 release check requires every generated tip to pass this review.

Missing base analyses can be resumed with `UNDERSTANDING_COURSE=nce2` and
`node scripts/generate-understanding-all.mjs --stored-source --no-span-enum`.
Stored source order is authoritative; context does not expand source fragments.
Both generators stop on Ark `SetLimitExceeded`, rather than repeatedly charging
or switching models. The account owner must adjust the model usage cap to resume.

For incremental local builds, tips without approved base analysis stay on disk
and are not exposed by the manifest. Before a full NCE 2 release run
`node scripts/build-understanding.mjs --require-complete --require-teacher-tips --require-nce2-teacher-tips`,
`node scripts/test-nce2-teacher-tips.mjs` and the full UI test. An incremental
build passing does not certify full course coverage. These scripts do not deploy;
deployment is a separate release step after the full checks pass.

The canonical teaching standard is `docs/teacher-tip-standard.zh-CN.md`.
Review selects one or two valuable expression insights, anticipates genuine
Chinese-language transfer questions, and avoids invented contrasts or repeated
grammar analysis. All 956 NCE 1 tips have received a Codex editorial review;
this is self-review, not independent human verification or user acceptance.
`node scripts/report-teacher-tip-review.mjs` compares effective tips against the
pre-review snapshot and writes `reports/teacher-tip-review/result.json`.
The current review changes 334 tips and retains 622. Do not replace the baseline
snapshot after editing, as it preserves the comparison for user inspection.

## Full NCE 1 Editorial Content

The complete target is 956 source practice records across 72 imported reading
lessons (odd lesson numbers 1-143). Numbered even exercise lessons are not imported.
Seven files named `content/teacher-tips.nce1-lessons-START-END.v1.json` partition
ownership by lesson range. All tips are directly authored by Codex; no external
Doubao generation calls are made. `reviewStatus` distinguishes self-review from
user acceptance. Existing source analyses, translations, word data, stable IDs,
manual Lesson 3 groups and learner progress remain unchanged.

`scripts/teacher-tip-content.mjs` is the shared loader for build and tests. It checks
range, metadata, every lesson and sentence count, nonempty text, duplicate identity
and source fingerprints. Arrays follow stored source order, not the UI question
number. The generated catalog binds each tip to its stable ID and exact English.
`sourceDigest` locks the authored range to its ordered source IDs and English;
source edits cause a build failure rather than silently assigning tips to new text.
`node scripts/seal-teacher-tip-sources.mjs` is a one-time mechanical metadata step
after editorial review; never reseal a changed source without reviewing the tips.

Build with `node scripts/build-understanding.mjs --require-course=nce1 --require-teacher-tips`.
Check full UI coverage with `node scripts/test-teacher-tip-pilot.mjs --require-complete`.
It compares every relation and structural-note cell with the unchanged original,
checks exact tips and hidden backbone at 375/430/1280px, and rejects runtime model
calls. `scripts/test-understanding.mjs` also checks word speech and manual groups.

Both courses use translation, teacher tip, relation table, structural note table
and folded role/word details when a reviewed tip is available. Old backbone and
comparison text remain stored; the old comparison block is hidden when a tip is
available, avoiding two competing teaching summaries. Content is versioned JSON
compiled into static lesson assets, not a claimed production SQL database write.
Local generation alone does not deploy; the user separately authorized publishing
after full completion and verification.

## NCE 1 Lessons 1-20

`content/teacher-tips.nce1-lessons-1-20.v1.json` contains 126 directly authored
Codex tips across the ten available reading lessons numbered 1, 3, 5, 7, 9,
11, 13, 15, 17 and 19. Even-numbered exercise lessons are not imported texts.
No Doubao API was used. Content is self-reviewed, awaiting user review, local only.
Arrays follow the versioned source index order within each lesson, including repeated
sentences. The builder checks exact coverage and joins to stable source sentence IDs,
retaining original analysis records and manual overrides unchanged. If source order
changes, review the corresponding tip array before rebuilding.
The seven user-reviewed examples take precedence over later batch drafts.
The view replaces the visible backbone with the tip and preserves relation/note
fields in tables. Source backbone and comparison data remain stored.
Run `node scripts/test-teacher-tip-pilot.mjs` for the full batch plus remaining pilots.

## Directly Authored Review Samples

`content/teacher-tips.editorial-pilot.v1.json` contains seven tips written directly
by Codex, not generated with the Doubao API. They cover selected sentences in
Lessons 1, 25, 37, 43, 85, 141 and 143 and await user review. These are additive
display overrides with exact sentence-ID/English matching; existing lesson data,
including human editorial records, is not rewritten. The build validates references
and embeds the small pilot catalog in `understanding-content.js`.

The seven samples show "名师提点" instead of the backbone section, without a
backbone disclosure. Original backbone data stays stored. Relations and structural
notes use tables with every original text field preserved. Other sentences keep
their current layout, except the existing Lesson 37 table pilot.

Quality references are the user's five distinct examples: asking a plan,
description with added detail, state and earlier cause, introducing existence,
and progressively narrowing a location. They are not five templates. A tip should
connect concrete intent with the necessary English choices; do not remove useful
English to meet an arbitrary word count or require every tip to end with advice.

Run `node scripts/test-teacher-tip-pilot.mjs` to check all seven on mobile and
desktop, unchanged relation/structure text, hidden backbone and no model calls.

## Earlier API-Generated Lesson 37 Pilot

Teaching standard: intent-driven English expression thinking. Consider intent,
information organization, expression choices and transfer internally, without
turning them into four visible sections or a fixed sentence template.

Choose one useful, sentence-specific insight. Usually write 2-4 natural sentences,
roughly 50-100 Chinese characters, connecting what the speaker wants to express
with how the English is organized. Avoid retranslating, repeating the full grammar
analysis or using generic "core first, details later" advice. Add a brief warning
only when a real Chinese-English difference can interfere with understanding.
Do not claim this organization is exclusive to British English.

Generation and independent review rules are versioned in
`scripts/teacher-tip-rules.mjs`. The reviewer checks accuracy, usefulness,
unsupported assumptions and repetitive templates across the lesson.

`node scripts/generate-teacher-tips.mjs` only fills missing tips in NCE 1 Lesson 37.
It uses server-only `.env.local`, preserves human records, validates all output
before saving, and adds only `teacherTip: {text, ruleVersion, reviewNote}` to each
record. Existing English, IDs, translations and all analysis fields are retained.
Build static lesson assets with `node scripts/build-understanding.mjs`.

The earlier Lesson 37 API tips remain in the source records. The directly authored
pilot takes precedence where present. The current Lesson 37 view uses the heading
"名师提点" without the backbone disclosure; the original backbone remains stored.
Correct answers load stored tips without model calls. Model review is not human
verification. This pilot is local only until separately approved for deployment.
