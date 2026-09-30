export const FOLLOWUP_MARKER = '\n<<<FOLLOWUP_QUESTIONS>>>';
export const followupInstruction = `\n【每轮回复协议】每一次回复，包括局部追问，都必须输出JSON对象：{"answer":"Markdown正文","suggestions":["追问1","追问2","追问3"]}。answer先写，suggestions包含3—4个简短中文追问。根据最新问题、本轮回答和历史对话推断下一步想问什么，不重复已经回答的问题，不使用固定模板。不能因为用户要求简短或只问一个点就省略suggestions。若涉及音标，使用英式IPA。禁止代码围栏，推荐问题不是正文。`;
export const replyFormat = { type: 'json_schema', name: 'tutor_reply', strict: true, schema: {
  type: 'object', additionalProperties: false, required: ['answer', 'suggestions'], properties: {
    answer: { type: 'string' }, suggestions: { type: 'array', minItems: 3, maxItems: 4, items: { type: 'string' } }
  }
} };
export function createStructuredReply(onText) {
  let raw = '', emitted = '';
  return {
    push(text) {
      raw += text;
      const start = /"answer"\s*:\s*"/.exec(raw);
      if (!start) return;
      let decoded = '', i = start.index + start[0].length;
      while (i < raw.length) {
        const char = raw[i++];
        if (char === '"') break;
        if (char !== '\\') { decoded += char; continue; }
        if (i >= raw.length) break;
        const escape = raw[i++];
        if (escape === 'u') {
          if (raw.length - i < 4) break;
          const hex = raw.slice(i, i + 4);
          if (!/^[0-9a-f]{4}$/i.test(hex)) break;
          decoded += String.fromCharCode(parseInt(hex, 16)); i += 4;
        } else {
          const escapes = { '"': '"', '\\': '\\', '/': '/', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
          if (!(escape in escapes)) break;
          decoded += escapes[escape];
        }
      }
      if (decoded.length > emitted.length) { onText(decoded.slice(emitted.length)); emitted = decoded; }
    },
    finish() {
      const data = JSON.parse(raw);
      const suggestions = parseFollowups(JSON.stringify(data.suggestions));
      if (typeof data.answer !== 'string' || !data.answer.trim() || suggestions.length < 3) throw Error('Incomplete tutor reply');
      if (!data.answer.startsWith(emitted)) throw Error('Inconsistent tutor reply');
      if (data.answer.length > emitted.length) onText(data.answer.slice(emitted.length));
      return suggestions;
    }
  };
}
export function parseFollowups(text) {
  try {
    const items = JSON.parse(text.trim());
    if (!Array.isArray(items)) return [];
    return [...new Set(items.filter(item => typeof item === 'string' && item.trim() && item.length <= 100).map(item => item.trim()))].slice(0, 4);
  } catch { return []; }
}
// Retain a possible fragmented marker until it can be distinguished from prose.
export function createReplyParts(onText) {
  let buffer = '', suffix = '', separated = false;
  return {
    push(text) {
      if (separated) { suffix += text; return; }
      buffer += text;
      const index = buffer.indexOf(FOLLOWUP_MARKER);
      if (index >= 0) {
        onText(buffer.slice(0, index));
        suffix = buffer.slice(index + FOLLOWUP_MARKER.length);
        buffer = ''; separated = true;
      } else {
        let held = 0;
        for (let size = 1; size < FOLLOWUP_MARKER.length && size <= buffer.length; size++) {
          if (buffer.endsWith(FOLLOWUP_MARKER.slice(0, size))) held = size;
        }
        const safe = buffer.length - held;
        if (safe) { onText(buffer.slice(0, safe)); buffer = buffer.slice(safe); }
      }
    },
    finish() {
      if (!separated && buffer) onText(buffer);
      buffer = '';
      return separated ? parseFollowups(suffix) : [];
    }
  };
}
