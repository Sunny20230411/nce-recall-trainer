import { readFile, writeFile } from 'node:fs/promises';
import { teacherTipSourceDigest } from './teacher-tip-content.mjs';

const source = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8'));
const audit = JSON.parse(await readFile('reports/sentence-boundary-audit.reviewed.json', 'utf8'));
const parents = audit.reviewed.filter(record => record.decision === 'propose-split').map(record => {
  const original = source.records.find(item => item.sentenceId === record.sentenceId);
  if (!original || original.english !== record.english || record.candidateParts.join(' ') !== original.english) throw Error(`Source changed: ${record.sentenceId}`);
  return { courseId: original.courseId, lessonId: original.lessonId, parentSentenceId: original.sentenceId, parentEnglish: original.english, children: record.candidateParts };
});
if (parents.length !== 172) throw Error('Reviewed boundary coverage changed');
await writeFile('content/sentence-split-plan.v1.json', JSON.stringify({ schemaVersion: '1.0.0', revision: 5, sourceRevision: source.revision, sourceDigest: teacherTipSourceDigest(source.records), parents }, null, 2) + '\n');
console.log(`Prepared ${parents.length} reviewed parent boundaries; no course data overwritten.`);
