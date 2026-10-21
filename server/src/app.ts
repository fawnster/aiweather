import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, readFileSync } from 'node:fs';
import { stat, realpath, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync, constants as zlib } from 'node:zlib';
import { resolve, extname, sep } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerMessage } from '../../shared/types.js';
import type { State } from './state.js';
import type { SourceHealth } from './poller.js';
import { UptimeService } from './uptime.js';
import { NewsService } from './news.js';
import { sources } from './registry.js';
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm' };
// Compression: the bulk uptime JSON is ~3 MB raw and ~10x smaller compressed. Each compressed body is made once and
// reused until its content changes, so a burst of visitors costs one compression, not one each (the host has 0.25 vCPU).
type Encoding = 'br' | 'gzip';
const COMPRESSIBLE = /^(?:text\/|application\/json|image\/svg\+xml)/;
export function pickEncoding(acceptEncoding: string | string[] | undefined): Encoding | null {
  const value = String(acceptEncoding ?? '');
  return /\bbr\b/.test(value) ? 'br' : /\bgzip\b/.test(value) ? 'gzip' : null;
}
function compress(body: Buffer, encoding: Encoding): Buffer {
  return encoding === 'br'
    ? brotliCompressSync(body, { params: { [zlib.BROTLI_PARAM_QUALITY]: 5, [zlib.BROTLI_PARAM_SIZE_HINT]: body.length } })
    : gzipSync(body, { level: 6 });
}
class CompressedCache {
  private entries = new Map<string, { tag: string; br?: Buffer; gzip?: Buffer }>();
  constructor(private max = 200) {}
  get(key: string, tag: string, body: () => Buffer, encoding: Encoding): Buffer {
    let entry = this.entries.get(key);
    if (!entry || entry.tag !== tag) {
      entry = { tag };
      this.entries.delete(key); this.entries.set(key, entry);
      if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
    }
    return entry[encoding] ??= compress(body(), encoding);
  }
}

