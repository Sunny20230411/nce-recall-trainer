import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPublishedUnderstanding } from './sentence-split-content.mjs';
import { validateUnderstanding } from './understanding-contract.mjs';
const baseline = await loadPublishedUnderstanding({ withoutScanCorrection: true });
const published = await loadPublishedUnderstanding();
const plan = JSON.parse(await readFile('content/nce1-scan-correction.plan.v1.json', 'utf8'));
const proof = JSON.parse(await readFile('exports/nce1-proofread-2026-10-26.json', 'utf8'));
assert.equal(published.revision, 6);
assert.equal(published.records.filter(r => r.courseId === 'nce1').length, 1224);
assert.equal(published.records.filter(r => r.courseId === 'nce2').length, 1218);
const normalize = value => value.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
for (const source of proof.lessons) {
  const records = published.records.filter(record => record.courseId === 'nce1' && record.lessonId === source.lessonId);
  assert.equal(normalize(records.map(r => r.english).join(' ')), normalize(source.scanText), source.lessonId);
  records.forEach((record, index) => { assert.equal(record.sentenceOrder, index + 1); assert.deepEqual(validateUnderstanding(record), []); });
}
for (const record of baseline.records) {
  if (record.courseId === 'nce2' || !plan.lessons.some(lesson => lesson.lessonId === record.lessonId)) assert.deepEqual(published.records.find(r => r.sentenceId === record.sentenceId), record);
  if (record.analysisSource === 'human') assert.deepEqual(published.records.find(r => r.sentenceId === record.sentenceId), record);
}
for (const source of plan.lessons.flatMap(lesson => lesson.records)) {
  const record = published.records.find(r => r.sentenceId === source.sentenceId);
  assert.equal(record.english, source.english);
  assert.ok(published.teacherTips.records.some(tip => tip.sentenceId === record.sentenceId && tip.english === record.english && tip.text.trim()));
  if (source.action === 'retain') { const old = baseline.records.find(r => r.sentenceId === source.sentenceId); assert.deepEqual(record, { ...old, sentenceOrder: source.sentenceOrder }); }
  if (source.action === 'correct') assert.equal(record.sentenceId, source.previousSentenceId);
}
console.log('All 72 scan sources reconstruct exactly; 1224 NCE1 and 1218 NCE2 records complete; human/unchanged content and stable IDs preserved.');
