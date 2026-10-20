(() => {
  const eligible = () => Boolean(state.selectedCourseId && state.selectedLesson?.sentences.length);
  const scopeKey = () => `yuke_vocabulary_v1:${state.selectedCourseId}:${state.selectedLesson.id}`;
  let words = [], loadedKey;
  function loadWords() {
    const key = scopeKey();
    if (key === loadedKey) return;
    let stored;
    try {
      stored = localStorage.getItem(key);
      words = JSON.parse(stored || '[]');
    } catch { words = []; }
    if (!Array.isArray(words)) words = [];
    words = words.filter(word => word && typeof word.text === 'string' && typeof word.meaning === 'string');
    loadedKey = key;
  }
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const clean = value => String(value).replace(/^[^a-z]+|[^a-z]+$/gi, '');
  const identity = word => `${clean(word.text).toLowerCase()}:${word.meaning}`;
  const save = () => { localStorage.setItem(loadedKey, JSON.stringify(words)); window.refreshVocabulary(); decorate(); };
  const style = document.createElement('style');
  style.textContent = `
    #vocabListView{max-width:960px;margin:auto}.vocab-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:24px}.vocab-head h2{font-size:24px;margin:0 0 6px}.vocab-head p{color:var(--soft);margin:0}.vocab-list{border-top:1px solid var(--line)}.vocab-row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(0,2fr) auto;align-items:center;gap:24px;padding:20px 0;border-bottom:1px solid var(--line)}.vocab-row>div{min-width:0;overflow-wrap:anywhere}.vocab-row small{display:block;color:var(--soft);margin-top:6px}.vocab-word{border:0;background:none;color:var(--text);padding:0;font:inherit;font-weight:700;font-size:19px;cursor:pointer}.vocab-empty{padding:64px 16px;text-align:center;color:var(--soft)}.vocab-word-toggle{display:block;margin-top:4px;font-size:12px;padding:3px 5px}.vocab-collect{margin:10px 0}.vocab-exercise-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.vocab-exercise-actions .btn{min-width:0}.vocab-result{margin-top:20px;line-height:1.7;overflow-wrap:anywhere}.vocab-progress{margin-left:auto}.vocab-input-shell .word-slot{width:min(100%,320px)!important}.vocab-input-shell .word-slots{justify-content:center}.vocab-status{color:var(--soft);font-size:13px}.vocab-finish{text-align:center;padding:56px 12px}.vocab-finish .vocab-exercise-actions{margin-top:24px}body.vocab-practice-active main{padding-bottom:100px}body.vocab-practice-active #topTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#vocabPracticeView .feedback{pointer-events:auto;min-height:0;padding:10px;margin:12px 0}#vocabPracticeView .feedback:empty{padding:0;margin:0}.vocab-original{font-size:16px;color:var(--soft)}.vocab-pause{padding:48px 0;text-align:center}.vocab-pause button{margin-top:20px}
    @media(max-width:660px){.vocab-row{grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:18px 0}.vocab-row .vocab-example{grid-column:1/-1;grid-row:2}.vocab-head h2{font-size:21px}.vocab-head .btn{width:100%}body.vocab-practice-active main{padding:12px 0 100px}.vocab-exercise-actions.vocab-toolbar{position:fixed;z-index:20;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;padding:6px;border:1px solid var(--line);border-radius:22px;background:var(--panel);box-shadow:0 8px 26px #394c761f}.vocab-toolbar .btn{padding:4px 2px;min-height:44px;font-size:12px;border-radius:16px}.vocab-toolbar .key{display:none}}
  `;
  document.head.append(style);
  const listView = document.createElement('section');
  listView.id = 'vocabListView'; listView.className = 'view';
  const practiceView = document.createElement('section');
  practiceView.id = 'vocabPracticeView'; practiceView.className = 'view';
  document.querySelector('main').append(listView, practiceView);
  let session = null, previewScroll = 0, listScroll = 0, timer;
  const activePractice = () => practiceView.classList.contains('active');
  function navigate(id, title) {
    showView(id);
    document.body.classList.toggle('vocab-practice-active', id === 'vocabPracticeView');
    document.querySelector('#topTitle').textContent = title;
    document.querySelector('#homeBtn').setAttribute('aria-label', id === 'vocabPracticeView' ? '返回生词本' : '返回课文');
    document.querySelector('#homeBtn').title = id === 'vocabPracticeView' ? '返回生词本' : '返回课文';
    window.scrollTo(0, 0);
  }
  window.handleVocabularyBack = view => {
    if (!['vocabListView', 'vocabPracticeView'].includes(view)) return false;
    if (view === 'vocabPracticeView') {
      if (session && !session.finished && !confirm('结束本轮单词练习并返回生词本？')) return true;
      clearInterval(timer); stopSentenceAudio(); list();
      requestAnimationFrame(() => window.scrollTo(0, listScroll));
    } else {
      navigate('previewView', state.selectedLesson.title);
      requestAnimationFrame(() => { document.querySelector('#vocabEntry')?.focus({ preventScroll: true }); window.scrollTo(0, previewScroll); });
    }
    return true;
  };
  function list() {
    clearInterval(timer);
    loadWords();
    navigate('vocabListView', `${state.selectedLesson.title} · 生词本`);
    const body = listView;
    body.innerHTML = `<header class="vocab-head"><div><h2>生词本</h2><p>${escape(state.selectedLesson.title)} · ${words.length} 个单词</p></div><button class="btn" id="vocabStart" ${words.length ? '' : 'disabled'}>开始默写</button></header>` + (words.length ? `<div class="vocab-list">${words.map((word, index) => `<div class="vocab-row"><div><button class="vocab-word" data-speak="${index}" title="播放 ${escape(word.text)}">${escape(word.text)}</button><small>${escape(word.phonetic)}</small><small>${escape(word.meaning)} · ${escape(word.pos)}</small></div><div class="vocab-example"><small>${escape(word.english)}</small></div><button class="preview-play" data-remove="${index}" aria-label="移除 ${escape(word.text)}">移除</button></div>`).join('')}</div>` : '<div class="vocab-empty">暂无生词</div>');
    body.querySelectorAll('[data-speak]').forEach(button => button.onclick = () => speakSentence(words[button.dataset.speak].text));
    body.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { words.splice(Number(button.dataset.remove), 1); save(); list(); });
    body.querySelector('#vocabStart').onclick = () => start(words);
  }
  function start(entries) {
    if (!entries.length) return;
    listScroll = window.scrollY;
    session = { items: entries.map(word => ({ ...word, value: '', attempts: 0, status: 'pending', hadError: false })), index: 0, seconds: 0, paused: false, finished: false };
    navigate('vocabPracticeView', `${state.selectedLesson.title} · 单词默写`);
    clearInterval(timer);
    timer = setInterval(() => { if (activePractice() && !session.paused && !session.finished) { session.seconds++; updateMetrics(); } }, 1000);
    question();
  }
  const current = () => session.items[session.index];
  window.getVocabularyTutorContext = () => activePractice() && session && !session.finished && !session.paused ? {
    kind: 'vocabulary', selectedCourseId: state.selectedCourseId, selectedLesson: state.selectedLesson, currentIndex: session.index,
    vocabulary: current(), current: { sentence: { english: current().text, chinese: current().meaning },
      correct: current().status === 'correct', viewedAnswer: ['viewed', 'mastered'].includes(current().status),
      wrongIndexes: current().status === 'wrong' ? [0] : [] }
  } : null;
  const complete = item => ['correct', 'viewed', 'mastered'].includes(item.status);
  const accuracy = () => Math.round(session.items.filter(item => item.status === 'correct' && !item.hadError).length / Math.max(1, session.items.filter(item => item.attempts || complete(item)).length) * 100);
  function updateMetrics() {
    const timerNode = practiceView.querySelector('#vocabTimer');
    if (timerNode) timerNode.textContent = `${String(Math.floor(session.seconds / 60)).padStart(2, '0')}:${String(session.seconds % 60).padStart(2, '0')}`;
    const accuracyNode = practiceView.querySelector('#vocabAccuracy');
    if (accuracyNode) accuracyNode.textContent = `${accuracy()}%`;
  }
  function question(focus = true) {
    window.dispatchEvent(new Event('vocabulary-context-change'));
    const item = current(), done = complete(item);
    const count = session.items.filter(complete).length;
    document.querySelector('#topTitle').textContent = `${state.selectedLesson.title} · 单词默写 (${session.index + 1}/${session.items.length})`;
    practiceView.innerHTML = `<div class="practice"><div class="practice-status"><div class="metric-row"><span>${session.index + 1} / ${session.items.length}</span><span>用时 <b id="vocabTimer"></b></span><span>正确率 <b id="vocabAccuracy"></b></span></div><div class="progress-track" aria-label="单词练习进度"><div class="progress-fill" style="width:${count / session.items.length * 100}%"></div></div><button class="preview-play" id="vocabPause">暂停</button></div><div class="drill"><div class="drill-card"><div class="sentence-order">第 ${session.index + 1} 个单词</div><div class="prompt-label">中文提示 · ${escape(item.pos)}</div><div class="chinese">${escape(item.meaning)}</div><div class="input-shell vocab-input-shell"><div class="word-slots"><div class="word-slot ${item.status === 'wrong' ? 'wrong' : done ? 'correct' : item.value ? 'filled' : ''}" style="--slot-width:320px"><span class="slot-ipa">${done ? escape(item.phonetic) : ''}</span><input class="slot-input vocab-input" value="${escape(done ? item.text : item.value)}" aria-label="填写英文单词" aria-invalid="${item.status === 'wrong'}" autocomplete="off" autocapitalize="off" spellcheck="false" ${done ? 'disabled' : ''}></div></div></div><div class="feedback ${item.status === 'wrong' ? 'wrong' : done ? 'correct' : ''}" role="status">${item.status === 'wrong' ? '拼写还不对，修改后再提交。' : done ? item.status === 'correct' ? '正确' : item.status === 'viewed' ? '已查看答案' : '已标记掌握' : ''}</div>${done ? `<div class="vocab-result"><p class="vocab-original">${escape(item.english)}</p></div>` : ''}</div></div><div class="vocab-exercise-actions vocab-toolbar"><button class="btn ghost" id="vocabPrev" ${session.index ? '' : 'disabled'}><span class="key">Shift ←</span>上一题</button><button class="btn secondary" id="vocabHear"><span class="key">Ctrl</span>发音</button><button class="btn secondary" id="vocabMaster" ${done ? 'disabled' : ''}><span class="key">Ctrl M</span>掌握</button><button class="btn secondary" id="vocabAnswer" ${done ? 'disabled' : ''}><span class="key">Alt</span>答案</button><button class="btn" id="vocabSubmit"><span class="key">Space</span>${done ? '继续' : '提交'}</button><button class="btn ghost" id="vocabNext" ${done ? '' : 'disabled'}><span class="key">Shift →</span>下一题</button></div></div>`;
    updateMetrics();
    practiceView.querySelector('.metric-row').append(practiceView.querySelector('#vocabPause'));
    alignToolbar();
    const input = practiceView.querySelector('input');
    input.oninput = () => { item.value = input.value; input.closest('.word-slot').classList.toggle('filled', Boolean(input.value)); };
    practiceView.querySelector('#vocabPrev').onclick = () => move(-1);
    practiceView.querySelector('#vocabNext').onclick = () => move(1);
    practiceView.querySelector('#vocabSubmit').onclick = submit;
    practiceView.querySelector('#vocabHear').onclick = () => { stopSentenceAudio(); speakSentence(item.text); };
    practiceView.querySelector('#vocabAnswer').onclick = () => reveal('viewed');
    practiceView.querySelector('#vocabAnswer').disabled = done && item.status !== 'viewed';
    practiceView.querySelector('#vocabAnswer').innerHTML = `<span class="key">Alt</span>${item.status === 'viewed' ? '隐藏答案' : '显示答案'}`;
    practiceView.querySelector('#vocabMaster').onclick = () => reveal('mastered');
    practiceView.querySelector('#vocabPause').onclick = pause;
    if (focus) { if (!done) input.focus({ preventScroll: true }); else practiceView.querySelector('#vocabSubmit').focus({ preventScroll: true }); }
  }
  function submit() {
    if (session.paused) return;
    const item = current();
    if (complete(item)) { move(1); return; }
    item.attempts++;
    if (item.value.trim().toLowerCase() === item.text.toLowerCase()) {
      item.status = 'correct'; question(); stopSentenceAudio(); speakSentence(item.text);
    } else { item.hadError = true; item.status = 'wrong'; question(); practiceView.querySelector('input').select(); }
  }
  function reveal(status) {
    if (!session.paused && status === 'viewed' && current().status === 'viewed') {
      current().status = current().beforeAnswerStatus || 'pending';
      question();
      return;
    }
    if (session.paused || complete(current())) return;
    if (status === 'viewed') current().beforeAnswerStatus = current().status;
    current().status = status; current().hadError = true; question();
  }
  function move(offset) {
    if (session.paused || (offset > 0 && !complete(current()))) return;
    const next = session.index + offset;
    if (next < 0) return;
    stopSentenceAudio();
    if (next >= session.items.length) { finish(); return; }
    session.index = next; question();
  }
  function finish() {
    window.dispatchEvent(new Event('vocabulary-context-change'));
    session.finished = true; clearInterval(timer);
    const mistakes = session.items.filter(item => item.hadError);
    // Word-session results are isolated from all sentence learning records.
    try { localStorage.setItem(`${loadedKey}:result`, JSON.stringify({ completedAt: new Date().toISOString(), seconds: session.seconds, accuracy: accuracy(), items: session.items })); } catch {}
    practiceView.innerHTML = `<section class="vocab-finish"><h2>本轮完成</h2><p>${session.items.length} 个单词 · 正确率 ${accuracy()}% · 用时 ${session.seconds} 秒</p><div class="vocab-exercise-actions">${mistakes.length ? `<button class="btn" id="vocabRetry">复习错词 ${mistakes.length}</button>` : ''}<button class="btn secondary" id="vocabBack">返回生词本</button></div></section>`;
    practiceView.querySelector('#vocabBack').onclick = list;
    practiceView.querySelector('#vocabRetry')?.addEventListener('click', () => start(mistakes));
    practiceView.querySelector('button')?.focus();
  }
  function pause() {
    window.dispatchEvent(new Event('vocabulary-context-change'));
    session.paused = true; stopSentenceAudio();
    practiceView.innerHTML = '<div class="vocab-pause"><h2>练习已暂停</h2><button class="btn" id="vocabResume">继续练习</button></div>';
    practiceView.querySelector('button').onclick = () => { session.paused = false; question(); };
    practiceView.querySelector('button').focus();
  }
  let controlUsed = false;
  function alignToolbar() {
    const toolbar = practiceView.querySelector('.vocab-toolbar');
    if (!toolbar || !matchMedia('(max-width:660px)').matches) return;
    const viewport = window.visualViewport;
    const covered = viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0;
    toolbar.style.bottom = `calc(${covered + 8}px + env(safe-area-inset-bottom, 0px))`;
  }
  window.visualViewport?.addEventListener('resize', alignToolbar);
  window.visualViewport?.addEventListener('scroll', alignToolbar);
  window.addEventListener('resize', alignToolbar);
  document.addEventListener('keydown', event => {
    if (!activePractice() || !session || session.finished || event.isComposing || event.target.closest('.tutor-dialog')) return;
    if (session.paused) { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); session.paused = false; question(); } return; }
    // Toolbar buttons keep native Enter/Space activation, preventing double submits.
    if (event.target.closest('button') && ['Enter', ' '].includes(event.key)) return;
    if (event.key === 'Control') { if (!event.repeat) controlUsed = false; return; }
    if (event.ctrlKey) controlUsed = true;
    let action;
    if (event.shiftKey && event.key === 'ArrowLeft') action = () => move(-1);
    else if (event.shiftKey && event.key === 'ArrowRight') action = () => move(1);
    else if (event.ctrlKey && event.key.toLowerCase() === 'm') action = () => reveal('mastered');
    else if (event.key === 'Alt') action = () => reveal('viewed');
    else if ([' ', 'Enter'].includes(event.key)) action = submit;
    else if (event.key === 'Escape') action = pause;
    if (action) { event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) action(); }
  }, true);
  document.addEventListener('keyup', event => {
    if (activePractice() && session && !session.paused && !session.finished && event.key === 'Control' && !controlUsed) { event.preventDefault(); event.stopImmediatePropagation(); stopSentenceAudio(); speakSentence(current().text); }
  }, true);
  window.refreshVocabulary = () => {
    document.querySelector('#vocabEntry')?.remove();
    if (!eligible()) return;
    loadWords();
    const button = document.createElement('button');
    button.id = 'vocabEntry'; button.className = 'badge'; button.type = 'button';
    button.textContent = `生词本 ${words.length}`;
    button.onclick = () => { previewScroll = window.scrollY; list(); };
    document.querySelector('#lessonInfo').append(button);
  };
  async function sentenceWords(sentence) {
    const courseId = state.selectedCourseId, lesson = state.selectedLesson;
    try { await window.ensureLessonUnderstanding(courseId, lesson.id); } catch {}
    const records = window.SENTENCE_UNDERSTANDING.records.filter(record => record.courseId === courseId && record.lessonId === lesson.id && record.english === sentence.english);
    const order = lesson.sentences.indexOf(sentence) + 1;
    const record = records.find(record => record.sentenceId === sentence.id) || records.find(record => record.sentenceOrder === order) || (records.length === 1 ? records[0] : null);
    const entries = record?.words || sentenceAnalysisFor(sentence).tokens.map(token => ({ text: token.displayText || token.text, phonetic: token.phonetic, meaning: token.translation, pos: token.posLabel }));
    return entries.map((word, index) => ({ ...word, phonetic: window.britishPhoneticFor(word.text, word.phonetic, record?.parentEnglish || sentence.parentEnglish || sentence.english, (record?.tokenOffset || sentence.tokenOffset || 0) + index) || word.phonetic }));
  }
  function add(word, sentence) {
    const item = { ...word, text: clean(word.text), english: sentence.english, sentenceId: sentence.id };
    if (!item.text) return;
    if (!words.some(saved => identity(saved) === identity(item))) words.push(item);
    save();
  }
  let decorating = false;
  async function decorate() {
    if (decorating || !eligible()) return;
    loadWords();
    const scope = loadedKey;
    const context = window.getReadOnlyAnalysisContext?.();
    const sentence = context?.current.sentence || (document.body.classList.contains('practice-active') ? state.current?.sentence : null);
    if (!sentence) return;
    const root = document.querySelector(context ? '#analysisContent' : '#wordSlots');
    if (!root.querySelector('.understanding-word-table')) return;
    decorating = true;
    try {
      const entries = await sentenceWords(sentence);
      if (scopeKey() !== scope || (window.getReadOnlyAnalysisContext?.()?.current.sentence || state.current?.sentence) !== sentence) return;
      root.querySelectorAll('.understanding-word-table tbody tr').forEach((row, index) => {
        const word = entries[index];
        if (!word || !clean(word.text)) return;
        let button = row.querySelector('.vocab-word-toggle');
        if (!button) { button = document.createElement('button'); button.type = 'button'; button.className = 'preview-play vocab-word-toggle'; row.querySelector('th').append(button); }
        const saved = words.some(item => identity(item) === identity(word));
        const label = saved ? '已收藏' : '+ 生词';
        if (button.textContent !== label) button.textContent = label;
        button.setAttribute('aria-pressed', String(saved));
        button.onclick = event => {
          event.stopPropagation();
          if (words.some(item => identity(item) === identity(word))) { words = words.filter(item => identity(item) !== identity(word)); save(); }
          else add(word, sentence);
        };
      });
    } finally { decorating = false; if (scopeKey() !== scope) void decorate(); }
  }
  new MutationObserver(() => { if (!decorating) void decorate(); }).observe(document.querySelector('main'), { childList: true, subtree: true });
  window.offerVocabularyMistakes = async () => {
    if (!eligible()) return;
    loadWords();
    const scope = loadedKey;
    const sentence = state.current?.sentence;
    const indexes = [...(state.current?.wrongIndexes || [])];
    if (!sentence || !indexes.length) return;
    const entries = await sentenceWords(sentence);
    if (scopeKey() !== scope || state.current?.sentence !== sentence || state.phase !== 'wrong') return;
    document.querySelector('#vocabCollect')?.remove();
    const button = document.createElement('button'); button.id = 'vocabCollect'; button.type = 'button'; button.className = 'preview-play vocab-collect';
    button.style.pointerEvents = 'auto';
    button.textContent = `收集本次错词（${indexes.length}）`;
    button.onclick = () => { indexes.forEach(index => { if (entries[index]) add(entries[index], sentence); }); button.textContent = '已加入生词本'; button.disabled = true; };
    document.querySelector('#feedback').append(button);
  };
  window.refreshVocabulary();
})();
