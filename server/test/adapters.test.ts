import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { normalize, combine } from '../src/adapters/index.js';
import { sources } from '../src/registry.js';
const dir = new URL('../fixtures/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
const read = (file: string) => readFileSync(new URL(file, dir), 'utf8');
const fixture = (key: string) => { const r = manifest.find((r: any) => r.key === key && r.status === 200 && r.file); assert.ok(r, `Missing real recording for ${key}`); return { body: read(r.file), now: Date.parse(r.recordedAt) }; };
const get = (id: string) => sources.find(s => s.id === id)!;
for (const source of sources.filter(s => s.endpoints.length)) test(`real recording: ${source.id} (${source.kind})`, () => {
  const results = source.endpoints.map(endpoint => { const { body, now } = fixture(endpoint.key); return normalize(body, endpoint, source, now); });
  const result = combine(results);
  assert.equal(result.level, 'operational');
  assert.ok(Array.isArray(result.components)); assert.equal(result.openIncidents.length, 0);
  for (const i of result.recentIncidents) { assert.ok(i.resolvedAt); assert.ok(Number.isFinite(Date.parse(i.updatedAt))); }
});
function statusChange(indicator: string, componentStatus = 'operational') {
  const source = get('claude'), endpoint = source.endpoints[0], { body, now } = fixture(endpoint.key);
  const data = JSON.parse(body); data.status.indicator = indicator; data.components.forEach((c: any) => c.status = componentStatus);
  data.incidents = []; data.scheduled_maintenances = [];
  return normalize(JSON.stringify(data), endpoint, source, now);
}
test('all Statuspage indicator and component severities', () => {
  for (const [indicator, expected] of Object.entries({ none: 'operational', minor: 'degraded', major: 'partial', critical: 'major' })) assert.equal(statusChange(indicator).level, expected);
  for (const [status, expected] of Object.entries({ operational: 'operational', degraded_performance: 'degraded', partial_outage: 'partial', major_outage: 'major', under_maintenance: 'maintenance' })) assert.equal(statusChange('none', status).level, expected);
  assert.throws(() => statusChange('unrecognized'), /Unrecognized/);
});
test('Kimi only keeps the four requested components and ignores website severity', () => {
  const source = get('kimi'), { body, now } = fixture('kimi'); const data = JSON.parse(body);
  data.status.indicator = 'critical'; data.components.find((c: any) => c.name === 'Website').status = 'major_outage';
  const result = normalize(JSON.stringify(data), source.endpoints[0], source, now);
  assert.deepEqual(result.components.map(c => c.name), ['Kimi', 'Open API', 'API Service', 'Kimi Code']); assert.equal(result.level, 'operational');
  data.components.find((c: any) => c.name === 'Kimi Code').status = 'partial_outage';
  assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'partial');
});
test('Copilot and v0 ignore unrelated component outages and incidents', () => {
  for (const id of ['copilot', 'v0']) {
    const source = get(id), { body, now } = fixture(id), data = JSON.parse(body);
    data.status.indicator = 'critical'; data.components.filter((c: any) => !/^(Copilot|v0)$/i.test(c.name)).forEach((c: any) => c.status = 'major_outage');
    data.incidents = [{ id: 'unrelated', name: 'Unrelated outage', status: 'investigating', impact: 'critical', created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), components: [] }];
    const result = normalize(JSON.stringify(data), source.endpoints[0], source, now);
    assert.equal(result.level, 'operational'); assert.equal(result.components.length, 1); assert.equal(result.openIncidents.length, 0);
  }
});
test('v0 falls back to page status when component is absent; Copilot fails closed', () => {
  for (const id of ['copilot', 'v0']) {
    const source = get(id), { body, now } = fixture(id), data = JSON.parse(body);
    data.status.indicator = 'critical'; data.components = data.components.filter((c: any) => !/^(Copilot|v0)$/i.test(c.name));
    if (id === 'v0') assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'major');
    else assert.throws(() => normalize(JSON.stringify(data), source.endpoints[0], source, now), /component missing/);
  }
});
test('Kimi, Copilot and v0 levels come only from scoped components, even with related incidents', () => {
  for (const id of ['kimi', 'copilot', 'v0']) {
    const source = get(id), { body, now } = fixture(id), data = JSON.parse(body);
    const component = data.components.find((c: any) => /^(Kimi|Copilot|v0)$/i.test(c.name));
    const at = new Date(now).toISOString();
    data.incidents = [{ id: 'related', name: `${source.name} outage`, status: 'investigating', impact: 'critical', created_at: at, updated_at: at, components: [{ id: component.id }] }];
    const result = normalize(JSON.stringify(data), source.endpoints[0], source, now);
    assert.equal(result.openIncidents[0].level, 'major'); assert.equal(result.level, 'operational');
    component.status = 'degraded_performance';
    assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'degraded');
  }
});
test('cached incident enrichment cannot mask recovery in the current summary', () => {
  const source = get('openai'), { body, now } = fixture('openai'), summary = JSON.parse(body), at = new Date(now).toISOString();
  const history = { incidents: [{ id: 'older', name: 'Previous outage', status: 'investigating', impact: 'critical', created_at: at, updated_at: at }] };
  const supplement = normalize(JSON.stringify(history), source.endpoints[1], source, now);
  assert.equal(supplement.openIncidents[0].level, 'major');
  assert.equal(combine([normalize(body, source.endpoints[0], source, now), supplement]).level, 'operational');
  summary.status.indicator = 'critical';
  assert.equal(combine([normalize(JSON.stringify(summary), source.endpoints[0], source, now), supplement]).level, 'major');
});
test('Statuspage incident mapping, latest update and active maintenance only', () => {
  const source = get('claude'), { body, now } = fixture('claude'), data = JSON.parse(body);
  const at = new Date(now).toISOString();
  data.incidents = [{ id: 'a', name: 'API outage', status: 'investigating', impact: 'critical', created_at: at, updated_at: at, incident_updates: [{ created_at: at, body: '<p>Current update</p>' }] }];
  const result = normalize(JSON.stringify(data), source.endpoints[0], source, now);
  assert.equal(result.level, 'major'); assert.equal(result.openIncidents[0].latestUpdate, 'Current update');
  data.incidents = []; data.scheduled_maintenances = [{ id: 'm', name: 'Maintenance', status: 'scheduled', created_at: at, updated_at: at }];
  assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'operational');
  data.scheduled_maintenances[0].status = 'in_progress';
  assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'maintenance');
});
test('OpenStatus compatibility (Gamma/Zed/Synteq) and future maintenance exclusion', () => {
  const source = get('synteq'), { body, now } = fixture('synteq'), data = JSON.parse(body);
  assert.equal(normalize(body, source.endpoints[0], source, now).level, 'operational');
  data.page.status = 'DOWN'; assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'major');
  data.page.status = 'UP'; data.activeMaintenances[0].status = 'INPROGRESS';
  assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'maintenance');
  // Synteq on 2026-10-21: an Instatus page word we hadn't seen, with its incident
  data.activeMaintenances[0].status = 'NOTSTARTEDYET'; data.page.status = 'ONEMAJOROUTAGE';
  data.activeIncidents = [{ id: 'cmvhjs3tu031m0xplbqqxrdwa', name: 'Billing/Account Portal outage', started: '2026-10-21T03:23:31.553Z', status: 'INVESTIGATING', impact: 'MAJOROUTAGE', url: 'https://status.synteq.com/cmvhjs3tu031m0xplbqqxrdwa', updatedAt: '2026-10-21T03:23:31.554Z' }];
  const out = normalize(JSON.stringify(data), source.endpoints[0], source, now);
  assert.equal(out.level, 'major'); assert.equal(out.openIncidents.length, 1); assert.equal(out.openIncidents[0].title, 'Billing/Account Portal outage'); assert.equal(out.summary, '');
  data.page.status = 'SOMENEWWORD'; data.activeIncidents[0].impact = 'PARTIALOUTAGE';
  assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'partial', 'unknown words carry no level; incidents still count');
  data.activeIncidents = [];
  assert.throws(() => normalize(JSON.stringify(data), source.endpoints[0], source, now), /Unrecognized Instatus page status/);
});
test('incident.io full_outage on a summary component is a major outage (Amp, 2026-10-21), not a failed read', () => {
  const source = get('amp'), { body, now } = fixture('amp'), data = JSON.parse(body);
  data.components[0].status = 'full_outage';
  const result = normalize(JSON.stringify(data), source.endpoints[0], source, now);
  assert.equal(result.components.find((c: any) => c.name === data.components[0].name)?.level ?? result.level, 'major');
});
test('MiniMax regional aggregation takes worst, not the last region', () => {
  assert.equal(combine([statusChange('critical'), statusChange('none')]).level, 'major');
  assert.equal(combine([statusChange('none'), statusChange('major')]).level, 'partial');
});
test('Better Stack resource/report severities and resolved report updates', () => {
  const source = get('luma'), { body, now } = fixture('luma-betterstack'), data = JSON.parse(body);
  const resource = data.included.find((i: any) => i.type === 'status_page_resource');
  resource.attributes.status = 'degraded'; assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'degraded');
  resource.attributes.status = 'downtime'; assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'major');
  const report = data.included.find((i: any) => i.type === 'status_report'); report.attributes.aggregate_state = 'degraded'; report.attributes.starts_at = new Date(now - 60_000).toISOString();
  const result = normalize(JSON.stringify(data), source.endpoints[0], source, now);
  assert.equal(result.openIncidents.length, 1); assert.ok(result.openIncidents[0].latestUpdate);
  resource.attributes.status = 'operational'; report.attributes.affected_resources = [{ status: 'degraded' }];
  assert.equal(normalize(JSON.stringify(data), source.endpoints[0], source, now).level, 'degraded', 'older outage updates must not mask a current improvement');
});
test('Grok RSS explicit status, severity and timestamped updates', () => {
  const source = get('grok'), { body, now } = fixture('grok');
  const open = body.replaceAll('Status: RESOLVED', 'Status: INVESTIGATING');
  assert.equal(normalize(open, source.endpoints[0], source, now).level, 'major');
  assert.equal(normalize(open.replaceAll('Severity: outage', 'Severity: disruption'), source.endpoints[0], source, now).level, 'partial');
  assert.equal(normalize(open.replace(/Severity: (outage|disruption|degraded)/g, 'Severity: degraded'), source.endpoints[0], source, now).level, 'degraded');
  assert.ok(normalize(open, source.endpoints[0], source, now).openIncidents.every(i => i.updatedAt >= i.startedAt));
});
test('DeepSeek bilingual titles keep English', () => {
  const source = get('deepseek'), { body, now } = fixture('deepseek');
  const data = new XMLParser({ ignoreAttributes: false }).parse(body);
  const first = data.rss.channel.item[0]; first.pubDate = new Date(now).toUTCString();
  data.rss.channel.item = [first];
  const open = new XMLBuilder({ ignoreAttributes: false }).build(data);
  const result = normalize(open, source.endpoints[0], source, now);
  assert.ok(result.recentIncidents.some(i => i.title === 'Search service error'));
  assert.ok(result.recentIncidents.every(i => !/[\u3400-\u9fff]/.test(i.title)));
  first.description = first.description.replace('Status:</strong> resolved', 'Status:</strong> investigating');
  assert.throws(() => normalize(new XMLBuilder({ ignoreAttributes: false }).build(data), source.endpoints[0], source, now), /no readable severity/);
  first.title = 'Partial outage';
  assert.equal(normalize(new XMLBuilder({ ignoreAttributes: false }).build(data), source.endpoints[0], source, now).level, 'partial');
});
test('Alibaba history selection, open rules and discovered live sfm product map', () => {
  const source = get('qwen'), { body, now } = fixture('qwen'); const data = JSON.parse(body);
  const item = { ...data.data[0], title: 'Qwen Model Studio incident', endTime: null };
  data.data.push(item);
  const historyEndpoint = source.endpoints.find(e => e.adapter === 'qwen')!;
  const result = normalize(JSON.stringify(data), historyEndpoint, source, now); assert.equal(result.openIncidents.length, 1); assert.equal(result.level, 'partial');
  item.endTime = now; assert.equal(normalize(JSON.stringify(data), historyEndpoint, source, now).openIncidents.length, 1, 'title without Recovered remains open');
  item.title += ' Recovered'; assert.equal(normalize(JSON.stringify(data), historyEndpoint, source, now).openIncidents.length, 0);
  const current = { success: true, data: [{ productStatus: { sfm: [{ eventId: String(item.id), impactLevel: 'ALARM' }], irrelevant: [{ eventId: 'other' }] }, eventDetails: { [item.id]: { ...item, endTime: null, title: 'Bailian incident' } } }] };
  assert.equal(normalize(JSON.stringify(current), source.endpoints[0], source, now).level, 'partial');
});
test('malformed/HTML/unrecognized responses never normalize to operational', () => {
  for (const source of sources.filter(s => s.endpoints.length)) for (const endpoint of source.endpoints) {
    assert.throws(() => normalize('<html>challenge</html>', endpoint, source));
    assert.throws(() => normalize('{}', endpoint, source));
  }
});
