import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { loadTeacherTips } from './teacher-tip-content.mjs';

const sourceIndex = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8'));
const pilot = await loadTeacherTips(sourceIndex.records, { requireComplete: process.argv.includes('--require-complete') });
const course = process.argv.find(value => value.startsWith('--course='))?.split('=')[1];
if (course) pilot.records = pilot.records.filter(tip => tip.courseId === course);
const existingPilot = JSON.parse(await readFile('content/sentence-understanding.pilot.v1.json', 'utf8'));
if (process.argv.includes('--available-only')) {
  const fs = await import('node:fs/promises');
  const available = new Set((await fs.readdir('content/understanding-records')).map(name => name.replace(/\.json$/, '')));
  for (const record of existingPilot.records) available.add(record.sentenceId);
  pilot.records = pilot.records.filter(tip => available.has(tip.sentenceId));
}
const records = await Promise.all(pilot.records.map(tip => existingPilot.records.find(record => record.sentenceId === tip.sentenceId) || readFile(`content/understanding-records/${tip.sentenceId}.json`, 'utf8').then(JSON.parse)));
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
try {
  for (const width of [375, 430, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 932 } });
    const errors = [];
    let calls = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/chat')) calls++; });
    await page.goto(pathToFileURL(resolve('index.html')).href);
    await page.evaluate(records => {
      const catalog = window.SENTENCE_UNDERSTANDING.records;
      for (const record of records) if (!catalog.some(item => item.sentenceId === record.sentenceId)) catalog.push(record);
    }, records);
    for (const [index, record] of records.entries()) {
      await page.evaluate(record => {
        state.selectedCourseId = record.courseId;
        state.selectedLesson = courseCatalog[record.courseId].lessons.find(lesson => lesson.id === record.lessonId);
        startPractice(state.selectedLesson.sentences, 'course', false);
        state.currentIndex = state.selectedLesson.sentences.findIndex(sentence => sentence.id === record.sentenceId);
        if (state.currentIndex < 0) state.currentIndex = state.selectedLesson.sentences.findIndex(sentence => sentence.english === record.english);
        if (state.currentIndex < 0) throw Error(`Missing practice sentence: ${record.english}`);
        renderQuestion();
        state.current.correct = true;
        state.phase = 'correct';
        renderWordSlots({ correctAll: true });
      }, record);
      assert.equal(await page.locator('[data-section="teacher-tip"]').count(), 1, `${record.sentenceId}: missing tip in actual practice rendering`);
      // Render each stable source record, including repeated English lines.
      await page.evaluate(record => {
        const sentence = { ...state.selectedLesson.sentences.find(sentence => sentence.english === record.english), id: record.sentenceId };
        const markup = window.renderSentenceUnderstanding({ sentence, courseId: record.courseId, lessonId: record.lessonId, sentenceOrder: record.sentenceOrder, legacyAnalysis: { tokens: [], groups: [] }, manualStructure: false });
        document.getElementById('wordSlots').innerHTML = markup;
      }, record);
      assert.equal(await page.locator('[data-section="teacher-tip"] > h2').textContent(), '名师提点');
      assert.equal(await page.locator('[data-section="teacher-tip"] > p').textContent(), pilot.records[index].text);
      assert.equal(await page.locator('.understanding-backbone').count(), 0);
      assert.equal(await page.locator('summary', { hasText: '一句话主干' }).count(), 0);
      const relations = await page.locator('.understanding-relations-table tbody tr').evaluateAll(rows => rows.map(row => Array.from(row.children, cell => cell.textContent)));
      assert.deepEqual(relations, record.parts.length > 1 ? record.parts.map(part => [part.relation, part.text, part.meaning]) : []);
      const notes = await page.locator('.understanding-notes-table tbody tr').evaluateAll(rows => rows.map(row => Array.from(row.children, cell => cell.textContent)));
      assert.deepEqual(notes, (record.structureNotes || record.notes).map(note => [note.title, note.text]));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width === 430 && ['nce-1-lesson-019-sentence-007', 'nce-1-lesson-001-sentence-001', 'nce-2-lesson-001-sentence-001'].includes(record.sentenceId)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `reports/teacher-tip-${record.lessonId}-${record.sentenceOrder}.png`, fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    assert.equal(calls, 0);
    await page.close();
    console.log(`${width}px: ${records.length} teacher tips; original relation/note text preserved; no overflow or model calls.`);
  }
} finally { await browser.close(); }
