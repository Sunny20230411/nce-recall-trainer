import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadTeacherTips } from './teacher-tip-content.mjs';

const sources = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8')).records;
const tips = await loadTeacherTips(sources, { requireComplete: true });
const directory = 'reports/teacher-tip-review';
await mkdir(directory, { recursive: true });
const baselinePath = `${directory}/baseline.json`;
if (process.argv.includes('--snapshot')) {
  await writeFile(baselinePath, `${JSON.stringify(tips, null, 2)}\n`);
  console.log(`Snapshot: ${tips.records.length} effective tips`);
} else {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const previous = new Map(baseline.records.map(tip => [tip.sentenceId, tip]));
  const comparable = tips.records.filter(tip => previous.has(tip.sentenceId));
  const changed = comparable.filter(tip => tip.text !== previous.get(tip.sentenceId).text).map(tip => ({ sentenceId: tip.sentenceId, lessonId: tip.lessonId, english: tip.english, before: previous.get(tip.sentenceId).text, after: tip.text }));
  const report = { standardVersion: 'intent-driven-expression-1.2.0', reviewMethod: 'Codex editorial review, not independent human verification', totalReviewed: comparable.length, addedSinceBaseline: tips.records.length - comparable.length, changedCount: changed.length, unchangedCount: comparable.length - changed.length, changed };
  await writeFile(`${directory}/result.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ total: report.totalReviewed, changed: report.changedCount, unchanged: report.unchangedCount }));
}
