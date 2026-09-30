import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { validateUnderstanding } from './understanding-contract.mjs';

const content = JSON.parse(await readFile('content/sentence-understanding.pilot.v1.json', 'utf8'));
assert.equal(content.records.length, 8);
for (const record of content.records) {
  assert.deepEqual(validateUnderstanding(record), []);
  assert.equal(record.analysisStatus, 'approved');
}
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let calls = 0;
    page.on('request', request => { if (request.url().includes('/api/chat')) calls++; });
    await page.goto(pathToFileURL(resolve('index.html')).href);
    await page.evaluate(() => {
      window.wordSpeechCalls = [];
      speechSynthesis.speak = utterance => window.wordSpeechCalls.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate });
      speechSynthesis.cancel = () => {};
    });
    await page.click('#openNce1Btn'); await page.click('.lesson-card[data-id="lesson-1"]'); await page.click('#startBtn');
    for (const record of content.records) {
      await page.evaluate(record => {
        state.selectedCourseId = record.courseId;
        state.selectedLesson = courseCatalog[record.courseId].lessons.find(lesson => lesson.id === record.lessonId);
        startPractice(state.selectedLesson.sentences, 'course', false);
        state.currentIndex = record.sentenceOrder - 1;
        renderQuestion();
        state.current.correct = true;
        state.phase = 'correct';
        renderWordSlots({ correctAll: true });
      }, record);
      assert.equal(await page.locator('.understanding-original').textContent(), record.english);
      assert.equal(await page.locator('.understanding-parts .understanding-part').count(), record.parts.length > 1 ? record.parts.length : 0);
      assert.equal(await page.locator('.understanding-details[open]').count(), 0);
      assert.equal(await page.locator('.sentence-understanding > :last-child summary').textContent(), '单词详情');
      const sections = await page.locator('.sentence-understanding > section').evaluateAll(nodes => nodes.map(node => node.dataset.section));
      assert.deepEqual(sections, ['translation', ...(record.comparison ? ['comparison'] : []), 'backbone', ...(record.parts.length > 1 ? ['relations'] : []), 'structure']);
      await page.locator('.understanding-word-details summary').click();
      assert.equal(await page.locator('.understanding-word-table tbody tr').count(), record.words.length);
      const wordButton = page.locator('.understanding-word-play').first();
      const word = await wordButton.textContent();
      const replayBefore = await page.evaluate(() => state.current.replayCount);
      await wordButton.click();
      const spoken = await page.evaluate(() => window.wordSpeechCalls.at(-1));
      assert.equal(spoken.text, word);
      assert.equal(spoken.lang, 'en-GB');
      assert.ok(Math.abs(spoken.rate - 0.8) < 0.0001);
      await wordButton.focus();
      const speechCount = await page.evaluate(() => window.wordSpeechCalls.length);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.wordSpeechCalls.length), speechCount + 1);
      assert.equal(await page.evaluate(() => state.current.replayCount), replayBefore);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('.understanding-word-details summary').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (record.lessonId === 'lesson-131') {
        assert.equal(await page.locator('.structure-group').count(), 0);
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
        await page.screenshot({ path: `reports/understanding-${width}.png`, fullPage: true });
      }
    }
    await page.evaluate(() => {
      const sentence = courseCatalog.nce1.lessons.find(lesson => lesson.id === 'lesson-3').sentences[0];
      const before = JSON.stringify(sentenceAnalysisFor(sentence));
      const html = renderSentenceUnderstanding({ sentence, courseId: 'nce1', lessonId: 'lesson-3', sentenceOrder: 1, legacyAnalysis: sentenceAnalysisFor(sentence), manualStructure: true });
      if (!html.includes('详细结构') || before !== JSON.stringify(sentenceAnalysisFor(sentence))) throw Error('Manual structure changed');
      const malicious = renderSentenceUnderstanding({ sentence: { english: '<img src=x onerror=alert(1)>', chinese: '<script>bad</script>' }, courseId: 'nce1', lessonId: 'unknown', sentenceOrder: 1, legacyAnalysis: { tokens: [], groups: [] } });
      const template = document.createElement('template'); template.innerHTML = malicious;
      if (template.content.querySelector('script,img')) throw Error('Unsafe explanation');
    });
    assert.equal(calls, 0); assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Eight reviewed examples render without API calls or horizontal overflow; manual groups preserved.');
} finally { await browser.close(); }
