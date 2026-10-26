import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { validateUnderstanding, recordKey } from './understanding-contract.mjs';
import { loadTeacherTips } from './teacher-tip-content.mjs';
import { applySentenceSplits } from './sentence-split-content.mjs';
import { applyScanCorrection } from './scan-correction-content.mjs';
const path = process.argv.slice(2).find(argument => !argument.startsWith('--')) || 'content/sentence-understanding.pilot.v1.json';
const content = JSON.parse(await readFile(path, 'utf8'));
if (content.schemaVersion !== '1.0.0' || !Number.isInteger(content.revision) || content.revision < 1 || !Array.isArray(content.records)) throw Error('Invalid supplement metadata');
const seen = new Set();
for (const record of content.records) {
  if (!record.courseId || !record.lessonId || !record.sentenceId || !Number.isInteger(record.sentenceOrder) || record.sentenceOrder < 1) throw Error('Missing stable source identity');
  if (seen.has(recordKey(record))) throw Error(`Duplicate ${recordKey(record)}`);
  seen.add(recordKey(record));
  const errors = validateUnderstanding(record);
  if (errors.length) throw Error(`${recordKey(record)}: ${errors.join('; ')}`);
}
const records = content.records.filter(record => record.analysisStatus === 'approved');
const allRecords = new Map(records.map(record => [recordKey(record), record]));
let sources = [];
try { sources = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8')).records; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let missing = 0;
const courseId = process.argv.find(argument => argument.startsWith('--require-course='))?.split('=')[1];
if (courseId && !['nce1', 'nce2'].includes(courseId)) throw Error('Invalid required course');
const missingByCourse = {};
for (const source of sources) {
  if (allRecords.has(recordKey(source))) {
    if (allRecords.get(recordKey(source)).english !== source.english) throw Error(`${source.sentenceId}: protected source changed`);
    continue;
  }
  let record;
  try { record = JSON.parse(await readFile(`content/understanding-records/${source.sentenceId}.json`, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') { missing++; missingByCourse[source.courseId] = (missingByCourse[source.courseId] || 0) + 1; continue; } throw error; }
  const errors = validateUnderstanding(record);
  if (record.english !== source.english || recordKey(record) !== recordKey(source)) errors.push('source changed');
  if (errors.length || record.analysisStatus !== 'approved') throw Error(`${source.sentenceId}: ${errors.join('; ') || 'not reviewed'}`);
  allRecords.set(recordKey(record), record);
}
if (missing && process.argv.includes('--require-complete')) throw Error(`Missing ${missing} sentence analyses`);
if (courseId && missingByCourse[courseId]) throw Error(`Missing ${missingByCourse[courseId]} ${courseId} sentence analyses`);
let teacherTips = await loadTeacherTips(sources, { requireComplete: process.argv.includes('--require-teacher-tips') });
if (process.argv.includes('--require-nce2-teacher-tips') && teacherTips.records.filter(tip => tip.courseId === 'nce2').length !== sources.filter(source => source.courseId === 'nce2').length) throw Error('Incomplete NCE 2 teacher tips');
if (process.argv.includes('--require-nce2-teacher-tips') && teacherTips.records.some(tip => tip.courseId === 'nce2' && tip.author !== 'human' && tip.accuracyReview?.version !== 'nce2-expression-accuracy-1.0.0')) throw Error('NCE 2 teacher tip accuracy review incomplete');
// In-progress NCE 2 batches remain on disk; only expose tips with approved analysis.
teacherTips.records = teacherTips.records.filter(tip => tip.courseId !== 'nce2' || allRecords.has(recordKey(tip)));
const tipKeys = new Set();
for (const tip of teacherTips.records) {
  const original = allRecords.get(recordKey(tip));
  if (!original || original.english !== tip.english || !tip.text?.trim() || tipKeys.has(recordKey(tip))) throw Error(`Invalid teacher tip pilot: ${tip.sentenceId}`);
  tipKeys.add(recordKey(tip));
}
const published = await applyScanCorrection(await applySentenceSplits(sources, [...allRecords.values()], teacherTips, { requireComplete: !process.argv.includes('--allow-partial-splits') }));
allRecords.clear();
for (const record of published.records) allRecords.set(recordKey(record), record);
teacherTips = published.teacherTips;
const publishedPilot = published.records.filter(record => records.some(original => original.sentenceId === (record.parentSentenceId || record.sentenceId)));
await writeFile('content/understanding-source-index.effective.v1.json', JSON.stringify({ schemaVersion: '1.0.0', revision: published.revision, complete: published.complete, records: published.sources }, null, 2) + '\n');
const lessons = {};
const byLesson = Map.groupBy([...allRecords.values()], record => `${record.courseId}:${record.lessonId}`);
for (const [key, lessonRecords] of byLesson) {
  const { courseId, lessonId } = lessonRecords[0];
  const directory = `assets/understanding/${courseId}`;
  const asset = `${directory}/${lessonId}.json`;
  await mkdir(directory, { recursive: true });
  await writeFile(asset, JSON.stringify({ schemaVersion: '1.0.0', records: lessonRecords.sort((a, b) => a.sentenceOrder - b.sentenceOrder) }));
  lessons[key] = asset;
}
await writeFile('understanding-content.js', `// Generated by scripts/build-understanding.mjs; edit the source JSON.\nwindow.SENTENCE_UNDERSTANDING = ${JSON.stringify({ schemaVersion: content.schemaVersion, revision: published.revision, records: publishedPilot, lessons, totalRecords: allRecords.size, teacherTips, practiceSplits: published.practiceSplits, ...(published.practiceCorrections ? { practiceCorrections: published.practiceCorrections } : {}) })};\n`);
console.log(`Validated ${allRecords.size} records; exported ${byLesson.size} lesson files; missing ${missing}.`);
console.log(`Missing by course: ${JSON.stringify(missingByCourse)}`);
console.log(`Reviewed boundary revision: ${published.practiceSplits.parents.length}/172 parents; complete=${published.complete}.`);
