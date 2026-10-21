import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { gcp, gcpIncidents } from '../src/adapters/gcp.js';
import { normalize } from '../src/adapters/index.js';
import { gcpUptime } from '../src/gcp-uptime.js';
import { sources } from '../src/registry.js';
import { UptimeService } from '../src/uptime.js';
import { Poller } from '../src/poller.js';
import { State } from '../src/state.js';
import { createApp } from '../src/app.js';

const fixture = (file: string) => readFile(new URL(`../fixtures/gcp/${file}`, import.meta.url), 'utf8');
const recorded = await fixture('incidents.json'), open = await fixture('open.json');
const rawOpen = JSON.parse(open)[0];
const NOW = Date.parse('2026-10-21T02:00:00Z');
const source = sources.find(s => s.id === 'gemini')!;
const incident = (extra: Record<string, unknown> = {}) => ({ ...structuredClone(rawOpen), ...extra });
const history = (rows: any[], now = NOW) => gcpUptime(JSON.stringify(rows), now)[0];

test('Google Cloud recording: trimmed official Gemini incident, unrelated products excluded, operational now', async () => {
  const manifest = JSON.parse(await readFile(new URL('../fixtures/manifest.json', import.meta.url), 'utf8'));
  const record = manifest.find((r: any) => r.key === 'gemini-gcp');
  assert.equal(record.url, 'https://status.cloud.google.com/incidents.json'); assert.equal(record.status, 200);
  assert.equal(createHash('sha256').update(recorded).digest('hex'), record.sha256);
  assert.equal(Buffer.byteLength(recorded), record.bytes);
  assert.equal(JSON.parse(recorded).length, 3);
  const rows = gcpIncidents(recorded);
  assert.equal(rows.length, 1); assert.deepEqual(rows[0].products, ['Vertex Gemini API']);
  assert.equal(rows[0].incident.id, '41E5S3mkTGDfkZuJZH5k');
  assert.equal(rows[0].incident.level, 'degraded');
  assert.equal(rows[0].incident.startedAt, '2026-02-27T12:37:00.000Z');
  assert.equal(rows[0].incident.resolvedAt, '2026-02-27T14:35:00.000Z');
  const current = normalize(recorded, source.endpoints[0], source, NOW);
  assert.equal(current.level, 'operational'); assert.deepEqual(current.openIncidents, []); assert.deepEqual(current.recentIncidents, []);
  assert.deepEqual(current.components, [{ name: 'Vertex Gemini API', level: 'operational' }]);
  assert.ok(gcpUptime(recorded, NOW)[0].days.every(d => d.level === 'operational' && d.downMinutes === 0));
});

test('Google Cloud scopes by case-insensitive Gemini product titles, deduplicates parts, and keeps component impacts separate', () => {
  const related = incident({ id: 'code', status_impact: 'SERVICE_DISRUPTION', affected_products: [{ title: 'gEmInI Code Assist' }, { title: 'gEmInI Code Assist' }, { title: 'Cloud Run' }] });
  const unrelated = incident({ id: 'other', external_desc: 'Gemini in the title is not product scope', service_name: 'Gemini', affected_products: [{ title: 'Cloud Run' }] });
  const result = gcp(JSON.stringify([incident({ end: '2026-10-20T23:45:00Z' }), related, unrelated]), NOW);
  assert.equal(result.level, 'partial'); assert.deepEqual(result.openIncidents.map(i => i.id), ['code']);
  assert.deepEqual(result.components, [{ name: 'Vertex Gemini API', level: 'operational' }, { name: 'gEmInI Code Assist', level: 'partial' }]);
  const [api] = gcpUptime(JSON.stringify([related, unrelated]), NOW);
  assert.equal(api.name, 'Vertex Gemini API'); assert.equal(api.days.at(-1)!.level, 'partial'); assert.equal(api.days.at(-1)!.events.length, 1);
});

test('Google Cloud current levels use status_impact rather than severity, with worst open impact winning', () => {
  for (const [status_impact, expected] of Object.entries({ SERVICE_OUTAGE: 'major', SERVICE_DISRUPTION: 'partial', SERVICE_INFORMATION: 'degraded' })) {
    const result = gcp(JSON.stringify([incident({ status_impact, severity: 'low' })]), NOW);
    assert.equal(result.level, expected); assert.equal(result.components[0].level, expected);
  }
  const rows = ['SERVICE_INFORMATION', 'SERVICE_OUTAGE', 'SERVICE_DISRUPTION'].map((status_impact, index) => incident({ id: String(index), status_impact }));
  assert.equal(gcp(JSON.stringify(rows), NOW).level, 'major');
});

