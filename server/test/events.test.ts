import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Company, Incident, ServerMessage } from '../../shared/types.js';
import { diffCompany, EventBuffer } from '../src/events.js';
import { failedCompany, HOLD_MS, initialCompany, NEVER_FETCHED, STALE_MS, State } from '../src/state.js';
import { sources } from '../src/registry.js';
const source = sources[0];
const at = '2026-10-20T12:00:00.000Z'; const later = '2026-10-20T12:01:00.000Z';
const incident: Incident = { id: 'a', title: 'API errors', level: 'partial', status: 'investigating', startedAt: at, updatedAt: at };
const company = (overrides: Partial<Company> = {}): Company => ({ ...initialCompany(source), level: 'operational', stale: false, fetchedAt: at, error: undefined, ...overrides });
test('boot seeds silently; open/update/status-only/resolve/vanished/level diff', () => {
  const initial = company(), open = company({ level: 'partial', openIncidents: [incident] });
  assert.deepEqual(diffCompany(undefined, open), []);
  assert.deepEqual(diffCompany(initial, open).map(e => e.type), ['level_changed', 'incident_opened']);
  const updated = company({ ...open, openIncidents: [{ ...incident, updatedAt: later }] });
  assert.equal(diffCompany(open, updated)[0].type, 'incident_updated');
  const statusOnly = company({ ...open, openIncidents: [{ ...incident, status: 'identified' }] });
  assert.equal(diffCompany(open, statusOnly)[0].type, 'incident_updated');
  assert.equal(diffCompany(open, company({ recentIncidents: [{ ...incident, status: 'resolved', updatedAt: later, resolvedAt: later }] }))[1].type, 'incident_resolved');
  const vanished = diffCompany(open, initial, later); assert.equal(vanished[1].incident?.resolvedAt, later);
  assert.deepEqual(diffCompany(open, open), []);
});
test('unhealthy or stale source never resolves incidents', () => {
  const previous = company({ level: 'partial', openIncidents: [incident] });
  assert.ok(diffCompany(previous, company({ level: 'unknown', error: 'blocked' })).every(e => e.type === 'level_changed'));
  assert.ok(diffCompany(previous, company({ stale: true })).every(e => e.type === 'level_changed'));
});
test('event ids deterministic across identical diffs and include changed revision', () => {
  const before = company(), next = company({ openIncidents: [incident] });
  assert.equal(diffCompany(before, next, at)[0].id, diffCompany(before, next, later)[0].id);
  assert.notEqual(diffCompany(before, next)[0].id, diffCompany(before, { ...next, openIncidents: [{ ...incident, updatedAt: later }] })[0].id);
});
test('ring buffer is newest first, bounded, and de-duplicates', () => {
  const buffer = new EventBuffer();
  for (let i = 0; i < 220; i++) buffer.add([{ id: String(i), type: 'level_changed', companyId: 'claude', at }]);
  buffer.add([{ id: '219', type: 'level_changed', companyId: 'claude', at }]);
  assert.equal(buffer.all().length, 200); assert.equal(buffer.all()[0].id, '219'); assert.equal(buffer.all()[199].id, '20');
});
test('a brief failed read keeps the last good reading, turns unknown after HOLD_MS, and is stale after 5 minutes', () => {
  const before = company();
  const brief = failedCompany(before, 'HTTP 403', Date.parse(at) + 1000);
  assert.equal(brief.level, before.level); assert.equal(brief.summary, before.summary); assert.equal(brief.error, 'HTTP 403'); assert.equal(brief.stale, false); assert.equal(brief.fetchedAt, at);
  const long = failedCompany(before, 'HTTP 403', Date.parse(at) + HOLD_MS + 1);
  assert.equal(long.level, 'unknown'); assert.equal(long.stale, true); assert.equal(long.fetchedAt, at);
  assert.equal(failedCompany(before, 'timeout', Date.parse(at) + STALE_MS + 1).stale, true);
  assert.equal(initialCompany(source).fetchedAt, NEVER_FETCHED); assert.equal(initialCompany(source).stale, true);
});
test('State preserves a healthy baseline through failure and seeds after failed startup without a storm', () => {
  const messages: ServerMessage[] = []; const state = new State([source], false, m => messages.push(m));
  state.apply(failedCompany(state.get(source.id), 'timeout'), Date.parse(at));
  state.apply(company({ level: 'partial', openIncidents: [incident] }), Date.parse(at)); assert.equal(state.events.all().length, 0);
  state.apply(failedCompany(state.get(source.id), 'HTTP 503', Date.parse(at) + HOLD_MS + 1000), Date.parse(at) + HOLD_MS + 1000);
  assert.equal(state.events.all().length, 1); assert.equal(state.events.all()[0].to, 'unknown');
  state.apply(company({ fetchedAt: later }), Date.parse(later));
  assert.equal(state.events.all().filter(e => e.type === 'incident_resolved').length, 1);
  assert.equal(state.get(source.id).recentIncidents.length, 1);
  assert.equal(messages.filter(m => m.t === 'event').length, state.events.all().length);
  state.apply(company({ fetchedAt: later }), Date.parse(later) + 1000);
  assert.equal(state.get(source.id).recentIncidents.length, 1, 'remember derived resolutions for the full 24h window');
});
test('State marks companies stale after 5 minutes, greys them after HOLD_MS, and sends each change once', () => {
  const messages: ServerMessage[] = []; const state = new State([source], false, m => messages.push(m));
  state.apply(company(), Date.parse(at)); messages.length = 0;
  state.apply(company({ fetchedAt: later }), Date.parse(later)); assert.equal(messages.length, 0);
  state.expire(Date.parse(later) + STALE_MS + 1);
  assert.equal(state.get(source.id).level, 'operational'); assert.equal(state.get(source.id).stale, true); assert.equal(messages.length, 1);
  state.expire(Date.parse(later) + STALE_MS + 20_000); assert.equal(messages.length, 1);
  state.expire(Date.parse(later) + HOLD_MS + 1);
  assert.equal(state.get(source.id).level, 'unknown'); assert.equal(state.get(source.id).stale, true);
  state.expire(Date.parse(later) + HOLD_MS + 20_000); assert.equal(state.get(source.id).level, 'unknown');
});
test('a reopened incident supersedes its remembered resolution', () => {
  const state = new State([source], false); state.apply(company(), Date.parse(at));
  const reopened = company({ level: 'partial', openIncidents: [incident], recentIncidents: [{ ...incident, status: 'resolved', resolvedAt: at }] });
  state.apply(reopened, Date.parse(later)); assert.equal(state.get(source.id).recentIncidents.length, 0);
  state.apply({ ...reopened, recentIncidents: [] }, Date.parse(later));
  assert.equal(state.events.all().filter(e => e.type === 'incident_resolved').length, 0);
});
