import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sources } from '../src/registry.js';
import { UptimeService } from '../src/uptime.js';
import { alibabaUptime, betterstackUptime, flashdutyUptime, instatusUptime, QWEN_HISTORY_DAYS } from '../src/uptime-providers.js';

const dir = new URL('../fixtures/uptime2/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', dir), 'utf8'));
const fixture = (key: string) => readFile(new URL(manifest.find((r: any) => r.key === key).file, dir), 'utf8');
const NOW = Date.parse(manifest.find((r: any) => r.company === 'deepseek' && r.file && r.url.includes('/structure')).recordedAt);
async function recorded(url: string) {
  const wanted = new URL(url);
  const r = manifest.find((r: any) => {
    const u = new URL(r.url);
    return r.file && u.origin === wanted.origin && u.pathname === wanted.pathname && u.searchParams.get('offset') === wanted.searchParams.get('offset');
  });
  assert.ok(r, `Unrecorded fixture request: ${url}`);
  if (wanted.hostname === 'status.alibabacloud.com') assert.equal(wanted.searchParams.get('numOfDay'), String(QWEN_HISTORY_DAYS));
  return readFile(new URL(r.file, dir), 'utf8');
}

test('uptime2 recordings retain digests; all providers replay', async () => {
  for (const r of manifest.filter((r: any) => r.file)) {
    const body = await readFile(new URL(r.file, dir));
    assert.equal(body.byteLength, r.bytes, r.key);
    assert.equal(createHash('sha256').update(body).digest('hex'), r.sha256, r.key);
  }
  const service = new UptimeService(sources, recorded, () => NOW);
  const ids = ['huggingface', 'luma', 'modal', 'novita', 'higgsfield', 'together', 'udio', 'gamma', 'zed', 'synteq', 'deepseek', 'qwen'];
  for (const id of ids) {
    const c = (await service.get(id))!;
    assert.equal(c.source, 'statuspage', id);
    assert.doesNotMatch(c.note ?? '', /unavailable/i, id);
    assert.ok(c.components.length, `${id}: ${c.note}`);
    assert.ok(c.components.some(v => v.name === c.primary), id);
    for (const component of c.components) {
      assert.ok(component.days.length > 0 && component.days.length <= 90, `${id}: ${component.name}`);
      assert.deepEqual(component.days.map(d => d.date), [...new Set(component.days.map(d => d.date))].sort());
      for (const pct of [component.pct30, component.pct90]) if (pct != null) assert.ok(pct >= 0 && pct <= 100);
    }
  }
});

test('Better Stack reads JSON:API availability, per-day seconds and unmonitored history without invented pct30', async () => {
  const raw = await fixture('huggingface-0'), components = betterstackUptime(raw);
  assert.equal(components[0].pct90, 99.989);
  assert.ok(components.every(c => c.pct30 == null && c.days.length === 90));
  const data = JSON.parse(raw), resource = data.included.find((r: any) => r.type === 'status_page_resource');
  const outage = resource.attributes.status_history.find((d: any) => d.downtime_duration > 0);
  assert.equal(components[0].days.find(d => d.date === outage.day)!.downMinutes, outage.downtime_duration / 60);
  const novita = betterstackUptime(await fixture('novita-0'));
  assert.ok(novita.some(c => c.days.some(d => d.level === 'unknown' && d.downMinutes == null)));
  const together = betterstackUptime(await fixture('together-0'));
  assert.ok(together.some(c => c.days.some(d => d.level === 'major' && d.downMinutes! > 0)));
  resource.attributes.availability = null;
  assert.equal(betterstackUptime(JSON.stringify(data))[0].pct90, undefined);
  resource.attributes.status_history[0].status = 'new-unrecognized-status';
  assert.throws(() => betterstackUptime(JSON.stringify(data)), /Unrecognized/);
  assert.throws(() => betterstackUptime('{}'), /schema/);
});

