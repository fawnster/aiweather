import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { sources, type Source } from '../src/registry.js';
import { keptComponents } from '../src/components.js';
import { statuspageUptime, incidentUptime, UptimeService } from '../src/uptime.js';
import { SourceError } from '../src/http-source.js';
import { rssIncidents } from '../src/adapters/rss.js';
import { createApp } from '../src/app.js';
import { State } from '../src/state.js';

const fixture = (id: string) => readFile(new URL(`../fixtures/uptime/${id}.json`, import.meta.url), 'utf8');
const source = (id: string) => sources.find(s => s.id === id)!;
const manifest = JSON.parse(await fixture('manifest'));
const record = (id: string) => manifest.find((r: any) => r.key === id);
const clock = (id: string) => Date.parse(new URL(record(id).url).searchParams.get('end_at') ?? record(id).recordedAt);
const readFixture = async (url: string) => {
  const wanted = new URL(url);
  const entry = manifest.find((r: any) => {
    const recorded = new URL(r.url);
    return recorded.origin === wanted.origin && recorded.pathname === wanted.pathname;
  });
  assert.ok(entry?.file, `Unrecorded fixture request: ${url}`);
  return fixture(entry.key);
};

test('recorded Claude: published percentages, seconds, links, 90 source dates; events are not outages', async () => {
  const company = await new UptimeService(sources, readFixture, () => clock('claude')).get('claude')!;
  assert.equal(company.source, 'statuspage');
  assert.equal(company.primary, 'Claude API (api.anthropic.com)');
  assert.equal(company.components.length, 6);
  const api = company.components.find(c => c.name === company.primary)!;
  const raw = JSON.parse(await fixture('claude'));
  const apiId = Object.keys(raw.timelines).find(id => raw.timelines[id].component.name === api.name)!;
  assert.equal(api.pct30, raw.values.find((v: any) => v.component === apiId).thirty);
  assert.equal(api.pct90, raw.values.find((v: any) => v.component === apiId).ninety);
  const first = company.components[0];
  const down = first.days.find(d => d.date === '2026-07-25')!;
  assert.equal(down.level, 'partial'); assert.equal(down.downMinutes, 5871 / 60);
  assert.equal(first.days[0].date, '2026-07-23'); assert.equal(first.days.length, 90);
  const eventOnly = first.days.find(d => d.date === '2026-07-23')!;
  assert.equal(eventOnly.level, 'operational'); assert.equal(eventOnly.downMinutes, 0);
  assert.match(eventOnly.events[0].url!, /^https:\/\/status.claude.com\/incidents\/[^/]+$/);
  for (const component of company.components) assert.deepEqual(component.days.map(d => d.date), component.days.map(d => d.date).sort());
});

test('recorded Cursor: worst mixed outage and partial+major seconds', async () => {
  const company = await new UptimeService(sources, readFixture).get('cursor')!;
  assert.equal(company.primary, 'IDE');
  const mixed = company.components.find(c => c.name === 'Grok Bot')!.days.find(d => d.date === '2026-09-03')!;
  assert.equal(mixed.level, 'major'); assert.equal(mixed.downMinutes, (1043 + 10912) / 60);
});

test('recorded OpenAI: exact published 90d percentage, no inferred 30d; component scope from widget', async () => {
  const company = await new UptimeService(sources, readFixture, () => clock('openai')).get('openai')!;
  assert.equal(company.source, 'incident.io'); assert.equal(company.primary, 'Chat Completions');
  const raw = JSON.parse(await fixture('openai'));
  const summary = JSON.parse(await fixture('openai-summary')).summary;
  assert.deepEqual(company.components.map(c => c.name), summary.components.map((c: any) => c.name));
  const api = company.components.find(c => c.name === company.primary)!;
  const id = summary.components.find((c: any) => c.name === company.primary).id;
  assert.equal(api.pct90, Number(raw.component_uptimes.find((u: any) => u.component_id === id).uptime));
  assert.equal(api.pct90, 100); assert.ok(api.days.some(d => d.level !== 'operational'));
  assert.ok(company.components.every(c => !('pct30' in c)));
  assert.equal(api.days.length, 90); assert.equal(api.days.at(-1)!.date, new Date(clock('openai')).toISOString().slice(0, 10));
  // OpenAI publishes canonical incident.io permalinks, not status.openai.com URLs.
  const officialLinks = new Set(raw.incident_links.map((link: any) => link.permalink));
  const events = company.components.flatMap(c => c.days.flatMap(d => d.events));
  assert.ok(events.length); assert.ok(events.every(event => officialLinks.has(event.url)));
});