test('Google Cloud normalizes title, readable status, latest update, timestamps, URL and open/recent resolution boundaries', () => {
  const current = gcp(open, NOW), [i] = current.openIncidents;
  assert.equal(i.title, 'Synthetic Gemini API outage'); assert.equal(i.status, 'ongoing');
  assert.equal(i.startedAt, '2026-10-20T23:30:00.000Z'); assert.equal(i.updatedAt, '2026-10-21T00:15:00.000Z');
  assert.equal(i.resolvedAt, undefined); assert.equal(i.url, 'https://status.cloud.google.com/incidents/synthetic-gemini-outage');
  assert.equal(i.latestUpdate, rawOpen.most_recent_update.text); assert.equal(current.summary, i.latestUpdate);
  const withoutEnd = incident(); delete withoutEnd.end;
  assert.equal(gcp(JSON.stringify([withoutEnd]), NOW).openIncidents.length, 1);
  const future = incident({ end: '2026-10-21T03:00:00Z' });
  assert.equal(gcp(JSON.stringify([future]), NOW).openIncidents.length, 1);
  const resolved = incident({ end: new Date(NOW).toISOString() });
  const closed = gcp(JSON.stringify([resolved]), NOW);
  assert.equal(closed.level, 'operational'); assert.equal(closed.openIncidents.length, 0); assert.equal(closed.recentIncidents.length, 1);
  assert.equal(gcp(JSON.stringify([resolved]), NOW + 86_400_000).recentIncidents.length, 1);
  assert.equal(gcp(JSON.stringify([resolved]), NOW + 86_400_001).recentIncidents.length, 0);
});

test('Google Cloud 90 UTC dates: midnight crossing, overlap union, merged products, information events and source intervals', () => {
  const api = history([
    incident({ id: 'cross', begin: '2026-10-20T19:30:00-04:00', end: '2026-10-21T00:30:00Z', status_impact: 'SERVICE_DISRUPTION' }),
    incident({ id: 'overlap', begin: '2026-10-21T00:00:00Z', end: '2026-10-21T01:00:00Z', affected_products: [{ title: 'Gemini Code Assist' }] }),
    incident({ id: 'information', begin: '2026-10-21T01:00:00Z', end: '2026-10-21T02:00:00Z', status_impact: 'SERVICE_INFORMATION' }),
    incident({ id: 'midnight', begin: '2026-10-18T23:00:00Z', end: '2026-10-19T00:00:00Z', status_impact: 'SERVICE_INFORMATION' }),
  ]);
  assert.equal(api.days.length, 90); assert.equal(api.days[0].date, '2026-07-24'); assert.equal(api.days.at(-1)!.date, '2026-10-21');
  assert.deepEqual(api.days.map(d => d.date), [...new Set(api.days.map(d => d.date))].sort());
  const find = (date: string) => api.days.find(d => d.date === date)!;
  assert.equal(find('2026-10-20').level, 'partial'); assert.equal(find('2026-10-20').downMinutes, 30);
  assert.equal(find('2026-10-21').level, 'major'); assert.equal(find('2026-10-21').downMinutes, 60); assert.equal(find('2026-10-21').events.length, 3);
  assert.equal(find('2026-10-18').level, 'degraded'); assert.equal(find('2026-10-18').downMinutes, 0);
  assert.equal(find('2026-10-19').level, 'operational'); assert.equal(find('2026-10-19').downMinutes, 0); assert.deepEqual(find('2026-10-19').events, []);
  assert.deepEqual(JSON.parse(JSON.stringify(find('2026-10-20').events[0])), {
    title: 'Synthetic Gemini API outage', url: 'https://status.cloud.google.com/incidents/synthetic-gemini-outage',
    startedAt: '2026-10-20T23:30:00.000Z', resolvedAt: '2026-10-21T00:30:00.000Z',
  });
  assert.ok(!('pct30' in api) && !('pct90' in api));
});

test('Google Cloud history clips old/open/future-end intervals to the window and now, excludes future starts', () => {
  const api = history([
    incident({ id: 'old', begin: '2026-01-01T00:00:00Z', end: '2026-07-24T00:30:00Z' }),
    incident({ id: 'future-end', begin: '2026-10-21T01:30:00Z', end: '2026-11-01T00:00:00Z' }),
    incident({ id: 'future-start', begin: '2026-11-01T00:00:00Z' }),
  ]);
  assert.equal(api.days[0].downMinutes, 30); assert.equal(api.days.at(-1)!.downMinutes, 30); assert.equal(api.days.at(-1)!.events.length, 1);
  assert.equal(history([incident({ begin: '2026-01-01T00:00:00Z' })]).days[0].downMinutes, 1440);
  const today = gcpUptime(open, NOW)[0].days.at(-1)!;
  assert.equal(today.downMinutes, 120); assert.equal(today.events.length, 1);
  assert.equal(JSON.parse(JSON.stringify(today.events[0])).resolvedAt, undefined);
  assert.equal(history([incident({ status_impact: 'SERVICE_INFORMATION' })]).days.at(-1)!.downMinutes, 0);
  assert.ok(history([]).days.every(d => d.level === 'operational' && d.downMinutes === 0 && !d.events.length));
});

