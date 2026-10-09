import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const teacherTipBatches = [[1, 20], [21, 40], [41, 60], [61, 80], [81, 100], [101, 120], [121, 144]];

export function teacherTipSourceDigest(sources) {
  return createHash('sha256').update(JSON.stringify(sources.map(source => [source.sentenceId, source.english]))).digest('hex');
}

export async function loadTeacherTips(sources, { requireComplete = false } = {}) {
  const pilot = JSON.parse(await readFile('content/teacher-tips.editorial-pilot.v1.json', 'utf8'));
  const records = new Map(pilot.records.map(record => [record.sentenceId, record]));
  const batches = [];
  const covered = new Set();
  for (const [start, end] of teacherTipBatches) {
    const path = `content/teacher-tips.nce1-lessons-${start}-${end}.v1.json`;
    let batch;
    try { batch = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (!requireComplete && error.code === 'ENOENT') continue; throw error; }
    if (batch.schemaVersion !== '1.0.0' || !Number.isInteger(batch.revision) || batch.revision < 1 || !batch.author || !batch.ruleVersion || !batch.lessons) throw Error(`Invalid teacher tip metadata: ${path}`);
    const expected = sources.filter(source => source.courseId === 'nce1' && Number(source.lessonId.split('-')[1]) >= start && Number(source.lessonId.split('-')[1]) <= end);
    if (batch.sourceDigest && batch.sourceDigest !== teacherTipSourceDigest(expected)) throw Error(`Teacher tip source changed; review before rebuilding: ${path}`);
    if (requireComplete && !batch.sourceDigest) throw Error(`Teacher tip source fingerprint missing: ${path}`);
    const lessonIds = new Set(expected.map(source => source.lessonId));
    if (Object.keys(batch.lessons).length !== lessonIds.size) throw Error(`Missing or extra teacher tip lesson: ${path}`);
    for (const [number, tips] of Object.entries(batch.lessons)) {
      const lessonId = `lesson-${number}`;
      const lessonSources = expected.filter(source => source.lessonId === lessonId).sort((a, b) => a.sentenceOrder - b.sentenceOrder);
      if (!lessonIds.has(lessonId) || !Array.isArray(tips) || tips.length !== lessonSources.length) throw Error(`Teacher tip coverage mismatch: ${lessonId}`);
      lessonSources.forEach((source, index) => {
        const text = tips[index];
        if (typeof text !== 'string' || !text.trim() || covered.has(source.sentenceId)) throw Error(`Invalid or duplicate teacher tip: ${source.sentenceId}`);
        covered.add(source.sentenceId);
        records.set(source.sentenceId, { courseId: source.courseId, lessonId, sentenceId: source.sentenceId, english: source.english, text, author: batch.author, ruleVersion: batch.ruleVersion, reviewStatus: batch.reviewStatus });
      });
    }
    batches.push({ path, revision: batch.revision, ruleVersion: batch.ruleVersion });
  }
  if (requireComplete && covered.size !== sources.filter(source => source.courseId === 'nce1').length) throw Error('Incomplete NCE 1 teacher tips');
  // Keep the seven user-reviewed teaching references ahead of subsequent batch drafts.
  for (const tip of pilot.records) records.set(tip.sentenceId, { author: pilot.author, ruleVersion: pilot.ruleVersion, reviewStatus: pilot.reviewStatus, ...tip });
  const nce2Sources = new Map(sources.filter(source => source.courseId === 'nce2').map(source => [source.sentenceId, source]));
  for (const source of nce2Sources.values()) {
    let tip;
    try { tip = JSON.parse(await readFile(`content/teacher-tips/nce2/${source.sentenceId}.json`, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (tip.courseId !== source.courseId || tip.lessonId !== source.lessonId || tip.english !== source.english || tip.sentenceId !== source.sentenceId || !tip.text?.trim() || !tip.ruleVersion || tip.sourceDigest !== teacherTipSourceDigest([source])) throw Error(`Invalid NCE 2 teacher tip: ${source.sentenceId}`);
    records.set(source.sentenceId, tip);
  }
  return { schemaVersion: '1.0.0', revision: pilot.revision, batches, records: [...records.values()] };
}
