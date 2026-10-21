import { Agent } from 'undici';
import { USER_AGENT } from './registry.js';

// One connection pool per host, over HTTP/2 like a browser. When a request fails at the network level (timeout, dropped
// connection), that host's pool is thrown away, so the retry and every later poll start on a fresh connection. Before
// this, a stalled HTTP/2 connection to Statuspage's CDN (2026-10-21) kept 14 companies unreadable for an hour: a
// timeout cancelled only the request, and every poll went back to the same dead link. (HTTP/1.1 was no answer: that
// day the same CDN often left HTTP/1.1 requests hanging while fresh HTTP/2 ones answered in milliseconds.) Each address
// also gets 2 s to connect instead of Node's 250 ms, which gives up on a slow moment.
const pools = new Map<string, Agent>();
function poolFor(url: string) {
  const origin = new URL(url).origin;
  let pool = pools.get(origin);
  if (!pool) pools.set(origin, pool = new Agent({ allowH2: true, connect: { timeout: 10_000, autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 2_000 } }));
  return pool;
}
function dropPool(url: string) {
  const origin = new URL(url).origin, pool = pools.get(origin);
  pools.delete(origin);
  pool?.destroy().catch(() => {});
}
export class SourceError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) { super(message); }
}
export interface CachedResponse { body: string; etag?: string; modified?: string }
export class HttpSource {
  private cache = new Map<string, CachedResponse>();
  constructor(private options: { cache?: boolean; accept?: string; allowHtml?: boolean } = {}) {}
  /** One quick retry, on a fresh connection, when the network itself fails (timeout, dropped connection); HTTP errors
   *  aren't retried. */
  async read(url: string): Promise<string> {
    try { return await this.readOnce(url); }
    catch (error) {
      if (error instanceof SourceError) throw error;
      dropPool(url);
      try { return await this.readOnce(url); }
      catch (again) { if (!(again instanceof SourceError)) dropPool(url); throw again; }
    }
  }
  private async readOnce(url: string): Promise<string> {
    const cached = this.cache.get(url);
    // Plain (uncompressed) replies: on 2026-10-21 Statuspage's CDN hung every request that accepted gzip, br or zstd,
    // and answered the same request at once without it (Node's fetch asks for compression unless told otherwise).
    // Status replies are a few KB, and the 4 MiB cap below already counts the unpacked size.
    const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: this.options.accept ?? 'application/json, application/rss+xml, application/xml, text/xml;q=0.9', 'accept-encoding': 'identity' };
    if (cached?.etag) headers['if-none-match'] = cached.etag;
    if (cached?.modified) headers['if-modified-since'] = cached.modified;
    const init = { headers, signal: AbortSignal.timeout(12_000), dispatcher: poolFor(url) }; // Statuspage took 7 s on a slow day
    const response = await fetch(url, init as RequestInit);
    if (response.status === 304 && cached) return cached.body;
    if (!response.ok) {
      await response.body?.cancel();
      const retry = response.headers.get('retry-after');
      const retryAfterMs = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : undefined;
      throw new SourceError(`HTTP ${response.status}${response.status === 403 ? ' (access blocked; no bypass attempted)' : ''}`, retryAfterMs);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new SourceError('Empty source response');
    const chunks: Uint8Array[] = []; let bytes = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 4 * 1024 * 1024) { await reader.cancel(); throw new SourceError('Source exceeds 4 MiB limit'); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    if (/^\s*(?:<!doctype html|<html)/i.test(body)) {
      if (/cf-chl-|challenge-platform(?!\/scripts\/jsd\/|[^\"']*turnstile)|<title[^>]*>[^<]*(?:Just a moment|Attention Required|captcha)|<(?:h1|form)[^>]*(?:id|class)=[\"'][^\"']*(?:challenge|captcha)/i.test(body)) throw new SourceError('Challenge-blocked official source (no bypass attempted)');
      if (!this.options.allowHtml) throw new SourceError('Expected machine-readable data; received HTML');
    }
    if (this.options.cache !== false) this.cache.set(url, { body, etag: response.headers.get('etag') ?? undefined, modified: response.headers.get('last-modified') ?? undefined });
    return body;
  }
}
