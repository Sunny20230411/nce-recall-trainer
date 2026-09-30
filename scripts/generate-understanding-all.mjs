import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { validateUnderstanding, recordKey } from './understanding-contract.mjs';
import { generationRules, reviewRules } from './understanding-bulk-rules.mjs';
import { generationFormat, reviewFormat } from './understanding-model-format.mjs';

process.loadEnvFile('.env.local');
const concurrency = Math.max(1, Math.min(24, Number(process.env.UNDERSTANDING_CONCURRENCY || 4)));
const limit = Number(process.env.UNDERSTANDING_LIMIT || Infinity);
const courseId = process.env.UNDERSTANDING_COURSE || '';
if (courseId && !['nce1', 'nce2'].includes(courseId)) throw Error('Invalid UNDERSTANDING_COURSE');
const root = 'content/understanding-records';
await mkdir(root, { recursive: true });
await mkdir('reports/understanding-all', { recursive: true });
const pilot = JSON.parse(await readFile('content/sentence-understanding.pilot.v1.json', 'utf8'));
const protectedKeys = new Set(pilot.records.map(recordKey));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
let sources;
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve('index.html')).href);
  sources = await page.evaluate(() => Object.values(courseCatalog).flatMap(course => course.lessons.flatMap(lesson => lesson.sentences.map((sentence, index) => ({
    courseId: course.id, lessonId: lesson.id, sentenceId: sentence.id || `nce-1-lesson-${String(lesson.lessonNo || Number(lesson.id.replace('lesson-', ''))).padStart(3, '0')}-sentence-${String(index + 1).padStart(3, '0')}`,
    sentenceOrder: index + 1, english: sentence.english, chinese: sentence.chinese, lesson: lesson.title,
    context: lesson.sentences.slice(Math.max(0, index - 1), index + 2).map(item => item.english).join(' ')
  })))));
} finally { await browser.close(); }
await writeFile('content/understanding-source-index.v1.json', JSON.stringify({ schemaVersion: '1.0.0', revision: 4, records: sources }, null, 2) + '\n');
console.log(`Source inventory: ${sources.length}; ${JSON.stringify(sources.reduce((counts, source) => ({ ...counts, [source.courseId]: (counts[source.courseId] || 0) + 1 }), {}))}; concurrency ${concurrency}`);

async function model(rules, data, budget, format) {
  for (let retry = 0; retry < 8; retry++) {
  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90000),
    body: JSON.stringify({ model: process.env.ARK_MODEL || 'doubao-seed-2-0-lite-260428', store: false, thinking: { type: 'disabled' }, max_output_tokens: budget, text: { format },
      input: [{ role: 'system', content: rules }, { role: 'user', content: JSON.stringify(data) }] })
  });
  if (response.status === 429 || response.status >= 500) {
    await new Promise(resolve => setTimeout(resolve, Math.min(60000, 5000 * (retry + 1))));
    continue;
  }
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const code = String(details.error?.code || 'UnknownError');
    const error = Error(`Model HTTP ${response.status}: ${code}`);
    error.fatal = response.status === 401 || response.status === 403;
    throw error;
  }
  const result = await response.json();
  const raw = (result.output || []).filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('');
  return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  }
  throw Error('Model unavailable after backoff retries');
}

