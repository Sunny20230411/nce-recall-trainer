import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { teacherTipRules, TEACHER_TIP_VERSION } from './teacher-tip-rules.mjs';
import { validateUnderstanding } from './understanding-contract.mjs';
import { makeLetterShape } from './sentence-split-content.mjs';
process.loadEnvFile('.env.local');
if (!process.env.ARK_API_KEY || !process.env.ARK_MODEL) throw Error('Missing configured model credentials');
const plan = JSON.parse(await readFile('content/nce1-scan-correction.plan.v1.json', 'utf8'));
const standard = await readFile('docs/teacher-tip-standard.zh-CN.md', 'utf8');
const root = 'content/nce1-scan-correction-records', reportRoot = 'reports/nce1-scan-correction-generation';
await mkdir(root, { recursive: true }); await mkdir(reportRoot, { recursive: true });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string' }, integer = { type: 'integer' }, array = items => ({ type: 'array', minItems: 1, items });
const entrySchema = object({ sentenceId: str, chinese: str, intent: str, teacherTip: str,
  parts: array(object({ start: integer, end: integer, relation: str, meaning: str })),
  notes: array(object({ title: str, text: str })), structures: array(object({ start: integer, end: integer, role: str, explanation: str })),
  words: array(object({ meaning: str, pos: str, phonetic: str })),
  memoryHint: str, answerHint: str, reviewNote: str });
