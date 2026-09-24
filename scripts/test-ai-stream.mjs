import assert from 'node:assert/strict';
import http from 'node:http';
import { readEvents } from '../stream-events.js';
import { createHandler } from '../api/chat.js';

const bytes = new TextEncoder().encode('data: {"text":"你好"}\r\n\r\ndata: {"text":"世界"}\n\n');
const fragmented = new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } });
const parsed = []; for await (const event of readEvents(fragmented)) parsed.push(event.text);
assert.deepEqual(parsed, ['你好', '世界']);
let signal;
const server = http.createServer(createHandler({ env: { AI_CHAT_ENABLED: 'true', ARK_API_KEY: 'test-only' }, fetcher: async (_, options) => {
  signal = options.signal;
  assert.equal(JSON.parse(options.body).stream, true);
  let timer;
  return new Response(new ReadableStream({ start(c) {
    const emit = event => c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    emit({ type: 'response.output_text.delta', delta: '第一段' });
    timer = setTimeout(() => { emit({ type: 'response.output_text.delta', delta: '第二段' }); emit({ type: 'response.completed' }); c.close(); }, 150);
    signal.addEventListener('abort', () => { clearTimeout(timer); c.error(Error('aborted')); }, { once: true });
  }, cancel() { clearTimeout(timer); } }));
} }));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const call = abort => fetch(`http://127.0.0.1:${server.address().port}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stream: true, message: 'Explain', context: { english: 'Hi' } }), signal: abort });
  const r = await call(); const events = []; const times = [];
  for await (const event of readEvents(r.body)) { events.push(event); times.push(Date.now()); }
  assert.deepEqual(events.map(e => e.type), ['delta', 'delta', 'done']);
  assert.ok(times[1] - times[0] > 50, 'First text arrives before completion');
  const abort = new AbortController(); const r2 = await call(abort.signal);
  const reader = r2.body.getReader(); await reader.read(); abort.abort();
  await new Promise(resolve => setTimeout(resolve, 50)); assert.ok(signal.aborted);
  console.log('UTF-8 fragmentation, progressive output, completion and upstream cancellation passed.');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
