import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { Poller } from '../src/poller.js';
import { State } from '../src/state.js';
import { sources } from '../src/registry.js';
const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8');
test('poller refreshes summaries but rate-limits incident history to at least five minutes', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.parse('2026-10-20T22:40:00Z') });
  t.mock.method(Math, 'random', () => 0);
  const source = sources.find(s => s.id === 'openai')!; const calls: { url: string; at: number }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    calls.push({ url, at: Date.now() }); return new Response(fixture(url.includes('/incidents.json') ? 'openai-history' : 'openai'));
  });
  const state = new State([source], false), poller = new Poller(state, [source]); t.after(() => poller.stop()); poller.start(); await setImmediate();
  assert.equal(state.get('openai').level, 'operational');
  for (let i = 0; i < 6; i++) { t.mock.timers.tick(60_000); await setImmediate(); }
  const histories = calls.filter(c => c.url.includes('/incidents.json'));
  assert.equal(histories.length, 2); assert.ok(histories[1].at - histories[0].at >= 300_000);
  assert.ok(calls.filter(c => c.url.includes('/summary.json')).length >= 6);
  assert.equal(poller.sources()[0].lastError, null);
});
test('one failed MiniMax region makes the aggregate unknown instead of masking it', async t => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: Date.parse('2026-10-20T22:40:00Z') });
  t.mock.method(Math, 'random', () => 0);
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url: string) => url.includes('minimaxi.com') ? new Response('blocked', { status: 403 }) : new Response(fixture('minimax')));
  const source = sources.find(s => s.id === 'minimax')!;
  const state = new State([source], false), poller = new Poller(state, [source]); t.after(() => poller.stop()); poller.start(); await setImmediate();
  assert.equal(state.get('minimax').level, 'unknown'); assert.match(state.get('minimax').error!, /403/);
  assert.equal(poller.sources()[0].lastOkAt, null);
});
