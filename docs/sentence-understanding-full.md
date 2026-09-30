# Full-Course Sentence Understanding

The supplemental layer covers the practice inventory, not only source paragraphs:
956 NCE 1 and 1217 NCE 2 sentences (2173 total). Original course data, IDs,
answer handling and Lesson 3 manual groups remain unchanged.

## Source And Ownership

- `content/understanding-source-index.v1.json`: ordered source snapshot and stable identities.
- `content/understanding-records/<sentenceId>.json`: independently resumable sentence records.
- `content/sentence-understanding.pilot.v1.json`: protected editorial examples, taking precedence.
- `scripts/understanding-bulk-rules.mjs`: generation and separate model-review instructions.
- `scripts/generate-understanding-all.mjs`: offline production, validation and review.
- `assets/understanding/<courseId>/<lessonId>.json`: generated lesson-level browser assets.

The generator preserves existing human or approved records. Model-approved records
explicitly state that review was performed by a separate model request, not a human.
Structural validation is not proof of linguistic correctness; targeted editorial
review is still needed for complex or ambiguous language. Human corrections should
set `analysisSource` to `human` and document the reason in `reviewNote`.

## Production

Use server-only credentials from `.env.local`; do not copy credentials into assets.

```powershell
$env:UNDERSTANDING_CONCURRENCY='8'
node scripts/generate-understanding-all.mjs
node scripts/build-understanding.mjs --require-complete
node scripts/test-understanding.mjs
node build.mjs
```

`UNDERSTANDING_LIMIT` can restrict a trial. Remove that environment variable before
a full run. Reruns skip completed records; rate-limit/server failures use backoff.
To resume only NCE 1, set `UNDERSTANDING_COURSE=nce1` (or `nce2` for NCE 2).
The source snapshot always retains both courses; the API queue is course-scoped.
`node scripts/build-understanding.mjs --require-course=nce1` fails if any NCE 1
record is missing, while still exporting existing NCE 2 records unchanged.
Generation and independent review use strict JSON schemas from
`scripts/understanding-model-format.mjs`, followed by local source and content
validation. Human records are never regenerated automatically, even if invalid;
the build reports those problems for editorial correction.
Diagnostic rejects live in `reports/understanding-all`, never in browser assets.
Before publishing a modified course exchange package, run the course validator too.
Authentication and account errors stop the full queue immediately. The initial run
stopped on `AccountOverdueError` with 275 exported records. On 2026-09-30 the NCE 1
queue was resumed using the configured Doubao Seed 2.1 Lite model, preserving the
editorial pilot and every previously approved record.

Current local coverage: NCE 1 is complete at 956/956 practice sentences; NCE 2
retains its three pilot examples, with 1214/1217 sentences still missing. There are
959 exported records across 74 lesson assets. NCE 1 completeness, source identity,
local structural validation, independent model review and 430px/1280px rendering
checks passed. This is not a human review of every sentence and is not yet deployed.

With the local server running, `node scripts/test-understanding-assets.mjs` checks
every exported record, HTTP lesson loading, source identity, mobile/desktop rendering,
word tables and absence of model calls. The pilot test retains manual-override coverage.

## Display

Load static lesson assets on demand, not the whole course at startup. Correct answers
do not call a model. Explain natural meaning, relevant Chinese/English organization,
complete core meaning, information relationships and selected structural connections.
Simple sentences omit unnecessary comparison. Word details are the last folded table.
Every display lookup checks the unchanged English source and original sentence order.
