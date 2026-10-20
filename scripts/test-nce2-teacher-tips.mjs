import assert from 'node:assert/strict';
import { validateUnderstanding } from './understanding-contract.mjs';
import { TEACHER_TIP_VERSION } from './teacher-tip-rules.mjs';
import { loadPublishedUnderstanding } from './sentence-split-content.mjs';

const published = await loadPublishedUnderstanding({ requireComplete: !process.argv.includes('--allow-partial') });
const sources = published.sources;
const catalog = published.teacherTips;
const selected = sources.filter(source => source.courseId === 'nce2');
const tips = catalog.records.filter(tip => tip.courseId === 'nce2');
const partial = process.argv.includes('--allow-partial');
if (!partial) assert.equal(tips.length, selected.length);
assert.equal(new Set(tips.map(tip => tip.sentenceId)).size, tips.length);
let analyses = 0;
for (const source of selected) {
  const tip = tips.find(tip => tip.sentenceId === source.sentenceId);
  if (tip) {
  assert.equal(tip.english, source.english);
  assert.equal(tip.ruleVersion, TEACHER_TIP_VERSION);
  assert.ok(/[\u3400-\u9fff]/u.test(tip.text), source.sentenceId);
  assert.ok(['model-reviewed-awaiting-user-review', 'authored-and-self-reviewed-awaiting-user-review'].includes(tip.reviewStatus), source.sentenceId);
  if (!partial) assert.equal(tip.accuracyReview?.version, 'nce2-expression-accuracy-1.0.0', source.sentenceId);
  if (tip.editorialAuthor === 'Codex') assert.equal(tip.accuracyReview?.method, 'codex-editorial-self-review-not-human-verification', source.sentenceId);
  } else if (!partial) assert.fail(`Missing teacher tip: ${source.sentenceId}`);
  const record = published.records.find(record => record.sentenceId === source.sentenceId);
  assert.deepEqual(validateUnderstanding(record), [], source.sentenceId);
  assert.equal(record.english, source.english);
  assert.equal(record.analysisStatus, 'approved');
  assert.ok(/[\u3400-\u9fff]/u.test(record.chinese), source.sentenceId);
  analyses++;
}
console.log(JSON.stringify({ total: selected.length, teacherTips: tips.length, analyses, missingTips: selected.length - tips.length, missingAnalyses: selected.length - analyses, partial, validation: 'source-matched, model-reviewed or Codex-self-reviewed, current teaching standard' }));
