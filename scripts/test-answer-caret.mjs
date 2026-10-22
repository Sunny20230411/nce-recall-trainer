import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    await page.goto('http://127.0.0.1:4177/');
    await page.click('#openNce1Btn');
    await page.click('.lesson-card[data-id="lesson-1"]');
    await page.click('#startBtn');
    const input = page.locator('#wordSlots .slot-input').first();
    for (const [start, end] of [[2, 2], [1, 1], [0, 2]]) {
      await input.fill('sa');
      await input.evaluate((node, range) => node.setSelectionRange(...range), [start, end]);
      for (let toggle = 0; toggle < 2; toggle++) {
        await page.keyboard.press('Alt');
        await page.waitForTimeout(100);
        assert.deepEqual(await input.evaluate(node => [node.value, node.selectionStart, node.selectionEnd, document.activeElement === node]), ['sa', start, end, true]);
      }
    }
    await input.evaluate(node => node.setSelectionRange(2, 2));
    await page.keyboard.press('Alt');
    await page.keyboard.type('y');
    assert.equal(await input.inputValue(), 'say');
    await page.close();
    console.log(`${width}px: Alt preserves end/middle caret and selection; continued typing appends correctly.`);
  }
} finally { await browser.close(); }
