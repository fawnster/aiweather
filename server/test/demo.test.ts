import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDemo } from '../src/demo.js';
import { State } from '../src/state.js';
import { sources } from '../src/registry.js';
test('fixture-only demo timeline resolves at 90s and loops without becoming stale', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-20T22:35:00Z') });
  const state = new State(sources, true); const stop = await startDemo(state); t.after(stop);
  assert.equal(state.snapshot().demo, true); assert.equal(state.events.all().length, 0);
  assert.equal(state.snapshot().companies.length, 48);
  for (const id of ['ai21', 'augment', 'warp', 'baseten', 'tavus', 'assemblyai', 'gemini']) {
    assert.equal(state.get(id).sourceKind, 'live'); assert.ok(state.get(id).components.length); assert.equal(state.get(id).error, undefined);
  }
  t.mock.timers.tick(10_000); assert.equal(state.get('openai').level, 'degraded');
  t.mock.timers.tick(10_000); assert.equal(state.get('openai').level, 'partial'); assert.equal(state.get('openai').openIncidents.length, 1);
  t.mock.timers.tick(15_000); assert.equal(state.get('openai').level, 'major');
  t.mock.timers.tick(25_000); assert.equal(state.get('claude').openIncidents.length, 1);
  t.mock.timers.tick(30_000); assert.equal(state.get('openai').level, 'operational'); assert.equal(state.get('claude').openIncidents.length, 0);
  assert.equal(state.events.all().filter(e => e.type === 'incident_resolved').length, 2);
  t.mock.timers.tick(10_000); assert.equal(state.get('openai').level, 'degraded');
  assert.ok(state.snapshot().companies.every(c => !c.stale));
});
