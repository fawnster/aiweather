import { SourceError } from './http-source.js';

/** Shared by the uptime and news warmers; each job reads its URLs sequentially. */
export class WorkQueue {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(private limit = 4) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>(resolve => this.waiting.push(resolve));
    else this.active++;
    try { return await work(); }
    finally { const next = this.waiting.shift(); if (next) next(); else this.active--; }
  }
}

/** Bounded, completion-timed cache. Expiration schedules work without removing data. */
export class RefreshCache<T> {
  private entries = new Map<string, { data: T; expires: number; bytes: number; good: boolean }>();
  private inFlight = new Map<string, Promise<T>>();
  private bytes = 0;
  private timer?: NodeJS.Timeout;
  constructor(private options: {
    ids: string[]; ttl: number; queue: WorkQueue; now: () => number;
    load: (id: string) => Promise<T>; pending: (id: string) => T;
    failure: (id: string, error: unknown, previous?: T) => T;
    maxEntryBytes: number; maxBytes: number;
  }) {}
  get(id: string): Promise<T> | undefined {
    if (!this.options.ids.includes(id)) return undefined;
    const entry = this.entries.get(id);
    if (!entry) return this.refresh(id);
    if (entry.expires <= this.options.now()) void this.refresh(id);
    return Promise.resolve(entry.data);
  }
  all(): Promise<T[]> { return Promise.all(this.options.ids.map(id => this.get(id)!)); }
  refresh(id: string): Promise<T> {
    const running = this.inFlight.get(id);
    if (running) return running;
    const job = this.options.queue.run(async () => {
      const previous = this.entries.get(id);
      let data: T, ttl = this.options.ttl, good = true;
      try {
        data = await this.options.load(id);
        const bytes = Buffer.byteLength(JSON.stringify(data));
        if (bytes > this.options.maxEntryBytes || this.bytes - (previous?.bytes ?? 0) + bytes > this.options.maxBytes)
          throw new Error('Official data exceeds the bounded cache capacity');
      } catch (error) {
        data = this.options.failure(id, error, previous?.good ? previous.data : undefined);
        good = previous?.good ?? false;
        ttl = Math.max(5 * 60_000, error instanceof SourceError ? error.retryAfterMs ?? 0 : 0);
      }
      const bytes = Buffer.byteLength(JSON.stringify(data));
      this.bytes += bytes - (previous?.bytes ?? 0);
      this.entries.set(id, { data, expires: this.options.now() + ttl, bytes, good });
      return data;
    }).finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, job);
    return job;
  }
  /** Seed honest pending values before accepting requests; warm in the background. */
  start(): void {
    if (this.timer) return;
    for (const id of this.options.ids) if (!this.entries.has(id)) {
      const data = this.options.pending(id), bytes = Buffer.byteLength(JSON.stringify(data));
      this.entries.set(id, { data, bytes, expires: 0, good: false }); this.bytes += bytes;
    }
    const tick = () => { for (const id of this.options.ids) if (this.entries.get(id)!.expires <= this.options.now()) void this.refresh(id); };
    tick(); this.timer = setInterval(tick, 60_000); this.timer.unref();
  }
  stop(): void { clearInterval(this.timer); this.timer = undefined; }
}
