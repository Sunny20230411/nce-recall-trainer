import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const audit = JSON.parse(await readFile('content/british-phonetics.audit.v1.json', 'utf8'));
const inventory = JSON.parse(await readFile('reports/phonetics/inventory.json', 'utf8'));
assert.equal(audit.sentences, 2173);
assert.equal(audit.tokens, inventory.occurrences.length);
assert.equal(audit.cases.length, inventory.groups.length);
assert.equal(new Set(audit.cases.map(item => item.key)).size, audit.cases.length);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(resolve('index.html')).href);
    const count = await page.evaluate(({ occurrences, cases }) => {
      const lookup = new Map(cases.map(item => [item.key, item]));
      for (const occurrence of occurrences) {
        const word = String(occurrence.word).toLowerCase().replace(/’/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        if (!word) continue;
        const record = lookup.get(`${word}|${occurrence.english}|${occurrence.index}`) || lookup.get(`${word}|${occurrence.english}`) || lookup.get(word);
        if (!record) throw Error(`Uncovered token: ${word}`);
        const result = britishPhoneticFor(occurrence.word, occurrence.ipa, occurrence.english, occurrence.index);
        if (result !== (record.status === 'verified' ? record.ipa : '')) throw Error(`Wrong lookup: ${record.key}`);
      }
      for (const [word, phonetic] of [['coat', '/kəʊt/'], ['glass', '/ɡlɑːs/'], ['not', '/nɒt/']]) {
        if (britishPhoneticFor(word) !== phonetic) throw Error(`Dialect regression: ${word}`);
      }
      const sentence = { english: 'I read the book yesterday.', chinese: '' };
      const host = document.createElement('main'); host.style.cssText = 'width:min(100%,600px);margin:auto'; document.body.replaceChildren(host);
      host.innerHTML = renderSentenceUnderstanding({ sentence, courseId: 'unknown', lessonId: 'unknown', sentenceOrder: 1, legacyAnalysis: { tokens: [{ displayText: 'yesterday', phonetic: '/wrong/', translation: '昨天', posLabel: '副词' }], groups: [] } });
      host.querySelector('details').open = true;
      if (host.querySelector('tbody td').textContent === '/wrong/') throw Error('Word table bypassed British data');
      if (document.documentElement.scrollWidth > innerWidth) throw Error('Mobile overflow');
      return occurrences.length;
    }, { occurrences: inventory.occurrences, cases: audit.cases });
    assert.deepEqual(errors, []);
    console.log(`${width}px: all ${count} token occurrences resolve to reviewed British data or an explicit unresolved result.`);
    await page.close();
  }
} finally { await browser.close(); }
