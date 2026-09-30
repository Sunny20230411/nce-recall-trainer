import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { RULE_VERSION, validateUnderstanding, recordKey } from './understanding-contract.mjs';

process.loadEnvFile('.env.local');
const output = 'content/sentence-understanding.pilot.v1.json';
let existing = { schemaVersion: '1.0.0', revision: 1, records: [] };
try { existing = JSON.parse(await readFile(output, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
let sources;
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve('index.html')).href);
  sources = await page.evaluate(() => {
    const selections = [
      ['nce1', 'Excuse me!'],
      ['nce1', 'Is this your handbag?'],
      ['nce1', 'Where are you going to spend your holidays this year, Gary?'],
      ['nce1', 'If I win a lot of money'],
      ['nce1', 'I live in a very old town which'],
      ['nce2', 'Last week I went to the theatre.'],
      ['nce2', 'I visited museums and sat in public gardens.'],
      ['nce2', 'I had a very good seat.']
    ];
    return selections.map(([courseId, prefix]) => {
      for (const lesson of courseCatalog[courseId].lessons) {
        const index = lesson.sentences.findIndex(sentence => sentence.english.startsWith(prefix));
        if (index < 0) continue;
        const sentence = lesson.sentences[index];
        return { courseId, lessonId: lesson.id, sentenceId: sentence.id || `nce-1-lesson-${String(lesson.lessonNo || Number(lesson.id.replace('lesson-', ''))).padStart(3, '0')}-sentence-${String(index + 1).padStart(3, '0')}`, sentenceOrder: index + 1,
          english: sentence.english, chinese: sentence.chinese, lesson: lesson.title };
      }
      throw Error(`Missing pilot source: ${prefix}`);
    });
  });
} finally { await browser.close(); }

const rules = `你为中文母语成年人制作英语句子的静态理解解析。只输出合法 JSON 对象，不要 Markdown 代码块。
保留英文原句所有词和标点，不改写或遗漏。中文自然准确。先解释交际意图和意义关系，再给必要术语；简单句短讲，复杂句按需拆解，不固定套栏目。
避免逐字翻译；解释工具、方式、目的、条件、时间、地点或修饰等关系，挑1—3个影响理解的点。不要说英语只能有一个动词，不说I开头不自然。
问句Where不是主语，独立问句不是状语从句；be going to在语境中判断计划或移动。关系词说明指代和句中作用。if不是only if；目的不表示结果一定实现。
parts按有意义短语连续拆分，使用sourceTokens的0起始闭区间startToken/endToken定位。不返回text，由程序按范围保留原文和标点。所有parts范围必须按顺序覆盖每个词一次，不能重复整句。relation使用通俗中文，例如询问地点、计划的事情、时间、称呼，而不是强制主谓宾。
structures保存准确的详细语法，平铺对象，不画嵌套树。每项text必须来自原句，role是角色，explanation用通俗中文说明作用。词性和句子角色分开。
words每个原句空格分隔的词项各一项，text含紧邻标点，phonetic是英语音标，meaning是本句语境义，pos是词性；I不能译成i数据，the不能译成编号。不要把助动词are单独译成“是”。
解析阅读顺序：自然翻译→中英文怎么表达（按需）→一句话主干→信息关系→结构拆解。不要强制简单句填满五层。
comparison为null或{chinese,english,steps:[{label,text,explanation}],takeaway}。不要只说中文词放前面、英文放后面；在确有理解障碍时展示中文自然说法、英文已交代的内容、读者还缺哪条信息，以及新信息怎样接回主干或名词。steps按句子需要选用，不强制三步。拆解或还原表达明确区别于原句答案。不要泛称英语总是先主干后描述，不把所有结构套成定语从句。
backbone:{text,meaning}，用完整核心表达说明谁做什么或什么状态。系动词句保留表语。若为帮助理解把问句还原成陈述或拆掉修饰，meaning中明确说明不是原句答案。
structureNotes:[{title,text}]，说明1—3个关键连接或构造方法，和parts的信息关系解释分工，避免整段重复。
JSON字段：chinese:string,intent:string,comparison:null或{chinese,english},backbone:{text,meaning},parts:[{startToken,endToken,meaning,relation}],structureNotes:[{title,text}],notes:[{title,text}],structures:[{text,role,explanation}],words:[{text,meaning,pos,phonetic}]。notes保留兼容，可以与structureNotes一致。适合复杂句时可用换行展示拆句合并或中英文对照。`;

for (const source of sources) {
  const prior = existing.records.find(record => recordKey(record) === recordKey(source));
  if (prior?.analysisSource === 'human' || prior?.analysisStatus === 'approved') { console.log(`Preserved reviewed ${source.sentenceId}`); continue; }
  if (prior && !validateUnderstanding(prior).length) { console.log(`Resumed draft ${source.sentenceId}`); continue; }
  let record;
  let feedback = '';
  for (let attempt = 0; attempt < 3; attempt++) {
  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.ARK_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model: process.env.ARK_MODEL || 'doubao-seed-2-0-lite-260428', store: false, thinking: { type: 'disabled' }, max_output_tokens: 3500,
      input: [{ role: 'system', content: rules }, { role: 'user', content: JSON.stringify({ ...source, sourceTokens: source.english.split(/\s+/).map((text, index) => ({ index, text })) }) + feedback }] })
  });
  if (!response.ok) throw Error(`Model HTTP ${response.status} for ${source.sentenceId}`);
  const result = await response.json();
  const raw = (result.output || []).filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('');
  let data;
  try { data = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
  catch { feedback = '\n上次返回不是合法JSON，请重新输出完整JSON。'; continue; }
  const sourceTokens = source.english.split(/\s+/);
  data.parts = (data.parts || []).map(part => ({ text: Number.isInteger(part.startToken) && Number.isInteger(part.endToken) && part.startToken >= 0 && part.endToken >= part.startToken && part.endToken < sourceTokens.length ? sourceTokens.slice(part.startToken, part.endToken + 1).join(' ') : '', meaning: part.meaning, relation: part.relation }));
  record = { ...data, ...source, chinese: data.chinese, analysisSource: 'ai', analysisStatus: 'generated', ruleVersion: RULE_VERSION, reviewNote: null };
  const errors = validateUnderstanding(record);
  if (!errors.length) break;
  console.log(JSON.stringify({ sentenceId: source.sentenceId, attempt: attempt + 1, errors, parts: record.parts?.map(part => part.text), words: record.words?.map(word => word.text) }));
  await mkdir('reports/understanding-rejected', { recursive: true });
  await writeFile(`reports/understanding-rejected/${source.sentenceId}.json`, JSON.stringify(record, null, 2));
  feedback = `\n上次结果未通过校验：${errors.join('; ')}。parts和words的text用单个空格拼接必须与英文原句完全一致，不要把问号单独拆开或交换语序。重新输出完整JSON。`;
  record = undefined;
  }
  if (!record) throw Error(`Validation failed after three attempts for ${source.sentenceId}`);
  existing.records = existing.records.filter(item => recordKey(item) !== recordKey(record));
  existing.records.push(record);
  await mkdir('content', { recursive: true });
  await writeFile(output, JSON.stringify(existing, null, 2) + '\n');
  console.log(`Generated ${source.sentenceId}: ${source.english}`);
}