export function createApp(state: State, health: () => SourceHealth[], staticRoot: string, uptime = new UptimeService(sources), news = new NewsService()) {
  const compressed = new CompressedCache();
  const started = Date.now();
  const ws = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const lastPong = new WeakMap<WebSocket, number>();
  const send = (client: WebSocket, message: ServerMessage) => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (client.bufferedAmount > 1024 * 1024) { client.terminate(); return; }
    client.send(JSON.stringify(message));
  };
  const broadcast = (message: ServerMessage) => {
    const body = JSON.stringify(message);
    for (const client of ws.clients) {
      if (client.bufferedAmount > 1024 * 1024) client.terminate();
      else if (client.readyState === WebSocket.OPEN) client.send(body);
    }
  };
  const json = (res: ServerResponse, data: unknown, cached = false) => {
    res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', cached ? 'public, max-age=60' : 'no-store');
    const text = JSON.stringify(data);
    const encoding = text.length > 1024 ? pickEncoding(res.req?.headers['accept-encoding']) : null;
    res.setHeader('vary', 'accept-encoding');
    if (!encoding) { res.end(text); return; }
    const raw = Buffer.from(text);
    const body = compressed.get(`api:${res.req?.url ?? ''}`, createHash('sha1').update(raw).digest('base64'), () => raw, encoding);
    res.setHeader('content-encoding', encoding); res.setHeader('content-length', body.length); res.end(body);
  };
  const serve = async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('x-content-type-options', 'nosniff');
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
    if (url.pathname === '/api/snapshot') { json(res, state.snapshot()); return; }
    if (url.pathname === '/api/health') { const sources = health(); json(res, { ok: true, uptimeSec: Math.floor((Date.now() - started) / 1000), sources }); return; }
    if (url.pathname === '/api/uptime') { json(res, await uptime.all(), true); return; }
    if (url.pathname === '/api/news') { json(res, await news.all(), true); return; }
    if (url.pathname.startsWith('/api/news/')) {
      const result = news.get(decodeURIComponent(url.pathname.slice('/api/news/'.length)));
      if (!result) { res.statusCode = 404; json(res, { error: 'Unknown company' }); return; }
      json(res, await result, true); return;
    }
    if (url.pathname.startsWith('/api/uptime/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/uptime/'.length));
      const result = uptime.get(id);
      if (!result) { res.statusCode = 404; json(res, { error: 'Unknown company' }); return; }
      json(res, await result, true); return;
    }
    if (url.pathname === '/ws') { res.writeHead(426, { upgrade: 'websocket' }); res.end(); return; }
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.split('/').some(s => s.startsWith('.'))) { res.writeHead(400); res.end(); return; }
    const root = resolve(staticRoot);
    let path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    let info = await stat(path).catch(() => null), stand = false;
    // a page opened before a deploy still asks for files (its weather icons) in the hashed folder its code came from:
    // answer with the same file from the build that's live now, instead of index.html as a broken image
    const old = info?.isFile() ? null : /^\/s-[a-f0-9]{10}\/(.+)$/.exec(pathname);
    if (old) for (const dir of (await readdir(root).catch(() => [] as string[])).filter(d => /^s-[a-f0-9]{10}$/.test(d))) {
      const p = resolve(root, dir, old[1]), i = p.startsWith(root + sep) ? await stat(p).catch(() => null) : null;
      if (i?.isFile()) { path = p; info = i; stand = true; break; }
    }
    if (!info?.isFile()) { path = resolve(root, 'index.html'); info = await stat(path).catch(() => null); }
    if (!info?.isFile()) { res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end('Frontend not built yet. The backend is available at /api/snapshot and /api/health.'); return; }
    const real = await realpath(path);
    const rootReal = await realpath(root);
    if (!real.startsWith(rootReal + sep)) { res.writeHead(403); res.end(); return; }
    const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
    // web/build.mjs puts the modules under /s-<content hash>/, so those never change once published
    const immutable = /[\\/]s-[a-f0-9]{10}[\\/]/.test(path) || /[.-][a-z0-9_-]{8,}\.[a-z0-9]+$/i.test(path.split(sep).pop()!);
    res.setHeader('cache-control', path.endsWith('.html') ? 'no-cache' : immutable && !stand ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    res.setHeader('etag', etag);
    if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }
    res.setHeader('content-type', mime[extname(path)] ?? 'application/octet-stream');
    res.setHeader('accept-ranges', 'bytes');
    // Safari/iOS only plays <video> when the server answers byte-range requests with 206
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
      let end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      if (start >= info.size || start > end) { res.writeHead(416, { 'content-range': `bytes */${info.size}` }); res.end(); return; }
      res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${info.size}`, 'content-length': end - start + 1 });
      if (req.method === 'HEAD') { res.end(); return; }
      createReadStream(path, { start, end }).on('error', () => res.destroy()).pipe(res);
      return;
    }
    const type = mime[extname(path)] ?? '';
    const encoding = COMPRESSIBLE.test(type) && info.size > 1024 && info.size < 4 * 1024 * 1024 ? pickEncoding(req.headers['accept-encoding']) : null;
    res.setHeader('vary', 'accept-encoding');
    if (encoding) {
      const body = compressed.get(`file:${path}`, etag, () => readFileSync(path), encoding); // read + compressed once per version
      res.setHeader('content-encoding', encoding); res.setHeader('content-length', body.length);
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.setHeader('content-length', info.size);
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(path).on('error', () => res.destroy()).pipe(res);
  };
  const server = createServer((req, res) => { void serve(req, res).catch(error => { if (!res.headersSent) res.writeHead(error instanceof URIError ? 400 : 500); res.end(); }); });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  server.on('upgrade', (req, socket, head) => {
    let pathname: string;
    try { pathname = new URL(req.url ?? '/', 'http://localhost').pathname; }
    catch { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return; }
    if (pathname !== '/ws') { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return; }
    ws.handleUpgrade(req, socket, head, client => ws.emit('connection', client, req));
  });
  ws.on('connection', client => {
    lastPong.set(client, Date.now());
    client.on('error', () => client.terminate());
    client.on('message', data => {
      try { if (JSON.parse(data.toString()).t === 'pong') lastPong.set(client, Date.now()); }
      catch { client.close(1007, 'Expected JSON'); }
    });
    send(client, { t: 'snapshot', data: state.snapshot() });
  });
  const heartbeat = setInterval(() => {
    for (const client of ws.clients) {
      if (Date.now() - (lastPong.get(client) ?? 0) > 75_000) client.terminate();
      else send(client, { t: 'ping', at: new Date().toISOString() });
    }
  }, 25_000);
  heartbeat.unref();
  const close = () => { clearInterval(heartbeat); for (const client of ws.clients) client.terminate(); ws.close(); server.close(); };
  return { server, broadcast, close };
}
