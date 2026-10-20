import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const effective = JSON.parse(await readFile('content/understanding-source-index.effective.v1.json', 'utf8'));
if (!process.argv.includes('--allow-partial')) assert.equal(effective.complete, true);
const baseline = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8')).records;
const old51 = baseline.filter(record => record.courseId === 'nce1' && record.lessonId === 'lesson-51');
const new51 = effective.records.filter(record => record.courseId === 'nce1' && record.lessonId === 'lesson-51');
assert.equal(new51.length, 16);
const legacyRecord = { lessonId: 'lesson-51', startedRuns: 5, completedRuns: 2, progress: 50, completed: false, lastAccuracy: 77,
  aggregateCorrect: 20, aggregateQuestions: 30, lastPosition: 9,
  wrongSentences: [{ english: old51[5].english, chinese: old51[5].chinese, wrongCount: 2, lastInput: 'old complete answer', lastWrongAt: '2026-10-01T00:00:00Z' }],
  newWords: [{ english: old51[5].english, chinese: old51[5].chinese, addedAt: '2026-10-01T00:00:00Z' }] };
const legacySession = { lessonId: 'lesson-51', phase: 'wrong', currentIndex: 5, score: 900, combo: 1, maxCombo: 2, elapsed: 42,
  sessionTotalCount: 12, sessionCompletedCount: 5, sessionCorrectCount: 5,
  practiceEnglish: old51.map(record => record.english),
  learningRecordSnapshot: { lessonId: 'lesson-51', existed: true, record: legacyRecord },
  results: old51.map((record, index) => ({ english: record.english, chinese: record.chinese, correct: index < 5, attempts: index < 6 ? 1 : 0,
    progressCounted: index < 5, accuracyCounted: index < 5, lastInput: index < 5 ? record.english : 'old complete answer' })) };
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    const errors = [];
    let calls = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/chat')) calls++; });
    await page.addInitScript(({ record, session }) => {
      localStorage.setItem('nce_learning_records_v1', JSON.stringify({ 'lesson-51': record }));
      localStorage.setItem('nce_practice_session_v3', JSON.stringify(session));
    }, { record: legacyRecord, session: legacySession });
    const url = process.env.SPLIT_TEST_URL || pathToFileURL(resolve('index.html')).href;
    await page.goto(url);
    if (!process.env.SPLIT_TEST_URL) {
      const records = JSON.parse(await readFile('assets/understanding/nce1/lesson-51.json', 'utf8')).records;
      await page.evaluate(records => window.SENTENCE_UNDERSTANDING.records.push(...records), records);
    }
    const actual = await page.evaluate(() => Object.values(courseCatalog).flatMap(course => course.lessons.flatMap(lesson => lesson.sentences.map(sentence => ({ courseId: course.id, lessonId: lesson.id, english: sentence.english })))));
    assert.deepEqual(actual, effective.records.map(({ courseId, lessonId, english }) => ({ courseId, lessonId, english })));
    await page.click('#openNce1Btn');
    await page.click('.lesson-card[data-id="lesson-51"]');
    assert.equal(await page.locator('#englishText > li').count(), 16);
    assert.equal(await page.locator('#chineseText > li').count(), 16);
    const preview = await page.locator('#englishText .preview-sentence > span').allTextContents();
    assert.deepEqual(preview, new51.map(record => record.english));
    assert.ok(preview.includes("It's always warm in April and May, but it rains sometimes."));
    const history = await page.evaluate(() => learningRecordFor(state.selectedLesson));
    assert.equal(history.completedRuns, 2);
    assert.equal(history.progress, 50);
    assert.equal(history.lastAccuracy, 77);
    assert.equal(history.aggregateQuestions, 30);
    assert.equal(history.wrongSentences.length, 2);
    assert.equal(history.newWords.length, 2);
    await page.locator('#historyMistakesBtn').click();
    assert.equal(await page.locator('#historyMistakeList .history-mistake-item').count(), 2);
    assert.ok((await page.locator('#historyMistakeList').textContent()).includes('上次整题输入'));
    await page.evaluate(async () => {
      await ensureLessonUnderstanding('nce1', 'lesson-51');
      startPractice(state.selectedLesson.sentences, 'course', true);
    });
    const restored = await page.evaluate(() => ({ english: state.current.sentence.english, score: state.score, total: state.sessionTotalCount,
      elapsed: elapsedSeconds(), phase: state.phase, backup: Boolean(localStorage.getItem('nce_practice_session_v3_before_boundary_r5')) }));
    assert.equal(restored.english, "It's often windy in March.");
    assert.equal(restored.score, 900);
    assert.equal(restored.total, 16);
    assert.ok(restored.elapsed >= 42 && restored.elapsed < 50);
    assert.equal(restored.phase, 'ready');
    assert.equal(restored.backup, true);
    await page.evaluate(() => { state.current.correct = true; state.phase = 'correct'; renderWordSlots({ correctAll: true }); });
    assert.equal(await page.locator('[data-section="translation"] p').textContent(), new51[5].chinese);
    assert.equal(await page.locator('[data-section="teacher-tip"]').count(), 1);
    await page.locator('.understanding-word-details summary').click();
    assert.equal(await page.locator('.understanding-word-table tbody tr').count(), 5);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `reports/sentence-split-lesson51-${width}.png`, fullPage: true });
    assert.equal(calls, 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px: exact published practice/preview, 16 aligned Lesson 51 units, legacy progress/mistakes/session preserved; no API calls.`);
  }
} finally { await browser.close(); }
