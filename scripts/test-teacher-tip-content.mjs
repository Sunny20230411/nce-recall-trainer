import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadTeacherTips, teacherTipSourceDigest } from './teacher-tip-content.mjs';
import { loadPublishedUnderstanding } from './sentence-split-content.mjs';

const { records: sources } = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8'));
const content = await loadTeacherTips(sources, { requireComplete: true });
const expected = sources.filter(source => source.courseId === 'nce1');
const nce1Tips = content.records.filter(record => record.courseId === 'nce1');
assert.equal(nce1Tips.length, expected.length);
assert.equal(expected.length, 956);
assert.equal(new Set(nce1Tips.map(record => record.sentenceId)).size, 956);
assert.equal(new Set(nce1Tips.map(record => record.lessonId)).size, 72);
for (const tip of nce1Tips) {
  const source = expected.find(record => record.sentenceId === tip.sentenceId);
  assert.equal(tip.english, source.english);
  assert.equal(tip.lessonId, source.lessonId);
  assert.equal(tip.author, 'Codex');
  assert.ok(tip.text.trim().length >= 15, tip.sentenceId);
  assert.ok(!tip.text.includes('名师提点：'), tip.sentenceId);
}
const context = { window: {} };
vm.runInNewContext(await readFile('understanding-content.js', 'utf8'), context);
const manifest = context.window.SENTENCE_UNDERSTANDING;
const availableIds = new Set();
for (const path of Object.values(manifest.lessons)) {
  const asset = JSON.parse(await readFile(path, 'utf8'));
  for (const record of asset.records) availableIds.add(record.sentenceId);
}
assert.equal(availableIds.size, manifest.totalRecords);
const published = await loadPublishedUnderstanding();
assert.equal(JSON.stringify(manifest.teacherTips.records), JSON.stringify(published.teacherTips.records));
const nce1PublishedCount = published.records.filter(record => record.courseId === 'nce1').length;
assert.equal(published.teacherTips.records.filter(tip => tip.courseId === 'nce1').length, nce1PublishedCount);
const changed = sources.map(source => ({ ...source }));
changed.find(source => source.courseId === 'nce1').english += ' altered';
await assert.rejects(() => loadTeacherTips(changed, { requireComplete: true }), /source changed/);
assert.notEqual(teacherTipSourceDigest(expected), teacherTipSourceDigest([...expected].reverse()));
console.log(`956 legacy directly authored tips, ${nce1PublishedCount} published NCE1 units, 72 lessons, exact generated content and source drift protection passed.`);
