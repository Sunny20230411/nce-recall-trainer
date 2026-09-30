(() => {
  const loaded = new Set();
  const loading = new Map();
  window.ensureLessonUnderstanding = function (courseId, lessonId) {
    const key = `${courseId}:${lessonId}`;
    const asset = window.SENTENCE_UNDERSTANDING?.lessons?.[key];
    if (!asset || loaded.has(key) || location.protocol === 'file:') return null;
    if (loading.has(key)) return loading.get(key);
    const promise = fetch(asset).then(response => {
      if (!response.ok) throw Error('Unable to load sentence explanation');
      return response.json();
    }).then(data => {
      if (!Array.isArray(data.records)) throw Error('Invalid sentence explanation');
      const catalog = window.SENTENCE_UNDERSTANDING;
      const keys = new Set(catalog.records.map(record => `${record.courseId}:${record.lessonId}:${record.sentenceId}`));
      for (const record of data.records) {
        const identity = `${record.courseId}:${record.lessonId}:${record.sentenceId}`;
        if (!keys.has(identity) && record.courseId === courseId && record.lessonId === lessonId && record.analysisStatus === 'approved') catalog.records.push(record);
      }
      loaded.add(key);
    }).finally(() => loading.delete(key));
    loading.set(key, promise);
    return promise;
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const rows = items => items.map(item => `<li><strong>${escape(item.text)}</strong><span>${escape(item.role)}</span><p>${escape(item.explanation)}</p></li>`).join('');
  document.addEventListener('click', event => {
    const button = event.target.closest('.understanding-word-play');
    if (!button) return;
    stopSentenceAudio();
    speakSentence(button.textContent);
  });
  document.addEventListener('keydown', event => {
    const button = event.target.closest('.understanding-word-play');
    if (!button || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) button.click();
  }, true);
  window.renderSentenceUnderstanding = function ({ sentence, courseId, lessonId, sentenceOrder, legacyAnalysis, manualStructure, roleLabels = {} }) {
    const record = (window.SENTENCE_UNDERSTANDING?.records || []).find(item => item.courseId === courseId && item.lessonId === lessonId && item.sentenceOrder === sentenceOrder && item.english === sentence.english && item.analysisStatus === 'approved');
    const words = (record?.words || legacyAnalysis.tokens.map(token => ({ text: `${token.displayText || token.text || ''}${token.punctuation || ''}`, phonetic: token.phonetic, meaning: token.translation, pos: token.posLabel }))).map((word, index) => ({ ...word, phonetic: window.britishPhoneticFor(word.text, word.phonetic, sentence.english, index) || '待确认' }));
    const structures = manualStructure ? legacyAnalysis.groups.map(group => ({ text: legacyAnalysis.tokens.slice(group.startToken, group.endToken + 1).map(token => `${token.displayText || token.text || ''}${token.punctuation || ''}`).join(' '), role: group.label || roleLabels[group.type]?.[0] || group.type, explanation: '' })) : record?.structures || [];
    return `<div class="sentence-understanding">
      <p class="understanding-original" lang="en">${escape(sentence.english)}</p>
      <section class="understanding-section" data-section="translation"><h2>自然翻译</h2><p class="understanding-translation">${escape(record?.chinese || sentence.chinese)}</p></section>
      ${record?.comparison ? `<section class="understanding-section" data-section="comparison"><h2>中英文怎么表达</h2><p><strong>中文：</strong>${escape(record.comparison.chinese)}</p><p><strong>英文：</strong>${escape(record.comparison.english)}</p>
        ${record.comparison.steps?.length ? `<ol class="understanding-comparison-steps">${record.comparison.steps.map(step => `<li><h3>${escape(step.label)}</h3><p class="understanding-step-expression" lang="en">${escape(step.text)}</p><p>${escape(step.explanation)}</p></li>`).join('')}</ol>` : ''}
        ${record.comparison.takeaway ? `<p class="understanding-takeaway">${escape(record.comparison.takeaway)}</p>` : ''}</section>` : ''}
      ${record?.backbone ? `<section class="understanding-section" data-section="backbone"><h2>一句话主干</h2><p class="understanding-backbone" lang="en">${escape(record.backbone.text)}</p><p>${escape(record.backbone.meaning)}</p></section>` : ''}
      ${record && record.parts.length > 1 ? `<section class="understanding-section" data-section="relations"><h2>信息关系</h2><div class="understanding-parts">${record.parts.map(part => `<div class="understanding-part"><span>${escape(part.relation)}</span><strong lang="en">${escape(part.text)}</strong><p>${escape(part.meaning)}</p></div>`).join('')}</div></section>` : ''}
      ${record ? `<section class="understanding-section" data-section="structure"><h2>结构拆解</h2><div class="understanding-notes">${(record.structureNotes || record.notes).map(note => `<section><h3>${escape(note.title)}</h3><p>${escape(note.text)}</p></section>`).join('')}</div>
        ${structures.length ? `<details class="understanding-details"><summary>语法角色详情</summary><ul class="understanding-structures">${rows(structures)}</ul></details>` : ''}</section>` : structures.length ? `<details class="understanding-details"><summary>详细结构</summary><ul class="understanding-structures">${rows(structures)}</ul></details>` : ''}
      <details class="understanding-details understanding-word-details"><summary>单词详情</summary><table class="understanding-word-table"><caption>原句单词与本句用法</caption><colgroup><col class="word-col"><col class="phonetic-col"><col class="meaning-col"><col class="pos-col"></colgroup><thead><tr><th scope="col">单词</th><th scope="col">音标</th><th scope="col">本句词义</th><th scope="col">词性</th></tr></thead><tbody>${words.map(word => `<tr><th scope="row" lang="en"><button type="button" class="understanding-word-play" title="播放单词：${escape(word.text)}" aria-label="播放单词：${escape(word.text)}" ${'speechSynthesis' in window ? '' : 'disabled'}>${escape(word.text)}</button></th><td>${escape(word.phonetic)}</td><td>${escape(word.meaning)}</td><td>${escape(word.pos)}</td></tr>`).join('')}</tbody></table></details>
    </div>`;
  };
})();