test('Instatus decodes published SSR JSON without eval; honors 90/30 periods, exact percentages and impacts', async () => {
  const gamma = instatusUptime(await fixture('gamma-0'));
  assert.equal(gamma.period, 90);
  assert.equal(gamma.components.find(c => c.name === 'Website')!.pct90, 99.97);
  assert.equal(gamma.components.find(c => c.name === 'API')!.pct90, 99.92);
  assert.ok(gamma.components.some(c => c.days.some(d => d.downMinutes! > 0)));
  const synteq = instatusUptime(await fixture('synteq-0'));
  assert.equal(synteq.period, 30);
  assert.equal(synteq.components.find(c => c.name === 'Dedicated Server Control Panel')!.pct30, 98.29);
  assert.ok(synteq.components.every(c => c.pct90 == null));
  assert.ok(synteq.components.some(c => c.days.some(d => d.level === 'maintenance')));
  const zed = instatusUptime(await fixture('zed-0'));
  assert.ok(zed.components.every(c => c.pct90 === 100));
  assert.throws(() => instatusUptime('<html>not an uptime page</html>'), /Missing/);
});

test('DeepSeek copies backend published percentages, including sections; unions daily impacts, no pct30', async () => {
  const entries = manifest.filter((r: any) => r.company === 'deepseek' && r.file);
  const structure = JSON.parse(await fixture(entries.find((r: any) => r.url.includes('/structure')).key));
  const active = await fixture(entries.find((r: any) => r.url.includes('/active')).key);
  const results = flashdutyUptime(JSON.stringify(structure), active, NOW);
  assert.equal(results.length, 8);
  assert.equal(results[0].pct90, structure.data.component_uptimes[0].uptime);
  assert.ok(results.some(c => c.pct90 === 99.84));
  assert.ok(results.every(c => c.pct30 == null));
  assert.ok(results.some(c => c.days.some(d => d.downMinutes! > 0)));
  assert.ok(results.some(c => c.days.some(d => d.level === 'unknown')));
  const target = structure.data.component_uptimes[0].component_id;
  const dayStart = Math.floor(NOW / 86_400_000) * 86_400_000 - 86_400_000;
  const base = dayStart / 1000;
  structure.data.component_impacts = [
    { component_id: target, start_at_seconds: base + 3600, end_at_seconds: base + 7200, status: 'full_outage' },
    { component_id: target, start_at_seconds: base + 5400, end_at_seconds: base + 9000, status: 'partial_outage' },
    { component_id: target, start_at_seconds: base + 12_000, end_at_seconds: base + 18_000, status: 'maintenance' },
  ];
  const [clipped] = flashdutyUptime(JSON.stringify(structure), active, NOW);
  const day = clipped.days.find(d => d.date === new Date(dayStart).toISOString().slice(0, 10))!;
  assert.equal(day.level, 'major'); assert.equal(day.downMinutes, 90);
  assert.equal(clipped.pct90, structure.data.component_uptimes[0].uptime);
  structure.data.component_uptimes[0].uptime = 97.12345;
  assert.equal(flashdutyUptime(JSON.stringify(structure), active, NOW)[0].pct90, 97.12345);
  structure.data.component_uptimes[0].uptime = null;
  assert.equal(flashdutyUptime(JSON.stringify(structure), active, NOW)[0].pct90, undefined);
});

test('Qwen selects Model Studio sfm only, retains 90 sorted dates, never publishes a percentage', async () => {
  const body = await fixture('qwen-0');
  const [c] = alibabaUptime(body);
  assert.equal(c.name, 'Alibaba Cloud Model Studio');
  assert.equal(c.days.length, 90); assert.equal(c.pct30, undefined); assert.equal(c.pct90, undefined);
  // Older official Model Studio incident is outside the retained 90-day window.
  const raw = JSON.parse(body);
  const impacted = raw.data.find((r: any) => r.productStatusDetail.productStatus.sfm?.length);
  const other = raw.data.find((r: any) => Object.entries(r.productStatusDetail.productStatus).some(([id, impacts]: any) => id !== 'sfm' && impacts.length) && !r.productStatusDetail.productStatus.sfm?.length);
  assert.ok(impacted && other);
  assert.equal(alibabaUptime(JSON.stringify({ success: true, data: [impacted] }))[0].days[0].level, 'partial');
  assert.equal(alibabaUptime(JSON.stringify({ success: true, data: [other] }))[0].days[0].level, 'operational');
  assert.match(alibabaUptime(JSON.stringify({ success: true, data: [impacted] }))[0].days[0].events[0].url!, /historyId=/);
  assert.throws(() => alibabaUptime('{"success":false,"data":[]}'), /schema/);
});
