import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateUnderstanding } from './understanding-contract.mjs';
import { teacherTipSourceDigest } from './teacher-tip-content.mjs';
import { TEACHER_TIP_VERSION } from './teacher-tip-rules.mjs';
function stableWords(record, old) {
  const words = record.words, prior = old?.words || [];
  const normalize = text => text.toLowerCase().replace(/[^a-z0-9']/g, '');
  const n = prior.length, m = words.length, d = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) d[i][0] = i;
  for (let j = 1; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (normalize(prior[i - 1].text) === normalize(words[j - 1].text) ? 0 : 1));
  const mapping = new Map(); let i = n, j = m;
  while (i || j) {
    if (i && j && d[i][j] === d[i - 1][j - 1] + (normalize(prior[i - 1].text) === normalize(words[j - 1].text) ? 0 : 1)) { mapping.set(j - 1, i - 1); i--; j--; }
    else if (i && d[i][j] === d[i - 1][j] + 1) i--; else j--;
  }
  return words.map((word, index) => {
    const priorIndex = mapping.get(index);
    return { ...word, tokenId: priorIndex === undefined ? `${record.sentenceId}-token-r6-${String(index).padStart(3, '0')}` : prior[priorIndex].tokenId || `${old.parentSentenceId || old.sentenceId}-token-${String((old.tokenOffset || 0) + priorIndex).padStart(3, '0')}` };
  });
}
export async function applyScanCorrection(published) {
  let release;
  try { release = JSON.parse(await readFile('content/nce1-scan-correction.release.v1.json', 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return published; throw error; }
  if (release.status !== 'complete' || release.revision !== 6) throw Error('Scan correction is not release-ready');
  const plan = JSON.parse(await readFile('content/nce1-scan-correction.plan.v1.json', 'utf8'));
  const digest = createHash('sha256').update(JSON.stringify(published.sources.map(record => [record.courseId, record.lessonId, record.sentenceId, record.english]))).digest('hex');
  if (digest !== plan.baselineDigest || release.sourceSha256 !== plan.source.sha256) throw Error('Scan correction source fingerprint changed');
  const originals = new Map(published.records.map(record => [record.sentenceId, record]));
  const oldTips = new Map(published.teacherTips.records.map(record => [record.sentenceId, record]));
  let editorial = { records: {} };
  try { editorial = JSON.parse(await readFile('content/nce1-scan-correction.editorial.v1.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const replacements = new Map(), changedTips = [], runtimeLessons = [];
  for (const lesson of plan.lessons) {
    const records = [];
    for (const source of lesson.records) {
      const old = originals.get(source.sentenceId);
      if (old?.analysisSource === 'human' && old.english !== source.english) throw Error(`Protected human analysis: ${source.sentenceId}`);
      let record, tip;
      if (source.action === 'retain') {
        if (!old || old.english !== source.english) throw Error(`Retained source mismatch ${source.sentenceId}`);
        record = { ...old, sentenceOrder: source.sentenceOrder };
        tip = oldTips.get(source.sentenceId);
      } else {
        const file = JSON.parse(await readFile(`content/nce1-scan-correction-records/${source.sentenceId}.json`, 'utf8'));
        const codexAuthored = file.author === 'Codex' && file.reviewMethod === 'codex-authored-and-self-reviewed-not-human-verification';
        if (file.sourceSha256 !== plan.source.sha256 || (file.reviewMethod !== 'separate-model-request-not-human-verification' && !codexAuthored)) throw Error(`Unreviewed correction ${source.sentenceId}`);
        record = { ...file.record, words: stableWords(file.record, old) };
        const correction = editorial.records[source.sentenceId];
        if (correction) record = { ...record, ...(correction.chinese ? { chinese: correction.chinese } : {}),
          ...(correction.intent ? { intent: correction.intent } : {}),
          words: record.words.map((word, index) => ({ ...word, ...(correction.wordMeanings?.[index] ? { meaning: correction.wordMeanings[index] } : {}) })),
          teacherTip: { ...record.teacherTip, text: correction.teacherTip || record.teacherTip.text },
          reviewNote: `${record.reviewNote} Codex对译意或过度概括作补充校正，非人工核验。` };
        if (record.english !== source.english || record.sentenceId !== source.sentenceId || record.courseId !== 'nce1' || record.lessonId !== source.lessonId) throw Error(`Correction identity mismatch ${source.sentenceId}`);
        tip = { courseId: 'nce1', lessonId: source.lessonId, sentenceId: record.sentenceId, english: record.english,
          text: record.teacherTip.text, author: file.author, ruleVersion: TEACHER_TIP_VERSION, revision: 6,
          sourceDigest: teacherTipSourceDigest([record]), reviewStatus: codexAuthored ? 'authored-and-self-reviewed-awaiting-user-review' : 'model-reviewed-awaiting-user-review', reviewNote: record.reviewNote,
          accuracyReview: { version: 'nce2-expression-accuracy-1.0.0', model: file.author, method: file.reviewMethod, note: record.reviewNote } };
      }
      const errors = validateUnderstanding(record);
      if (errors.length || !tip?.text) throw Error(`${source.sentenceId}: ${errors.join('; ') || 'Missing teacher tip'}`);
      records.push(record); changedTips.push(tip);
    }
    if (records.map(record => record.english).join(' ') !== lesson.sourceText) throw Error(`Scan reconstruction failed ${lesson.lessonId}`);
    replacements.set(lesson.lessonId, records);
    runtimeLessons.push({ courseId: 'nce1', lessonId: lesson.lessonId, revision: 6,
      baseline: lesson.baseline.map(record => ({ id: record.sentenceId, english: record.english })),
      sentences: records.map(record => ({ id: record.sentenceId, english: record.english, chinese: record.chinese,
        ...(record.parentSentenceId ? { parentSentenceId: record.parentSentenceId, parentEnglish: record.parentEnglish, tokenOffset: record.tokenOffset } : {}),
        contentRevision: 6, hints: record.hints || { memoryNote: record.intent, letterShape: '', answerNote: record.intent },
        analysis: { indexBase: 0, tokens: record.words.map(word => ({ text: word.text, displayText: word.text, punctuation: '', phonetic: word.phonetic, translation: word.meaning, posLabel: word.pos })),
          groups: [{ id: `${record.sentenceId}-root`, type: 'independent_element', label: '练习单元', startToken: 0, endToken: record.words.length - 1, parentGroupId: null }] }
      })) });
  }
  const records = [], handled = new Set();
  for (const original of published.records) {
    if (original.courseId !== 'nce1' || !replacements.has(original.lessonId)) { records.push(original); continue; }
    if (!handled.has(original.lessonId)) { records.push(...replacements.get(original.lessonId)); handled.add(original.lessonId); }
  }
  const oldSources = new Map(published.sources.map(source => [source.sentenceId, source]));
  const sources = records.map(record => ({ courseId: record.courseId, lessonId: record.lessonId, sentenceId: record.sentenceId,
    sentenceOrder: record.sentenceOrder, english: record.english, chinese: record.chinese,
    lesson: oldSources.get(record.sentenceId)?.lesson || plan.lessons.find(lesson => lesson.lessonId === record.lessonId)?.lesson,
    ...(record.parentSentenceId ? { parentSentenceId: record.parentSentenceId, parentEnglish: record.parentEnglish, tokenOffset: record.tokenOffset } : {}) }));
  if (new Set(records.map(record => record.sentenceId)).size !== records.length) throw Error('Duplicate corrected stable ID');
  return { ...published, revision: 6, records, sources, complete: true,
    teacherTips: { ...published.teacherTips, revision: 6, records: [...published.teacherTips.records.filter(tip => tip.courseId !== 'nce1' || !replacements.has(tip.lessonId)), ...changedTips] },
    practiceCorrections: { revision: 6, sourceSha256: plan.source.sha256, lessons: runtimeLessons } };
}
