import { readFile, writeFile } from 'node:fs/promises';
import { teacherTipBatches, teacherTipSourceDigest } from './teacher-tip-content.mjs';

// Mechanical metadata migration; run only after reviewing the tips against this source revision.
const { records } = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8'));
for (const [start, end] of teacherTipBatches) {
  const path = `content/teacher-tips.nce1-lessons-${start}-${end}.v1.json`;
  const batch = JSON.parse(await readFile(path, 'utf8'));
  const sources = records.filter(source => source.courseId === 'nce1' && Number(source.lessonId.split('-')[1]) >= start && Number(source.lessonId.split('-')[1]) <= end);
  const digest = teacherTipSourceDigest(sources);
  if (batch.sourceDigest && batch.sourceDigest !== digest) throw Error(`Source drift: ${path}; do not reseal without editorial review`);
  batch.sourceDigest = digest;
  await writeFile(path, `${JSON.stringify(batch, null, 2)}\n`);
  console.log(`${path}: ${sources.length} source identities sealed`);
}