test('all recorded official pages normalize, use real primary names and share card filters', async () => {
  const service = new UptimeService(sources, readFixture, () => clock('openai'));
  for (const s of sources.filter(s => s.uptime === 'statuspage' || s.uptime === 'incident.io')) {
    const company = await service.get(s.id)!;
    assert.doesNotMatch(company.note ?? '', /unavailable/i, s.id);
    assert.equal(company.source, s.uptime, s.id); assert.ok(company.components.length, s.id);
    assert.ok(company.components.every(c => c.days.length <= 90), s.id);
    if (s.primaryComponent) assert.match(company.primary!, s.primaryComponent, s.id);
    const summaries = s.uptime === 'incident.io' ? [JSON.parse(await fixture(`${s.id}-summary`)).summary] : await Promise.all(s.endpoints.filter(e => e.adapter === 'statuspage').map(async e => JSON.parse(await fixture(`${e.key}-summary`))));
    const names = summaries.flatMap((summary, i) => keptComponents(summary.components, s).map((c: any) => s.id === 'minimax' ? `${i === 0 ? 'Global' : 'China'}: ${c.name}` : c.name));
    assert.ok(company.components.every(c => names.includes(c.name)), s.id);
    if (['copilot', 'v0'].includes(s.id)) assert.deepEqual(company.components.map(c => c.name), [s.id === 'v0' ? 'v0' : 'Copilot']);
    if (s.id === 'kimi') assert.ok(company.components.every(c => /^(Kimi|Open API|API Service|Kimi Code)$/.test(c.name)));
    if (['lovable', 'bolt'].includes(s.id)) assert.ok(company.components.every(c => c.pct30 == null && c.pct90 == null));
    if (s.id === 'windsurf') assert.match(company.note!, /2 of 9/);
  }
});

test('six new Statuspages: selected product headlines have published percentages and 90 known source days', async () => {
  const headlines = { ai21: 'AI21 Gateway', augment: 'API', warp: 'Warp Client', baseten: 'Dedicated Inference', tavus: 'Conversational Video Interface', assemblyai: 'Asynchronous API' };
  const service = new UptimeService(sources, readFixture);
  for (const [id, name] of Object.entries(headlines)) {
    const company = (await service.get(id))!;
    assert.equal(company.source, 'statuspage', id); assert.equal(company.primary, name, id);
    const headline = company.components.find(c => c.name === name)!;
    const raw = JSON.parse(await fixture(id));
    const code = Object.keys(raw.timelines).find(code => raw.timelines[code].component.name === name)!;
    assert.equal(headline.pct90, raw.values.find((v: any) => v.component === code).ninety, id);
    assert.equal(typeof headline.pct90, 'number', id);
    assert.equal(headline.days.length, 90, id);
    assert.equal(new Set(headline.days.map(d => d.date)).size, 90, id);
    assert.ok(headline.days.every(day => day.level !== 'unknown'), id);
    assert.deepEqual(headline.days.map(d => d.date), raw.timelines[code].days.map((d: any) => d.date).sort().slice(-90), id);
  }
});

