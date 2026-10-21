import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { datadog } from '../src/adapters/datadog.js';

const recorded = JSON.parse(await readFile(new URL('../fixtures/openrouter.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-10-21T03:00:00Z');
const baseUrl = 'https://status.openrouter.ai';
const base = () => ({ ...structuredClone(recorded), incidents: [] as any[], maintenances: [] as any[] });
const run = (body: any) => datadog(JSON.stringify(body), baseUrl, NOW);
const affected = (status: string) => [{ ...recorded.components[0].components[0], status }];
const report = (extra: Record<string, unknown> = {}) => ({
  id: 'test-incident', title: 'Gateway disruption', currentStatus: 'investigating', resolved: false,
  publishedDate: '2026-10-21T01:00:00Z', lastModifiedAt: '2026-10-21T02:00:00Z',
  description: 'Investigating gateway errors.', componentsAffected: affected('partial_outage'), timeline: [], ...extra,
});

test('Datadog recording: preserve all seven distinct components, not the group; historical incidents do not affect live status', () => {
  const result = run(recorded);
  assert.equal(result.level, 'operational');
  assert.deepEqual(result.components.map(c => c.name), [
    'Chat (/api/v1/chat/completions)', 'Video (/api/v1/videos)', 'Image (/api/v1/image)',
    'TTS (/api/v1/audio/speech)', 'STT (/api/v1/audio/transcriptions)', 'Embeddings (/api/v1/embeddings)', 'Web & Application Services',
  ]);
  assert.ok(result.components.every(c => c.level === 'operational'));
  assert.deepEqual(result.openIncidents, []);
  assert.deepEqual(result.recentIncidents, []);
});

test('Datadog current component enum and worst severity', () => {
  for (const [status, level] of Object.entries({ operational: 'operational', maintenance: 'maintenance', degraded: 'degraded', partial_outage: 'partial', major_outage: 'major' })) {
    const data = base(); data.components[0].components[2].status = status;
    assert.equal(run(data).level, level);
    assert.equal(run(data).components[2].level, level);
  }
  const data = base(); data.components[0].components[0].status = 'major_outage'; data.components[1].status = 'degraded';
  assert.equal(run(data).level, 'major');
});

test('Datadog open incidents influence weather using current affected components, not stale historical outages', () => {
  const data = base(); data.incidents = [report()];
  const result = run(data);
  assert.equal(result.level, 'partial');
  assert.equal(result.openIncidents[0].url, `${baseUrl}/test-incident`);
  assert.equal(result.summary, 'Investigating gateway errors.');
  data.incidents[0] = report({ currentStatus: 'monitoring', componentsAffected: affected('operational'), timeline: [
    { createdAt: '2026-10-21T01:00:00Z', componentsAffected: affected('major_outage'), description: 'Earlier outage.' },
  ] });
  assert.equal(run(data).level, 'operational');
  assert.equal(run(data).openIncidents.length, 1);
  data.incidents.push(report({ id: 'second', componentsAffected: affected('degraded') }));
  assert.equal(run(data).level, 'degraded');
});

test('Datadog resolved history keeps published impact, recent window and effective timeline order, never current weather', () => {
  const data = base(); data.incidents = [report({ currentStatus: 'resolved', resolved: true, resolvedDate: '2026-10-21T02:00:00Z', componentsAffected: affected('operational'), timeline: [
    { createdAt: '2026-10-21T02:30:00Z', startedAt: '2026-10-21T01:00:00Z', description: 'Earlier outage.', componentsAffected: affected('major_outage') },
    { createdAt: '2026-10-21T02:00:00Z', startedAt: '2026-10-21T02:00:00Z', description: 'Recovered.', componentsAffected: affected('operational') },
    { id: 'deleted-update', deletedAt: '2026-10-21T02:45:00Z' },
  ] })];
  const result = run(data);
  assert.equal(result.level, 'operational');
  assert.deepEqual(result.openIncidents, []);
  assert.equal(result.recentIncidents[0].level, 'major');
  assert.equal(result.recentIncidents[0].latestUpdate, 'Recovered.');
  data.incidents[0].resolvedDate = '2026-10-19T01:00:00Z';
  assert.deepEqual(run(data).recentIncidents, []);
  data.incidents[0].resolvedDate = '2026-10-22T01:00:00Z';
  assert.deepEqual(run(data).recentIncidents, []);
});

test('Datadog only in-progress maintenance affects weather; component failures still win', () => {
  const data = base(); data.maintenances = [report({ id: 'work', currentStatus: 'scheduled', startDate: '2026-10-22T01:00:00Z', scheduledDescription: 'Future work.', inProgressDescription: 'Working now.' })];
  for (const status of ['scheduled', 'completed', 'canceled']) {
    data.maintenances[0].currentStatus = status;
    assert.equal(run(data).level, 'operational'); assert.deepEqual(run(data).openIncidents, []);
  }
  data.maintenances[0].currentStatus = 'in_progress'; data.maintenances[0].startDate = '2026-10-21T01:00:00Z';
  const result = run(data);
  assert.equal(result.level, 'maintenance'); assert.equal(result.summary, 'Working now.');
  assert.equal(result.openIncidents[0].url, `${baseUrl}/maintenances/work`);
  data.components[1].status = 'partial_outage'; assert.equal(run(data).level, 'partial');
});

test('Datadog rejects unrecognized schemas/statuses; an open incident with no readable impact keeps the component level', () => {
  for (const value of [null, {}, { components: [], incidents: [] }]) assert.throws(() => run(value));
  for (const status of ['new-state', 'constructor']) {
    const data = base(); data.components[1].status = status;
    assert.throws(() => run(data), /Unrecognized Datadog component status/);
  }
  const data = base(); data.incidents = [report({ componentsAffected: [] })];
  const plain = base(); plain.incidents = [];
  const result = run(data);
  assert.equal(result.level, run(plain).level);
  assert.equal(result.openIncidents.length, 1); assert.equal(result.openIncidents[0].level, 'unknown');
  data.incidents[0].currentStatus = 'new-status'; assert.throws(() => run(data), /Unrecognized Datadog incident status/);
  data.incidents = []; data.maintenances = [{ currentStatus: 'new-status' }]; assert.throws(() => run(data), /Unrecognized Datadog maintenance status/);
});
