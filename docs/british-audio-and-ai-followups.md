# British Audio And Follow-Ups

All sentence playback paths use `assets/british-english.js`: en-GB, rate 0.8,
an available British voice with local voices preferred. Actual accent depends on
installed system/browser voices. Real iOS hardware remains a separate test.

Curated British IPA overrides correct known mixed-dialect entries in slots,
legacy details and word tables without modifying human course records. Other
existing IPA is preserved, not converted with unreliable symbol substitutions.
This is not a full vocabulary IPA audit. Unknown words no longer show their
spelling as invented IPA.

`api/reply-parts.js` now extracts streamed Markdown from the `answer` field of a
structured JSON reply with a mandatory `suggestions` array of 3-4 contextual
follow-ups. Every turn uses the same reply schema; metadata never appears in prose.
Incomplete structured replies report an interruption rather than silently dropping
recommendations. No second model request is made.

Questions appear after each successful answer and use the normal submit path.
Submitting the next question removes previous recommendations, leaving one latest
set. Two real consecutive streaming turns were verified after this change.
Errors and interruptions do not fabricate recommendations. Text uses textContent.
Tests cover fragmented markers, malformed metadata, progressive output,
cancellation, voice selection, IPA, mobile focus and clickable questions.
A real model call returned prose and three contextual follow-ups in one response.
