import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpSource, SourceError } from '../src/http-source.js';
import { pollDelay } from '../src/poller.js';
import { USER_AGENT } from '../src/registry.js';
test('honest UA, conditional requests and cached 304', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    const headers = options.headers as Record<string, string>; assert.equal(headers['user-agent'], USER_AGENT); assert.ok(options.signal);
    if (calls++ === 0) return new Response('{"data":true}', { headers: { etag: '"abc"', 'last-modified': 'Tue, 20 Oct 2026 12:00:00 GMT' } });
    assert.equal(headers['if-none-match'], '"abc"'); assert.equal(headers['if-modified-since'], 'Tue, 20 Oct 2026 12:00:00 GMT');
    return new Response(null, { status: 304 });
  });
  const client = new HttpSource(); assert.equal(await client.read('https://official.example/status'), '{"data":true}');
  assert.equal(await client.read('https://official.example/status'), '{"data":true}'); assert.equal(calls, 2);
});
test('challenge/HTML/error responses fail without retries or UA switching', async t => {
  let calls = 0;
  const mock = t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('<!doctype html><html>Just a moment Cloudflare challenge-platform</html>'); });
  await assert.rejects(new HttpSource().read('https://official.example'), /Challenge-blocked/); assert.equal(calls, 1);
  mock.mock.mockImplementation(async () => new Response('blocked', { status: 403 }));
  await assert.rejects(new HttpSource().read('https://official.example'), /HTTP 403/);
  mock.mock.mockImplementation(async () => new Response('rate limited', { status: 429, headers: { 'retry-after': '120' } }));
  await assert.rejects(new HttpSource().read('https://official.example'), (e: unknown) => e instanceof SourceError && e.retryAfterMs === 120000);
});
test('uptime JSON requests can disable raw URL/body caching', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    calls++;
    const headers = options.headers as Record<string, string>;
    assert.equal(headers.accept, 'application/json'); assert.equal(headers['user-agent'], USER_AGENT);
    assert.equal(headers['if-none-match'], undefined); assert.equal(headers['if-modified-since'], undefined);
    return new Response('{}', { headers: { etag: '"do-not-retain"' } });
  });
  const http = new HttpSource({ cache: false, accept: 'application/json' });
  await http.read('https://official.example/component_impacts?at=1'); await http.read('https://official.example/component_impacts?at=1');
  assert.equal(calls, 2);
});
test('oversized body rejected; polling jitter, exponential backoff and Retry-After', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)));
  await assert.rejects(new HttpSource().read('https://official.example'), /4 MiB/);
  assert.equal(pollDelay(0, () => 0), 54000); assert.equal(pollDelay(0, () => 1), 66000);
  assert.equal(pollDelay(1, () => 0.5), 15000); assert.equal(pollDelay(3, () => 0.5), 60000); assert.equal(pollDelay(99, () => 0.5), 300000);
  assert.equal(pollDelay(1, () => 0.5, 1_800_000), 1_800_000);
});

test('explicit SSR opt-in permits ordinary HTML but never a challenge, including with HTTP 200', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('<!doctype html><html>Official uptime data</html>'));
  await assert.rejects(new HttpSource({ cache: false }).read('https://official.example'), /received HTML/);
  assert.match(await new HttpSource({ cache: false, allowHtml: true }).read('https://official.example'), /Official uptime/);
  mock.mock.mockImplementation(async () => new Response('<!doctype html><html><title>Just a moment...</title><script src="/cdn-cgi/challenge-platform/"></script></html>'));
  await assert.rejects(new HttpSource({ cache: false, allowHtml: true }).read('https://official.example'), /Challenge-blocked/);
});

test('legitimate SSR with passive Cloudflare JSD / CAPTCHA configuration is readable, actual CAPTCHA is not', async t => {
  let body = '<!doctype html><html><head><title>Official Blog</title></head><body><article>Real post</article><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script><script>const hcaptchaSiteKey="public-key";</script></body></html>';
  t.mock.method(globalThis, 'fetch', async () => new Response(body));
  const http = new HttpSource({ allowHtml: true, cache: false });
  assert.equal(await http.read('https://official.example'), body);
  body = '<!doctype html><html><head><title>CAPTCHA verification required</title></head><body>Verify you are human</body></html>';
  await assert.rejects(http.read('https://official.example'), /Challenge-blocked/);
});
