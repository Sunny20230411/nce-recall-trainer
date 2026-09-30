# Full British IPA Audit

## Scope And Evidence

`scripts/audit-british-phonetics.mjs` inventories every practice sentence in NCE 1
and NCE 2 (2173), using the existing display tokenization. Ordinary words are
deduplicated; context-sensitive heteronyms receive sentence-specific entries.
Generation and independent model-review requests are offline and resumable.
This is model-assisted checking, not a claim of dictionary verification or human
review of every token. Uncertain names and readings are explicitly unresolved.

## Data Ownership

- `reports/phonetics/inventory.json`: original token-level source snapshot and grouping.
- `content/british-phonetics/`: checkpoint records, filename is base64url of the stable key.
- `content/british-phonetics.audit.v1.json`: generated audit, notes, unresolved cases and counts.
- `assets/british-phonetics-data.js`: generated static display-only overlay.
- `assets/british-english.js`: normalized lookup and British speech configuration.
- `content/british-phonetics.editorial.v1.json`: explicit editorial corrections with
  higher export priority than model records; generation never overwrites this file.

The overlay does not overwrite course records, human analyses, IDs, meanings or
structures. Unknown readings return no IPA, never a guessed spelling transcription.
Contextual entries take priority over global ones. Accepted British variants can
both be shown when no unique reading can be confirmed. Curated editor overrides
remain available outside the audited inventory.
Duplicate heteronyms within a sentence are also keyed by token position. Unicode
letters are preserved so French names with accents are not mistaken for English
words. Old translations and POS may be wrong; review uses the actual English text.

## Maintenance

```powershell
node scripts/audit-british-phonetics.mjs
node scripts/build-british-phonetics.mjs
node scripts/test-british-phonetics.mjs
node build.mjs
```

The builder requires an entry for every inventory case. Authentication/account
errors stop the queue without replacing successful checkpoints. On text changes,
regenerate the inventory and review new context-specific keys. A correct answer
only reads bundled data; no pronunciation model request happens in the browser.
Set `PHONETICS_REVIEW_UNRESOLVED=1` to recheck uncertain entries; otherwise a rerun
preserves all completed results. `PHONETICS_BATCH_SIZE=5` is useful for repair runs.
Unresolved word-table cells display a pending-confirmation label, not fabricated IPA.

Strong citation forms are used for word details; sentence speech will naturally
use weak forms and connected speech. British phonemic variants and linking r
are not errors merely because their symbols differ. Real pronunciation depends
on the installed en-GB voice, independently from these displayed transcriptions.
