# Codex Scan-Correction Authoring

No external model/API calls. Author the assigned records directly. Read
`docs/teacher-tip-standard.zh-CN.md` and the source plan's full lesson context.
Keep English and stable identities exactly as supplied. Do not edit retained or
already completed API records. Use `apply_patch` for authored file edits.

Write only your assigned `content/nce1-scan-correction-codex/LETTER.json` file:

```json
{"author":"Codex","batch":"LETTER","records":[{
  "id":"EXACT-SENTENCE-ID",
  "chinese":"自然中文翻译",
  "intent":"表达意图",
  "tip":"因句施教的名师提点，简短自然，侧重表达选择而非再讲一遍语法",
  "parts":[[0,1,"信息作用","片段中文"]],
  "notes":[["要点","必要的结构解释"]],
  "structures":[[0,0,"主语","句法作用解释"]],
  "words":[["本句中文词义","中文词性","/optional British IPA/"]],
  "memoryHint":"不泄露完整英文的中文思路提示",
  "answerHint":"中文简短解释"
}]}
```

Parts and structures use ZERO-based INCLUSIVE word indices based on
`english.split(/\s+/)`. Parts must cover all words exactly once in order.
Structures need not cover every word but must explain meaningful real roles;
do not substitute part-of-speech labels for sentence roles. Each `words` tuple
corresponds to one whitespace-delimited word, including contractions/hyphenated
spelling as a single token. Provide contextual Chinese meanings, not English
glosses, even for names, numbers or letter-spelling items. Explain empty auxiliary
meanings in parentheses. Word IPA may be omitted ONLY when a standard British IPA
is already in the existing approved vocabulary. Supply it explicitly for names,
heteronyms, spelling strings, or genuinely new forms. Use '待确认' rather than
inventing uncertain IPA. No generic automatic Chinese/POS fallback.

Useful read-only token/context inspection:

```js
const plan=JSON.parse(readFileSync('content/nce1-scan-correction.plan.v1.json'));
const assigned=JSON.parse(readFileSync('reports/nce1-codex-assignments/LETTER.json'));
for(const item of assigned){ const lesson=plan.lessons.find(l=>l.lessonId===item.lessonId);
  console.log(item.sentenceId,item.english.split(/\s+/).map((t,i)=>`${i}:${t}`).join(' '),lesson.sourceText); }
```

Quality: do not say English is always core-first; do not claim please position or
vocative position intrinsically makes requests more polite/natural. Do not ban
some in all negatives or any in all affirmatives. Correct alternatives are not
errors. Handle reported speech, backshift, neither/none, scopes of negatives,
present perfect and modal certainty carefully. Keep short replies short. Do not
misrepresent I want my change as looking for lost coins. Keep lesson 117's change
pun about swallowed coins. Do not confuse tomorrow/next week in reported speech
with an obligatory conversion when reference time is unchanged.

Run a structural check through `node scripts/compile-nce1-codex-batches.mjs --check=LETTER`
once the parent provides that script. Report the file changed and any uncertainty.
Do not create release manifests or commit/deploy anything.
