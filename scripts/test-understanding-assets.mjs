import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { validateUnderstanding, recordKey } from './understanding-contract.mjs';

const source = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8'));
const identities = new Map(source.records.map(record => [recordKey(record), record]));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    const errors = [];
    let apiCalls = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/chat')) apiCalls++; });
    await page.goto(process.env.UNDERSTANDING_TEST_URL || 'http://127.0.0.1:4177/');
    const records = await page.evaluate(async () => {
      for (const key of Object.keys(window.SENTENCE_UNDERSTANDING.lessons)) {
        const [courseId, lessonId] = key.split(':');
        await window.ensureLessonUnderstanding(courseId, lessonId);
      }
      return window.SENTENCE_UNDERSTANDING.records;
    });
    assert.equal(records.length, await page.evaluate(() => window.SENTENCE_UNDERSTANDING.totalRecords));
    for (const record of records) {
      assert.deepEqual(validateUnderstanding(record), [], record.sentenceId);
      assert.equal(record.english, identities.get(recordKey(record))?.english);
    }
    await page.evaluate(records => {
      const host = document.createElement('main');
      host.style.cssText = 'width:min(100%,600px);margin:auto';
      document.body.replaceChildren(host);
      for (const record of records) {
        host.innerHTML = renderSentenceUnderstanding({ sentence: record, courseId: record.courseId, lessonId: record.lessonId, sentenceOrder: record.sentenceOrder, legacyAnalysis: { tokens: [], groups: [] }, manualStructure: false });
        if (host.querySelector('.understanding-original').textContent !== record.english) throw Error('Source display changed');
        host.querySelector('.understanding-word-details').open = true;
        if (host.querySelectorAll('tbody tr').length !== record.words.length) throw Error('Missing word rows');
        if (document.documentElement.scrollWidth > innerWidth) throw Error(`Overflow: ${record.sentenceId}`);
      }
    }, records);
    assert.equal(apiCalls, 0);
    assert.deepEqual(errors, []);
    console.log(`${width}px: ${records.length} static records loaded and rendered without API calls or overflow.`);
    await page.close();
  }
} finally { await browser.close(); }
