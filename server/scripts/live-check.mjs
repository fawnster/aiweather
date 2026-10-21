// Run after npm run build: node server/scripts/live-check.mjs
// This is the production process itself, so RSS includes all polling, parsing and serving.
import { mkdir, writeFile } from 'node:fs/promises';
if (process.env.DEMO) throw new Error('Live validation refuses DEMO');
const directory = new URL('../reports/', import.meta.url);
await mkdir(directory, { recursive: true });
await import('../dist/server/src/index.js');
const start = Date.now();
const samples = [];
for (let i = 0; i <= 33; i++) {
  if (i) await new Promise(resolve => setTimeout(resolve, 10_000));
  samples.push({ at: new Date().toISOString(), elapsedSec: Math.round((Date.now() - start) / 1000), rssBytes: process.memoryUsage().rss });
  await writeFile(new URL('memory.json', directory), JSON.stringify({ runtime: process.version, demo: false, durationSec: samples.at(-1).elapsedSec, samples }, null, 2) + '\n');
}
const base = `http://127.0.0.1:${process.env.PORT ?? 8787}`;
const health = await (await fetch(base + '/api/health')).json();
const snapshot = await (await fetch(base + '/api/snapshot')).json();
await writeFile(new URL('health.json', directory), JSON.stringify(health, null, 2) + '\n');
await writeFile(new URL('live-summary.json', directory), JSON.stringify({ at: new Date().toISOString(), durationSec: samples.at(-1).elapsedSec, demo: snapshot.demo, peakRssBytes: Math.max(...samples.map(s => s.rssBytes)), steadyPeakRssBytes: Math.max(...samples.filter(s => s.elapsedSec >= 30).map(s => s.rssBytes)), companies: snapshot.companies.map(({ id, level, sourceKind, error }) => ({ id, level, sourceKind, ...(error ? { error } : {}) })) }, null, 2) + '\n');
console.log(`Live validation recorded ${samples.at(-1).elapsedSec}s; peak RSS ${(Math.max(...samples.map(s => s.rssBytes)) / 1048576).toFixed(1)} MiB. Reports saved to server/reports/.`);
process.emit('SIGTERM');
