(() => {
  const entry = document.createElement('button');
  entry.className = 'ask-ai-entry'; entry.textContent = '问 AI'; entry.type = 'button';
  entry.title = '打开 AI 学习助教'; entry.setAttribute('aria-haspopup', 'dialog');
  document.body.append(entry);
  const dialog = document.createElement('dialog');
  dialog.className = 'tutor-dialog'; dialog.setAttribute('aria-labelledby', 'tutorTitle');
  dialog.innerHTML = `<div class="tutor-layout"><header class="tutor-header"><strong id="tutorTitle">AI 学习助教</strong><button type="button" aria-label="关闭">×</button></header><p class="tutor-context"></p><div class="tutor-messages" role="log" aria-live="polite"></div><p class="tutor-status" role="status"></p><form class="tutor-form"><textarea aria-label="你的问题" placeholder="这句话哪里不理解？" maxlength="1500" rows="2" required></textarea><button type="submit">发送</button></form></div>`;
  document.body.append(dialog);
  const messages = dialog.querySelector('.tutor-messages');
  const status = dialog.querySelector('.tutor-status');
  const input = dialog.querySelector('textarea');
  const send = dialog.querySelector('[type=submit]');
  let history = [], identity = '', controller;
  const suggestions = document.createElement('section');
  suggestions.className = 'tutor-suggestions';
  messages.before(suggestions);
  const note = document.createElement('p'); note.className = 'tutor-note'; note.textContent = '回答由 AI 生成，仅供学习参考';
  dialog.querySelector('.tutor-form').after(note);
  function suggest() {
    suggestions.replaceChildren();
    suggestions.hidden = messages.childElementCount > 0;
    const title = document.createElement('h3'); title.textContent = '你是否想问'; suggestions.append(title);
    const questions = ['帮我分析这句话的语法结构', '这句话有哪些常用表达？', '先给我一点提示，不要直接给答案', '用相似句型再举两个例子'];
    if (state.current.sentence.english.includes('?')) questions[1] = '这句话的疑问句语序为什么这样安排？';
    else if (/\b(can|could|must|should|may)\b/i.test(state.current.sentence.english)) questions[1] = '这里的情态动词表达了什么含义？';
    if (state.current.wrongIndexes?.length) questions.unshift('我填写的单词哪里错了？为什么？');
    for (const question of questions) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = question;
      button.onclick = () => { input.value = question; dialog.querySelector('form').requestSubmit(); };
      suggestions.append(button);
    }
  }
  const currentIdentity = () => `${state.selectedCourseId}:${state.selectedLesson.id}:${state.currentIndex}:${state.current?.sentence?.english}`;
  function append(role, text) {
    const node = document.createElement('p'); node.className = 'tutor-message'; node.dataset.role = role; node.textContent = text;
    messages.append(node); messages.scrollTop = messages.scrollHeight;
    return node;
  }
  entry.addEventListener('click', () => {
    if (!state.current) return;
    if (identity !== currentIdentity()) { history = []; messages.replaceChildren(); input.value = ''; identity = currentIdentity(); }
    dialog.querySelector('.tutor-context').textContent = `${state.selectedLesson.title} · 第 ${state.currentIndex + 1} 句：${state.current.sentence.chinese}`;
    suggest();
    status.textContent = location.protocol === 'file:' ? '请通过本地预览服务器打开页面，AI 接口不能在文件模式运行。' : '';
    dialog.showModal(); input.focus();
  });
  dialog.querySelector('.tutor-header button').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { controller?.abort(); });
  for (const event of ['keydown', 'keyup']) dialog.addEventListener(event, e => e.stopPropagation());
  new MutationObserver(() => { if (dialog.open && (!document.body.classList.contains('practice-active') || identity !== currentIdentity())) dialog.close(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || controller || location.protocol === 'file:') return;
    const snapshot = identity;
    const sentence = state.current.sentence;
    const context = { lesson: state.selectedLesson.title, english: sentence.english, chinese: sentence.chinese,
      draft: Array.from(document.querySelectorAll('#wordSlots input')).map(node => node.value).join(' '),
      errors: JSON.stringify(state.current.wrongIndexes || []), answerVisible: state.current.correct || state.current.viewedAnswer,
      analysis: JSON.stringify(sentence.analysis || sentenceAnalysisCatalog[normalizeForAccepted(sentence.english)] || (window.NCE1_SENTENCE_ANALYSIS || {})[normalizeForAccepted(sentence.english)] || {}).slice(0, 4000) };
    controller = new AbortController(); send.disabled = true; status.textContent = '';
    suggestions.hidden = true;
    append('user', question); input.value = '';
    const pending = append('pending', '正在思考… 0 秒');
    pending.setAttribute('role', 'status');
    const started = Date.now();
    const timer = setInterval(() => { pending.textContent = `正在思考… ${Math.floor((Date.now() - started) / 1000)} 秒`; }, 1000);
    const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'tutor-stop'; stop.textContent = '停止生成';
    stop.onclick = () => controller?.abort(); status.append(stop);
    let answer = '', answerNode;
    try {
      const { readEvents } = await import('./stream-events.js');
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
            answerNode.textContent = answer;
            if (follow) messages.scrollTop = messages.scrollHeight;
          } else if (event.type === 'done') complete = true;
          else if (event.type === 'error') throw Error(event.error);
        }
        if (!complete || !answer) throw Error('回答中断，已保留收到的内容，请重试。');
      } else {
        const data = await response.json(); answer = data.answer;
        if (!answer) throw Error('模型没有返回文本，请重试。');
        answerNode = append('assistant', answer);
      }
      if (snapshot !== currentIdentity() || !dialog.open) return;
      pending.remove();
      history.push({ role: 'user', content: question }, { role: 'assistant', content: answer.slice(0, 5000) });
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
    finally { clearInterval(timer); controller = undefined; send.disabled = false; }
  });
})();