const selectedSources = sources.filter(source => !courseId || source.courseId === courseId);
const protectedCount = selectedSources.filter(source => protectedKeys.has(recordKey(source))).length;
let done = 0, skipped = 0, failed = 0, cursor = 0, fatalError = null;
const queue = selectedSources.filter(source => !protectedKeys.has(recordKey(source))).slice(0, limit);
console.log(`Selected ${courseId || 'all'}: ${selectedSources.length} sentences; protected ${protectedCount}`);
async function generate(source) {
  const path = `${root}/${source.sentenceId}.json`;
  try {
    const prior = JSON.parse(await readFile(path, 'utf8'));
    if (prior.analysisSource === 'human') { skipped++; return; }
    if (prior.english === source.english && !validateUnderstanding(prior).length && prior.analysisStatus === 'approved') { skipped++; return; }
  } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  let problem = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sourceTokens = source.english.split(/\s+/);
      const format = structuredClone(generationFormat);
      format.schema.properties.words.minItems = sourceTokens.length;
      format.schema.properties.words.maxItems = sourceTokens.length;
      if (sourceTokens.length <= 60) {
        const phrases = sourceTokens.flatMap((_, start) => sourceTokens.slice(start).map((_, offset) => sourceTokens.slice(start, start + offset + 1).join(' ')));
        format.schema.properties.structures.items.properties.text.enum = phrases;
      }
      const draft = await model(generationRules + `\n本次words必须恰好${sourceTokens.length}项，一项对应一个sourceToken，包括带引号、人名和冒号的词项。chinese仅是旧提示，可能含整段多余内容；只解析english，不把旧中文扩展进英文。structures的text必须从原文直接复制，保留大小写、缩写和标点，不能把I'm写成I am、It's写成It is后放进structures。backbone可以注明辅助还原，structures不可还原。`, { ...source, sourceTokens: sourceTokens.map((text, index) => ({ index, text })), previousError: problem }, 5000, format);
      if (draft.comparison && !draft.comparison.chinese && !draft.comparison.english) draft.comparison = null;
      draft.parts = (draft.parts || []).map(part => ({ text: Number.isInteger(part.startToken) && Number.isInteger(part.endToken) && part.startToken >= 0 && part.endToken >= part.startToken && part.endToken < sourceTokens.length ? sourceTokens.slice(part.startToken, part.endToken + 1).join(' ') : '', relation: part.relation, meaning: part.meaning }));
      if (!Array.isArray(draft.words) || draft.words.length !== sourceTokens.length) throw Error('words count mismatch');
      draft.words = draft.words.map((word, index) => ({ ...word, text: sourceTokens[index] }));
      let record = { ...draft, ...source, chinese: draft.chinese, notes: draft.structureNotes || [], analysisSource: 'ai', analysisStatus: 'generated', ruleVersion: 'understanding-zh-adult-1.1.0', reviewNote: null };
      delete record.context;
      let errors = validateUnderstanding(record);
      if (errors.length || !record.backbone || !Array.isArray(record.structureNotes)) {
        await writeFile(`reports/understanding-all/${source.sentenceId}-draft.json`, JSON.stringify(record, null, 2));
        const invalidSpans = (record.structures || []).filter(group => !source.english.includes(group.text)).map(group => group.text);
        throw Error((errors.join('; ') || 'missing teaching frames') + (invalidSpans.length ? `; invalid spans: ${JSON.stringify(invalidSpans)}` : ''));
      }
      const reviewSchema = structuredClone(reviewFormat);
      const wordArray = reviewSchema.schema.properties.patch.properties.words.anyOf[0];
      wordArray.minItems = sourceTokens.length;
      wordArray.maxItems = sourceTokens.length;
      const partArray = reviewSchema.schema.properties.patch.properties.parts.anyOf[0];
      partArray.minItems = draft.parts.length;
      partArray.maxItems = draft.parts.length;
      if (sourceTokens.length <= 60) reviewSchema.schema.properties.patch.properties.structures.anyOf[0].items.properties.text.enum = format.schema.properties.structures.items.properties.text.enum;
      const review = await model(reviewRules + '\n结构化patch字段：无需修改的字段填null；comparison为null时保留原值，需要删除比较时在reason说明并使用空chinese和english。parts只能更正原分块的meaning和relation，保留text及数组长度。', { context: source.context, record }, 5500, reviewSchema);
      if (review.approved !== true) throw Error(`Reviewer: ${review.reason}`);
      const allowed = ['chinese', 'intent', 'comparison', 'backbone', 'parts', 'structureNotes', 'structures', 'words'];
      for (const field of allowed) if (review.patch?.[field] != null) record[field] = review.patch[field];
      if (record.comparison && !record.comparison.chinese && !record.comparison.english) record.comparison = null;
      if (!Array.isArray(record.words) || record.words.length !== sourceTokens.length) throw Error('Reviewer changed words count');
      record.words = record.words.map((word, index) => ({ ...word, text: sourceTokens[index] }));
      if (review.patch?.parts) {
        if (review.patch.parts.length !== draft.parts.length) throw Error('Reviewer changed parts count');
        if (review.patch.parts.some((part, index) => part.text !== draft.parts[index].text)) throw Error('Reviewer changed parts text');
        record.parts = review.patch.parts;
      }
      record.notes = record.structureNotes;
      record.analysisStatus = 'approved';
      record.reviewNote = `模型独立复核后通过：${review.reason || '核对翻译、主干、关系、结构和词义。'}（非逐句人工审核）`;
      errors = validateUnderstanding(record);
      if (errors.length) {
        await writeFile(`reports/understanding-all/${source.sentenceId}-rejected.json`, JSON.stringify({ source, draft, review, errors }, null, 2));
        throw Error(errors.join('; '));
      }
      await writeFile(`${path}.tmp`, JSON.stringify(record, null, 2) + '\n');
      await rename(`${path}.tmp`, path);
      done++;
      return;
    } catch (error) {
      if (error.fatal) { fatalError = error.message; return; }
      problem = error.message; console.log(`Retry ${source.sentenceId} ${attempt + 1}: ${problem.slice(0, 180)}`);
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }
  failed++;
  await writeFile(`reports/understanding-all/${source.sentenceId}.json`, JSON.stringify({ source, problem }, null, 2));
}

const timer = setInterval(() => console.log(`Progress generated=${done} preserved=${skipped + protectedCount} failed=${failed} remaining=${queue.length - cursor} total=${selectedSources.length}`), 20000);
try {
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < queue.length && !fatalError) await generate(queue[cursor++]);
  }));
} finally { clearInterval(timer); }
console.log(`Finished generated=${done} preserved=${skipped + protectedCount} failed=${failed} total=${selectedSources.length}`);
if (fatalError) console.error(`Stopped: ${fatalError}. Completed records are preserved; rerun after resolving the account issue.`);
if (failed || fatalError) process.exitCode = 1;
