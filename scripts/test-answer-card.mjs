import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    await page.goto('http://127.0.0.1:4177/');
    await page.click('#openNce1Btn'); await page.click('.lesson-card[data-id="lesson-41"]'); await page.click('#startBtn');
    await page.keyboard.press('Alt');
    await page.waitForFunction(() => [...document.querySelectorAll('#answerReveal .word-meaning')].some(node => node.textContent === '包'));
    const result = await page.evaluate(() => {
      const sentence = state.current.sentence;
      const record = window.getSentenceUnderstandingRecord({ sentence, courseId: state.selectedCourseId, lessonId: state.selectedLesson.id, sentenceOrder: 1 });
      const compact = text => {
        let value = text || '', previous;
        do { previous = value; value = value.replace(/（[^（）]*）|\([^()]*\)/g, ''); } while (value !== previous);
        return value.trim();
      };
      return { actual: [...document.querySelectorAll('#answerReveal .word-meaning')].map(node => node.textContent), expected: record.words.map(word => compact(word.meaning)).filter(Boolean), font: getComputedStyle(document.querySelector('.answer-word-text')).fontSize, line: getComputedStyle(document.querySelector('.answer-word-text')).borderBottomWidth };
    });
    assert.deepEqual(result.actual, result.expected);
    assert.equal(result.line, '1px');
    assert.equal(result.font, width === 430 ? '14px' : '24px');
    assert.equal(await page.locator('#answerReveal .slot-ipa, #answerReveal .pos-tag').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `reports/answer-card-${width}.png` });
    await page.close();
    console.log(`${width}px: answer card hides IPA/POS, uses smaller English and exact contextual analysis meanings.`);
  }
} finally { await browser.close(); }
