import { fileURLToPath } from 'node:url';
import { State } from './state.js';
import { sources } from './registry.js';
import { Poller } from './poller.js';
import { createApp } from './app.js';
import { UptimeService } from './uptime.js';
import { NewsService } from './news.js';
import { WorkQueue } from './refresh-cache.js';
const demo = process.env.DEMO === '1';
let app: ReturnType<typeof createApp>;
const state = new State(sources, demo, message => app.broadcast(message));
// Live status has its own four request slots: uptime histories and news share three more and can never hold up a
// status check (they used to share one queue, so a slow history page could leave the board unread for minutes).
const poller = new Poller(state, sources, new WorkQueue(4));
const queue = new WorkQueue(3);
const uptime = new UptimeService(sources, undefined, Date.now, queue);
const news = new NewsService(undefined, undefined, Date.now, queue);
uptime.start(); news.start();
const project = import.meta.url.includes('/dist/') ? '../../../../' : '../../';
app = createApp(state, () => demo ? state.snapshot().companies.map(c => ({ id: c.id, lastOkAt: c.sourceKind === 'none' ? null : c.fetchedAt, lastError: c.sourceKind === 'none' ? c.summary : null, latencyMs: null })) : poller.sources(), fileURLToPath(new URL(project + 'web/dist', import.meta.url)), uptime, news);
let stopDemo: (() => void) | undefined;
if (demo) { const { startDemo } = await import('./demo.js'); stopDemo = await startDemo(state); }
else poller.start();
const staleTimer = demo ? undefined : setInterval(() => state.expire(), 15_000);
const port = Number(process.env.PORT ?? 8787);
app.server.listen(port, '0.0.0.0', () => console.log(`aiweather listening on 0.0.0.0:${port}${demo ? ' [DEMO]' : ''}`));
function stop() { uptime.stop(); news.stop(); poller.stop(); if (staleTimer) clearInterval(staleTimer); stopDemo?.(); app.close(); }
process.once('SIGINT', stop); process.once('SIGTERM', stop);
