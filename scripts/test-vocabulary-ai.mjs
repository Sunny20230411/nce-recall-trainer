import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    let payload;
    await page.addInitScript(() => localStorage.setItem('yuke_vocabulary_v1:nce1:lesson-41', JSON.stringify([
      { text: 'heavy', meaning: '重的', pos: 'adjective', english: 'Is that bag heavy, Penny?' },
      { text: 'tobacco', meaning: '烟草', pos: 'noun', english: 'And a tin of tobacco.' }
    ])));
    await page.route('**/api/chat', async route => { payload = route.request().postDataJSON(); await route.fulfill({ json: { answer: '这是描述重量的词。', suggestions: ['怎样区分相近的词义？'] } }); });
    await page.goto('http://127.0.0.1:4177/'); await page.click('#openNce1Btn'); await page.click('.lesson-card[data-id="lesson-41"]'); await page.click('#vocabEntry'); await page.click('#vocabStart');
    await page.fill('.vocab-input', 'hevy'); await page.click('#vocabSubmit');
    await page.click('.ask-ai-entry');
    assert.ok(!(await page.locator('.tutor-context').textContent()).includes('heavy'));
    assert.ok(!(await page.locator('.tutor-suggestions').textContent()).includes('heavy'));
    await page.locator('.tutor-suggestions button').first().click();
    await page.waitForSelector('.tutor-followups button');
    assert.equal(payload.context.kind, 'vocabulary'); assert.equal(payload.context.english, 'heavy'); assert.equal(payload.context.draft, 'hevy');
    assert.equal(payload.context.answerVisible, false); assert.equal(payload.context.sourceSentence, 'Is that bag heavy, Penny?');
    await page.locator('.tutor-header button').first().click(); await page.click('#vocabAnswer');
    await page.click('.ask-ai-entry'); assert.ok((await page.locator('.tutor-context').textContent()).includes('heavy'));
    await page.locator('.tutor-header button').first().click(); await page.click('#vocabNext');
    await page.click('.ask-ai-entry');
    assert.equal(await page.locator('.tutor-message').count(), 0);
    assert.ok(!(await page.locator('.tutor-context').textContent()).includes('heavy'));
    assert.ok(!(await page.locator('.tutor-context').textContent()).includes('tobacco'));
    console.log(`${width}px: vocabulary AI, hidden answers, wrong spelling context, followups and conversation isolation passed.`);
    await page.close();
  }
} finally { await browser.close(); }
