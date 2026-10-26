import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { loadPublishedUnderstanding, makeLetterShape } from './sentence-split-content.mjs';
import { validateUnderstanding } from './understanding-contract.mjs';
import { TEACHER_TIP_VERSION } from './teacher-tip-rules.mjs';
const plan = JSON.parse(await readFile('content/nce1-scan-correction.plan.v1.json', 'utf8'));
const sources = new Map(plan.lessons.flatMap(lesson => lesson.records).map(record => [record.sentenceId, record]));
const baseline = await loadPublishedUnderstanding({ withoutScanCorrection: true });
const normalized = text => text.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
const ipa = new Map();
for (const record of baseline.records) for (const word of record.words) if (word.phonetic && word.phonetic !== '待确认' && !ipa.has(normalized(word.text))) ipa.set(normalized(word.text), word.phonetic);
for (const path of await readdir('content/nce1-scan-correction-records')) {
  if (!path.endsWith('.json')) continue;
  const { record } = JSON.parse(await readFile(`content/nce1-scan-correction-records/${path}`, 'utf8'));
  for (const word of record.words) if (word.phonetic && word.phonetic !== '待确认' && !ipa.has(normalized(word.text))) ipa.set(normalized(word.text), word.phonetic);
}
const check = process.argv.find(arg => arg.startsWith('--check='))?.slice(8);
const paths = check ? [`${check}.json`] : (await readdir('content/nce1-scan-correction-codex')).filter(path => path.endsWith('.json')).sort();
const seen = new Set(), wrappers = [], uncertain = [];
for (const path of paths) {
  const batch = JSON.parse(await readFile(`content/nce1-scan-correction-codex/${path}`, 'utf8'));
  if (batch.author !== 'Codex') throw Error(`Invalid authorship ${path}`);
  const assigned = JSON.parse(await readFile(`reports/nce1-codex-assignments/${batch.batch}.json`, 'utf8'));
  const expected = new Set(assigned.map(record => record.sentenceId));
  if (batch.records.length !== assigned.length) throw Error(`${path}: ${batch.records.length} records, expected ${assigned.length}`);
  for (const item of batch.records) {
    if (!expected.delete(item.id) || seen.has(item.id)) throw Error(`Unassigned/duplicate ID ${item.id}`);
    seen.add(item.id);
    const source = sources.get(item.id), tokens = source.english.split(/\s+/);
    if (source.action === 'retain' || item.words.length !== tokens.length) throw Error(`${item.id}: ${item.words.length} word tuples, expected ${tokens.length}`);
    const range = ([start, end]) => {
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= tokens.length) throw Error(`${item.id}: invalid range ${start}-${end}`);
      return tokens.slice(start, end + 1).join(' ');
    };
    let position = 0;
    for (const part of item.parts) { if (part[0] !== position) throw Error(`${item.id}: noncontiguous part at ${part[0]}, expected ${position}`); position = part[1] + 1; }
    if (position !== tokens.length) throw Error(`${item.id}: incomplete parts`);
    const notes = item.notes.map(([title, text]) => ({ title, text }));
    const record = { courseId: source.courseId, lessonId: source.lessonId, sentenceId: source.sentenceId, sentenceOrder: source.sentenceOrder,
      english: source.english, chinese: item.chinese, intent: item.intent, comparison: null,
      parts: item.parts.map(part => ({ text: range(part), relation: part[2], meaning: part[3] })),
      notes, structureNotes: notes, structures: item.structures.map(group => ({ text: range(group), role: group[2], explanation: group[3] })),
      words: item.words.map(([meaning, pos, explicit], index) => { const phonetic = explicit || ipa.get(normalized(tokens[index])) || '待确认'; if (phonetic === '待确认') uncertain.push([item.id, tokens[index]]); return { text: tokens[index], meaning, pos, phonetic }; }),
      hints: { memoryNote: item.memoryHint, letterShape: makeLetterShape(source.english), answerNote: item.answerHint },
      teacherTip: { text: item.tip, ruleVersion: TEACHER_TIP_VERSION, reviewNote: 'Codex按句直接撰写并自检，非人工逐句核验。' },
      analysisSource: 'ai', analysisStatus: 'approved', ruleVersion: 'scan-correction-1.0.0', contentRevision: 6,
      reviewNote: 'Codex按扫描整理稿语境直接撰写并自检；无外部API调用，非人工逐句核验。' };
    const errors = validateUnderstanding(record);
    for (const value of [item.chinese, item.intent, item.tip, item.memoryHint, item.answerHint, ...record.words.flatMap(word => [word.meaning, word.pos])]) if (!/[\u3400-\u9fff]/u.test(value || '')) errors.push(`Chinese teaching required: ${value}`);
    if (errors.length) throw Error(`${item.id}: ${errors.join('; ')}`);
    wrappers.push({ schemaVersion: '1.0.0', revision: 6, sourceSha256: plan.source.sha256, author: 'Codex',
      reviewMethod: 'codex-authored-and-self-reviewed-not-human-verification', ruleVersion: TEACHER_TIP_VERSION, record });
  }
  if (expected.size) throw Error(`Missing assigned IDs ${path}`);
}
if (!check) {
  await mkdir('content/nce1-scan-correction-records', { recursive: true });
  for (const wrapper of wrappers) {
    const path = `content/nce1-scan-correction-records/${wrapper.record.sentenceId}.json`;
    try { const prior = JSON.parse(await readFile(path, 'utf8')); if (prior.author !== 'Codex') throw Error(`Cannot overwrite model-reviewed file ${path}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await writeFile(path, JSON.stringify(wrapper, null, 2) + '\n');
  }
}
console.log(JSON.stringify({ mode: check ? 'check-only' : 'compiled', records: wrappers.length, uncertainIPA: uncertain }, null, 2));
