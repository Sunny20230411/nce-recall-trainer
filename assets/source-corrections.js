(() => {
  const correctionFor = lesson => lesson.sourceCorrection;
  const applySplits = window.applyReviewedSentenceSplits;
  window.applyReviewedSentenceSplits = (courseId, lessons) => {
    applySplits(courseId, lessons);
    for (const correction of window.SENTENCE_UNDERSTANDING?.practiceCorrections?.lessons || []) {
      if (correction.courseId !== courseId) continue;
      const lesson = lessons.find(lesson => lesson.id === correction.lessonId);
      if (!lesson || lesson.sourceCorrection?.revision === correction.revision) continue;
      // Never silently overwrite a locally imported or independently edited lesson.
      if (lesson.sentences.length !== correction.baseline.length || !lesson.sentences.every((sentence, i) => sentence.english === correction.baseline[i].english)) continue;
      lesson.sentences = correction.sentences.map(sentence => ({ ...sentence, audioUrl: null, acceptedAnswers: [sentence.english] }));
      lesson.sourceCorrection = correction;
      lesson.boundaryRevision = correction.revision;
    }
  };
  const unchangedEnglish = lesson => new Set(lesson.sentences.map(sentence => sentence.english));
  window.migrateVocabularySourceCorrection = (items, lesson) => {
    if (!correctionFor(lesson)) return items;
    const clean = text => String(text || '').replace(/^[^a-z]+|[^a-z]+$/gi, '').toLowerCase();
    return items.map(item => {
      if (lesson.sentences.some(sentence => sentence.english === item.english)) return item;
      const sentence = lesson.sentences.find(sentence => sentence.id === item.sentenceId);
      const word = sentence?.analysis.tokens.find(token => clean(token.text) === clean(item.text));
      return word ? { ...item, english: sentence.english, meaning: word.translation, phonetic: word.phonetic, pos: word.posLabel,
        previousSourceEnglish: item.english, sourceStatus: 'corrected', sourceRevision: 6 }
        : { ...item, sourceStatus: 'previous-edition', sourceRevision: 6 };
    });
  };
  const migrateLearning = window.migrateSentenceSplitLearningRecord;
  window.migrateSentenceSplitLearningRecord = (record, lesson) => {
    const baseline = migrateLearning(record, lesson), correction = correctionFor(lesson);
    if (!correction || Number(baseline.sourceCorrectionRevision || 0) >= correction.revision) return baseline;
    const valid = unchangedEnglish(lesson);
    const completedOld = Math.floor(Math.max(0, Math.min(100, Number(baseline.progress) || 0)) / 100 * correction.baseline.length);
    const retainedCompleted = correction.baseline.slice(0, completedOld).filter(sentence => valid.has(sentence.english)).length;
    const oldCurrent = correction.baseline[Number(baseline.lastPosition) || 0];
    const nextPosition = oldCurrent ? lesson.sentences.findIndex(sentence => sentence.id === oldCurrent.id) : -1;
    return { ...baseline, contentRevision: correction.revision, sourceCorrectionRevision: correction.revision,
      progress: Math.floor(retainedCompleted / lesson.sentences.length * 100), completed: retainedCompleted === lesson.sentences.length,
      lastPosition: nextPosition >= 0 ? nextPosition : 0,
      wrongSentences: (baseline.wrongSentences || []).filter(item => valid.has(item.english)),
      newWords: (baseline.newWords || []).filter(item => valid.has(item.english)),
      sourceCorrectionHistory: { revision: correction.revision, previous: baseline }
    };
  };
  const migrateSession = window.migrateSentenceSplitSession;
  window.migrateSentenceSplitSession = (saved, lesson) => {
    const baseline = migrateSession(saved, lesson), correction = correctionFor(lesson);
    if (!correction || Number(baseline.sourceCorrectionRevision || 0) >= correction.revision || Number(saved.contentRevision || 0) >= correction.revision) return baseline;
    const queues = new Map();
    for (const item of baseline.results || []) {
      if (!queues.has(item.english)) queues.set(item.english, []);
      queues.get(item.english).push(item);
    }
    const results = lesson.sentences.map(sentence => {
      const prior = queues.get(sentence.english)?.shift();
      return prior ? { ...prior, english: sentence.english, chinese: sentence.chinese } : { english: sentence.english, chinese: sentence.chinese,
        correct: false, mastered: false, skipped: false, attempts: 0, emptySubmits: 0, hadWrongAttempt: false,
        progressCounted: false, accuracyCounted: false, lastInput: '', draftText: '', wordValues: [], wrongIndexes: [], pendingReplacementIndexes: [], activeWordIndex: 0 };
    });
    const firstPending = results.findIndex(result => !result.correct && !result.mastered && !result.skipped);
    return { ...baseline, contentRevision: correction.revision, sourceCorrectionRevision: correction.revision, results,
      currentIndex: firstPending >= 0 ? firstPending : Math.max(0, results.length - 1), phase: firstPending >= 0 ? 'ready' : 'correct',
      practiceEnglish: results.map(item => item.english), sessionTotalCount: results.length,
      sessionCompletedCount: results.filter(item => item.progressCounted || item.correct || item.mastered || item.skipped).length,
      sessionCorrectCount: results.filter(item => item.accuracyCounted || (item.correct && !item.mastered)).length,
      sourceCorrectionHistory: { revision: correction.revision, previous: saved },
      learningRecordSnapshot: baseline.learningRecordSnapshot ? { ...baseline.learningRecordSnapshot,
        record: baseline.learningRecordSnapshot.record ? window.migrateSentenceSplitLearningRecord(baseline.learningRecordSnapshot.record, lesson) : baseline.learningRecordSnapshot.record } : null
    };
  };
})();
