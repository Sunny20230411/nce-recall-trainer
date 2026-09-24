import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const { default: chat } = await import('../api/chat.js');
const root = resolve('.');
const allowed = new Set(['index.html', 'ai-chat.js', 'ai-chat.css', 'nce1-analysis.js', 'nce1-zh-supplement.js', 'nce2-content.js']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/api/chat') return await chat(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const name = path === '/' ? 'index.html' : path.slice(1);
    if ((!allowed.has(name) && !/^assets\/[a-zA-Z0-9_./ -]+$/.test(name)) || name.split('/').includes('..')) { res.writeHead(404).end(); return; }
    const body = await readFile(resolve(root, name));
    res.writeHead(200, { 'Content-Type': mime[extname(name)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end(); }
});
let port = Number(process.env.PORT || 4173);
server.on('error', error => { if (error.code === 'EADDRINUSE' && port < 4190) server.listen(++port, '127.0.0.1'); else throw error; });
server.listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}`));
