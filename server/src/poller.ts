import { normalize, combine } from './adapters/index.js';
import type { Normalized } from './adapters/common.js';
import { HttpSource, SourceError } from './http-source.js';
import type { Source } from './registry.js';
import { WorkQueue } from './refresh-cache.js';
import { failedCompany, State } from './state.js';
export interface SourceHealth { id: string; lastOkAt: string | null; lastError: string | null; latencyMs: number | null }
/** Every minute while a source answers. After a failure it's tried again soon (15 s, then 30 s, 1, 2, 4 and at most 5
 *  minutes), because a status CDN that drops some requests otherwise leaves a company unread for long stretches; a
 *  source's own Retry-After always wins. */
export function pollDelay(failures: number, random = Math.random, retryAfterMs = 0) {
  const base = failures ? Math.min(300_000, 15_000 * 2 ** (failures - 1)) : 60_000;
  return Math.max(Math.round(base * (0.9 + random() * 0.2)), retryAfterMs);
}
export class Poller {
  private http = new HttpSource();
  private results = new Map<string, { at: number; data: Normalized }>();
  private running = 0;
  private jobs: { source: Source; due: number; failures: number; busy: boolean }[];
  private health = new Map<string, SourceHealth>();
  private timer?: NodeJS.Timeout;
  constructor(private state: State, sources: Source[], private queue = new WorkQueue(4)) {
    this.jobs = sources.filter(s => s.endpoints.length).map(source => ({ source, due: Date.now() + Math.random() * 10_000, failures: 0, busy: false }));
    for (const source of sources) this.health.set(source.id, { id: source.id, lastOkAt: null, lastError: source.endpoints.length ? 'Awaiting first poll' : source.note ?? 'No readable official source', latencyMs: null });
  }
  start() { this.timer = setInterval(() => this.tick(), 250); this.tick(); }
  stop() { if (this.timer) clearInterval(this.timer); }
  private tick() {
    for (const job of this.jobs) {
      if (this.running >= 4) break;
      if (job.busy || job.due > Date.now()) continue;
      job.busy = true; this.running++;
      void this.queue.run(() => this.poll(job)).finally(() => { job.busy = false; this.running--; });
    }
  }
  private async poll(job: typeof this.jobs[number]) {
    const start = Date.now(); const health = this.health.get(job.source.id)!;
    let retryAfterMs = 0;
    try {
      // Sequential endpoints keep the global network concurrency bounded at four.
      const results = [];
      for (const endpoint of job.source.endpoints) {
        const cached = this.results.get(endpoint.url);
        if (endpoint.intervalMs && cached && Date.now() - cached.at < endpoint.intervalMs) { results.push(cached.data); continue; }
        const body = await this.http.read(endpoint.url);
        const result = normalize(body, endpoint, job.source);
        if (job.source.id === 'minimax') {
          const region = endpoint.key === 'minimax-cn' ? 'China' : 'Global';
          result.components = result.components.map(c => ({ ...c, name: `${region}: ${c.name}` }));
          for (const i of [...result.openIncidents, ...result.recentIncidents]) i.id = `${endpoint.key}:${i.id}`;
        }
        if (endpoint.intervalMs) this.results.set(endpoint.url, { at: Date.now(), data: result });
        results.push(result);
      }
      const fetchedAt = new Date().toISOString();
      const { error: _error, ...before } = this.state.get(job.source.id);
      this.state.apply({ ...before, ...combine(results), fetchedAt, stale: false });
      health.lastOkAt = fetchedAt; health.lastError = null; job.failures = 0;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      health.lastError = reason.slice(0, 240); job.failures++;
      if (error instanceof SourceError) retryAfterMs = error.retryAfterMs ?? 0;
      this.state.apply(failedCompany(this.state.get(job.source.id), health.lastError));
      console.warn(`[source:${job.source.id}] ${health.lastError}`);
    } finally {
      health.latencyMs = Date.now() - start;
      job.due = Date.now() + pollDelay(job.failures, Math.random, retryAfterMs);
    }
  }
  sources() { return [...this.health.values()]; }
}