const rules = `${teacherTipRules}\n${standard}\n你正在修正新概念英语第一册与扫描整理原文不符的内容。英文是已确定的原文，不得改写，邻近句只作语境。仅给指定句子补齐完整静态教学数据。parts和structures使用给定tokens的零起始闭区间，parts依序连续覆盖全部tokens且不能重叠，structures可嵌套但只能在本句内。parts的relation说明信息作用，structures的role说明句法角色，words.pos才是词性，不混淆。words严格对应每个空格词项，各一项，不能拆缩写，不得遗漏标点词项。phonetic用英式IPA（斜线包裹），meaning为本句准确中文义；无实义助动词用中文说明功能，不强译成是。完整收缩词的词义与词性可说明其组成。人名与地名音标尽力准确，确实不能确定写“待确认”，不得编造。parts.meaning是中文自然语义；notes选1-3个关键结构说明；teacherTip遵循完整名师提点规则。memoryHint是不给完整英文答案的中文思路提示；answerHint是简短中文解释。所有中文说明字段必须含中文（人名含中文译名；字母拼读可解释为字母名）。英语单词拼读I-N-T-E-L-L-I-G-E-N-T是一个原文词项，保留整串。电话号码是数字原文，不拼读成别的答案。不要把正确的完整形式误说成不自然；不要把修饰范围、比较、时态或双重否定解释反；引语、标题碎片和短答因句施教，不因不完整而拒绝。不要输出思考过程。reviewNote只简述校验结果，不假称人工核验。`;
const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
async function atomic(path, data) { await writeFile(`${path}.tmp`, JSON.stringify(data, null, 2) + '\n'); await rename(`${path}.tmp`, path); }
function assemble(entry, source, reviewed) {
  const tokens = source.english.split(/\s+/);
  if (entry.sentenceId !== source.sentenceId || entry.words.length !== tokens.length) throw Error(`Word count/identity mismatch ${source.sentenceId}`);
  const range = group => {
    if (!Number.isInteger(group.start) || !Number.isInteger(group.end) || group.start < 0 || group.end < group.start || group.end >= tokens.length) throw Error(`Invalid range ${source.sentenceId}`);
    return tokens.slice(group.start, group.end + 1).join(' ');
  };
  let next = 0;
  for (const part of entry.parts) { if (part.start !== next) throw Error(`Noncontiguous parts ${source.sentenceId}`); next = part.end + 1; }
  if (next !== tokens.length) throw Error(`Incomplete parts ${source.sentenceId}`);
  const record = { courseId: source.courseId, lessonId: source.lessonId, sentenceId: source.sentenceId, sentenceOrder: source.sentenceOrder,
    english: source.english, chinese: entry.chinese, intent: entry.intent, comparison: null,
    parts: entry.parts.map(part => ({ text: range(part), relation: part.relation, meaning: part.meaning })),
    notes: entry.notes, structureNotes: entry.notes,
    structures: entry.structures.map(group => ({ text: range(group), role: group.role, explanation: group.explanation })),
    words: entry.words.map((word, i) => ({ text: tokens[i], ...word })),
    hints: { memoryNote: entry.memoryHint, letterShape: makeLetterShape(source.english), answerNote: entry.answerHint },
    teacherTip: { text: entry.teacherTip, ruleVersion: TEACHER_TIP_VERSION, reviewNote: entry.reviewNote },
    analysisSource: 'ai', analysisStatus: reviewed ? 'approved' : 'generated', ruleVersion: 'scan-correction-1.0.0', contentRevision: 6,
    reviewNote: `豆包生成并独立请求复核，非人工逐句核验。${entry.reviewNote}` };
  const errors = validateUnderstanding(record);
  for (const value of [entry.chinese, entry.intent, entry.teacherTip, entry.memoryHint, entry.answerHint, ...entry.words.flatMap(w => [w.meaning, w.pos]), ...entry.parts.flatMap(p => [p.meaning, p.relation]), ...entry.notes.map(n => n.text)]) if (!/[\u3400-\u9fff]/u.test(value || '')) errors.push(`Chinese teaching required, replace or explain this value in Chinese: ${JSON.stringify(value)}`);
  if (errors.length) throw Error(`${source.sentenceId}: ${errors.join('; ')}`);
  return record;
}
async function request(batch, review, feedback) {
  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', { method: 'POST',
    headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(240000),
    body: JSON.stringify({ model: process.env.ARK_MODEL, store: false, thinking: { type: 'disabled' }, max_output_tokens: 15000,
      text: { format: { type: 'json_schema', name: 'nce1_corrected_teaching', strict: true, schema: object({ records: { type: 'array', minItems: batch.length, maxItems: batch.length, items: entrySchema } }) } },
      input: [{ role: 'system', content: rules + (review ? '\n本次为独立复核。逐条检查给定draft，不照抄可能的错译、词义、音标、角色和过度概括；直接返回修订后的全部字段。特别审查teacherTip是否只在复述翻译或堆语法，必要时重写，简单短答不要强行制造中英差异。' : '\n本次生成正文，不返回字段之外的内容。') + (feedback ? `\n必须修复上次校验错误：${feedback}` : '') },
        { role: 'user', content: JSON.stringify(batch) }] }) });
  if (!response.ok) { const details = await response.json().catch(() => ({})); const error = Error(`Model HTTP ${response.status}: ${details.error?.code || 'unknown'}`); error.fatal = [401,403,404].includes(response.status) || details.error?.code === 'SetLimitExceeded'; throw error; }
  const data = await response.json(); usage.calls++; usage.inputTokens += data.usage?.input_tokens || 0; usage.outputTokens += data.usage?.output_tokens || 0;
  const text = (data.output || []).filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('');
  return JSON.parse(text).records;
}
const pending = [];
for (const lesson of plan.lessons) for (const source of lesson.records.filter(source => source.action !== 'retain')) {
  try {
    const prior = JSON.parse(await readFile(`${root}/${source.sentenceId}.json`, 'utf8'));
    if (prior.sourceSha256 === plan.source.sha256 && prior.record.english === source.english && prior.reviewMethod === 'separate-model-request-not-human-verification' && !validateUnderstanding(prior.record).length) continue;
  } catch {}
  pending.push({ ...source, tokens: source.english.split(/\s+/).map((text, index) => ({ index, text })), context: lesson.sourceText });
}
const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.slice(8) || Infinity);
const selected = pending.slice(0, limit), batches = [];
for (let i = 0; i < selected.length; i += 3) batches.push(selected.slice(i, i + 3));
let cursor = 0, completed = 0, failed = 0, fatal;
const concurrency = Math.max(1, Math.min(5, Number(process.env.SCAN_CORRECTION_CONCURRENCY || 5)));
console.log(JSON.stringify({ totalChanged: plan.lessons.flatMap(l => l.records).filter(r => r.action !== 'retain').length, pending: pending.length, selected: selected.length, concurrency }));
const timer = setInterval(() => console.log(JSON.stringify({ completed, selected: selected.length, failed, usage })), 30000);
try {
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < batches.length && !fatal) {
      const batch = batches[cursor++];
      try {
        let draft, reviewed, errorMessage = '';
        const draftPath = `${reportRoot}/${batch[0].sentenceId}-draft.json`;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (!draft) {
              if (!errorMessage) try { const cache = JSON.parse(await readFile(draftPath, 'utf8')); if (cache.sourceSha256 === plan.source.sha256) draft = cache.records; } catch {}
              if (!draft) { draft = await request(batch, false, errorMessage); await atomic(draftPath, { sourceSha256: plan.source.sha256, records: draft }); }
            }
            if (draft.length !== batch.length) throw Error('Draft count mismatch');
            draft.forEach((entry, i) => assemble(entry, batch[i], false));
            reviewed = await request(batch.map((source, i) => ({ ...source, draft: draft[i] })), true, errorMessage);
            if (reviewed.length !== batch.length) throw Error('Review count mismatch');
            reviewed.forEach((entry, i) => assemble(entry, batch[i], true));
            break;
          } catch (error) { if (error.fatal || attempt === 2) throw error; errorMessage = error.message; draft = null; console.error(`Retry ${batch[0].sentenceId}: ${errorMessage}`); }
        }
        for (const [index, source] of batch.entries()) await atomic(`${root}/${source.sentenceId}.json`, {
          schemaVersion: '1.0.0', revision: 6, sourceSha256: plan.source.sha256, author: process.env.ARK_MODEL,
          reviewMethod: 'separate-model-request-not-human-verification', ruleVersion: TEACHER_TIP_VERSION,
          record: assemble(reviewed[index], source, true)
        });
        completed += batch.length; console.log(`Reviewed ${completed}/${selected.length}: ${batch[0].lessonId}`);
      } catch (error) { failed += batch.length; if (error.fatal) fatal = error.message; await atomic(`${reportRoot}/${batch[0].sentenceId}-failure.json`, { sentenceIds: batch.map(s => s.sentenceId), error: error.message }); console.error(error.message); }
    }
  }));
} finally { clearInterval(timer); }
await atomic(`${reportRoot}/latest-run.json`, { completed, selected: selected.length, pending: pending.length, failed, fatal: fatal || null, usage });
console.log(JSON.stringify({ completed, selected: selected.length, failed, fatal, usage }));
if (failed || fatal) process.exitCode = 1;
