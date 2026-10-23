import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.js';
import { State } from '../src/state.js';
import { sources } from '../src/registry.js';

// the fixture page carries one inline script, so its hash must show up in the page's Content Security Policy
const FIXTURE_HTML = '<html>fixture sky<script>window.k = 1</script></html>';
test('HTTP snapshot/health, SPA/static caching, websocket snapshot/fanout/heartbeat', { timeout: 35_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'aiweather-static-'));
  await mkdir(join(root, 'assets')); await writeFile(join(root, 'index.html'), FIXTURE_HTML); await writeFile(join(root, 'assets', 'sky-1234abcd.js'), 'console.log("sky")');
  await mkdir(join(root, 's-0123456789', 'wx'), { recursive: true }); await writeFile(join(root, 's-0123456789', 'wx', 'rain.svg'), '<svg>rain</svg>');
  let app: ReturnType<typeof createApp>;
  const state = new State([sources[0]], false, m => app.broadcast(m));
  app = createApp(state, () => [], root);
  t.after(() => { app.close(); return rm(root, { recursive: true, force: true }); });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const address = app.server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  assert.equal((await (await fetch(base + '/api/snapshot')).json()).demo, false);
  assert.deepEqual(Object.keys(await (await fetch(base + '/api/health')).json()), ['ok', 'uptimeSec', 'sources']);
  const index = await fetch(base + '/route'); assert.equal(await index.text(), FIXTURE_HTML); assert.equal(index.headers.get('cache-control'), 'no-cache');
  const csp = index.headers.get('content-security-policy') ?? '';
  assert.match(csp, /default-src 'self'/); assert.match(csp, /object-src 'none'/); assert.match(csp, /base-uri 'none'/);
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update('window.k = 1').digest('base64')}'`), 'the inline script is allowed by its hash');
  assert.ok(csp.includes(`connect-src 'self' ws://${new URL(base).host} wss://${new URL(base).host} https://data.x.ai`), 'its own WebSocket and xAI status JSON');
  const asset = await fetch(base + '/assets/sky-1234abcd.js'); assert.match(asset.headers.get('cache-control')!, /immutable/);
  // an icon asked for by a page from an older build is answered from the live build (not as index.html), briefly cached
  const stale = await fetch(base + '/s-abcdefabcd/wx/rain.svg'); assert.equal(await stale.text(), '<svg>rain</svg>');
  assert.match(stale.headers.get('content-type')!, /svg/); assert.equal(stale.headers.get('cache-control'), 'public, max-age=300');
  assert.match((await fetch(base + '/s-0123456789/wx/rain.svg')).headers.get('cache-control')!, /immutable/);
  assert.equal(await (await fetch(base + '/s-abcdefabcd/wx/missing.svg')).text(), FIXTURE_HTML);
  assert.equal((await fetch(base + '/assets/sky-1234abcd.js', { headers: { 'if-none-match': asset.headers.get('etag')! } })).status, 304);
  assert.equal((await fetch(base + '/route', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/.env')).status, 400);
  assert.equal((await fetch(base + '/ws')).status, 426);
  const connect = async () => {
    const client = new WebSocket(base.replace('http', 'ws') + '/ws'); const messages: any[] = [];
    client.on('message', raw => { const message = JSON.parse(raw.toString()); messages.push(message); if (message.t === 'ping') client.send('{"t":"pong"}'); });
    await once(client, 'message'); assert.equal(messages[0].t, 'snapshot'); return { client, messages };
  };
  const first = await connect(), second = await connect();
  const heartbeat = new Promise<void>(resolve => first.client.on('message', raw => { if (JSON.parse(raw.toString()).t === 'ping') resolve(); }));
  state.apply({ ...state.get('claude'), level: 'operational', error: undefined, stale: false, fetchedAt: new Date().toISOString() });
  const one = once(first.client, 'message'), two = once(second.client, 'message'); await Promise.all([one, two]);
  assert.equal(first.messages.filter(m => m.t === 'company').length, 1); assert.equal(second.messages.filter(m => m.t === 'company').length, 1);
  const next = { ...state.get('claude'), level: 'degraded' as const, fetchedAt: new Date().toISOString() };
  const e1 = once(first.client, 'message'), e2 = once(second.client, 'message'); state.apply(next); await Promise.all([e1, e2]);
  assert.equal(first.messages.filter(m => m.t === 'event').length, 1); assert.equal(second.messages.filter(m => m.t === 'event').length, 1);
  assert.equal(first.messages.filter(m => m.t === 'event')[0].data.id, second.messages.filter(m => m.t === 'event')[0].data.id);
  await heartbeat;
  const ping = first.messages.find(m => m.t === 'ping');
  assert.ok(ping.at);
  assert.equal(ping.fetched.claude, state.get('claude').fetchedAt); // each company's last good read rides along (fetchedAt alone is never broadcast)
  first.client.terminate(); second.client.terminate();
});

test('compresses big JSON and text files once, and leaves small or media responses alone', async () => {
  const { brotliDecompressSync, gunzipSync } = await import('node:zlib');
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { State } = await import('../src/state.js');
  const { sources } = await import('../src/registry.js');
  const { createApp, pickEncoding } = await import('../src/app.js');
  assert.equal(pickEncoding('gzip, deflate, br'), 'br'); assert.equal(pickEncoding('gzip'), 'gzip'); assert.equal(pickEncoding(undefined), null);
  const dir = await mkdtemp(join(tmpdir(), 'aiw-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html>' + 'x'.repeat(4000));
  await writeFile(join(dir, 'tiny.css'), 'a{}');
  const app = createApp(new State(sources, false), () => [], dir);
  await new Promise<void>(r => app.server.listen(0, r));
  const port = (app.server.address() as any).port;
  try {
    const snap = await fetch(`http://localhost:${port}/api/snapshot`, { headers: { 'accept-encoding': 'br' } });
    assert.equal(snap.headers.get('vary'), 'accept-encoding');
    const page = await fetch(`http://localhost:${port}/`, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(page.headers.get('content-encoding'), 'gzip');
    const tiny = await fetch(`http://localhost:${port}/tiny.css`, { headers: { 'accept-encoding': 'br' } });
    assert.equal(tiny.headers.get('content-encoding'), null);
    // raw HTTP to see the encoded bytes (fetch decodes for us)
    const http = await import('node:http');
    const raw = await new Promise<{ enc?: string; body: Buffer }>((resolve, reject) => http.get({ port, path: '/api/snapshot', headers: { 'accept-encoding': 'br' } }, res => {
      const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ enc: res.headers['content-encoding'] as string, body: Buffer.concat(chunks) }));
    }).on('error', reject));
    assert.equal(raw.enc, 'br');
    assert.equal(JSON.parse(brotliDecompressSync(raw.body).toString()).companies.length, sources.length);
    const gz = await new Promise<Buffer>((resolve, reject) => http.get({ port, path: '/', headers: { 'accept-encoding': 'gzip' } }, res => {
      const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject));
    assert.match(gunzipSync(gz).toString(), /^<!doctype html>x+$/);
  } finally { app.close?.(); app.server.close(); }
});
