import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { NewsService, parseNews } from '../src/news.js';
import { newsSources, type NewsSource } from '../src/news-sources.js';
import { sources } from '../src/registry.js';
import { SourceError } from '../src/http-source.js';
import { WorkQueue } from '../src/refresh-cache.js';
import { UptimeService } from '../src/uptime.js';
import { createApp } from '../src/app.js';
import { State } from '../src/state.js';

const fixture = (file: string) => readFile(new URL(`../fixtures/news/${file}`, import.meta.url), 'utf8');
const manifest = JSON.parse(await fixture('manifest.json'));
const NOW = Date.parse('2026-10-20T12:00:00Z');
const source = (kind: NewsSource['kind']): NewsSource => ({ companyId: 'test', sourceName: 'Official', sourceUrl: 'https://official.example/posts', url: 'https://official.example/feed', kind,
  ...(kind === 'html' ? { html: { rows: 'article.post', title: 'h2', link: 'h2 a', summary: '.description' } } : {}) });
const deferred = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));

test('every registry company has exactly one researched official source and fixture or explicit absence', () => {
  assert.deepEqual(newsSources.map(s => s.companyId), sources.map(s => s.id));
  assert.equal(new Set(newsSources.map(s => s.companyId)).size, 48);
  assert.deepEqual(manifest.map((r: any) => r.companyId), sources.map(s => s.id));
});
for (const row of manifest) if (row.file && row.status === 200) test(`recorded ${row.companyId}: exact official headlines, links, dates and descriptions`, async () => {
  const actual = parseNews(await fixture(row.file), newsSources.find(s => s.companyId === row.companyId)!);
  assert.deepEqual(actual, row.expected); assert.ok(actual.length > 0 && actual.length <= 10);
  for (const item of actual) {
    assert.ok(item.title && item.url.startsWith('https://')); assert.ok(!item.summary || [...item.summary].length <= 200);
    if (item.publishedAt) assert.equal(new Date(item.publishedAt).toISOString(), item.publishedAt);
  }
});
test('RSS: verbatim titles, entities, dc:date, source-only plain descriptions, absent fields and official URLs', async () => {
  assert.deepEqual(parseNews(await fixture('rss-feed.xml'), source('rss')), [
    { title: 'New & verbatim', url: 'https://official.example/posts/new', publishedAt: '2026-10-20T10:00:00.000Z' },
    { title: 'Original & unchanged — “title”', url: 'https://official.example/posts/old', publishedAt: '2026-10-19T16:00:00.000Z', summary: 'Source description & detail.' },
    { title: 'Undated', url: 'https://official.example/posts/undated' },
  ]);
});
test('Atom: alternate links, xml:base, published preferred to updated, HTML titles and source summaries', async () => {
  assert.deepEqual(parseNews(await fixture('atom-feed.xml'), source('atom')), [
    { title: 'New & original', url: 'https://official.example/posts/new', publishedAt: '2026-10-20T01:00:00.000Z' },
    { title: 'Published title — exactly', url: 'https://official.example/posts/old', publishedAt: '2026-10-19T16:00:00.000Z', summary: 'Source summary & details.' },
  ]);
});
test('JSON Feed: source summaries only, no date_modified invented as publication date', async () => {
  assert.deepEqual(parseNews(await fixture('json-feed.json'), source('json')), [
    { title: 'No description', url: 'https://official.example/posts/two', publishedAt: '2026-10-20T10:00:00.000Z' },
    { title: 'Original title — not rewritten', url: 'https://official.example/posts/one', publishedAt: '2026-10-19T16:00:00.000Z', summary: 'Source description & details.' },
    { title: 'Undated original', url: 'https://official.example/posts/three' },
  ]);
});
test('HTML: robust DOM parsing, exact titles, source dates, deduplication, navigation and unsafe URLs excluded', async () => {
  assert.deepEqual(parseNews(await fixture('html-listing.html'), source('html')), [
    { title: 'Newest — punctuation stays!', url: 'https://official.example/posts/new', publishedAt: '2026-10-20T10:30:00.000Z' },
    { title: 'Verbatim & original title', url: 'https://official.example/posts/one', publishedAt: '2026-10-19T00:00:00.000Z', summary: 'Source description only.' },
    { title: 'No invented date', url: 'https://official.example/posts/undated' },
  ]);
  assert.equal(parseNews('<article class=post><h2><a href=/posts/x>Unclosed tags', source('html'))[0].title, 'Unclosed tags');
});
test('HTML headline omits aria-hidden permalink decoration, retaining visible title and date', () => {
  const body = '<article class="post"><time datetime="2026-10-16"></time><h2><a href="/posts/change"><span aria-hidden="true">#</span>Original title</a></h2></article>';
  assert.deepEqual(parseNews(body, source('html')), [{ title: 'Original title', url: 'https://official.example/posts/change', publishedAt: '2026-10-16T00:00:00.000Z' }]);
});
test('newest ten, 200-character source description cap, malformed feeds rejected, external entities never expanded', () => {
  const items = Array.from({ length: 15 }, (_, i) => ({ title: `Title ${i}`, url: `/posts/${i}`, date_published: `2026-10-${String(i + 1).padStart(2, '0')}`, summary: '<b>' + '🙂'.repeat(250) + '</b>' }));
  const result = parseNews(JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', items }), source('json'));
  assert.equal(result.length, 10); assert.equal(result[0].title, 'Title 14'); assert.equal(result.at(-1)!.title, 'Title 5'); assert.equal([...result[0].summary!].length, 200);
  assert.throws(() => parseNews('<html>not RSS</html>', source('rss')), /expected feed/);
  assert.throws(() => parseNews('{}', source('json')), /JSON Feed/);
  assert.throws(() => parseNews('<html>client shell</html>', source('html')), /server-rendered/);
  const xml = '<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&secret;</title><link>/posts/x</link></item></channel></rss>';
  assert.equal(parseNews(xml, source('rss'))[0].title, '&secret;');
});
test('news cache coalesces, refreshes after 60m without blocking, retains good data on errors but clears on 403/challenge', async () => {
  let now = NOW, calls = 0, failure = '', gate: ReturnType<typeof deferred> | undefined;
  const body = await fixture('rss-feed.xml');
  const service = new NewsService([source('rss')], async () => { calls++; if (gate) await gate.promise; if (failure) throw new SourceError(failure); return body; }, () => now);
  assert.equal(service.get('unknown'), undefined);
  const first = service.get('test')!; assert.equal(service.get('test'), first);
  const good = await first; assert.equal(calls, 1); now += 60 * 60_000 - 1;
  assert.equal(await service.get('test'), good); assert.equal(calls, 1);
  now++; gate = deferred(); assert.equal(await service.get('test'), good); assert.equal(calls, 2);
  const refresh = service.refresh('test'); gate.release(); gate = undefined;
  const fresh = await refresh; assert.notEqual(fresh, good); assert.equal(fresh.fetchedAt, new Date(now).toISOString());
  now += 60 * 60_000; failure = 'HTTP 503'; await service.get('test');
  const stale = await service.refresh('test'); assert.deepEqual(stale.items, fresh.items); assert.equal(stale.fetchedAt, fresh.fetchedAt); assert.match(stale.note!, /Last successful/);
  failure = 'HTTP 403 (access blocked; no bypass attempted)'; const blocked = await service.refresh('test'); assert.deepEqual(blocked.items, []); assert.match(blocked.note!, /403/);
  failure = 'Challenge-blocked official source (no bypass attempted)'; assert.deepEqual((await service.refresh('test')).items, []);
});
test('unavailable official sources are honest, no guessed requests; empty feeds and oversized normalized results', async () => {
  let calls = 0;
  const missing = { companyId: 'missing', sourceName: 'Official', sourceUrl: 'https://official.example/posts' };
  const service = new NewsService([missing], async () => { calls++; return ''; }, () => NOW);
  assert.equal((await service.get('missing'))!.note, 'No official news feed found'); assert.equal(calls, 0);
  const empty = new NewsService([source('rss')], async () => '<rss><channel/></rss>');
  assert.match((await empty.get('test'))!.note!, /no posts/);
  const oversized = new NewsService([source('json')], async () => JSON.stringify({ version: 'https://jsonfeed.org/version/1', items: [{ title: 'x'.repeat(150_000), url: '/posts/large' }] }));
  assert.deepEqual((await oversized.get('test'))!.items, []); assert.match((await oversized.get('test'))!.note!, /bounded cache/);
});
test('both boot warmers share at most four active company jobs and return pending cache copies instantly', async () => {
  const queue = new WorkQueue(4), gate = deferred(); let active = 0, peak = 0, reads = 0;
  const body = await fixture('rss-feed.xml');
  const read = async () => { reads++; peak = Math.max(peak, ++active); await gate.promise; active--; return body; };
  const registry = Array.from({ length: 8 }, (_, i) => ({ ...source('rss'), companyId: 'n' + i }));
  const news = new NewsService(registry, read, () => NOW, queue);
  const uptime = new UptimeService(sources.slice(0, 4), read, () => NOW, queue);
  uptime.start(); news.start();
  try {
    assert.equal(active, 4); assert.equal((await news.all()).length, 8); assert.equal((await uptime.all()).length, 4);
    assert.equal(reads, 4); assert.match((await news.get('n0'))!.note!, /Awaiting/);
    gate.release(); await Promise.all([...registry.map(s => news.refresh(s.companyId)), ...sources.slice(0, 4).map(s => uptime.refresh(s.id))]);
    assert.equal(peak, 4); assert.equal((await news.all()).filter(n => n.items.length).length, 8);
  } finally { gate.release(); news.stop(); uptime.stop(); }
});
test('background interval refreshes without requests and stops cleanly', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] }); let now = NOW, calls = 0;
  const body = await fixture('rss-feed.xml');
  const service = new NewsService([source('rss')], async () => { calls++; return body; }, () => now);
  service.start(); await service.refresh('test'); assert.equal(calls, 1);
  now += 60 * 60_000; t.mock.timers.tick(60_000); await nextTurn(); assert.equal(calls, 2);
  service.stop(); now += 60 * 60_000; t.mock.timers.tick(60_000); await nextTurn(); assert.equal(calls, 2);
});
test('bulk and individual news/uptime endpoints cover all 48 with public caching, unknown IDs and methods', async t => {
  const news = new NewsService(newsSources, async url => {
    const row = manifest.find((r: any) => r.url === url); assert.ok(row?.file, `Unrecorded ${url}`);
    if (row.status !== 200) throw new SourceError(`HTTP ${row.status} (access blocked; no bypass attempted)`);
    return fixture(row.file);
  }, () => NOW);
  const uptime = new UptimeService(sources, async url => {
    if (url === 'https://status.openrouter.ai/config.json') return readFile(new URL('../fixtures/openrouter-uptime/config.json', import.meta.url), 'utf8');
    throw new Error('Fixture uptime unavailable');
  }, () => NOW);
  const state = new State(sources, false, () => {}), app = createApp(state, () => [], tmpdir(), uptime, news);
  t.after(() => app.close()); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const address = app.server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  const snapshot = await (await fetch(base + '/api/snapshot')).json();
  assert.deepEqual(snapshot.companies.map((c: any) => c.id), sources.map(s => s.id));
  assert.equal(snapshot.companies.length, 48);
  for (const path of ['/api/news', '/api/uptime']) {
    const response = await fetch(base + path); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
    const result = await response.json(); assert.deepEqual(result.map((r: any) => r.companyId), sources.map(s => s.id));
    assert.equal((await fetch(base + path, { method: 'HEAD' })).status, 200);
  }
  const result = await (await fetch(base + '/api/news')).json();
  for (const row of result) {
    assert.deepEqual(Object.keys(row).sort(), ['companyId', 'sourceName', 'sourceUrl', 'items', 'fetchedAt', ...(row.note ? ['note'] : [])].sort());
    const entry = manifest.find((m: any) => m.companyId === row.companyId); assert.deepEqual(row.items, entry.expected ?? []);
  }
  for (const path of ['/api/news/claude', '/api/uptime/claude']) assert.equal((await fetch(base + path)).headers.get('cache-control'), 'public, max-age=60');
  const openrouterUptime = await (await fetch(base + '/api/uptime/openrouter')).json();
  assert.equal(openrouterUptime.source, 'statuspage'); assert.equal(openrouterUptime.components.length, 7);
  assert.ok(openrouterUptime.components.every((c: any) => c.days.length === 90));
  assert.match(openrouterUptime.note, /Datadog/);
  const openrouterNews = await (await fetch(base + '/api/news/openrouter')).json();
  assert.equal(openrouterNews.items[0].title, 'Private Endpoints: Bring Your Fine-Tuned Models and Capacity to OpenRouter');
  assert.equal((await fetch(base + '/api/news/claude')).headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal((await (await fetch(base + '/api/news/gemini')).json()).items[0].title, 'New Gemini tools for small business owners');
  for (const path of ['/api/news/unknown', '/api/uptime/unknown', '/api/uptime/glm']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base + '/api/news/%ZZ')).status, 400);
  assert.equal((await fetch(base + '/api/news', { method: 'POST' })).status, 405);
});
