import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';

process.loadEnvFile('.env.local');
const { createHandler } = await import('../api/chat.js');
const server = http.createServer(createHandler());
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const samples = [];
try {
  for (const sample of [
    ...(process.argv.includes('--bridge') ? [
      { name: 'tool-and-sequence', message: '我拿钥匙开门，为什么不能说 I take key open door？是不是英语只能有一个动词？', english: 'I open the door with a key.' },
      { name: 'destination-and-purpose', message: '帮我分析这句话，为什么有两个to？', english: 'I drove to the supermarket to buy some water.' },
      { name: 'acceptable-versus-intended', message: 'I eat outside 是不是错了？我每句都用I开头是不是也不对？', english: 'I eat outside.' }
    ] : [
    { name: 'relative-clause', message: '帮我分析这句话', english: 'I live in a very old town which is surrounded by beautiful woods.' },
    { name: 'expression-comparison', message: "It's over there. 和 There it is! 有什么区别？", english: "It's over there behind the teapot." },
    { name: 'unseen-conditional', message: '帮我分析这句话', english: 'If it rains tomorrow, we will stay at home.' },
    { name: 'simple-sentence', message: '帮我分析这句话', english: 'I am tired.' }
    ])
  ]) {
    const started = Date.now();
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: sample.message, context: { english: sample.english }, history: [] }) });
    const result = await response.json();
    if (!response.ok) throw Error(`Model evaluation failed (${response.status}): ${result.code || result.error}`);
    samples.push({ ...sample, elapsedMs: Date.now() - started, answer: result.answer });
    console.log(JSON.stringify(samples.at(-1)));
  }
  await mkdir('reports', { recursive: true });
  await writeFile(process.argv.includes('--bridge') ? 'reports/ai-learning-bridge-samples.json' : 'reports/ai-teaching-samples.json', JSON.stringify(samples, null, 2));
} finally {
  await new Promise(resolve => server.close(resolve));
}
