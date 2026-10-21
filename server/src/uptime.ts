import type { CompanyUptime, ComponentUptime, Level, UptimeDay } from '../../shared/types.js';
import { json, mapped, text, worst } from './adapters/common.js';
import { rssIncidents } from './adapters/rss.js';
import { datadogUptime } from './datadog-uptime.js';
import { gcpUptime } from './gcp-uptime.js';
import { keptComponents } from './components.js';
import { HttpSource } from './http-source.js';
import type { Source } from './registry.js';
import { RefreshCache, WorkQueue } from './refresh-cache.js';
import { alibabaUptime, betterstackUptime, flashdutyUptime, instatusUptime, QWEN_HISTORY_DAYS, publishedPercentage as percentage } from './uptime-providers.js';

const DAY = 86_400_000;
const SUCCESS_TTL = 30 * 60_000;
const MAX_COMPANY_BYTES = 2 * 1024 * 1024, MAX_CACHE_BYTES = 8 * 1024 * 1024;
interface RawComponent { id: string; name: string }
function components(value: unknown, source: Source): RawComponent[] {
  if (!Array.isArray(value) || value.some(c => typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name)) throw new Error('Invalid official component list');
  const kept = keptComponents(value as RawComponent[], source);
  if (!kept.length) throw new Error('Required company components missing from official source');
  return kept;
}
function timestamp(value: unknown): number {
  const at = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(at)) throw new Error('Invalid uptime timestamp');
  return at;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(timestamp(value)).toISOString().slice(0, 10) !== value) throw new Error('Invalid uptime day');
  return value;
}
function uniqueEvents(events: UptimeDay['events']): UptimeDay['events'] {
  return [...new Map(events.map(e => [e.url ?? e.title, e])).values()];
}

export function statuspageUptime(body: string, kept: RawComponent[], base: string): ComponentUptime[] {
  const data = json(body);
  if (!Array.isArray(data.values) || !data.timelines || typeof data.timelines !== 'object') throw new Error('Invalid Statuspage uptime schema');
  const values = new Map<string, any>(data.values.map((v: any) => [v.component, v]));
  return kept.filter(c => data.timelines[c.id]).map(c => {
    const timeline = data.timelines[c.id], value = values.get(c.id);
    if (timeline.component?.code !== c.id || !Array.isArray(timeline.days)) throw new Error('Invalid Statuspage uptime timeline');
    const days: UptimeDay[] = timeline.days.map((day: any) => {
      const dayDate = date(day.date);
      if (!day.outages || typeof day.outages !== 'object' || Array.isArray(day.outages)) throw new Error('Invalid Statuspage daily outages');
      for (const [key, seconds] of Object.entries(day.outages)) {
        if (!['p', 'm'].includes(key) || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) throw new Error('Unrecognized Statuspage outage duration');
      }
      const partial = day.outages.p ?? 0, major = day.outages.m ?? 0;
      const beforeStart = timeline.component.startDate && dayDate < date(timeline.component.startDate);
      if (day.related_events != null && !Array.isArray(day.related_events)) throw new Error('Invalid Statuspage related events');
      return {
        date: dayDate,
        level: beforeStart ? 'unknown' : major > 0 ? 'major' : partial > 0 ? 'partial' : 'operational',
        // Group durations are aggregates; Statuspage itself hides their time fields.
        ...(!beforeStart && !timeline.component.isGroup ? { downMinutes: (partial + major) / 60 } : {}),
        events: uniqueEvents((day.related_events ?? []).map((event: any) => {
          if (typeof event.code !== 'string' || !event.code || !text(event.name)) throw new Error('Invalid Statuspage related event');
          return { title: text(event.name).slice(0, 280), url: `${base}/incidents/${encodeURIComponent(event.code)}` };
        })),
      };
    });
    return { name: c.name, pct30: percentage(value?.thirty), pct90: percentage(value?.ninety), days: days.sort((a, b) => a.date.localeCompare(b.date)).slice(-90) };
  });
}

