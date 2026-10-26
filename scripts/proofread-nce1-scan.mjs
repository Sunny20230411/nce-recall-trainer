import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const scanPath = process.argv[2];
assert.ok(scanPath, 'Pass the scanned transcript HTML path');
const websiteUrl = process.env.PROOFREAD_SITE_URL || 'https://nce.sunchunjiang.com/';
const compact = text => text.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const lexical = text => [...compact(text).matchAll(/[a-zA-Z]+(?:'[a-zA-Z]+)*(?:-[a-zA-Z]+)*|\d+(?:[,.]\d+)*/g)].map(match => ({ text: match[0], key: match[0].toLowerCase(), offset: match.index }));
const contractions = { "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'cannot', "won't": 'will not', "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not', "i'll": 'i will', "you'll": 'you will', "we'll": 'we will', "they'll": 'they will', "it's": 'it is', "he's": 'he is', "she's": 'she is', "that's": 'that is', "what's": 'what is', "here's": 'here is', "there's": 'there is' };
const reviewNotes = {
  7: '两处 I am 被改成 I’m，属于原文形式差异。',
  9: '网站 Mrs. Ford 对应整理稿 Emma；另有 How’s / How is。人物名需以扫描版本确认。',
  15: 'we aren’t / we are not、They’re / They are；另有逗号差异。',
  29: '网站结尾多出 Right.。',
  33: '首句 It’s / It is 的形式差异。',
  37: '网站缺少制作书架、递锤子的整段前半对话；后半 paint this bookcase 与整理稿 paint it 也不同。',
  39: '整理稿 Put it here, on this shelf. 被改为 Put it on the shelf.；网站额外有 All right, Sam.。',
  45: '多处称呼、说话内容不同；网站增加取信、追问等内容，缺少 What’s the matter?，需重对整段对话。',
  47: '网站增加 Would you like a cup of coffee? / Yes, please.；饼干问答缺少 I do。',
  53: '网站缺少末句 It’s our favourite subject of conversation.。',
  59: '标题相同但正文完全不同：网站是袋内物品问答，整理稿为购买信封、信纸、胶水、粉笔并索找零的对话。',
  61: '网站缺少 Where’s Jimmy?、请医生、电话号码 09754 等大段前半内容，并改动问答。',
  63: 'The boy mustn’t go to school yet 后的称呼：网站 Mr. Williams，整理稿 Mrs. Williams。',
  67: '开头被改为不自然的 Where were you at the baker’s on Friday?；整理稿为 Hello. / Were you at the butcher’s? / Yes, I was.。',
  71: 'Did he telephone … last night? 中网站少了 again。',
  77: '网站缺少 on Monday, April 24th；ten/two 与 10/2 仅数字写法不同，too late / very late 是词语差异。',
  81: '网站开头比整理稿多出 Hi, Sam.。',
  83: '网站保留少量问候后混入第131课度假讨论；整理稿是午餐、咖啡、收拾行李和已休假的对话。',
  85: '网站缺少开头 Hello, Ken. / Hi, George.。',
  87: '网站缺少 Isn’t that your car? / Well, it was my car.；lamp post / lamp-post 为连字符差异。',
  95: '网站后半列车时刻、票价和误车情节大幅改写，缺少喝饮料、钟慢十分钟及五小时后下一班等内容。',
  97: '网站为买词典及戴帽认人的对话；整理稿为伦敦列车遗失行李、认领却拿错箱子的故事，正文不对应。',
  99: '网站缺少开头 Ow!。',
  101: '网站漏掉 What else does he say?、卡片第二段原话以及 Speak up, Penny 等一段对话。',
  103: '网站开头增加 Jane/Harry 分数问答，替换 How was the exam, Richard? / Not too bad.；另有 man / guy。',
  105: '网站漏掉 intelligent 拼写及只打一个 L 的核心情节，并改动其余办公对话。',
  107: '前半接近，后半应为要求同款合身蓝裙及店内最大尺码，网站改成比较裙长、再次试穿等内容。',
  109: '称呼 Harry / Charlotte 不同；后半咖啡、香烟、饼干及 Eat more and smoke less! 的内容大幅改写。',
  111: 'Do you want to buy it, dear? 对应整理稿 Do you like it, dear?。',
  113: '公交车到 Trafalgar Square、无法找零及乘客都是百万富翁的情节被大幅删改为泛化换零钱对话。',
  115: '网站为 Polly 应门、屋内没人等另一套对话；整理稿为赴午餐、人在花园及啤酒玩笑，情节明显不同。',
  117: '整理稿的 Tommy 吞硬币与 change 双关被网站改成吃蛋糕的情节，需按完整原文重做。',
  127: '网站仅有推测年龄的六句改写，缺少识别演员、丈夫次数等大段内容，年龄和时态也不同。',
  129: '网站删去超车、限速标志、做梦及驾照等对话，并把警察对车速的推测改成司机自述。',
  131: '网站漏 I’m not sure.；We can’t make up our minds 被改写；妻子担忧的表达也不同。',
  135: '网站仅为退休传闻的简短改写；整理稿含采访、Carlos、转述报道及第六任丈夫等完整情节。',
  137: 'travel around the world / travel round the world；两者可成立，但按整理稿原文应为 round。',
  139: '网站为弟弟 Tim 到伦敦的对话；整理稿为晚餐迟到、同名 John Smith 与修电话线路的误会，正文不对应。'
};
const majorLessons = new Set([37,45,59,61,83,95,97,103,105,107,109,113,115,117,127,129,135,139]);
const expanded = tokens => tokens.map(token => contractions[token.key] || token.key).join(' ');
function diffTokens(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i].key === b[j].key ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const hunks = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i].key === b[j].key) { i++; j++; continue; }
    const startA = i, startB = j;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i].key === b[j].key) break;
      if (j >= b.length || (i < a.length && table[i + 1][j] >= table[i][j + 1])) i++; else j++;
    }
    hunks.push({ startA, endA: i, startB, endB: j });
  }
  return hunks.map(h => {
    const left = a.slice(h.startA, h.endA), right = b.slice(h.startB, h.endB);
    return { ...h, website: left.map(t => t.text).join(' '), scan: right.map(t => t.text).join(' '),
      kind: expanded(left) === expanded(right) ? 'contraction-form' : left.length === 0 ? 'website-missing' : right.length === 0 ? 'website-extra' : 'wording',
      before: a.slice(Math.max(0, h.startA - 7), h.startA).map(t => t.text).join(' '),
      after: a.slice(h.endA, h.endA + 7).map(t => t.text).join(' ') };
  });
}
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
let scan, website;
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(scanPath)).href);
  scan = await page.evaluate(() => [...document.querySelectorAll('section[id^="l"]')].map(section => ({
    lessonId: `lesson-${section.id.slice(1)}`, number: Number(section.id.slice(1)), title: section.querySelector('h2').textContent,
    blocks: [...section.querySelectorAll('.speech,.narrative')].map(node => node.textContent)
  })));
  await page.goto(websiteUrl);
  website = await page.evaluate(() => courseCatalog.nce1.lessons.map(lesson => ({ lessonId: lesson.id, title: lesson.title, sentences: lesson.sentences.map((sentence, index) => ({ id: sentence.id, order: index + 1, english: sentence.english })) })));
} finally { await browser.close(); }
assert.equal(scan.length, 72); assert.equal(website.length, 72);
const effective = JSON.parse(await readFile('content/understanding-source-index.effective.v1.json', 'utf8')).records.filter(record => record.courseId === 'nce1');
const websiteMatchesLocal = JSON.stringify(website.flatMap(lesson => lesson.sentences.map(sentence => [lesson.lessonId, sentence.english]))) === JSON.stringify(effective.map(record => [record.lessonId, record.english]));
const lessons = scan.map(source => {
  const site = website.find(lesson => lesson.lessonId === source.lessonId);
  assert.ok(site, source.lessonId);
  const scanText = compact(source.blocks.join(' ')), siteText = compact(site.sentences.map(s => s.english).join(' '));
  const a = lexical(siteText), b = lexical(scanText), changes = diffTokens(a, b);
  for (const change of changes) {
    let cursor = 0;
    change.websiteSentences = site.sentences.filter(sentence => { const start = cursor; cursor += lexical(sentence.english).length; return (start < change.endA && cursor > change.startA) || (change.startA === change.endA && start <= change.startA && cursor >= change.startA); });
  }
  return { lessonId: source.lessonId, number: source.number, websiteTitle: site.title, scanTitle: compact(source.title),
    reviewNote: changes.length ? reviewNotes[source.number] || '' : '', priority: changes.length && majorLessons.has(source.number) ? 'major' : changes.length ? 'local-or-form' : 'none',
    titleDiffers: lexical(site.title).map(t => t.key).join(' ') !== lexical(source.title).map(t => t.key).join(' '),
    category: changes.some(c => c.kind !== 'contraction-form') ? 'content-difference' : changes.length ? 'contraction-only' : siteText === scanText ? 'exact' : 'punctuation-case-or-spacing',
    websiteUnits: site.sentences.length, websiteText: siteText, scanText, changes };
});
const summary = { lessons: lessons.length, websiteUnits: website.reduce((n, l) => n + l.sentences.length, 0), websiteMatchesLocal,
  categories: Object.fromEntries(['exact', 'punctuation-case-or-spacing', 'contraction-only', 'content-difference'].map(kind => [kind, lessons.filter(l => l.category === kind).length])),
  changeGroups: lessons.reduce((n, l) => n + l.changes.length, 0), titleDifferences: lessons.filter(l => l.titleDiffers).length };
