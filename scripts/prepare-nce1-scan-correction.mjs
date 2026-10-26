import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const scanPath = process.argv[2];
assert.ok(scanPath, 'Supply the reviewed scan transcript HTML');
const normalize = text => text.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const tokens = text => normalize(text).toLowerCase().match(/[a-z]+(?:'[a-z]+)*|\d+/g) || [];
function similarity(left, right) {
  const a = tokens(left), b = tokens(right);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(1, a.length, b.length);
}
function split(block) {
  const original = normalize(block), protect = match => match.replaceAll('.', '\u2060');
  const text = original.replace(/\b(?:Mr|Mrs|Ms|Dr|St|Prof|Capt|Col|Gen|Rev)\./gi, protect)
    .replace(/\b(?:[A-Z]\.){2,}/g, protect).replace(/\b[A-Z]\.(?=\s+(?:[A-Z]\.|[A-Z][a-z]))/g, protect)
    .replace(/\b[ap]\.m\./gi, protect).replace(/\d\.\d/g, protect);
  const result = []; let start = 0;
  for (const match of text.matchAll(/[.!?]+(?:["'])?\s+/g)) {
    const next = text.slice(match.index + match[0].length);
    if (match[0].startsWith('...') && /^[a-z.]/.test(next)) continue;
    if (/^(?:he|she|I|my\s+\w+|someone|George)\s+(?:said|asked|answered|called|replied|shouted|cried)\b/i.test(next) && /["']/.test(match[0])) continue;
    const end = match.index + match[0].trimEnd().length;
    result.push(original.slice(start, end)); start = match.index + match[0].length;
  }
  if (start < original.length) result.push(original.slice(start));
  assert.equal(result.join(' '), original);
  return result.filter(Boolean);
}
function align(old, sentences) {
  const n = old.length, m = sentences.length, d = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const substitutions = Array.from({ length: n }, () => new Float64Array(m));
  for (let i = 1; i <= n; i++) d[i][0] = i;
  for (let j = 1; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const sim = similarity(old[i - 1].english, sentences[j - 1]);
    const cost = normalize(old[i - 1].english) === sentences[j - 1] ? 0 : sim >= .5 ? 1 - sim + .25 : 2.1;
    substitutions[i - 1][j - 1] = cost;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
  }
  const matched = new Map(); let i = n, j = m;
  while (i || j) {
    if (i && j && Math.abs(d[i][j] - d[i - 1][j - 1] - substitutions[i - 1][j - 1]) < 1e-7) { matched.set(j - 1, old[i - 1]); i--; j--; }
    else if (i && Math.abs(d[i][j] - d[i - 1][j] - 1) < 1e-7) i--;
    else j--;
  }
  return matched;
}
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
let scan;
try {
  const page = await browser.newPage(); await page.goto(pathToFileURL(resolve(scanPath)).href);
  scan = await page.evaluate(() => [...document.querySelectorAll('section[id^=l]')].map(node => ({ lessonId: `lesson-${node.id.slice(1)}`, number: Number(node.id.slice(1)), title: node.querySelector('h2').textContent, blocks: [...node.querySelectorAll('.speech,.narrative')].map(block => block.textContent) })));
} finally { await browser.close(); }
assert.equal(scan.length, 72);
const effective = JSON.parse(await readFile('content/understanding-source-index.effective.v1.json', 'utf8'));
assert.equal(effective.revision, 5, 'Prepare the correction only against revision 5');
const lessons = [];
for (const source of scan) {
  const old = effective.records.filter(record => record.courseId === 'nce1' && record.lessonId === source.lessonId);
  assert.ok(old.length, source.lessonId);
  const sourceText = normalize(source.blocks.join(' '));
  if (old.map(record => normalize(record.english)).join(' ') === sourceText) continue;
  const sentences = source.blocks.flatMap(split), matched = align(old, sentences);
  const records = sentences.map((english, index) => {
    const prior = matched.get(index), unchanged = prior?.english === english;
    return { courseId: 'nce1', lessonId: source.lessonId, sentenceId: prior?.sentenceId || `nce-1-lesson-${String(source.number).padStart(3, '0')}-scan-r6-${String(index + 1).padStart(3, '0')}`,
      sentenceOrder: index + 1, lesson: old[0].lesson, english, action: unchanged ? 'retain' : prior ? 'correct' : 'add',
      ...(prior ? { previousSentenceId: prior.sentenceId, previousEnglish: prior.english, previousChinese: prior.chinese } : {}) };
  });
  assert.equal(records.map(record => record.english).join(' '), sourceText);
  const retainedIds = new Set(records.map(record => record.sentenceId));
  lessons.push({ lessonId: source.lessonId, lesson: old[0].lesson, sourceText, records,
    baseline: old, removed: old.filter(record => !retainedIds.has(record.sentenceId)) });
}
const records = lessons.flatMap(lesson => lesson.records);
const plan = { schemaVersion: '1.0.0', revision: 6, baselineRevision: 5, status: 'planned-not-published',
  source: { name: 'User-provided scan transcript HTML', path: resolve(scanPath), sha256: createHash('sha256').update(await readFile(scanPath)).digest('hex') },
  baselineDigest: createHash('sha256').update(JSON.stringify(effective.records.map(record => [record.courseId, record.lessonId, record.sentenceId, record.english]))).digest('hex'),
  summary: { affectedLessons: lessons.length, originalUnits: lessons.reduce((sum, l) => sum + l.baseline.length, 0), correctedUnits: records.length,
    actions: Object.fromEntries(['retain', 'correct', 'add'].map(action => [action, records.filter(record => record.action === action).length])), removed: lessons.reduce((sum, l) => sum + l.removed.length, 0) }, lessons };
await writeFile('content/nce1-scan-correction.plan.v1.json', JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({ summary: plan.summary, lessons: lessons.map(l => ({ lessonId: l.lessonId, old: l.baseline.length, new: l.records.length, changed: l.records.filter(r => r.action !== 'retain').length })) }, null, 2));
