import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { createHandler } from '../api/chat.js';

let payload;
const handler = createHandler({ env: { AI_CHAT_ENABLED: 'true', ARK_API_KEY: 'test-only' }, fetcher: async (url, options) => {
  assert.equal(url, 'https://ark.cn-beijing.volces.com/api/v3/responses');
  payload = JSON.parse(options.body);
  return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Mock explanation' }] }] }) };
} });
const mock = http.createServer(handler);
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${mock.address().port}`;
try {
  const result = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Explain', context: { english: 'Excuse me!' }, history: [] }) });
  assert.equal(result.status, 200); assert.equal((await result.json()).answer, 'Mock explanation');
  assert.equal(payload.store, false); assert.equal(payload.model, 'doubao-seed-2-0-lite-260428');
  assert.equal((await fetch(base)).status, 405);
  assert.equal((await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
} finally { await new Promise(resolve => mock.close(resolve)); }

const child = spawn(process.execPath, ['scripts/dev-server.mjs'], { env: { ...process.env, PORT: '4188', ARK_API_KEY: '', AI_CHAT_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Server timeout')), 10000);
    child.stdout.on('data', data => { const match = String(data).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    child.on('error', reject);
  });
  assert.equal((await fetch(`${url}/.env.local`)).status, 404);
  assert.equal((await fetch(`${url}/api/chat`, { method: 'POST' })).status, 503);
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const width of [1280, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.click('#openNce1Btn'); await page.click('.lesson-card[data-id="lesson-1"]'); await page.click('#startBtn');
    await page.click('.ask-ai-entry');
    assert.equal(await page.locator('.tutor-dialog').evaluate(el => el.open), true);
    await page.route('**/api/chat', async route => {
      const body = route.request().postDataJSON(); assert.equal(body.context.english, 'Excuse me!');
      await route.fulfill({ json: { answer: '<script>not HTML</script>' } });
    });
    await page.locator('.tutor-form textarea').fill('Explain this');
    await page.click('.tutor-form button');
    await page.locator('.tutor-message[data-role=assistant]').waitFor();
    assert.equal(await page.locator('.tutor-messages script').count(), 0);
    const before = await page.locator('#sentenceOrder').textContent();
    await page.locator('.tutor-form textarea').press('Enter');
    assert.equal(await page.locator('#sentenceOrder').textContent(), before);
    const bounds = await page.locator('.tutor-dialog').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.screenshot({ path: `reports/ai-chat-${width}.png` });
    await page.click('.tutor-header button');
    assert.deepEqual(errors, []); await page.close();
  }
  console.log('AI API and desktop/mobile browser checks passed.');
} finally {
  await browser?.close();
  child.kill();
  if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
}