const report = { checkedAt: new Date().toISOString(), websiteUrl, scanPath: resolve(scanPath), scanSha256: createHash('sha256').update(await readFile(scanPath)).digest('hex'), method: 'Compare live website course data with supplied HTML transcript; omit speaker labels; compare whole-lesson lexical order before grouping/punctuation; do not change content or infer scan authority.', summary, lessons };
await mkdir('exports', { recursive: true });
const base = process.env.PROOFREAD_REPORT_STEM || 'exports/nce1-proofread-2026-10-26';
await writeFile(`${base}.json`, JSON.stringify(report, null, 2));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const labels = { exact: '完全一致', 'punctuation-case-or-spacing': '仅标点/大小写/排版差异', 'contraction-only': '仅缩写形式差异', 'content-difference': '有词语/内容差异' };
let html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>新1原文校对</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:1200px;margin:32px auto;padding:0 20px;color:#17202a}h1{font-size:26px}h2{font-size:21px}section{border-top:1px solid #ccd8dd;padding:20px 0}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #ccd8dd;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}small{color:#536674}del{background:#ffe3e3;text-decoration:none}ins{background:#d6f4e7;text-decoration:none}.original{white-space:pre-wrap;font-family:Georgia,serif}nav a{display:inline-block;margin:4px 8px}summary{cursor:pointer}@media(max-width:640px){body{padding:0 12px;font-size:14px}th,td{padding:6px}}</style><h1>新概念英语第1册：网站与扫描整理原文校对</h1><p>对照对象：正式网站 ${escape(websiteUrl)} 与你提供的 HTML 整理稿。共72课，网站${summary.websiteUnits}个练习单元。未修改任何课文或解析。</p><p>完全一致${summary.categories.exact}课；仅标点/大小写/排版差异${summary.categories['punctuation-case-or-spacing']}课；仅缩写形式差异${summary.categories['contraction-only']}课；有词语/内容差异${summary.categories['content-difference']}课。词语差异共${summary.changeGroups}组（包含缩写）。</p><p>不按练习单元数量判错；人物名、换行和拆句先排除。下表仅显示词语差异；完整双方原文可展开核对标点。缩写归类只是定位线索，不意味着应自动改写；整理稿中的 OCR、版本差异仍需回看扫描页确认。</p><nav>${lessons.map(l => `<a href="#l${l.number}">${l.number}${l.changes.length ? '*' : ''}</a>`).join('')}</nav>`;
const activeMajor = lessons.filter(lesson => majorLessons.has(lesson.number) && lesson.changes.length);
html += activeMajor.length ? `<h2>优先核对的${activeMajor.length}课</h2><p>${activeMajor.map(lesson => `<a href="#l${lesson.number}">${lesson.number}</a>`).join('、')}。这些课存在大段缺失、明显改写或正文不对应；其余差异需区分漏词、称呼、版本和格式。</p>` : '<p>本轮没有发现需要优先处理的词语或内容差异。</p>';
html += `<p>${summary.changeGroups}组是词语对齐的差异组数，不是错误句子数。未直接查看扫描图片，仅以你提供的已整理 HTML 为对照。</p>`;
const md = ['# 新1原文校对', '', `正式网站：${websiteUrl}`, `整理稿：${resolve(scanPath)}`, '', JSON.stringify(summary, null, 2), '', '只校对，不修改课文。词语差异需结合扫描页/版本确认；练习拆句不算缺句。', ''];
for (const lesson of lessons) {
  html += `<section id="l${lesson.number}"><h2>${escape(lesson.websiteTitle)}</h2><p>${labels[lesson.category]} · 网站${lesson.websiteUnits}个练习单元${lesson.titleDiffers ? ` · 整理稿标题：${escape(lesson.scanTitle)}` : ''}</p>`;
  if (lesson.reviewNote && lesson.changes.length) html += `<p><strong>${lesson.priority === 'major' ? '优先复核：' : '复核说明：'}</strong>${escape(lesson.reviewNote)}</p>`;
  if (lesson.changes.length) {
    html += '<table><thead><tr><th>网站当前文字</th><th>扫描整理稿文字</th><th>网站定位与上下文</th></tr></thead><tbody>';
    md.push(`## ${lesson.websiteTitle}`, '', `分类：${labels[lesson.category]}`, lesson.reviewNote, '');
    for (const change of lesson.changes) {
      html += `<tr><td><del>${escape(change.website || '（无）')}</del></td><td><ins>${escape(change.scan || '（无）')}</ins></td><td><small>${change.websiteSentences.map(s => `第${s.order}单元`).join('、')} · ${escape(change.kind)}</small><br>${escape(change.before)} 【差异】 ${escape(change.after)}<br><small>${change.websiteSentences.map(s => escape(s.english)).join('<br>')}</small></td></tr>`;
      md.push(`- 网站：${change.website || '（无）'} → 整理稿：${change.scan || '（无）'}`, `  定位：${change.websiteSentences.map(s => `第${s.order}单元 ${s.english}`).join(' / ')}`, `  上下文：${change.before} 【差异】 ${change.after}`);
    }
    html += '</tbody></table>'; md.push('');
  }
  html += `<details><summary>展开双方完整原文</summary><h3>网站当前正文</h3><p class="original">${escape(lesson.websiteText)}</p><h3>扫描整理稿正文</h3><p class="original">${escape(lesson.scanText)}</p></details></section>`;
}
await writeFile(`${base}.html`, html + '</html>');
await writeFile(`${base}.md`, md.join('\n'));
console.log(JSON.stringify({ summary, reports: [`${base}.html`, `${base}.md`, `${base}.json`], differences: lessons.filter(l => l.changes.length).map(l => ({ lesson: l.number, changes: l.changes.map(c => [c.website, c.scan, c.kind]) })) }, null, 2));
