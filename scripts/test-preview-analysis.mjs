import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [375, 654, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 884 } });
    const errors = [];
    let apiCalls = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/chat')) apiCalls++; });
    await page.goto('http://127.0.0.1:4177/');
    await page.click('#openNce1Btn');
    await page.click('.lesson-card[data-id="lesson-41"]');
    const snapshot = () => page.evaluate(() => ({ storage: { ...localStorage }, current: state.current, phase: state.phase, index: state.currentIndex, score: state.score }));
    const before = await snapshot();
    await page.locator('[data-analysis="4"]').scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    await page.click('[data-analysis="4"]');
    await page.waitForSelector('#analysisContent .sentence-understanding');
    assert.match(await page.locator('#analysisContent').textContent(), /What's in it\?/);
    assert.match(await page.locator('#analysisContent').textContent(), /名师提点/);
    await page.click('#analysisNext');
    await page.waitForSelector('#analysisContent .sentence-understanding');
    assert.match(await page.locator('#analysisContent').textContent(), /A piece of cheese/);
    await page.click('.ask-ai-entry');
    assert.match(await page.locator('.tutor-context').textContent(), /A piece of cheese/);
    await page.locator('.tutor-header button').first().click();
    await page.click('#analysisSpeak');
    await page.keyboard.press('Enter');
    assert.deepEqual(await snapshot(), before);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.click('#homeBtn');
    await page.waitForSelector('#previewView.active');
    await page.waitForTimeout(60);
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll) <= 2);
    assert.deepEqual(await snapshot(), before);
    assert.equal(apiCalls, 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  // A failed asset request must offer a retry without entering practice.
  const page = await browser.newPage();
  await page.route('**/assets/understanding/nce1/lesson-41.json', route => route.abort());
  await page.goto('http://127.0.0.1:4177/');
  await page.click('#openNce1Btn');
  await page.click('.lesson-card[data-id="lesson-41"]');
  await page.click('[data-analysis="0"]');
  await page.waitForSelector('#analysisContent [role="alert"]');
  await page.unroute('**/assets/understanding/nce1/lesson-41.json');
  await page.locator('#analysisContent button').click();
  await page.waitForSelector('#analysisContent .sentence-understanding');
  await page.close();
  console.log('Preview analysis passed: responsive layout, navigation, AI context, unchanged records, return position, retry; no model API calls.');
} finally {
  await browser.close();
}
