import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { loadTeacherTips } from './teacher-tip-content.mjs';

const { records } = JSON.parse(await readFile('assets/understanding/nce1/lesson-37.json', 'utf8'));
const editorial = await loadTeacherTips(JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8')).records);
for (const record of records) {
  const original = JSON.parse(execFileSync('git', ['show', `HEAD:content/understanding-records/${record.sentenceId}.json`], { encoding: 'utf8' }));
  const { teacherTip, ...unchanged } = record;
  assert.deepEqual(unchanged, original, `${record.sentenceId}: original analysis changed`);
  assert.ok(teacherTip.text && teacherTip.ruleVersion && teacherTip.reviewNote);
}
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [375, 430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let calls = 0;
    page.on('request', request => { if (request.url().includes('/api/chat')) calls++; });
    await page.goto(pathToFileURL(resolve('index.html')).href);
    await page.evaluate(records => {
      window.SENTENCE_UNDERSTANDING.records.push(...records);
      state.selectedCourseId = 'nce1';
      state.selectedLesson = courseCatalog.nce1.lessons.find(lesson => lesson.id === 'lesson-37');
      startPractice(state.selectedLesson.sentences, 'course', false);
    }, records);
    for (const record of records) {
      await page.evaluate(record => {
        state.currentIndex = record.sentenceOrder - 1;
        renderQuestion();
        state.current.correct = true;
        state.phase = 'correct';
        renderWordSlots({ correctAll: true });
      }, record);
      assert.equal(await page.locator('[data-section="teacher-tip"] > h2').textContent(), '名师提点');
      assert.equal(await page.locator('[data-section="teacher-tip"] > p').textContent(), editorial.records.find(tip => tip.sentenceId === record.sentenceId)?.text || record.teacherTip.text);
      assert.equal(await page.locator('.understanding-backbone').count(), 0);
      const actual = await page.locator('.understanding-relations-table tbody tr').evaluateAll(rows => rows.map(row => Array.from(row.children, cell => cell.textContent)));
      assert.deepEqual(actual, record.parts.length > 1 ? record.parts.map(part => [part.relation, part.text, part.meaning]) : []);
      const notes = await page.locator('.understanding-notes-table tbody tr').evaluateAll(rows => rows.map(row => Array.from(row.children, cell => cell.textContent)));
      assert.deepEqual(notes, (record.structureNotes || record.notes).map(note => [note.title, note.text]));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.understanding-details[open]').count(), 0);
      if (record.sentenceOrder === 1) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `reports/lesson37-tables-${width}.png`, fullPage: true });
      }
    }
    await page.evaluate(() => {
      const record = window.SENTENCE_UNDERSTANDING.records.find(record => record.lessonId === 'lesson-131');
      const html = renderSentenceUnderstanding({ sentence: record, courseId: record.courseId, lessonId: record.lessonId, sentenceOrder: record.sentenceOrder, legacyAnalysis: { tokens: [], groups: [] }, manualStructure: false });
      const hasTip = window.SENTENCE_UNDERSTANDING.teacherTips.records.some(tip => tip.sentenceId === record.sentenceId);
      if (hasTip ? !html.includes('understanding-preview-table') : !html.includes('understanding-notes')) throw Error('Lesson layout inconsistent with tip coverage');
    });
    assert.equal(calls, 0);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px: Lesson 37 preserves every relation and note; no overflow or API calls.`);
  }
} finally { await browser.close(); }
