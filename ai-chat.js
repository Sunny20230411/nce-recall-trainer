(() => {
  const tutorContext = () => window.getVocabularyTutorContext?.() || window.getReadOnlyAnalysisContext?.() || state;
  const entry = document.createElement('button');
  entry.className = 'ask-ai-entry'; entry.textContent = '问 AI'; entry.type = 'button';
  entry.title = '打开 AI 学习助教；长按可拖动'; entry.setAttribute('aria-haspopup', 'dialog');
  document.body.append(entry);
  let drag = null, entryPosition = null, suppressPointerClick = false;
  function positionEntry(x, y) {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || document.documentElement.clientWidth;
    const height = viewport?.height || innerHeight;
    const rect = entry.getBoundingClientRect();
    entryPosition = {
      x: Math.max(left + 8, Math.min(x, left + width - rect.width - 8)),
      y: Math.max(top + 8, Math.min(y, top + height - rect.height - 8))
    };
    entry.style.left = `${entryPosition.x}px`;
    entry.style.top = `${entryPosition.y}px`;
    entry.style.right = 'auto';
  }
  function finishDrag(event) {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
    clearTimeout(drag.timer);
    if (drag.active || drag.cancelled) suppressPointerClick = true;
    const id = drag.id;
    drag = null;
    entry.classList.remove('is-dragging');
    if (entry.hasPointerCapture(id)) entry.releasePointerCapture(id);
  }
  entry.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    suppressPointerClick = false;
    const rect = entry.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, active: false, cancelled: false };
    entry.setPointerCapture(event.pointerId);
    drag.timer = setTimeout(() => {
      if (!drag || drag.cancelled) return;
      drag.active = true;
      positionEntry(rect.left, rect.top);
      entry.classList.add('is-dragging');
    }, 400);
  });
  entry.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) {
      drag.cancelled = true;
      clearTimeout(drag.timer);
    }
    if (drag.active) positionEntry(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) entry.addEventListener(type, finishDrag);
  entry.addEventListener('contextmenu', event => event.preventDefault());
  entry.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) entry.click();
  });
  window.addEventListener('blur', () => finishDrag());
  const keepEntryVisible = () => {
    if (entryPosition && entry.getClientRects().length) positionEntry(entryPosition.x, entryPosition.y);
  };
  window.addEventListener('resize', keepEntryVisible);
  window.visualViewport?.addEventListener('resize', keepEntryVisible);
  window.visualViewport?.addEventListener('scroll', keepEntryVisible);
  new MutationObserver(keepEntryVisible).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const dialog = document.createElement('dialog');
  dialog.className = 'tutor-dialog'; dialog.setAttribute('aria-labelledby', 'tutorTitle');
  dialog.innerHTML = `<div class="tutor-layout"><header class="tutor-header"><strong id="tutorTitle">AI 学习助教</strong><button type="button" aria-label="关闭">×</button></header><p class="tutor-context"></p><div class="tutor-messages" role="log" aria-live="polite"></div><p class="tutor-status" role="status"></p><form class="tutor-form"><textarea aria-label="你的问题" placeholder="这句话哪里不理解？" maxlength="1500" rows="2" required></textarea><button type="submit">发送</button></form></div>`;
  document.body.append(dialog);
  const messages = dialog.querySelector('.tutor-messages');
  const status = dialog.querySelector('.tutor-status');
  const input = dialog.querySelector('textarea');
  const send = dialog.querySelector('[type=submit]');
  const newChat = document.createElement('button');
  newChat.type = 'button'; newChat.className = 'tutor-new-chat';
  newChat.textContent = '新建会话'; newChat.title = '清空对话，保留当前句子';
  dialog.querySelector('.tutor-header').append(newChat);
  let history = [], identity = '', controller;
  let editing = null, draftBeforeEdit = '';
  const editNotice = document.createElement('div'); editNotice.className = 'tutor-edit-notice'; editNotice.hidden = true;
  editNotice.innerHTML = '<span>正在修改问题</span><button type="button">取消</button>';
  dialog.querySelector('form').before(editNotice);
  function clearEditing(restoreDraft = false) {
    if (restoreDraft) input.value = draftBeforeEdit;
    editing = null; draftBeforeEdit = ''; editNotice.hidden = true; send.textContent = '发送';
  }
  editNotice.querySelector('button').onclick = () => clearEditing(true);
  const suggestions = document.createElement('section');
  suggestions.className = 'tutor-suggestions';
  messages.before(suggestions);
  const note = document.createElement('p'); note.className = 'tutor-note'; note.textContent = '回答由 AI 生成，仅供学习参考';
  dialog.querySelector('.tutor-form').after(note);
  function suggest() {
    const state = tutorContext();
    suggestions.replaceChildren();
    suggestions.hidden = messages.childElementCount > 0;
    const title = document.createElement('h3'); title.textContent = '你是否想问'; suggestions.append(title);
    const word = state.vocabulary;
    const revealed = state.current.correct || state.current.viewedAnswer;
    const questions = word ? revealed
      ? [`${word.text} 在原课文里是什么意思？`, `怎样记住 ${word.text} 的拼写？`, `请用 ${word.text} 举两个常见用法的例子`, `这个词作为 ${word.pos} 时怎么用？`]
      : ['根据这个词的中文意思给我一点提示，不要透露完整拼写', '给我一个不含答案的词义辨析提示', '这个词有什么使用场景？先不要显示英文答案']
      : ['帮我分析这句话', '这句话有哪些常用表达？', '先给我一点提示，不要直接给答案', '用相似句型再举两个例子'];
    if (!word && state.current.sentence.english.includes('?')) questions[1] = '这句话的疑问句语序为什么这样安排？';
    else if (!word && /\b(can|could|must|should|may)\b/i.test(state.current.sentence.english)) questions[1] = '这里的情态动词表达了什么含义？';
    if (state.current.wrongIndexes?.length) questions.splice(1, 0, '我填写的单词哪里错了？为什么？');
    for (const question of questions) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = question;
      button.onclick = () => { input.value = question; dialog.querySelector('form').requestSubmit(); };
      suggestions.append(button);
    }
  }
  const currentIdentity = () => {
    const state = tutorContext();
    return `${state.kind || (document.body.classList.contains('analysis-active') ? 'analysis' : 'practice')}:${state.selectedCourseId}:${state.selectedLesson.id}:${state.currentIndex}:${state.current?.sentence?.english}`;
  };
  newChat.onclick = () => {
    if (controller) return;
    clearEditing();
    history = []; messages.replaceChildren(); input.value = ''; status.textContent = '';
    identity = currentIdentity(); suggest();
  };
  function append(role, text) {
    const node = document.createElement(role === 'assistant' ? 'div' : 'p'); node.className = 'tutor-message'; node.dataset.role = role; node.textContent = text;
    messages.append(node); messages.scrollTop = messages.scrollHeight;
    return node;
  }
  function addEditButton(node, question, historyIndex) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'tutor-edit-question';
    button.textContent = '修改'; button.title = '修改这条问题并重新生成回答';
    button.setAttribute('aria-label', '修改问题');
    button.onclick = () => {
      if (controller) return;
      if (!editing) draftBeforeEdit = input.value;
      editing = { node, historyIndex }; input.value = question;
      editNotice.hidden = false; send.textContent = '重新发送'; input.focus({ preventScroll: true });
    };
    node.append(button);
  }
  function appendFollowups(answerNode, questions) {
    if (!Array.isArray(questions) || !questions.length) return;
    const follow = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
    const section = document.createElement('section'); section.className = 'tutor-followups';
    const title = document.createElement('h3'); title.textContent = '猜你接下来想问'; section.append(title);
    for (const question of [...new Set(questions)].filter(q => typeof q === 'string' && q.trim() && q.length <= 100).slice(0, 4)) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = question;
      button.onclick = () => { if (controller) return; clearEditing(); input.value = question; dialog.querySelector('form').requestSubmit(); };
      section.append(button);
    }
    answerNode.after(section);
    if (follow) messages.scrollTop = messages.scrollHeight;
  }
  entry.addEventListener('click', event => {
    const state = tutorContext();
    if (event.detail && suppressPointerClick) { suppressPointerClick = false; return; }
    if (document.body.classList.contains('vocab-practice-active') && !state.vocabulary) return;
    if (!state.current) return;
    if (identity !== currentIdentity()) { clearEditing(); history = []; messages.replaceChildren(); input.value = ''; identity = currentIdentity(); }
    const context = dialog.querySelector('.tutor-context');
    context.replaceChildren();
    for (const [className, text] of [
      ['tutor-context-meta', `${state.selectedLesson.title} · 第 ${state.currentIndex + 1} ${state.vocabulary ? '个单词' : '句'}`],
      ['tutor-context-english', state.vocabulary && !state.current.correct && !state.current.viewedAnswer ? '单词默写 · 提示模式' : state.current.sentence.english],
      ['tutor-context-chinese', state.current.sentence.chinese]
    ]) {
      const line = document.createElement('span');
      line.className = className; line.textContent = text; context.append(line);
    }
    suggest();
    status.textContent = location.protocol === 'file:' ? '请通过本地预览服务器打开页面，AI 接口不能在文件模式运行。' : '';
    const mobile = matchMedia('(max-width: 660px), (pointer: coarse)').matches;
    const closeButton = dialog.querySelector('.tutor-header button');
    // Explicit autofocus also prevents the dialog restoring a previously focused textarea.
    closeButton.autofocus = mobile;
    dialog.showModal();
    (mobile ? closeButton : input).focus({ preventScroll: true });
  });
  dialog.querySelector('.tutor-header button').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { controller?.abort(); });
  for (const event of ['keydown', 'keyup']) dialog.addEventListener(event, e => e.stopPropagation());
  window.addEventListener('vocabulary-context-change', () => { if (dialog.open) dialog.close(); });
  new MutationObserver(() => { if (dialog.open && ((!document.body.classList.contains('practice-active') && !document.body.classList.contains('analysis-active') && !document.body.classList.contains('vocab-practice-active')) || identity !== currentIdentity())) dialog.close(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  dialog.querySelector('form').addEventListener('submit', async event => {
    const state = tutorContext();
    event.preventDefault();
    const question = input.value.trim();
    if (!question || controller || location.protocol === 'file:') return;
    if (editing) {
      const nodes = Array.from(messages.children);
      const start = nodes.indexOf(editing.node);
      if (start < 0) { clearEditing(); return; }
      nodes.slice(start).forEach(node => node.remove());
      history = history.slice(0, editing.historyIndex);
      clearEditing();
    }
    const historyIndex = history.length;
    const snapshot = identity;
    const sentence = state.current.sentence;
    const context = { lesson: state.selectedLesson.title, english: sentence.english, chinese: sentence.chinese, parentEnglish: sentence.parentEnglish || '',
      draft: document.body.classList.contains('analysis-active') ? '' : Array.from(document.querySelectorAll('#wordSlots input')).map(node => node.value).join(' '),
      errors: JSON.stringify(state.current.wrongIndexes || []), answerVisible: state.current.correct || state.current.viewedAnswer,
      analysis: JSON.stringify(sentence.analysis || sentenceAnalysisCatalog[normalizeForAccepted(sentence.english)] || (window.NCE1_SENTENCE_ANALYSIS || {})[normalizeForAccepted(sentence.english)] || {}).slice(0, 4000) };
    if (state.vocabulary) Object.assign(context, { kind: 'vocabulary', draft: state.vocabulary.value,
      wordPos: state.vocabulary.pos, sourceSentence: `${state.vocabulary.sourceStatus === 'previous-edition' ? '（旧版收藏例句，可能不属于修正后的本课）' : ''}${state.vocabulary.english}`, analysis: '', wordStatus: state.vocabulary.status });
    controller = new AbortController(); send.disabled = true; newChat.disabled = true; status.textContent = '';
    suggestions.hidden = true;
    messages.querySelectorAll('.tutor-followups').forEach(node => node.remove());
    messages.querySelectorAll('.tutor-edit-question').forEach(button => { button.disabled = true; });
    const userNode = append('user', question); input.value = '';
    const pending = append('pending', '正在思考… 0 秒');
    pending.setAttribute('role', 'status');
    const started = Date.now();
    const timer = setInterval(() => { pending.textContent = `正在思考… ${Math.floor((Date.now() - started) / 1000)} 秒`; }, 1000);
    const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'tutor-stop'; stop.textContent = '停止生成';
    stop.onclick = () => controller?.abort(); status.append(stop);
    let answer = '', answerNode, followups = [];
    try {
      const { readEvents } = await import('./stream-events.js');
      const { renderTutorMarkdown } = await import('./tutor-markdown.js');
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ message: question, context, history: history.slice(-10), stream: true }) });
      if (!response.ok) { const data = await response.json(); throw Error(data.error || '请求失败，请重试。'); }
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        let complete = false;
        for await (const event of readEvents(response.body)) {
          if (snapshot !== currentIdentity() || !dialog.open) { controller.abort(); return; }
          if (event.type === 'delta') {
            clearInterval(timer); pending.textContent = '正在生成…';
            answer += event.text;
            if (!answerNode) answerNode = append('assistant', '');
            const follow = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
            renderTutorMarkdown(answerNode, answer);
            if (follow) messages.scrollTop = messages.scrollHeight;
          } else if (event.type === 'done') { complete = true; followups = event.suggestions || []; }
          else if (event.type === 'error') throw Error(event.error);
        }
        if (!complete || !answer) throw Error('回答中断，已保留收到的内容，请重试。');
      } else {
        const data = await response.json(); answer = data.answer;
        followups = data.suggestions || [];
        if (!answer) throw Error('模型没有返回文本，请重试。');
        answerNode = append('assistant', answer);
        renderTutorMarkdown(answerNode, answer);
      }
      if (snapshot !== currentIdentity() || !dialog.open) return;
      pending.remove();
      appendFollowups(answerNode, followups);
      history.push({ role: 'user', content: question }, { role: 'assistant', content: answer.slice(0, 5000) });
      addEditButton(userNode, question, historyIndex);
      status.textContent = '';
    } catch (error) {
      pending.dataset.role = 'error';
      pending.textContent = error.name === 'AbortError' ? '已停止，可重新发送。'
        : error instanceof TypeError ? '无法连接 AI 服务，请检查网络或本地预览服务是否已启动。问题已保留，可重新发送。'
        : error.message;
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'tutor-retry'; retry.textContent = '重试';
      retry.onclick = () => { if (controller) return; input.value = question; dialog.querySelector('form').requestSubmit(); };
      pending.append(document.createElement('br'), retry);
      status.textContent = '';
    }
    finally {
      clearInterval(timer); controller = undefined; send.disabled = false; newChat.disabled = false;
      messages.querySelectorAll('.tutor-edit-question').forEach(button => { button.disabled = false; });
    }
  });
})();