test('Statuspage guards schema drift; respects missing values, availability, group duration semantics and 60-code batches', async () => {
  const kept = [{ id: 'a', name: 'API' }];
  const data = { values: [], timelines: { a: { component: { code: 'a', name: 'API', startDate: '2026-10-02' }, days: [{ date: '2026-10-01', outages: {} }, { date: '2026-10-02', outages: { m: 30 } }] } } };
  let [result] = statuspageUptime(JSON.stringify(data), kept, 'https://official.example');
  assert.equal(result.pct90, undefined); assert.equal(result.pct30, undefined);
  assert.equal(result.days[0].level, 'unknown'); assert.equal(result.days[0].downMinutes, undefined);
  assert.equal(result.days[1].downMinutes, 0.5);
  (data.timelines.a.component as any).isGroup = true;
  [result] = statuspageUptime(JSON.stringify(data), kept, 'https://official.example');
  assert.equal(result.days[1].downMinutes, undefined);
  (data.timelines.a.days[1].outages as any).future = 42;
  assert.throws(() => statuspageUptime(JSON.stringify(data), kept, 'https://official.example'), /Unrecognized/);
  assert.throws(() => statuspageUptime('{}', kept, 'https://official.example'), /schema/);
  const requests: string[] = [];
  const rows = Array.from({ length: 121 }, (_, id) => ({ id: String(id), name: String(id) }));
  const service = new UptimeService([source('claude')], async url => {
    if (url.endsWith('summary.json')) return JSON.stringify({ components: rows });
    requests.push(url);
    const codes = new URL(url).searchParams.get('components')!.split(',');
    assert.ok(codes.length <= 60);
    return JSON.stringify({ values: [], timelines: Object.fromEntries(codes.map(code => [code, { component: { code }, days: [] }])) });
  });
  assert.equal((await service.get('claude')!).components.length, 121); assert.equal(requests.length, 3);
});

const NOW = Date.parse('2026-10-20T12:00:00Z');
const summary = { components: [{ id: 'a', name: 'API' }], data_available_since: '2026-07-01T00:00:00Z' };
const impact = (start_at: string, end_at: string | null, status = 'partial_outage', id = 'incident') => ({ component_id: 'a', start_at, end_at, status, status_page_incident_id: id });
const impacts = (component_impacts: any[], component_uptimes: any[] = []) => JSON.stringify({ component_impacts, component_uptimes, incident_links: [{ id: 'incident', name: 'Official event', permalink: 'https://status.openai.com/incidents/official' }] });
test('incident.io UTC buckets, half-open midnights, overlap union, worst severity, open intervals, maintenance/degraded', () => {
  const body = impacts([
    impact('2026-10-18T23:30:00-00:00', '2026-10-19T00:30:00Z'),
    impact('2026-10-19T00:00:00Z', '2026-10-19T01:00:00Z', 'full_outage'),
    impact('2026-10-19T02:00:00Z', '2026-10-19T03:00:00Z', 'degraded_performance'),
    impact('2026-10-17T23:00:00Z', '2026-10-18T00:00:00Z', 'under_maintenance'),
    impact('2026-10-20T11:30:00Z', null),
    impact('2026-10-21T00:00:00Z', null),
  ], [{ component_id: 'a', uptime: '99.98', data_available_since: '2026-10-17T08:00:00Z' }]);
  const [api] = incidentUptime(body, summary, source('openai'), NOW);
  assert.equal(api.pct90, 99.98); assert.equal(api.pct30, undefined);
  const find = (day: string) => api.days.find(d => d.date === day)!;
  assert.equal(find('2026-10-16').level, 'unknown'); assert.equal(find('2026-10-16').downMinutes, undefined);
  assert.equal(find('2026-10-17').level, 'maintenance'); assert.equal(find('2026-10-17').downMinutes, 0);
  assert.equal(find('2026-10-18').level, 'partial'); assert.equal(find('2026-10-18').downMinutes, 30);
  assert.equal(find('2026-10-19').level, 'major'); assert.equal(find('2026-10-19').downMinutes, 60);
  assert.equal(find('2026-10-19').events.length, 1);
  assert.equal(find('2026-10-20').downMinutes, 30);
  assert.equal(api.days.length, 90); assert.equal(api.days[0].date, '2026-07-23');
  const [degraded] = incidentUptime(impacts([impact('2026-10-20T01:00:00Z', null, 'degraded_performance')]), summary, source('openai'), NOW);
  assert.equal(degraded.days.at(-1)!.level, 'degraded'); assert.equal(degraded.days.at(-1)!.downMinutes, 0);
  assert.equal(degraded.pct90, undefined);
});
test('incident.io scope, missing coverage and links, malformed/unknown statuses fail honestly', () => {
  const [api] = incidentUptime(impacts([impact('2026-10-20T01:00:00Z', null, 'partial_outage', 'not-linked')]), { components: summary.components }, source('openai'), NOW);
  assert.equal(api.days[0].level, 'unknown'); assert.deepEqual(api.days.at(-1)!.events, []);
  assert.throws(() => incidentUptime('{}', summary, source('openai'), NOW), /schema/);
  assert.throws(() => incidentUptime(impacts([impact('2026-10-20T01:00:00Z', null, 'future_status')]), summary, source('openai'), NOW), /Unrecognized/);
  assert.throws(() => incidentUptime(impacts([impact('invalid', null)]), summary, source('openai'), NOW), /timestamp/);
  assert.throws(() => incidentUptime(impacts([], [{ component_id: 'a', uptime: 'not a percentage' }]), summary, source('openai'), NOW), /percentage/);
});

