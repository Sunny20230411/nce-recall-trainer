import { readFile, writeFile, unlink } from 'node:fs/promises';
import { loadPublishedUnderstanding } from './sentence-split-content.mjs';
import { validateUnderstanding } from './understanding-contract.mjs';
const plan = JSON.parse(await readFile('content/nce1-scan-correction.plan.v1.json', 'utf8'));
for (const source of plan.lessons.flatMap(lesson => lesson.records).filter(record => record.action !== 'retain')) {
  const file = JSON.parse(await readFile(`content/nce1-scan-correction-records/${source.sentenceId}.json`, 'utf8'));
  if (file.sourceSha256 !== plan.source.sha256 || file.record.english !== source.english || validateUnderstanding(file.record).length) throw Error(`Incomplete correction ${source.sentenceId}`);
}
const path = 'content/nce1-scan-correction.release.v1.json';
await writeFile(path, JSON.stringify({ schemaVersion: '1.0.0', revision: 6, status: 'complete', sourceSha256: plan.source.sha256, reviewMethod: 'mixed-separate-model-review-and-codex-editorial-self-review-not-human-verification', summary: plan.summary }, null, 2) + '\n');
try { const result = await loadPublishedUnderstanding(); console.log(JSON.stringify({ revision: result.revision, totalRecords: result.records.length, nce1: result.records.filter(r => r.courseId === 'nce1').length, correctedLessons: result.practiceCorrections.lessons.length })); }
catch (error) { await unlink(path); throw error; }
