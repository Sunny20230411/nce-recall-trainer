# Sentence Understanding Pilot

The first rollout covers eight representative practice sentences from NCE 1 and 2. It does not claim a complete course review. English source, practice ordering, existing IDs, grades and answer-entry logic are unchanged.

## Ownership

- `content/sentence-understanding.pilot.v1.json`: source records; generated drafts require explicit content review before approval.
- `schemas/sentence-understanding.schema.json`: supplemental exchange contract. Future course packages may carry the same object as `sentence.understanding`.
- `scripts/generate-understanding.mjs`: offline, resumable API generation for the pilot; protects human and approved records. Invalid outputs receive at most three attempts. API keys remain in `.env.local`.
- `scripts/understanding-contract.mjs`: shared validation; checks exact sentence/part/word reconstruction and source spans. This does not establish linguistic correctness.
- `scripts/build-understanding.mjs`: validates all records and exports only approved records to `understanding-content.js`.
- `content/sentence-understanding.pilot-review.v1.json`: explicit editorial corrections and review notes for the pilot, kept separate from model drafts. `scripts/apply-understanding-review.mjs` applies them to non-human records only; human records are never silently overwritten.
- `understanding-view.js` and `.css`: display only; no API calls, sentence inference or writes to course records.

## Publication

Revision 2 uses the reading order: natural translation, optional Chinese/English expression comparison, a complete core expression, information relationships, then selected structural explanations. Word information is the final expandable table. Short sentences can omit comparison and merge relationships into the core explanation. `comparison`, `backbone` and `structureNotes` are additive fields; old source/tokens/groups remain intact. Explicit sample presentation reviews live in `content/sentence-understanding.frames.v1.json` and are applied with `node scripts/apply-understanding-frames.mjs`; this is an authorized revision of the selected manual records, not unrestricted model regeneration.

Revision 3 adds optional `comparison.steps` and `comparison.takeaway` for difficult information relationships. Steps use short labels, concrete expressions and explanations to show what the reader already knows, which information is missing and how English connects it. These are stored teaching observations, not browser-generated parsing. The first expanded examples are Lesson 131's question and Lesson 143's relative clause. Simpler comparisons stay compact.

1. Run `node scripts/generate-understanding.mjs` to produce drafts.
2. Read every pilot record, correct semantics/structure/contextual meanings, record review notes and set `analysisStatus` to `approved`. Preserve `analysisSource: human` for manually authored corrections.
3. Run `node scripts/build-understanding.mjs`, then `node build.mjs`.
4. Validate any modified exchange course package with `npm run validate:content -- <content-package.json>` before publishing. The pilot is a supplemental package, validated separately by its builder.

No model is called after a correct answer. Reviewed examples show meaning, phrase relationships and selected notes. Word information and accurate structure are expandable. Other sentences show original English and the existing Chinese prompt; unreviewed inferred structure is suppressed. Lesson 3 authoritative manual groups remain available and unchanged.

NCE 2 existing sentence IDs (including segment suffixes) are retained. Legacy NCE 1 lacks sentence IDs in its browser objects; the supplement uses the course specification's lesson/order IDs without altering browser records. Lookup also checks the exact English source to avoid stale explanations after corrections. Increasing the supplemental revision is required for subsequent wording corrections.

After layout and teaching quality are accepted, expand the offline source selection and review pipeline to full courses. Do not overwrite approved records through regeneration.
