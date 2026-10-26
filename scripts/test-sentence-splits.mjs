import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPublishedUnderstanding, makeLetterShape } from './sentence-split-content.mjs';
import { validateUnderstanding } from './understanding-contract.mjs';
import vm from 'node:vm';

const partial = process.argv.includes('--allow-partial');
assert.equal(makeLetterShape("I'm a new student."), "I'_ a n__ s______.");
const published = await loadPublishedUnderstanding({ requireComplete: !partial, withoutScanCorrection: true });
const original = JSON.parse(await readFile('content/understanding-source-index.v1.json', 'utf8'));
const plan = JSON.parse(await readFile('content/sentence-split-plan.v1.json', 'utf8'));
const pilots = JSON.parse(await readFile('content/sentence-understanding.pilot.v1.json', 'utf8')).records;
const tips = new Map(published.teacherTips.records.map(tip => [tip.sentenceId, tip]));
assert.equal(tips.size, published.records.length);
assert.equal(new Set(published.records.map(record => record.sentenceId)).size, published.records.length);
const byParent = Map.groupBy(published.records.filter(record => record.contentRevision === 5), record => record.parentSentenceId);
for (const boundary of plan.parents) {
  const children = byParent.get(boundary.parentSentenceId);
  if (!children && partial) continue;
  assert.equal(children?.length, 2, boundary.parentSentenceId);
  assert.equal(children.map(child => child.english).join(' '), boundary.parentEnglish);
  const base = pilots.find(record => record.sentenceId === boundary.parentSentenceId)
    || JSON.parse(await readFile(`content/understanding-records/${boundary.parentSentenceId}.json`, 'utf8'));
  assert.deepEqual(children.flatMap(child => child.words.map(({ text, meaning, pos }) => ({ text, meaning, pos }))), base.words.map(({ text, meaning, pos }) => ({ text, meaning, pos })));
  for (const child of children) {
    assert.deepEqual(validateUnderstanding(child), [], child.sentenceId);
    assert.equal(child.parentSentenceId, boundary.parentSentenceId);
    assert.equal(tips.get(child.sentenceId)?.english, child.english);
    assert.equal(tips.get(child.sentenceId)?.reviewStatus, 'model-reviewed-awaiting-user-review');
  }
}
const byLesson = Map.groupBy(published.records, record => `${record.courseId}:${record.lessonId}`);
for (const [key, records] of byLesson) {
  const baseline = original.records.filter(record => `${record.courseId}:${record.lessonId}` === key);
  assert.equal(records.map(record => record.english).join(' '), baseline.map(record => record.english).join(' '), `Original text changed: ${key}`);
  assert.deepEqual(records.map(record => record.sentenceOrder), records.map((_, index) => index + 1));
}
for (const record of published.records.filter(record => record.contentRevision !== 5)) {
  const base = pilots.find(item => item.sentenceId === record.sentenceId)
    || JSON.parse(await readFile(`content/understanding-records/${record.sentenceId}.json`, 'utf8'));
  assert.deepEqual(record, { ...base, sentenceOrder: record.sentenceOrder }, `Unchanged analysis altered: ${record.sentenceId}`);
}
if (!partial) {
  assert.equal(published.records.filter(record => record.courseId === 'nce1').length, 1127);
  assert.equal(published.records.filter(record => record.courseId === 'nce2').length, 1218);
  assert.equal(byParent.size, 172);
}
const context = { window: { SENTENCE_UNDERSTANDING: { practiceSplits: published.practiceSplits } } };
vm.runInNewContext(await readFile('sentence-splits.js', 'utf8'), context);
for (const courseId of ['nce1', 'nce2']) {
  const lessons = [...Map.groupBy(original.records.filter(record => record.courseId === courseId), record => record.lessonId)].map(([id, records]) => ({ id, sentences: records.map(record => ({ id: record.sentenceId, english: record.english, chinese: record.chinese })) }));
  context.window.applyReviewedSentenceSplits(courseId, lessons);
  for (const lesson of lessons) {
    assert.equal(JSON.stringify(lesson.sentences.map(record => record.english)), JSON.stringify(byLesson.get(`${courseId}:${lesson.id}`).map(record => record.english)));
    const before = JSON.stringify(lesson);
    context.window.applyReviewedSentenceSplits(courseId, [lesson]);
    assert.equal(JSON.stringify(lesson), before, 'Boundary application is idempotent');
    if (!lesson.boundaryMigration) continue;
    const parent = published.practiceSplits.parents.find(parent => parent.courseId === courseId && parent.lessonId === lesson.id);
    const saved = { progress: 60, completedRuns: 7, aggregateQuestions: 40, lastPosition: 2,
      wrongSentences: [{ english: parent.parentEnglish, wrongCount: 3, lastInput: 'original full input' }],
      newWords: [{ english: parent.parentEnglish, addedAt: '2026-10-01' }] };
    const migrated = context.window.migrateSentenceSplitLearningRecord(saved, lesson);
    assert.equal(migrated.progress, 60);
    assert.equal(migrated.completedRuns, 7);
    assert.equal(migrated.aggregateQuestions, 40);
    assert.equal(migrated.wrongSentences.length, 2);
    assert.equal(migrated.newWords.length, 2);
    assert.ok(migrated.wrongSentences.every(item => item.inheritedFromParent && item.wrongCount === 3 && item.lastInput === 'original full input'));
    assert.equal(JSON.stringify(migrated.boundaryHistory.wrongSentences), JSON.stringify(saved.wrongSentences));
    assert.equal(context.window.migrateSentenceSplitLearningRecord(migrated, lesson), migrated);
    const session = { currentIndex: 0, phase: 'wrong', score: 300, elapsed: 42, results: [{ english: parent.parentEnglish, correct: false, lastInput: 'old input', attempts: 2 }] };
    const restored = context.window.migrateSentenceSplitSession(session, lesson);
    assert.equal(restored.results.length, 2);
    assert.equal(restored.phase, 'ready');
    assert.equal(restored.score, 300);
    assert.equal(restored.elapsed, 42);
    assert.ok(restored.results.every(item => item.priorParentInput === 'old input' && !item.lastInput && !item.wrongIndexes.length));
    assert.equal(context.window.migrateSentenceSplitSession(restored, lesson), restored);
  }
}
console.log(JSON.stringify({ parents: byParent.size, units: byParent.size * 2, records: published.records.length, partial, validation: 'exact source/word inheritance, unchanged analyses, stable IDs and idempotent history/session migration' }));