test('Google Cloud malformed JSON/schema, timestamps, intervals and unknown impacts throw instead of returning operational', () => {
  const broken = [
    '<html>unavailable</html>', 'null', '{}', '[null]',
    JSON.stringify([incident({ affected_products: null })]), JSON.stringify([incident({ affected_products: [{ id: 'missing-title' }] })]),
    JSON.stringify([incident({ begin: 'invalid' })]), JSON.stringify([incident({ end: '' })]),
    JSON.stringify([incident({ end: '2026-01-01T00:00:00Z' })]), JSON.stringify([incident({ status_impact: 'NEW_IMPACT' })]),
    JSON.stringify([incident({ id: '' })]), JSON.stringify([incident({ external_desc: '' })]),
    JSON.stringify([incident({ uri: 'https://other.example/incident' })]),
  ];
  for (const body of broken) { assert.throws(() => gcp(body, NOW)); assert.throws(() => gcpUptime(body, NOW)); }
});

test('Google Cloud uptime uses the 30-minute cache, coalesces reads, labels history honestly and retains good data on failure', async () => {
  let now = NOW, calls = 0, body = open;
  const service = new UptimeService([source], async url => { calls++; assert.equal(url, source.endpoints[0].url); return body; }, () => now);
  const [first, same] = await Promise.all([service.get('gemini'), service.get('gemini')]);
  assert.equal(first, same); assert.equal(calls, 1); assert.ok(first);
  assert.equal(first.source, 'statuspage'); assert.equal(first.primary, 'Vertex Gemini API'); assert.equal(first.components.length, 1);
  assert.match(first.note!, /Google Cloud official incident history/); assert.match(first.note!, /without a Gemini incident are operational/);
  assert.match(first.note!, /begin\/end times/); assert.match(first.note!, /No uptime percentages/);
  now += 30 * 60_000 - 1; assert.equal(await service.get('gemini'), first); assert.equal(calls, 1);
  now++; await service.get('gemini'); await setImmediate(); assert.equal(calls, 2);
  const fresh = await service.get('gemini');
  body = '{}'; const stale = await service.refresh('gemini');
  assert.deepEqual(stale.components, fresh!.components); assert.match(stale.note!, /Invalid.*Last successful/);
  for (const read of [async () => '{}', async () => { throw new Error('HTTP 503'); }]) {
    const failed = await new UptimeService([source], read, () => NOW).get('gemini');
    assert.deepEqual(failed!.components, []); assert.match(failed!.note!, /Official uptime unavailable/);
  }
});

test('Google Cloud poller and API expose Gemini components, incident details and daily history using only official HttpSource reads', async t => {
  t.mock.method(Math, 'random', () => 0);
  const actualFetch = globalThis.fetch, urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(input));
    if (url.protocol === 'http:') return actualFetch(input, options);
    assert.equal(url.href, 'https://status.cloud.google.com/incidents.json'); urls.push(url.href);
    const headers = options?.headers as Record<string, string>;
    assert.equal(headers['user-agent'], 'aiweather/1.0 (+https://aiweather.synteq.app)');
    assert.equal(headers['accept-encoding'], 'identity'); assert.equal(headers.authorization, undefined);
    return new Response(open, { headers: { 'content-type': 'application/json' } });
  });
  const state = new State([source], false, () => {}), poller = new Poller(state, [source]);
  t.after(() => poller.stop()); poller.start(); await setImmediate();
  assert.equal(poller.sources()[0].lastError, null);
  const app = createApp(state, () => poller.sources(), tmpdir(), new UptimeService([source], undefined, () => NOW));
  t.after(() => app.close()); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const port = (app.server.address() as { port: number }).port, base = `http://127.0.0.1:${port}`;
  const snapshot = await (await fetch(`${base}/api/snapshot`)).json(), company = snapshot.companies[0];
  assert.equal(company.id, 'gemini'); assert.equal(company.sourceKind, 'live'); assert.equal(company.level, 'major');
  assert.deepEqual(company.components, [{ name: 'Vertex Gemini API', level: 'major' }]); assert.equal(company.openIncidents.length, 1);
  const response = await fetch(`${base}/api/uptime/gemini`); assert.equal(response.status, 200);
  const uptime = await response.json(); assert.equal(uptime.primary, 'Vertex Gemini API'); assert.equal(uptime.components[0].days.length, 90);
  const today = uptime.components[0].days.at(-1); assert.equal(today.level, 'major'); assert.equal(today.downMinutes, 120);
  assert.equal(today.events[0].startedAt, '2026-10-20T23:30:00.000Z');
  assert.ok(!('pct90' in uptime.components[0]) && !('pct30' in uptime.components[0])); assert.equal(urls.length, 2);
});

test('Google Cloud updates written in Markdown read as plain sentences', () => {
  const md = incident({ most_recent_update: { when: '2026-10-21T00:15:00Z', text: '# Incident Report\n## Summary\nCustomers saw **errors** in [Vertex AI](https://cloud.google.com/vertex-ai).\n- retries failed' } });
  assert.equal(gcp(JSON.stringify([md]), NOW).openIncidents[0].latestUpdate, 'Incident Report Summary Customers saw errors in Vertex AI. retries failed');
});
