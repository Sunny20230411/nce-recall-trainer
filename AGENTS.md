# Project Rules

## Course content

- Treat `docs/content-import-and-analysis-spec.md` as the implementation baseline for every new course import.
- A user may provide English source text only. The content-production step must preserve source order and generate sentence splitting, Chinese prompts, tokens, phonetics, contextual meanings, parts of speech, sentence structures, and three-level hints.
- Do not infer sentence structure in the browser at answer time. Generate, validate, version, and store analysis data before publishing.
- Keep part of speech and sentence role as separate data layers.
- Do not overwrite records whose `analysisSource` is `human` unless the user explicitly requests a new review.
- Keep stable course, lesson, sentence, and token IDs across wording corrections; increment the course revision instead.
- Run `npm run validate:content -- <content-package.json>` before publishing a new content package.
- Use `schemas/course-content.schema.json` for the exchange format and `database/schema.postgres.sql` as the production database reference.

## Existing behavior

- Preserve the verified answer-entry, validation, error correction, keyboard, progress, and wrong-answer review behavior unless the user explicitly changes it.
- Existing Lesson 3 manual structure groups are authoritative overrides over generated analysis.
