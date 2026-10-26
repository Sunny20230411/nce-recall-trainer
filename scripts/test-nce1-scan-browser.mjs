import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const plan = JSON.parse(await readFile('content/nce1-scan-correction.plan.v1.json', 'utf8'));
const effective = JSON.parse(await readFile('content/understanding-source-index.effective.v1.json', 'utf8'));
assert.equal(effective.revision, 6);
const old37 = plan.lessons.find(lesson => lesson.lessonId === 'lesson-37');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    const errors = []; let calls = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/')) calls++; });
    await page.addInitScript(old => {
      localStorage.setItem('nce_learning_records_v1', JSON.stringify({ 'lesson-37': { lessonId: 'lesson-37', contentRevision: 5, startedRuns: 4, completedRuns: 2, completed: true, progress: 100, lastAccuracy: 80, wrongSentences: old.baseline.map(record => ({ english: record.english, wrongCount: 2 })) } }));
      localStorage.setItem('nce_practice_session_v3', JSON.stringify({ lessonId: 'lesson-37', contentRevision: 5, currentIndex: 0, phase: 'correct', score: 500, elapsed: 90, results: old.baseline.map(record => ({ english: record.english, correct: true, progressCounted: true })) }));
    }, old37);
    await page.goto(process.env.SCAN_TEST_URL || 'http://127.0.0.1:4177/');
    const actual = await page.evaluate(() => Object.values(courseCatalog).flatMap(course => course.lessons.flatMap(lesson => lesson.sentences.map(sentence => [course.id, lesson.id, sentence.english]))));
    assert.deepEqual(actual, effective.records.map(record => [record.courseId, record.lessonId, record.english]));
    await page.click('#openNce1Btn'); await page.click('.lesson-card[data-id="lesson-37"]');
    assert.equal(await page.locator('#englishText > li').count(), 18);
    await page.click('#startBtn');
    const restored = await page.evaluate(() => ({ total: state.practiceSentences.length, first: state.current.sentence.english, score: state.score, archive: Boolean(localStorage.getItem('nce_practice_session_v3_before_content_r6')) }));
    assert.equal(restored.total, 18); assert.equal(restored.first, "You're working hard, George."); assert.equal(restored.score, 500); assert.equal(restored.archive, true);
    for (const lesson of plan.lessons) {
      await page.evaluate(lessonId => { selectPreviewLesson(lessonId); showView('previewView'); }, lesson.lessonId);
      assert.deepEqual(await page.locator('#englishText .preview-sentence > span').allTextContents(), lesson.records.map(record => record.english));
      assert.equal(await page.locator('#chineseText > li').count(), lesson.records.length);
      await page.locator('[data-analysis]').first().click();
      await page.waitForSelector('#analysisContent .sentence-understanding');
      assert.equal(await page.locator('#analysisContent [data-section=teacher-tip]').count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.screenshot({ path: `reports/nce1-scan-correction-${width}.png` });
    assert.equal(calls, 0); assert.deepEqual(errors, []);
    await page.close(); console.log(`${width}px: all corrected lesson previews, Chinese, teaching and stable resume pass; no API calls or overflow.`);
  }
} finally { await browser.close(); }
