import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [320, 430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    await page.goto(process.env.PREVIEW_TEST_URL || 'http://127.0.0.1:4177/');
    await page.click('#openNce1Btn'); await page.click('.lesson-card[data-id="lesson-139"]');
    const result = await page.evaluate(() => ({
      fonts: [...document.querySelectorAll('#lessonInfo .badge')].map(node => { const css = getComputedStyle(node); return [css.fontFamily, css.fontSize, css.fontWeight, css.lineHeight].join('|'); }),
      order: [...document.querySelector('.preview-sentence-actions').children].map(node => node.textContent),
      offset: getComputedStyle(document.querySelector('.preview-sentence-actions')).marginRight,
      title: getComputedStyle(document.querySelector('#previewTitle')).fontSize,
      intro: Boolean(document.querySelector('#previewIntro')),
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
    assert.equal(new Set(result.fonts).size, 1);
    assert.ok(result.fonts[0].includes('|12px|600|'));
    assert.deepEqual(result.order, ['解析', '播放']);
    assert.equal(result.offset, '-8px'); assert.equal(result.title, '26px');
    assert.equal(result.intro, false); assert.equal(result.overflow, false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `reports/preview-layout-${width}.png` });
    await page.close(); console.log(`${width}px: consistent badges, analysis/play order, right offset and responsive preview passed.`);
  }
} finally { await browser.close(); }
