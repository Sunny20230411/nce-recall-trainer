import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { teacherTipRules, teacherTipReviewRules, TEACHER_TIP_VERSION } from './teacher-tip-rules.mjs';
import { teacherTipSourceDigest } from './teacher-tip-content.mjs';

process.loadEnvFile('.env.local');
const courseId = process.argv.find(value => value.startsWith('--course='))?.split('=')[1] || 'nce2';
if (courseId !== 'nce2') throw Error('This generator is restricted to NCE 2');
if (!process.env.ARK_API_KEY || !process.env.ARK_MODEL) throw Error('Missing ARK configuration');
const sources = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8')).records.filter(source => source.courseId === courseId);
const standard = await readFile('docs/teacher-tip-standard.zh-CN.md', 'utf8');
const references = JSON.parse(await readFile('content/teacher-tips.editorial-pilot.v1.json', 'utf8')).records.map(({ english, text }) => ({ english, text }));
const calibration = `质量校准：参考示例的教学深度，不照抄句式。不得凭空声称“不要硬加已经”“不用绕成我觉得”“比直译更自然”等，除非替代说法确实有问题且给出成立的具体对照。I thought the play was interesting、I sat in a good seat均可自然成立，不应贬低。时间背景不意味着后面所有动词只能用过去时。过去进行时描述当时正在进行，不保证一直持续或从未中断。不要用“强调”随意替代语义解释。优先点透真正关键的意义选择，允许简单句短讲。\n参考：${JSON.stringify(references)}`;
const root = `content/teacher-tips/${courseId}`;
const reportRoot = `reports/teacher-tip-generation/${courseId}`;
await mkdir(root, { recursive: true });
await mkdir(reportRoot, { recursive: true });
const concurrency = Math.max(1, Math.min(12, Number(process.env.TEACHER_TIP_CONCURRENCY || 6)));
const limit = Number(process.env.TEACHER_TIP_LIMIT || Infinity);
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: 'string' };
const outputFormat = (reviewed, count) => ({ type: 'json_schema', name: reviewed ? 'reviewed_tips' : 'teacher_tips', strict: true, schema: object({ records: { type: 'array', minItems: count, maxItems: count, items: object({ sentenceId: string, body: string, ...(reviewed ? { approved: { type: 'boolean' }, reason: string } : {}) }) } }) });
const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
async function atomic(path, data) {
  await writeFile(`${path}.tmp`, JSON.stringify(data, null, 2) + '\n');
  await rename(`${path}.tmp`, path);
}
async function model(rules, data, reviewed) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(150000),
        body: JSON.stringify({ model: process.env.ARK_MODEL, store: false, thinking: { type: 'disabled' }, max_output_tokens: 6000, text: { format: outputFormat(reviewed, data.length) }, input: [{ role: 'system', content: `${rules}\n完整标准：\n${standard}\n${calibration}\n必须按输入顺序返回恰好${data.length}条，sentenceId逐项原样复制。reason一句话简短说明，不写思考过程。` }, { role: 'user', content: JSON.stringify(data) }] })
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        const code = String(details.error?.code || 'UnknownError');
        const error = Error(`Model HTTP ${response.status}: ${code}`);
        error.fatal = [400, 401, 403, 404].includes(response.status) || code === 'SetLimitExceeded';
        throw error;
      }
      const result = await response.json();
      usage.calls++;
      usage.inputTokens += result.usage?.input_tokens || 0;
      usage.outputTokens += result.usage?.output_tokens || 0;
      const raw = (result.output || []).filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('');
      return JSON.parse(raw).records;
    } catch (error) {
      if (error.fatal || attempt === 5) throw error;
      await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
    }
  }
}
function index(items, batch, reviewed) {
  if (!Array.isArray(items) || items.length !== batch.length) throw Error('Response count mismatch');
  const map = new Map(items.map(item => [item.sentenceId, item]));
  if (map.size !== batch.length || batch.some(source => !map.has(source.sentenceId))) throw Error('Response identities changed');
  for (const item of items) {
    if (typeof item.body !== 'string' || !/[\u3400-\u9fff]/u.test(item.body) || !item.body.trim() || item.body.length > 1200 || /^(?:名师提点|老师提点|#{1,6}\s)/.test(item.body.trim())) throw Error('Invalid tip body');
    if (reviewed && item.approved !== true) throw Error(`Review rejected ${item.sentenceId}: ${item.reason}`);
  }
  return map;
}
if (process.argv.includes('--accuracy-review')) {
  const accuracyVersion = 'nce2-expression-accuracy-1.0.0';
  const auditRules = `${teacherTipReviewRules}\n这次是专门的准确性与教学价值复核，尤其纠正已经被前次审核漏过的错误。all week 不意味着从上周开始；过去进行时不保证一直无中断。you can't answer 可以自然描述客观处境，不意味着能力差；不能声称 it's impossible 更合适而不给真实语境依据。动作作话题常用-ing，也可用不定式等形式，不讲成所有句子必须-ing。地点、时间在不同位置都可能自然，不能凭词序断定其他位置不自然。遇到 one of ... who 等复杂一致现象，不轻率编造“重点不同所以任意变单复数”的规律。at last 可带终于的意味，不能必然推断疲惫或情绪。英文引用和中文时间范围必须一一核准。不要以现在完成时必然持续到现在、过去式必然不再持续等绝对判断教学。\n如果提点仅复述语法结构，改为当前句子最有价值的一处表达判断；有价值的短句不为改而改。对中文的有、让、被、觉得等词，区分表达角度而不制造错误。能修好就返回修订的body与approved=true，不要在reason长篇反思。真正有重大语境歧义才approved=false。`;
  const pending = [];
  let missing = 0;
  for (const source of sources) {
    let prior;
    try { prior = JSON.parse(await readFile(`${root}/${source.sentenceId}.json`, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT' && process.argv.includes('--available-only')) { missing++; continue; } throw error; }
    if (prior.sourceDigest !== teacherTipSourceDigest([source]) || prior.english !== source.english) throw Error(`Source drift: ${source.sentenceId}`);
    if (prior.author !== 'human' && prior.accuracyReview?.version !== accuracyVersion) pending.push({ source, prior });
  }
  let cursor = 0, checked = sources.length - pending.length - missing, changed = 0, failed = 0, fatal = null;
  const batches = [];
  for (let i = 0; i < pending.length; i += 4) batches.push(pending.slice(i, i + 4));
  const timer = setInterval(() => console.log(`Accuracy review checked=${checked}/${sources.length} changed=${changed} failed=${failed}`), 30000);
  try {
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (cursor < batches.length && !fatal) {
        const batch = batches[cursor++];
        try {
          const result = index(await model(auditRules, batch.map(({ source, prior }) => ({ sentenceId: source.sentenceId, english: source.english, chinese: source.chinese, context: source.context, proposedTip: prior.text })), true), batch.map(item => item.source), true);
          for (const { source, prior } of batch) {
            const review = result.get(source.sentenceId);
            const text = review.body.trim();
            if (text !== prior.text) changed++;
            await atomic(`${root}/${source.sentenceId}.json`, { ...prior, revision: prior.revision + 1, text, accuracyReview: { version: accuracyVersion, model: process.env.ARK_MODEL, note: review.reason, method: 'separate-model-request-not-human-verification' } });
            checked++;
          }
        } catch (error) {
          failed += batch.length;
          if (error.fatal) fatal = error.message;
          await atomic(`${reportRoot}/${batch[0].source.sentenceId}-accuracy-failure.json`, { sentenceIds: batch.map(item => item.source.sentenceId), error: error.message });
          console.error(`Accuracy failure ${batch[0].source.sentenceId}: ${error.message}`);
        }
      }
    }));
  } finally { clearInterval(timer); }
  await atomic(`${reportRoot}/accuracy-run.json`, { accuracyVersion, checked, changed, missing, failed, fatal, usage });
  console.log(JSON.stringify({ checked, changed, missing, failed, fatal, usage }));
  process.exit(failed || fatal ? 1 : 0);
}
const pending = [];
for (const source of sources) {
  try {
    const prior = JSON.parse(await readFile(`${root}/${source.sentenceId}.json`, 'utf8'));
    if (prior.english !== source.english || prior.sourceDigest !== teacherTipSourceDigest([source])) throw Error(`Source drift: ${source.sentenceId}`);
    if (prior.author === 'human' || (prior.ruleVersion === TEACHER_TIP_VERSION && prior.text?.trim() && ['model-reviewed-awaiting-user-review', 'authored-and-self-reviewed-awaiting-user-review'].includes(prior.reviewStatus))) continue;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  pending.push(source);
}
const selected = pending.slice(0, limit);
const batches = [];
for (let i = 0; i < selected.length; i += 6) batches.push(selected.slice(i, i + 6));
let cursor = 0, completed = sources.length - pending.length, failed = 0, fatal = null;
console.log(`Model ${process.env.ARK_MODEL}; ${sources.length} sentences; pending ${pending.length}; workers ${concurrency}`);
const timer = setInterval(() => console.log(`Teacher tips completed=${completed}/${sources.length} failed=${failed}`), 30000);
async function generate(batch) {
  const data = batch.map(source => ({ sentenceId: source.sentenceId, english: source.english, chinese: source.chinese, context: source.context, lesson: source.lesson }));
  const cachePath = `${reportRoot}/${batch[0].sentenceId}-draft.json`;
  try {
    let draft;
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf8'));
      if (cached.ruleVersion === TEACHER_TIP_VERSION && cached.sourceDigest === teacherTipSourceDigest(batch)) draft = index(cached.records, batch, false);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!draft) {
      draft = index(await model(teacherTipRules, data, false), batch, false);
      await atomic(cachePath, { ruleVersion: TEACHER_TIP_VERSION, sourceDigest: teacherTipSourceDigest(batch), records: [...draft.values()] });
    }
    const reviewed = index(await model(teacherTipReviewRules, data.map(item => ({ ...item, proposedTip: draft.get(item.sentenceId).body })), true), batch, false);
    for (const source of batch) {
      let review = reviewed.get(source.sentenceId);
      for (let repair = 0; review.approved !== true && repair < 2; repair++) {
        const item = data.find(item => item.sentenceId === source.sentenceId);
        const fixed = index(await model(teacherTipRules, [{ ...item, rejectedTip: review.body, correctionRequired: review.reason }], false), [source], false).get(source.sentenceId);
        review = index(await model(teacherTipReviewRules, [{ ...item, proposedTip: fixed.body }], true), [source], false).get(source.sentenceId);
      }
      if (review.approved !== true) {
        failed++;
        await atomic(`${reportRoot}/${source.sentenceId}-failure.json`, { sentenceIds: [source.sentenceId], error: `Review rejected: ${review.reason}` });
        continue;
      }
      await atomic(`${root}/${source.sentenceId}.json`, { schemaVersion: '1.0.0', revision: 1, courseId, lessonId: source.lessonId, sentenceId: source.sentenceId, english: source.english, text: review.body.trim(), sourceDigest: teacherTipSourceDigest([source]), ruleVersion: TEACHER_TIP_VERSION, author: process.env.ARK_MODEL, reviewStatus: 'model-reviewed-awaiting-user-review', reviewNote: `独立请求模型复核，非逐句人工审核：${review.reason}` });
      completed++;
    }
  } catch (error) {
    failed += batch.length;
    if (error.fatal) fatal = error.message;
    await atomic(`${reportRoot}/${batch[0].sentenceId}-failure.json`, { sentenceIds: batch.map(source => source.sentenceId), error: error.message });
    console.error(`Failed ${batch[0].sentenceId}: ${error.message}`);
  }
}
try {
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < batches.length && !fatal) await generate(batches[cursor++]);
  }));
} finally { clearInterval(timer); }
await atomic(`${reportRoot}/latest-run.json`, { model: process.env.ARK_MODEL, ruleVersion: TEACHER_TIP_VERSION, total: sources.length, completed, failed, fatal, usage });
console.log(JSON.stringify({ total: sources.length, completed, failed, fatal, usage }));
if (failed || fatal) process.exitCode = 1;
