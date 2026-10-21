import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sources, USER_AGENT } from '../src/registry.js';
import { newsSources } from '../src/news-sources.js';
import { State } from '../src/state.js';

test('board: 48 companies with official status sources; six Statuspage additions and Grok feed unchanged', () => {
  const ids = ['claude', 'openai', 'kimi', 'minimax', 'perplexity', 'cohere', 'manus', 'elevenlabs', 'stability', 'ideogram', 'runway', 'heygen', 'gamma', 'cartesia', 'groq', 'cerebras', 'fireworks', 'lambda', 'openrouter', 'poe', 'cursor', 'copilot', 'windsurf', 'amp', 'factory', 'devin', 'lovable', 'bolt', 'v0', 'zed', 'synteq', 'grok', 'deepseek', 'qwen', 'together', 'huggingface', 'luma', 'novita', 'modal', 'udio', 'higgsfield', 'ai21', 'augment', 'warp', 'baseten', 'tavus', 'assemblyai', 'gemini'];
  assert.deepEqual(sources.map(s => s.id), ids);
  assert.equal(new Set(ids).size, 48);
  assert.deepEqual(newsSources.map(s => s.companyId), ids);
  assert.deepEqual(new State(sources, false, () => {}).snapshot().companies.map(c => c.id), ids);
  assert.equal(sources.filter(s => s.kind === 'live').length, 46);
  assert.deepEqual(sources.filter(s => s.kind === 'none').map(s => s.id), []);
  assert.equal(sources.filter(s => s.kind === 'incident-feed').length, 2);
  assert.ok(sources.every(s => s.uptime || s.id === 'grok'));
  assert.deepEqual(sources.find(s => s.id === 'grok')!.endpoints, [{ key: 'grok', url: 'https://status.x.ai/feed.xml', adapter: 'rss' }]);
  for (const [id, name, category, base] of [
    ['ai21', 'AI21 Labs', 'lab', 'https://status.ai21.com'],
    ['augment', 'Augment Code', 'coding', 'https://status.augmentcode.com'],
    ['warp', 'Warp', 'coding', 'https://status.warp.dev'],
    ['baseten', 'Baseten', 'host', 'https://status.baseten.co'],
    ['tavus', 'Tavus', 'creative', 'https://status.tavus.io'],
    ['assemblyai', 'AssemblyAI', 'creative', 'https://status.assemblyai.com'],
  ]) {
    const s = sources.find(s => s.id === id)!;
    assert.equal(s.name, name); assert.equal(s.category, category); assert.equal(s.officialUrl, base);
    assert.equal(s.uptime, 'statuspage'); assert.ok(s.primaryComponent);
    assert.deepEqual(s.endpoints, [{ key: id, url: `${base}/api/v2/summary.json`, adapter: 'statuspage' }]);
  }
  const gemini = sources.find(s => s.id === 'gemini')!;
  assert.equal(gemini.name, 'Gemini'); assert.equal(gemini.category, 'lab'); assert.equal(gemini.kind, 'live');
  assert.equal(gemini.officialUrl, 'https://status.cloud.google.com/'); assert.equal(gemini.uptime, 'gcp');
  assert.ok(gemini.primaryComponent?.test('Vertex Gemini API'));
  assert.deepEqual(gemini.endpoints, [{ key: 'gemini-gcp', url: 'https://status.cloud.google.com/incidents.json', adapter: 'gcp' }]);
  assert.equal(USER_AGENT, 'aiweather/1.0 (+https://aiweather.synteq.app)');
});
