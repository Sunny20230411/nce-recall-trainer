import { readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { teacherTipSourceDigest } from './teacher-tip-content.mjs';
import { TEACHER_TIP_VERSION } from './teacher-tip-rules.mjs';
import { validateUnderstanding } from './understanding-contract.mjs';

const sources = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8')).records.filter(source => source.courseId === 'nce2');
const pilots = JSON.parse(await readFile('content/sentence-understanding.pilot.v1.json', 'utf8')).records;
const context = { window: {} };
vm.runInNewContext(await readFile('nce2-content.js', 'utf8'), context);
const legacy = new Map(context.window.NCE2_COURSE_DATA.lessons.flatMap(lesson => lesson.sentences.map(sentence => [sentence.id, sentence])));
vm.runInNewContext(await readFile('assets/british-phonetics-data.js', 'utf8'), context);
vm.runInNewContext(await readFile('assets/british-english.js', 'utf8'), context);
const root = 'content/nce2-editorial';
const range = process.argv.find(value => value.startsWith('--range='))?.slice(8).split(':').map(Number);
const paths = (await readdir(root)).filter(path => path.endsWith('.json') && (!range || (Number(path.match(/lesson-(\d+)/)?.[1]) >= range[0] && Number(path.match(/lesson-(\d+)/)?.[1]) <= range[1]))).sort();
const entries = new Map();
for (const path of paths) {
  const batch = JSON.parse(await readFile(`${root}/${path}`, 'utf8'));
  if (batch.author !== 'Codex' || batch.ruleVersion !== TEACHER_TIP_VERSION || !Array.isArray(batch.records)) throw Error(`Invalid editorial metadata: ${path}`);
  for (const entry of batch.records) {
    if (entries.has(entry.id)) throw Error(`Duplicate editorial record: ${entry.id}`);
    entries.set(entry.id, entry);
  }
}
if (process.argv.includes('--require-complete') && entries.size !== sources.length) throw Error(`Editorial coverage ${entries.size}/${sources.length}`);
const plan = [];
let newAnalyses = 0, reviewedTips = 0;
async function existing(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
for (const [id, entry] of entries) {
  const source = sources.find(source => source.sentenceId === id);
  if (!source || (entry.english && entry.english !== source.english) || typeof entry.tip !== 'string' || !/[\u3400-\u9fff]/u.test(entry.tip)) throw Error(`Invalid editorial identity or tip: ${id}`);
  const path = `content/understanding-records/${id}.json`;
  const prior = pilots.find(record => record.sentenceId === id) || await existing(path);
  if (!prior || (prior.ruleVersion === 'understanding-zh-adult-codex-1.0.0' && prior.analysisSource !== 'human' && entry.analysis)) {
    const data = entry.analysis;
    const tokens = source.english.split(/\s+/);
    if (!data || !Array.isArray(data.words) || data.words.length !== tokens.length) throw Error(`Missing authored analysis/word alignment: ${id}`);
    const original = legacy.get(id);
    if (!original || original.english !== source.english) throw Error(`Legacy source mismatch: ${id}`);
    const record = {
      ...source, chinese: data.translation, intent: data.intent, comparison: null,
      parts: data.parts.map(([text, relation, meaning]) => ({ text, relation, meaning })),
      structureNotes: data.notes.map(([title, text]) => ({ title, text })),
      notes: data.notes.map(([title, text]) => ({ title, text })),
      structures: data.structures.map(([text, role, explanation]) => ({ text, role, explanation })),
      words: data.words.map(([meaning, pos, phonetic], index) => ({ text: tokens[index], meaning, pos, phonetic: phonetic || context.window.britishPhoneticFor(tokens[index], original.analysis.tokens[index]?.phonetic || '', source.english, index) })),
      analysisSource: 'ai', analysisStatus: 'approved', ruleVersion: 'understanding-zh-adult-codex-1.0.0',
      reviewNote: 'Codex逐句撰写并自检，非外部API生成、非逐句人工核验。'
    };
    delete record.context;
    const errors = validateUnderstanding(record);
    for (const value of [record.chinese, record.intent, ...record.parts.flatMap(part => [part.relation, part.meaning]), ...record.structureNotes.map(note => note.text)]) if (!/[\u3400-\u9fff]/u.test(value || '')) errors.push('Chinese teaching explanation required');
    if (errors.length) throw Error(`${id}: ${errors.join('; ')}`);
    plan.push([path, record]);
    if (!prior) newAnalyses++;
  } else if (entry.analysis) {
    // Existing approved or human records are authoritative, even if a draft supplied analysis.
    if (prior.english !== source.english || validateUnderstanding(prior).length) throw Error(`Invalid protected analysis: ${id}`);
  }
  const tipPath = `content/teacher-tips/nce2/${id}.json`;
  const priorTip = await existing(tipPath);
  const editorialDigest = createHash('sha256').update(JSON.stringify(entry)).digest('hex');
  if (priorTip?.editorialDigest === editorialDigest) { reviewedTips++; continue; }
  if (priorTip?.author === 'human') {
    if (entry.tip !== priorTip.text) throw Error(`Cannot overwrite human tip: ${id}`);
    continue;
  }
  const unchanged = priorTip?.text === entry.tip;
  const tip = {
    ...priorTip, schemaVersion: '1.0.0', revision: (priorTip?.revision || 0) + 1,
    courseId: source.courseId, lessonId: source.lessonId, sentenceId: id, english: source.english,
    text: entry.tip, sourceDigest: teacherTipSourceDigest([source]), ruleVersion: TEACHER_TIP_VERSION,
    author: priorTip?.author || 'Codex', editorialAuthor: 'Codex', editorialDigest,
    reviewStatus: unchanged ? priorTip.reviewStatus : 'authored-and-self-reviewed-awaiting-user-review',
    reviewNote: unchanged ? priorTip.reviewNote : 'Codex逐句撰写或修订并自检；非逐句人工核验。',
    accuracyReview: { version: 'nce2-expression-accuracy-1.0.0', model: 'Codex', method: 'codex-editorial-self-review-not-human-verification', note: '按完整名师提点标准复查表达意图、中英差异、信息组织、表达选择和迁移价值。' }
  };
  plan.push([tipPath, tip]);
  reviewedTips++;
}
for (const [path, value] of plan) {
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n');
  await rename(`${path}.tmp`, path);
}
console.log(JSON.stringify({ editorialRecords: entries.size, newAnalyses, reviewedTips, externalApiCalls: 0 }));
