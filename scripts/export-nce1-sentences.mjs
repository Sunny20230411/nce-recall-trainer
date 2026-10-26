import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = JSON.parse(await readFile('content/understanding-source-index.effective.v1.json', 'utf8'));
assert.equal(source.complete, true, 'Do not export partially completed boundaries');
const records = source.records.filter(record => record.courseId === 'nce1');
const lessons = new Map();
const ids = new Set();
for (const record of records) {
  assert.ok(record.english && record.lesson);
  assert.ok(!ids.has(record.sentenceId), `Duplicate ID: ${record.sentenceId}`);
  ids.add(record.sentenceId);
  if (!lessons.has(record.lessonId)) lessons.set(record.lessonId, { title: record.lesson, records: [] });
  const lesson = lessons.get(record.lessonId);
  assert.equal(lesson.title, record.lesson);
  assert.equal(record.sentenceOrder, lesson.records.length + 1, `Source order: ${record.sentenceId}`);
  lesson.records.push(record);
}
assert.ok(records.length > 0);
assert.equal(lessons.size, 72);
const lines = ['New Concept English 1', `${lessons.size} lessons / ${records.length} practice sentences`, ''];
for (const lesson of lessons.values()) {
  lines.push(lesson.title);
  for (const record of lesson.records) lines.push(`${record.sentenceOrder}. ${record.english}`);
  lines.push('');
}
await mkdir('exports', { recursive: true });
const path = `exports/nce1-sentences-r${source.revision}.txt`;
// BOM and CRLF keep the export readable in Windows text editors.
const output = '\uFEFF' + lines.join('\r\n');
await writeFile(path, output, 'utf8');
assert.equal(await readFile(path, 'utf8'), output);
console.log(JSON.stringify({ path, lessons: lessons.size, sentences: records.length, sourceRevision: source.revision }));
