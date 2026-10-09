import { readFile, writeFile, rename } from 'node:fs/promises';
import { validateUnderstanding } from './understanding-contract.mjs';
import { teacherTipRules, teacherTipReviewRules, TEACHER_TIP_VERSION } from './teacher-tip-rules.mjs';

process.loadEnvFile('.env.local');
const source = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8'));
const sources = source.records.filter(record => record.courseId === 'nce1' && record.lessonId === 'lesson-37');
const records = await Promise.all(sources.map(record => readFile(`content/understanding-records/${record.sentenceId}.json`, 'utf8').then(JSON.parse)));
const pending = records.filter(record => record.analysisSource !== 'human' && record.teacherTip?.ruleVersion !== TEACHER_TIP_VERSION);
if (!pending.length) { console.log('No missing Lesson 37 teacher tips.'); process.exit(0); }
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = { type: 'string' };
const id = { type: 'string', enum: pending.map(record => record.sentenceId) };
const format = (name, fields) => ({ type: 'json_schema', name, strict: true, schema: object({ records: { type: 'array', minItems: pending.length, maxItems: pending.length, items: object({ sentenceId: id, ...fields }) } }) });
async function model(instruction, data, outputFormat) {
  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ model: process.env.ARK_MODEL, store: false, thinking: { type: 'disabled' }, max_output_tokens: 6500, text: { format: outputFormat }, input: [{ role: 'system', content: instruction }, { role: 'user', content: JSON.stringify(data) }] })
  });
  if (!response.ok) throw Error(`Model HTTP ${response.status}`);
  const result = await response.json();
  const raw = (result.output || []).filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('');
  return JSON.parse(raw).records;
}
function index(items) {
  if (!Array.isArray(items) || items.length !== pending.length) throw Error('Teacher tip count mismatch');
  const map = new Map(items.map(item => [item.sentenceId, item]));
  if (map.size !== pending.length || pending.some(record => !map.has(record.sentenceId))) throw Error('Teacher tip identities changed');
  return map;
}
const data = pending.map(record => ({ record: { sentenceId: record.sentenceId, english: record.english, chinese: record.chinese }, context: sources.find(source => source.sentenceId === record.sentenceId).context }));
const draft = index(await model(teacherTipRules, data, format('teacher_tips', { body: string })));
const reviewed = index(await model(teacherTipReviewRules, data.map(item => ({ ...item, proposedTip: draft.get(item.record.sentenceId).body })), format('reviewed_teacher_tips', { body: string, approved: { type: 'boolean' }, reason: string })));
const updates = pending.map(record => {
  const review = reviewed.get(record.sentenceId);
  if (!review.approved) throw Error(`${record.sentenceId}: reviewer rejected: ${review.reason}`);
  const updated = { ...record, teacherTip: { text: review.body.trim(), ruleVersion: TEACHER_TIP_VERSION, reviewNote: `独立模型复核：${review.reason}（非逐句人工审核）` } };
  const errors = validateUnderstanding(updated);
  if (errors.length) throw Error(`${record.sentenceId}: ${errors.join('; ')}`);
  const { teacherTip, ...original } = updated;
  const { teacherTip: priorTip, ...prior } = record;
  if (JSON.stringify(original) !== JSON.stringify(prior)) throw Error('Existing explanation changed');
  return updated;
});
for (const record of updates) {
  const path = `content/understanding-records/${record.sentenceId}.json`;
  await writeFile(`${path}.tmp`, JSON.stringify(record, null, 2) + '\n');
  await rename(`${path}.tmp`, path);
  console.log(`${record.sentenceId}: ${record.teacherTip.text}`);
}
console.log(`Saved ${updates.length} reviewed teacher tips; original explanations preserved.`);