test('lazy per-company cache, identical in-flight promise, completion-based 30m expiry and unknown ID', async () => {
  let calls = 0, now = NOW;
  const service = new UptimeService(sources, async url => { calls++; if (calls === 2) now += 60_000; return readFixture(url); }, () => now);
  assert.equal(calls, 0); assert.equal(service.get('not-a-company'), undefined); assert.equal(calls, 0);
  const one = service.get('claude')!, two = service.get('claude')!;
  assert.equal(one, two); const result = await one; assert.equal(calls, 2);
  now += 30 * 60_000 - 1;
  assert.equal(await service.get('claude'), result); assert.equal(calls, 2);
  now++; assert.equal(await service.get('claude'), result);
  assert.notEqual(await service.refresh('claude'), result); assert.equal(calls, 4);
});
test('failure coalescing and 5m backoff; Retry-After can extend it', async () => {
  let calls = 0, now = NOW;
  const service = new UptimeService(sources, async () => { calls++; throw new Error('blocked; no bypass attempted'); }, () => now);
  const [one, two] = await Promise.all([service.get('openai')!, service.get('openai')!]);
  assert.equal(one, two); assert.equal(calls, 1); assert.equal(one.source, 'incident.io'); assert.match(one.note!, /blocked/); assert.deepEqual(one.components, []);
  now += 5 * 60_000 - 1; assert.equal(await service.get('openai'), one); assert.equal(calls, 1);
  now++; assert.equal(await service.get('openai'), one); await service.refresh('openai'); assert.equal(calls, 2);
  const retry = new UptimeService(sources, async () => { calls++; throw new SourceError('HTTP 429', 20 * 60_000); }, () => now);
  await retry.get('claude'); const previous = calls;
  now += 19 * 60_000; await retry.get('claude'); assert.equal(calls, previous);
  now += 60_000; await retry.get('claude'); assert.equal(calls, previous + 1);
});
test('lazy upstream concurrency is bounded at two companies', async () => {
  let active = 0, max = 0;
  const service = new UptimeService(sources, async url => {
    active++; max = Math.max(active, max);
    try { await new Promise(resolve => setTimeout(resolve, 5)); return await readFixture(url); }
    finally { active--; }
  });
  const results = await Promise.all(['claude', 'openai', 'cursor', 'kimi', 'copilot', 'poe'].map(id => service.get(id)!));
  assert.equal(max, 2); assert.ok(results.every(c => c.components.length));
});
test('oversized normalized data is not cached unboundedly; the failure itself is cached', async () => {
  let calls = 0;
  const body = JSON.stringify({ values: [], timelines: { a: { component: { code: 'a' }, days: Array.from({ length: 90 }, (_, day) => ({ date: new Date(NOW - day * 86_400_000).toISOString().slice(0, 10), outages: {}, related_events: Array.from({ length: 100 }, (_, event) => ({ name: 'x'.repeat(280), code: String(event) })) })) } } });
  const service = new UptimeService([source('claude')], async url => { calls++; return url.endsWith('summary.json') ? JSON.stringify({ components: [{ id: 'a', name: 'API' }] }) : body; });
  const result = await service.get('claude')!;
  assert.match(result.note!, /bounded cache/); assert.equal(result.components.length, 0);
  assert.equal(await service.get('claude'), result); assert.equal(calls, 2);
});

