import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { datadogUptime } from '../src/datadog-uptime.js';
import { UptimeService } from '../src/uptime.js';
import { sources } from '../src/registry.js';

const dir = new URL('../fixtures/openrouter-uptime/', import.meta.url);
const read = (file: string) => readFile(new URL(file, dir), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
const recorded = JSON.parse(await read('config.json'));
const upstream = await read('page-logic.js');
const NOW = Date.parse('2026-10-21T12:00:00Z');
const component = (id = 'a', status = 'operational') => ({ id, name: id === 'a' ? 'API' : 'Other API', type: 'Component', status });
const update = (createdAt: string, componentsAffected: any[], extra = {}) => ({ id: createdAt, createdAt, componentsAffected, ...extra });
const incident = (id: string, timeline: any[], extra = {}) => ({ id, title: id, resolved: false, timeline, ...extra });
const config = (incidents: any[] = [], extra = {}) => ({ created: '2026-01-01T00:00:00Z', visualizationType: 'bars_and_uptime_percentage', components: [component(), component('b')], incidents, maintenances: [], ...extra });
const run = (data: any, now = NOW) => datadogUptime(JSON.stringify(data), now);

// Independent oracle: execute the saved FIRST-PARTY functions, not a second
// handwritten implementation. The only substitutions are a fixed clock, UTC
// calendar methods, and the bundler's object-spread helpers. Never fetch/eval JS
// at runtime; this is an offline fixture test only.
function page(data: any, now = NOW): any[] {
  const result = runInNewContext(`
    const NativeDate = Date;
    Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
      getFullYear() { return this.getUTCFullYear(); }
      getMonth() { return this.getUTCMonth(); }
      getDate() { return this.getUTCDate(); }
      setDate(value) { return this.setUTCDate(value); }
    };
    var e6 = { IA: Object.assign, ko: Object.assign };
    ${upstream}
    const statusPage = jz(input), coverage = wj(statusPage);
    const bars = pageBars(90, statusPage.components, statusPage.degradations, statusPage.maintenances);
    const leaves = statusPage.components.flatMap(c => c.type === 'ComponentGroup' ? c.components : [c]);
    leaves.map(c => {
      const percentage = period => {
        const age = coverage ? (now - new Date(coverage).getTime()) / 864e5 : period;
        const days = age > 0 ? Math.min(period, age) : period;
        return Number(wF(pageRanges(statusPage, c.id, new Date().toISOString(), days), days).toFixed(2));
      };
      return {
        name: c.name,
        ...(statusPage.visualizationType === 'bars_and_uptime_percentage' ? { pct30: percentage(30), pct90: percentage(90) } : {}),
        days: Object.entries(bars[c.id]).map(([date, events]) => ({
          date,
          level: coverage && date < wP(new Date(coverage)) ? 'unknown' : ({ partial_outage: 'partial', major_outage: 'major' }[events[0]?.status] ?? events[0]?.status ?? 'operational'),
          events: coverage && date < wP(new Date(coverage)) ? [] : events.map(e => ({ title: [...statusPage.degradations, ...statusPage.maintenances].find(n => n.id === e.eventId).title })),
        })),
      };
    });
  `, { input: data, now }, { timeout: 2000 });
  return JSON.parse(JSON.stringify(result));
}
function parity(data: any, now = NOW) { const actual = run(data, now); assert.deepEqual(actual, page(data, now)); return actual; }

test('official OpenRouter recording: digests, seven separate leaves, 90 UTC dates, exact page parity', async () => {
  for (const record of manifest.records) {
    if (record.file) assert.equal(createHash('sha256').update(await read(record.file)).digest('hex'), record.sha256);
    if (record.excerptFile) assert.equal(createHash('sha256').update(await read(record.excerptFile)).digest('hex'), record.excerptSha256);
  }
  const components = parity(recorded);
  assert.equal(components.length, 7);
  assert.deepEqual(components.map(c => c.name), [...recorded.components[0].components, recorded.components[1]].map(c => c.name));
  for (const c of components) {
    assert.equal(c.days.length, 90);
    assert.deepEqual(c.days.map(d => d.date), [...new Set(c.days.map(d => d.date))].sort());
    assert.ok(c.days.every(d => d.downMinutes == null));
  }
  assert.equal(components[0].pct30, 100);
  assert.ok(components.at(-1)!.days.some(d => d.level === 'degraded'));
});

test('carried worst daily state, recovery by omission, old history seeding, startedAt fallback and deleted updates', () => {
  const data = config([incident('carried', [
    update('2026-07-01T12:00:00Z', [component('a', 'major_outage')]),
    update('2026-07-24T00:00:00Z', [], { startedAt: '0001-01-01T00:00:00Z' }),
    update('2026-10-18T01:00:00Z', [component('b', 'partial_outage')]),
    update('2026-10-18T02:00:00Z', [], { deletedAt: '2026-10-18T03:00:00Z' }),
    update('2026-10-19T04:00:00Z', [component('a', 'degraded')], { startedAt: '2026-10-19T00:30:00Z', deletedAt: null }),
    update('not-a-date', [component('a', 'major_outage')]),
    update('2026-10-20T00:00:00Z', []),
  ], { resolved: true, resolvedDate: '2026-10-20T00:00:00Z' })]);
  const [a, b] = parity(data);
  assert.equal(a.days[0].date, '2026-07-24'); assert.equal(a.days[0].level, 'major');
  assert.equal(a.days[1].level, 'operational');
  assert.equal(b.days.find(d => d.date === '2026-10-19')!.level, 'partial');
  assert.equal(b.days.find(d => d.date === '2026-10-20')!.level, 'operational');
  // Resolution at midnight still colors that date: Pg is a daily-notice rule,
  // not a half-open duration rasterizer.
  assert.equal(a.days.find(d => d.date === '2026-10-20')!.level, 'degraded');
  assert.equal(a.days.at(-1)!.events.length, 0);
});

test('maintenance matches page filtering, inclusive completion, canceled carry and severity ordering; no percent deduction', () => {
  const data = config([incident('degraded', [update('2026-10-18T12:00:00Z', [component('a', 'degraded')])])], {
    maintenances: [
      { id: 'scheduled', title: 'scheduled', currentStatus: 'scheduled', timeline: [update('2026-10-10T00:00:00Z', [component('b')])] },
      { id: 'complete', title: 'complete', currentStatus: 'completed', startDate: '2026-10-17T12:00:00Z', completedDate: '2026-10-19T00:00:00Z', timeline: [update('2026-10-17T12:00:00Z', [component('a')])] },
      { id: 'canceled', title: 'canceled', currentStatus: 'canceled', timeline: [update('2026-10-19T12:00:00Z', [component('b')])] },
    ],
  });
  const [a, b] = parity(data);
  assert.equal(a.days.find(d => d.date === '2026-10-17')!.level, 'maintenance');
  assert.deepEqual(a.days.find(d => d.date === '2026-10-19')!.events.map(e => e.title), ['degraded', 'complete']);
  assert.equal(b.days.find(d => d.date === '2026-10-10')!.level, 'operational');
  assert.equal(b.days.at(-1)!.level, 'maintenance');
  assert.equal(a.pct30, 100); assert.equal(b.pct90, 100);
});

test('outage percentages union overlaps, clip to the selected period, ignore degraded/maintenance and round as displayed', () => {
  const data = config([
    incident('long', [update('2026-09-01T00:00:00Z', [component('a', 'partial_outage')]), update('2026-10-20T12:00:00Z', [])]),
    incident('overlap', [update('2026-10-20T00:00:00Z', [component('a', 'major_outage')]), update('2026-10-21T00:00:00Z', [])]),
    incident('open', [update('2026-10-21T06:00:00Z', [component('a', 'partial_outage')])]),
    incident('minor', [update('2026-10-01T00:00:00Z', [component('b', 'degraded')])]),
  ]);
  const [a, b] = parity(data);
  assert.equal(a.pct30, 0.83); assert.equal(b.pct30, 100);
  assert.equal(a.days.at(-1)!.level, 'major');
});

test('coverage uses earliest timeline (including deleted/scheduled), fractional age and UTC date boundaries', () => {
  const data = config([incident('utc', [
    update('2026-10-19T23:30:00-02:00', [component('a', 'partial_outage')]),
    update('2026-10-20T23:00:00Z', []),
  ])], { created: '2026-10-20T08:15:00Z', maintenances: [{ id: 'old', title: 'old', currentStatus: 'scheduled', timeline: [update('2026-10-18T15:10:00Z', [], { deletedAt: '2026-10-18T16:00:00Z' })] }] });
  const [a] = parity(data);
  assert.equal(a.days.find(d => d.date === '2026-10-17')!.level, 'unknown');
  assert.equal(a.days.find(d => d.date === '2026-10-18')!.level, 'operational');
  assert.equal(a.days.find(d => d.date === '2026-10-19')!.level, 'operational');
  assert.equal(a.days.find(d => d.date === '2026-10-20')!.level, 'partial');
  assert.equal(a.pct30, a.pct90); // Both are capped to the page's short coverage.
});

test('bars-only pages omit percentages; malformed/unsupported sources fail closed', () => {
  const [c] = parity(config([], { visualizationType: 'bars_only' }));
  assert.equal(c.pct30, undefined); assert.equal(c.pct90, undefined);
  for (const bad of ['<html>challenge</html>', '{}', JSON.stringify(config([], { visualizationType: 'component_name_only' })), JSON.stringify(config([], { components: [component('a', 'mystery')] }))]) assert.throws(() => datadogUptime(bad, NOW));
});

test('OpenRouter service fetches only official config, selects Chat and retains successful history on failure', async () => {
  let calls = 0, failure = false;
  const source = sources.find(s => s.id === 'openrouter')!;
  const service = new UptimeService([source], async url => {
    calls++; assert.equal(url, 'https://status.openrouter.ai/config.json');
    if (failure) throw new Error('HTTP 403 (access blocked; no bypass attempted)');
    return JSON.stringify(recorded);
  }, () => NOW);
  const result = await service.get('openrouter')!;
  assert.equal(result.source, 'statuspage'); assert.equal(result.components.length, 7);
  assert.equal(result.primary, 'Chat (/api/v1/chat/completions)');
  assert.deepEqual(result.components, run(recorded));
  assert.equal(await service.get('openrouter'), result); assert.equal(calls, 1);
  failure = true;
  const stale = await service.refresh('openrouter');
  assert.deepEqual(stale.components, result.components); assert.match(stale.note!, /403.*Last successful/);
  assert.equal(calls, 2);
});
