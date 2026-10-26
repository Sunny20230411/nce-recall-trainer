import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const plan = JSON.parse(await readFile('content/nce1-scan-correction.plan.v1.json', 'utf8'));
const source = plan.lessons.find(lesson => lesson.lessonId === 'lesson-37');
const correction = { courseId: 'nce1', lessonId: source.lessonId, revision: 6,
  baseline: source.baseline.map(record => ({ id: record.sentenceId, english: record.english })),
  sentences: source.records.map(record => ({ id: record.sentenceId, english: record.english, chinese: '测试', analysis: { tokens: [] } })) };
const context = { window: { SENTENCE_UNDERSTANDING: { practiceCorrections: { lessons: [correction] } } } };
vm.runInNewContext(await readFile('sentence-splits.js', 'utf8'), context);
vm.runInNewContext(await readFile('assets/source-corrections.js', 'utf8'), context);
const api = context.window;
const lesson = { id: 'lesson-37', sentences: correction.baseline.map(sentence => ({ ...sentence })) };
api.applyReviewedSentenceSplits('nce1', [lesson]);
assert.equal(lesson.sentences.length, 18);
assert.equal(lesson.sentences.map(s => s.english).join(' '), source.sourceText);
api.applyReviewedSentenceSplits('nce1', [lesson]); assert.equal(lesson.sentences.length, 18);
const locallyImported = { id: 'lesson-37', sentences: [{ english: 'My own imported text.' }] };
api.applyReviewedSentenceSplits('nce1', [locallyImported]); assert.equal(locallyImported.sentences[0].english, 'My own imported text.');
const record = { contentRevision: 5, progress: 100, completed: true, completedRuns: 3, startedRuns: 5, lastAccuracy: 83, aggregateCorrect: 99,
  lastPosition: 0, wrongSentences: source.baseline.map(s => ({ english: s.english, wrongCount: 2 })), newWords: [] };
const migrated = api.migrateSentenceSplitLearningRecord(record, lesson);
assert.equal(migrated.completed, false); assert.equal(migrated.progress, 33); assert.equal(migrated.lastAccuracy, 83);
assert.equal(migrated.completedRuns, 3); assert.equal(migrated.aggregateCorrect, 99); assert.equal(migrated.wrongSentences.length, 6);
assert.equal(migrated.sourceCorrectionHistory.previous.wrongSentences.length, 8);
assert.equal(api.migrateSentenceSplitLearningRecord(migrated, lesson), migrated);
const saved = { contentRevision: 5, currentIndex: 0, score: 500, elapsed: 80,
  results: source.baseline.map(s => ({ english: s.english, correct: true, progressCounted: true, lastInput: s.english })) };
const session = api.migrateSentenceSplitSession(saved, lesson);
assert.equal(session.results.length, 18); assert.equal(session.currentIndex, 0); assert.equal(session.phase, 'ready');
assert.equal(session.results.filter(r => r.correct).length, 6); assert.equal(session.score, 500);
assert.equal(session.sourceCorrectionHistory.previous, saved); assert.equal(api.migrateSentenceSplitSession(session, lesson), session);
const vocabulary = api.migrateVocabularySourceCorrection([{ text: 'bookcase', meaning: '书架', english: source.baseline[1].english, sentenceId: 'removed' }], lesson);
assert.equal(vocabulary.length, 1); assert.equal(vocabulary[0].sourceStatus, 'previous-edition');
console.log('Revision 6 migration passed: full source, new units pending, historical counts archived, idempotence, imported text protected, vocabulary retained.');
