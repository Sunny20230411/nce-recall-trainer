import { Lexer } from './assets/vendor/marked/marked.esm.js';

// Build only formatting nodes; model-provided HTML, URLs and images stay inert.
export function renderTutorMarkdown(target, source) {
  const fragment = document.createDocumentFragment();
  function render(parent, tokens) {
    for (const token of tokens || []) {
      if (['space', 'def'].includes(token.type)) continue;
      if (token.type === 'list') {
        const list = document.createElement(token.ordered ? 'ol' : 'ul');
        if (token.ordered && Number.isSafeInteger(token.start)) list.start = token.start;
        for (const item of token.items) {
          const li = document.createElement('li'); render(li, item.tokens); list.append(li);
        }
        parent.append(list); continue;
      }
      const tags = { paragraph: 'p', blockquote: 'blockquote', strong: 'strong', em: 'em',
        del: 'del', codespan: 'code', code: 'pre', br: 'br', hr: 'hr', heading: 'h3' };
      const tag = tags[token.type];
      if (tag) {
        const node = document.createElement(tag);
        if (token.tokens) render(node, token.tokens);
        else if (!['br', 'hr'].includes(tag)) node.textContent = token.text || '';
        parent.append(node);
      } else if (token.tokens && token.type !== 'html') render(parent, token.tokens);
      else parent.append(document.createTextNode(token.text ?? token.raw ?? ''));
    }
  }
  render(fragment, Lexer.lex(source, { gfm: true, breaks: true }));
  target.replaceChildren(fragment);
}