test('no-uptime sources do not fetch unrelated endpoints; feed counts use all retained 90d incidents', async () => {
  let reads = 0;
  const service = new UptimeService(sources, async url => {
    reads++;
    const company = sources.find(s => s.endpoints.some(e => e.url === url))!;
    return readFile(new URL(`../fixtures/${company.id}.xml`, import.meta.url), 'utf8');
  }, () => NOW);
  for (const id of ['missing', 'glm']) assert.equal(service.get(id), undefined);
  assert.equal(reads, 0);
  for (const s of sources.filter(s => s.kind === 'incident-feed' && !s.uptime)) {
    const raw = await readFile(new URL(`../fixtures/${s.id}.xml`, import.meta.url), 'utf8');
    const incidents = rssIncidents(raw);
    const expected = new Set(incidents.filter(i => Date.parse(i.startedAt) >= NOW - 90 * 86_400_000 && Date.parse(i.startedAt) <= NOW).map(i => i.id)).size;
    const company = await service.get(s.id)!;
    assert.equal(company.source, 'none'); assert.equal(company.feedIncidents90d, expected, s.id); assert.match(company.note!, /retained/);
  }
  assert.equal(reads, sources.filter(s => s.kind === 'incident-feed' && !s.uptime).length); // one read per feed
});
test('feed read failure never claims zero incidents', async () => {
  const service = new UptimeService(sources, async () => { throw new Error('feed offline'); });
  const company = await service.get('grok')!;
  assert.equal(company.source, 'none'); assert.equal(company.feedIncidents90d, undefined); assert.match(company.note!, /feed offline/);
});
test('GET /api/uptime/:id serves the contract, coalesces reads, has JSON 404 and existing method/URI guards', async t => {
  let calls = 0;
  const service = new UptimeService(sources, async url => { calls++; return readFixture(url); }, () => clock('openai'));
  const app = createApp(new State(sources, false, () => {}), () => [], tmpdir(), service);
  t.after(() => app.close());
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const address = app.server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/api/uptime/`;
  assert.equal(calls, 0);
  const replies = await Promise.all([fetch(base + 'claude'), fetch(base + 'claude')]);
  assert.ok(replies.every(r => r.status === 200)); assert.equal(calls, 2);
  assert.match(replies[0].headers.get('content-type')!, /application\/json/); assert.equal(replies[0].headers.get('cache-control'), 'public, max-age=60');
  assert.equal((await replies[0].json()).companyId, 'claude');
  assert.equal((await (await fetch(base + 'openai')).json()).source, 'incident.io');
  assert.equal((await fetch(base + 'glm')).status, 404);
  const missing = await fetch(base + 'missing'); assert.equal(missing.status, 404); assert.deepEqual(await missing.json(), { error: 'Unknown company' });
  assert.equal((await fetch(base + '%xx')).status, 400);
  assert.equal((await fetch(base + 'claude', { method: 'POST' })).status, 405);
  const head = await fetch(base + 'claude', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
