(() => {
  const revision = () => window.SENTENCE_UNDERSTANDING?.practiceSplits?.revision || 0;
  window.applyReviewedSentenceSplits = (courseId, lessons) => {
    const boundaries = window.SENTENCE_UNDERSTANDING?.practiceSplits?.parents || [];
    for (const lesson of lessons) {
      const parents = boundaries.filter(parent => parent.courseId === courseId && parent.lessonId === lesson.id);
      if (!parents.length || lesson.boundaryRevision === revision()) continue;
      const used = new Set(), oldToNew = [];
      const sentences = [];
      for (const sentence of lesson.sentences) {
        oldToNew.push(sentences.length);
        const parent = parents.find(parent => !used.has(parent.parentSentenceId) && parent.parentEnglish === sentence.english
          && (!sentence.id || sentence.id === parent.parentSentenceId));
        if (!parent) { sentences.push(sentence); continue; }
        used.add(parent.parentSentenceId);
        for (const child of parent.children) {
          // Only approved child data is used; parent answer variants/audio are not inherited.
          sentences.push({ ...child, audioUrl: null, acceptedAnswers: [child.english] });
        }
      }
      if (used.size) {
        const identities = window.SENTENCE_UNDERSTANDING.practiceSplits.identities?.[`${courseId}:${lesson.id}`];
        if (identities?.length === sentences.length && identities.every((item, index) => item.english === sentences[index].english)) {
          sentences.forEach((sentence, index) => {
            sentence.id = identities[index].id;
            if (identities[index].chinese) sentence.chinese = identities[index].chinese;
          });
        }
        lesson.boundaryMigration = { revision: revision(), oldToNew, oldCount: lesson.sentences.length };
        lesson.sentences = sentences;
        lesson.boundaryRevision = revision();
      }
    }
  };
  const childrenFor = (lesson, english) => lesson.sentences.filter(sentence => sentence.parentEnglish === english);
  function expandHistory(items, lesson) {
    const expanded = new Map();
    for (const item of items || []) {
      const children = childrenFor(lesson, item.english);
      const values = children.length ? children.map(child => ({ ...item, english: child.english, chinese: child.chinese,
        parentSentenceId: child.parentSentenceId, parentEnglish: item.english, parentChinese: item.chinese,
        inheritedFromParent: true })) : [item];
      for (const value of values) {
        const prior = expanded.get(value.english);
        if (!prior || (!value.inheritedFromParent && prior.inheritedFromParent)) expanded.set(value.english, value);
      }
    }
    return [...expanded.values()];
  }
  window.migrateSentenceSplitLearningRecord = (record, lesson) => {
    const migration = lesson.boundaryMigration;
    if (!migration || Number(record.contentRevision || 0) >= migration.revision) return record;
    const oldIndex = Math.max(0, Math.min(migration.oldCount - 1, Number(record.lastPosition) || 0));
    return { ...record, contentRevision: migration.revision,
      lastPosition: migration.oldToNew[oldIndex] ?? record.lastPosition,
      wrongSentences: expandHistory(record.wrongSentences, lesson), newWords: expandHistory(record.newWords, lesson),
      boundaryHistory: { revision: migration.revision, lastPosition: record.lastPosition,
        wrongSentences: record.wrongSentences || [], newWords: record.newWords || [] }
    };
  };
  window.migrateSentenceSplitSession = (saved, lesson) => {
    if (!lesson.boundaryMigration || Number(saved.contentRevision || 0) >= revision()) return saved;
    if (!(saved.results || []).some(item => childrenFor(lesson, item.english).length)) return saved;
    const results = [];
    let currentIndex = 0, currentWasSplit = false;
    for (const [index, item] of saved.results.entries()) {
      const children = childrenFor(lesson, item.english);
      if (index === saved.currentIndex) {
        currentIndex = results.length;
        currentWasSplit = children.length > 0;
        if (currentWasSplit && item.correct) currentIndex += children.length - 1;
      }
      if (!children.length) { results.push(item); continue; }
      for (const child of children) results.push({ ...item, english: child.english, chinese: child.chinese,
        parentEnglish: item.english, priorParentInput: item.lastInput, priorParentAttempts: item.attempts,
        ...(item.correct || item.mastered || item.skipped ? {} : { attempts: 0, emptySubmits: 0, hadWrongAttempt: false, firstTry: false }),
        lastInput: item.correct ? child.english : '', draftText: '', wordValues: [], wrongIndexes: [],
        pendingReplacementIndexes: [], activeWordIndex: 0, answerReturnPhase: 'ready' });
    }
    return { ...saved, contentRevision: revision(), results, currentIndex,
      phase: currentWasSplit && !results[currentIndex]?.correct ? 'ready' : saved.phase,
      practiceEnglish: results.map(item => item.english), sessionTotalCount: results.length,
      sessionCompletedCount: results.filter(item => item.progressCounted || item.correct || item.skipped || item.mastered).length,
      sessionCorrectCount: results.filter(item => item.accuracyCounted || (item.correct && !item.mastered)).length,
      learningRecordSnapshot: saved.learningRecordSnapshot ? { ...saved.learningRecordSnapshot,
        record: saved.learningRecordSnapshot.record ? window.migrateSentenceSplitLearningRecord(saved.learningRecordSnapshot.record, lesson) : saved.learningRecordSnapshot.record
      } : saved.learningRecordSnapshot
    };
  };
})();
