import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [320, 375, 430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 }, hasTouch: true });
    const errors = [];
    let calls = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/chat')) calls++; });
    await page.goto(pathToFileURL(resolve('index.html')).href);
    for (const card of await page.locator('.home-course-meta').all()) {
      const sizes = await card.locator(':scope > span').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, overflow: node.scrollWidth > node.clientWidth + 1 })));
      assert.equal(sizes.length, 5);
      const columns = [sizes[0], sizes[2], sizes[4]];
      assert.ok(Math.max(...columns.map(column => column.width)) - Math.min(...columns.map(column => column.width)) < 1, 'Metadata columns must be equal');
      assert.ok(columns.every(column => !column.overflow), 'Metadata text must fit');
    }
    await page.screenshot({ path: `reports/home-meta-${width}.png`, fullPage: true });
    await page.click('#openNce1Btn');
    await page.click('.lesson-card[data-id="lesson-7"]');
    await page.click('#startBtn');
    const entry = page.locator('.ask-ai-entry');
    const dialog = page.locator('.tutor-dialog');
    await entry.click();
    assert.ok(await dialog.evaluate(node => node.open), 'A short click opens AI');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    const cdp = await page.context().newCDPSession(page);
    async function touchDrag(x, y, delay = 450) {
      const box = await entry.boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      await page.waitForTimeout(delay);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(80);
    }
    await touchDrag(75, 250);
    let box = await entry.boundingBox();
    assert.ok(Math.abs(box.x + box.width / 2 - 75) < 2 && Math.abs(box.y + box.height / 2 - 250) < 2, 'Long press moves AI');
    assert.equal(await dialog.evaluate(node => node.open), false, 'Dragging must not open AI');
    assert.equal(await entry.evaluate(node => node.classList.contains('is-dragging')), false);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 75, y: 250 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(await dialog.evaluate(node => node.open), 'A new tap immediately after dragging opens AI');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await touchDrag(width - 1, 931);
    box = await entry.boundingBox();
    assert.ok(box.x >= 8 && box.y >= 8 && box.x + box.width <= width - 7 && box.y + box.height <= 925, 'Dragging stays inside the screen');
    await page.setViewportSize({ width: 375, height: 600 });
    await page.waitForTimeout(80);
    box = await entry.boundingBox();
    assert.ok(box.x >= 8 && box.y >= 8 && box.x + box.width <= 368 && box.y + box.height <= 593, 'Resize keeps AI visible');
    const before = { x: box.x, y: box.y };
    await touchDrag(75, 180, 30);
    box = await entry.boundingBox();
    assert.ok(Math.abs(box.x - before.x) < 1 && Math.abs(box.y - before.y) < 1, 'Moving before the hold threshold does not drag');
    assert.equal(await dialog.evaluate(node => node.open), false);
    await entry.focus();
    await page.keyboard.press('Enter');
    assert.ok(await dialog.evaluate(node => node.open), 'Keyboard activation still works after dragging');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    box = await entry.boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await page.waitForTimeout(450);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal(await entry.evaluate(node => node.classList.contains('is-dragging')), false, 'Cancelled gestures release drag state');
    box = await entry.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.move(100, 200);
    await page.mouse.up();
    box = await entry.boundingBox();
    assert.ok(Math.abs(box.x + box.width / 2 - 100) < 2 && Math.abs(box.y + box.height / 2 - 200) < 2, 'Mouse hold also drags AI');
    assert.equal(await dialog.evaluate(node => node.open), false);
    assert.equal(calls, 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px: equal metadata columns, touch long-press drag, bounds, resize, click and keyboard passed.`);
  }
} finally { await browser.close(); }
