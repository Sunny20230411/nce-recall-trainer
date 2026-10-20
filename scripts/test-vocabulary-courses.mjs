import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = []; let apiCalls = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/')) apiCalls++; });
  await page.addInitScript(() => localStorage.setItem('yuke_vocabulary_sample_v1', JSON.stringify([{ text: 'heavy', meaning: '旧样例' }])));
  await page.goto('http://127.0.0.1:4177/');
  const lessons = await page.evaluate(() => Object.values(courseCatalog).flatMap(course => course.lessons.filter(lesson => lesson.sentences.length).map(lesson => ({ courseId: course.id, lessonId: lesson.id, title: lesson.title }))));
  assert.equal(lessons.length, 168);
  for (const item of lessons) {
    const result = await page.evaluate(({ courseId, lessonId }) => {
      selectCourse(courseId); selectPreviewLesson(lessonId);
      return { entry: document.querySelector('#vocabEntry')?.textContent, title: state.selectedLesson.title };
    }, item);
    assert.equal(result.entry, '生词本 0', item.title);
    assert.equal(result.title, item.title);
  }
  const samples = [lessons[0], lessons[19], lessons[72], lessons.at(-1)];
  for (const item of samples) {
    await page.evaluate(({ courseId, lessonId }) => { selectCourse(courseId); selectPreviewLesson(lessonId); showView('previewView'); }, item);
    const before = await page.evaluate(() => ({ records: localStorage.getItem('nce_learning_records_v1'), session: localStorage.getItem('nce_practice_session_v3') }));
    await page.locator('[data-analysis]').first().click();
    await page.locator('#analysisContent .understanding-word-details summary').click();
    await page.locator('.vocab-word-toggle').first().click();
    await page.click('#homeBtn');
    assert.equal(await page.locator('#vocabEntry').textContent(), '生词本 1');
    await page.click('#vocabEntry');
    assert.ok((await page.locator('#vocabListView').textContent()).includes(item.title));
    await page.click('#vocabStart');
    assert.ok((await page.locator('#topTitle').textContent()).includes(item.title));
    await page.click('#vocabAnswer'); await page.click('#vocabAnswer');
    assert.equal(await page.locator('.vocab-input').isEnabled(), true);
    await page.click('#vocabMaster'); await page.click('#vocabNext'); await page.click('#vocabBack'); await page.click('#homeBtn');
    assert.deepEqual(await page.evaluate(() => ({ records: localStorage.getItem('nce_learning_records_v1'), session: localStorage.getItem('nce_practice_session_v3') })), before);
  }
  await page.reload();
  for (const item of samples) {
    await page.evaluate(({ courseId, lessonId }) => { selectCourse(courseId); selectPreviewLesson(lessonId); }, item);
    assert.equal(await page.locator('#vocabEntry').textContent(), '生词本 1');
  }
  await page.evaluate(() => { selectCourse('nce1'); selectPreviewLesson('lesson-41'); });
  assert.equal(await page.locator('#vocabEntry').textContent(), '生词本 0');
  assert.equal(apiCalls, 0);
  assert.deepEqual(errors, []);
  console.log('All 168 lessons have vocabulary entry; NCE1/NCE2 collections/results isolated, titles correct, refresh preserved, old sample ignored, sentence history unchanged; no API calls.');
} finally { await browser.close(); }