const incidentLevels: Record<string, Level> = {
  operational: 'operational', degraded_performance: 'degraded', partial_outage: 'partial', full_outage: 'major', under_maintenance: 'maintenance',
};
function unionMinutes(ranges: [number, number][]): number {
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0, end = -Infinity;
  for (const [start, stop] of ranges) { total += Math.max(0, stop - Math.max(start, end)); end = Math.max(end, stop); }
  return total / 60_000;
}
// An incident.io page that groups its parts lists them only in its layout (ElevenLabs, 2026-10-21): the flat list comes
// back empty, so the parts are read from the groups; a name used in two groups is prefixed with its group's name.
export function incidentComponents(summary: any): unknown {
  if (!Array.isArray(summary?.components) || summary.components.length) return summary?.components;
  const flat: { id: unknown; name: unknown; group?: string }[] = [];
  for (const item of Array.isArray(summary?.structure?.items) ? summary.structure.items : []) {
    if (item?.component) flat.push({ id: item.component.component_id ?? item.component.id, name: item.component.name });
    for (const c of Array.isArray(item?.group?.components) ? item.group.components : []) {
      if (!c?.hidden) flat.push({ id: c?.component_id ?? c?.id, name: c?.name, group: typeof item.group.name === 'string' ? item.group.name : undefined });
    }
  }
  const uses = new Map<unknown, number>();
  for (const c of flat) uses.set(c.name, (uses.get(c.name) ?? 0) + 1);
  return flat.map(c => ({ id: c.id, name: (uses.get(c.name) ?? 0) > 1 && c.group ? `${c.group}: ${c.name}` : c.name }));
}
export function incidentUptime(body: string, summary: any, source: Source, now: number): ComponentUptime[] {
  const data = json(body);
  if (!Array.isArray(data.component_uptimes) || !Array.isArray(data.component_impacts) || !Array.isArray(data.incident_links)) throw new Error('Invalid incident.io uptime schema');
  const kept = components(incidentComponents(summary), source);
  const uptimes = new Map<string, any>(data.component_uptimes.map((u: any) => [u.component_id, u]));
  const links = new Map<string, any>(data.incident_links.map((i: any) => [i.id, i]));
  const today = Math.floor(now / DAY) * DAY, first = today - 89 * DAY;
  return kept.map(c => {
    const uptime = uptimes.get(c.id);
    const available = uptime?.data_available_since ?? summary.data_available_since;
    const availableDay = available == null ? undefined : Math.floor(timestamp(available) / DAY) * DAY;
    const days: UptimeDay[] = Array.from({ length: 90 }, (_, index) => ({
      date: new Date(first + index * DAY).toISOString().slice(0, 10),
      level: availableDay == null || first + index * DAY < availableDay ? 'unknown' : 'operational', events: [],
    }));
    const down: [number, number][][] = Array.from({ length: 90 }, () => []);
    for (const impact of data.component_impacts.filter((i: any) => i.component_id === c.id)) {
      const start = Math.max(first, timestamp(impact.start_at));
      const end = Math.min(now, impact.end_at == null ? now : timestamp(impact.end_at));
      const level = mapped(impact.status, incidentLevels, 'incident.io component impact');
      if (end <= start) continue;
      const link = links.get(impact.status_page_incident_id);
      for (let index = Math.max(0, Math.floor((start - first) / DAY)); index < 90 && first + index * DAY < end; index++) {
        const day = days[index], dayStart = first + index * DAY;
        day.level = day.level === 'unknown' ? level : worst([day.level, level]);
        if (level === 'partial' || level === 'major') down[index].push([Math.max(start, dayStart), Math.min(end, dayStart + DAY)]);
        if (link) {
          if (!text(link.name) || typeof link.permalink !== 'string' || !/^https:\/\//.test(link.permalink)) throw new Error('Invalid official incident link');
          day.events.push({ title: text(link.name).slice(0, 280), url: link.permalink });
        }
      }
    }
    days.forEach((day, i) => {
      if (day.level !== 'unknown') day.downMinutes = unionMinutes(down[i]);
      day.events = uniqueEvents(day.events);
    });
    // The API publishes one percentage for the requested 90-day range. It has
    // no 30-day field; neither daily buckets nor impacts are used to invent one.
    return { name: c.name, pct90: percentage(uptime?.uptime), days };
  });
}

export class UptimeService {
  private cache: RefreshCache<CompanyUptime>;
  constructor(sources: Source[], private read: (url: string) => Promise<string> = url => new HttpSource({ cache: false, accept: 'application/json, text/html;q=0.9', allowHtml: true }).read(url), private now = Date.now, queue = new WorkQueue(2)) {
    const registry = new Map(sources.map(s => [s.id, s]));
    const empty = (id: string, note: string): CompanyUptime => ({
      companyId: id, source: registry.get(id)!.uptime === 'incident.io' ? 'incident.io' : registry.get(id)!.uptime ? 'statuspage' : 'none',
      components: [], fetchedAt: new Date(this.now()).toISOString(), note,
    });
    this.cache = new RefreshCache({
      ids: [...registry.keys()], ttl: SUCCESS_TTL, queue, now,
      maxEntryBytes: MAX_COMPANY_BYTES, maxBytes: MAX_CACHE_BYTES,
      load: id => this.fetch(registry.get(id)!),
      pending: id => empty(id, 'Awaiting first official uptime fetch'),
      failure: (id, error, previous) => {
        const note = `Official uptime unavailable: ${error instanceof Error ? error.message.slice(0, 200) : 'source read failed'}`;
        return previous ? { ...previous, note: `${note}. Last successful data retained.` } : empty(id, note);
      },
    });
  }
  get(id: string): Promise<CompanyUptime> | undefined { return this.cache.get(id); }
  all(): Promise<CompanyUptime[]> { return this.cache.all(); }
  start(): void { this.cache.start(); }
  stop(): void { this.cache.stop(); }
  refresh(id: string): Promise<CompanyUptime> { return this.cache.refresh(id); }
  private async fetch(source: Source): Promise<CompanyUptime> {
    let result: ComponentUptime[] = [], expected = 0;
    const notes: string[] = [];
    if (source.uptime === 'statuspage') {
      for (const endpoint of source.endpoints.filter(e => e.adapter === 'statuspage')) {
        const kept = components(json(await this.read(endpoint.url)).components, source);
        expected += kept.length;
        const base = new URL(endpoint.url).origin;
        for (let i = 0; i < kept.length; i += 60) {
          const batch = kept.slice(i, i + 60);
          const codes = batch.map(c => encodeURIComponent(c.id)).join(',');
          const parsed = statuspageUptime(await this.read(`${base}/uptime_showcase?components=${codes}`), batch, base);
          if (source.id === 'minimax') for (const component of parsed) component.name = `${endpoint.key === 'minimax-cn' ? 'China' : 'Global'}: ${component.name}`;
          result.push(...parsed);
        }
      }
      if (!result.length) notes.push('This official status page does not publish uptime for the kept components.');
      else if (result.length < expected) notes.push(`Official uptime covers ${result.length} of ${expected} kept components.`);
    } else if (source.uptime === 'incident.io') {
      const proxy = `${source.officialUrl}/proxy/${new URL(source.officialUrl).host}`;
      const summary = json(await this.read(proxy)).summary;
      const now = this.now();
      const url = `${proxy}/component_impacts?start_at=${new Date(now - 90 * DAY).toISOString()}&end_at=${new Date(now).toISOString()}`;
      result = incidentUptime(await this.read(url), summary, source, now);
      notes.push('The source publishes no 30-day percentage. Daily buckets use UTC; dates before data availability are unknown.');
      if (result.every(c => c.pct90 == null)) notes.push('The source provides impact history but publishes no uptime percentages.');
      else if (result.some(c => c.pct90 == null)) notes.push('Some kept components have no published uptime percentage.');
    } else if (source.uptime === 'datadog') {
      result = datadogUptime(await this.read(`${source.officialUrl}/config.json`), this.now());
      notes.push('Datadog: official page daily-notice logic in UTC. Displayed 30/90-day percentages use the page formula (partial/major intervals only), rounded to two decimals; periods are capped by page coverage. Pre-coverage dates are unknown.');
    } else if (source.uptime === 'betterstack') {
      result = betterstackUptime(await this.read(`${source.officialUrl}/index.json`));
      notes.push('Better Stack: published 90-day availability and daily status history.');
    } else if (source.uptime === 'instatus') {
      const parsed = instatusUptime(await this.read(source.officialUrl));
      result = parsed.components;
      notes.push(`Instatus: published ${parsed.period}-day uptime from server-rendered JSON; no other percentage period is inferred.`);
    } else if (source.uptime === 'gcp') {
      result = gcpUptime(await this.read(new URL('incidents.json', source.officialUrl).href), this.now());
      notes.push('Google Cloud official incident history: 90 UTC dates ending today, all Gemini products merged under Vertex Gemini API. Dates without a Gemini incident are operational because this is Google Cloud\'s official incident history. Downtime minutes come from incident begin/end times for SERVICE_OUTAGE and SERVICE_DISRUPTION; overlapping intervals are unioned and clipped to each day and now. SERVICE_INFORMATION affects day levels only. No uptime percentages are published.');
    } else if (source.uptime === 'flashduty') {
      const now = this.now(), base = `${source.officialUrl}/api/status-page/6410630422455/summary`;
      const active = await this.read(`${base}/active`);
      const structure = await this.read(`${base}/structure?start_at_from_seconds=${Math.floor((now - 90 * DAY) / 1000)}&start_at_to_seconds=${Math.floor(now / 1000)}`);
      result = flashdutyUptime(structure, active, now);
      notes.push('FlashDuty: copies published component/section uptime for the requested 90-day range; daily impact intervals use UTC.');
    } else if (source.uptime === 'alibaba') {
      const url = `https://status.alibabacloud.com/api/status/listProductStatusInPeriodInternational?regionId=non-regional&endTime=${this.now()}&numOfDay=${QWEN_HISTORY_DAYS}`;
      result = alibabaUptime(await this.read(url));
      notes.push(`Alibaba Cloud Model Studio (sfm): daily product status only; no percentage is published. Requests ${QWEN_HISTORY_DAYS} days, retaining at most 90.`);
    } else {
      notes.push(source.kind === 'incident-feed' ? 'This adapter reads incident-feed data, not published uptime percentages. The count includes only incidents retained in that feed, started within the last 90 days.' : source.note ?? 'This official source does not publish supported uptime data.');
    }
    const data: CompanyUptime = {
      companyId: source.id, source: result.length ? source.uptime === 'incident.io' ? 'incident.io' : 'statuspage' : 'none', components: result,
      fetchedAt: new Date(this.now()).toISOString(),
      ...(result.length ? { primary: (result.find(c => source.primaryComponent?.test(c.name)) ?? result[0]).name } : {}),
      ...(notes.length ? { note: notes.join(' ') } : {}),
    };
    if (source.kind === 'incident-feed' && !source.uptime) {
      const ids = new Set<string>(), now = this.now();
      for (const endpoint of source.endpoints) {
        const body = await this.read(endpoint.url);
        const incidents = rssIncidents(body);
        for (const incident of incidents) if (Date.parse(incident.startedAt) >= now - 90 * DAY && Date.parse(incident.startedAt) <= now) ids.add(incident.id);
      }
      data.feedIncidents90d = ids.size;
    }
    return data;
  }
}
