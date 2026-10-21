import type { Company, ServerMessage, Snapshot, WeatherEvent } from '../../shared/types.js';
import type { Source } from './registry.js';
import { diffCompany, EventBuffer } from './events.js';
export const STALE_MS = 5 * 60_000;
export const NEVER_FETCHED = '1970-01-01T00:00:00.000Z';
export function initialCompany(source: Source): Company {
  return { id: source.id, name: source.name, category: source.category, officialUrl: source.officialUrl,
    sourceUrl: source.endpoints[0]?.url, sourceKind: source.kind,
    level: source.kind === 'none' ? 'no-page' : 'unknown', summary: source.note ?? (source.kind === 'none' ? 'No readable official status source found' : 'Awaiting first successful read'),
    components: [], openIncidents: [], recentIncidents: [], fetchedAt: NEVER_FETCHED, stale: source.kind !== 'none',
    ...(source.kind === 'none' ? {} : { error: 'Awaiting first successful read' }) };
}
/** A brief failure on our side keeps the last good reading (its time still shows); only a long one turns the company grey. */
export const HOLD_MS = 10 * 60_000;
export function failedCompany(previous: Company, reason: string, now = Date.now()): Company {
  const age = now - Date.parse(previous.fetchedAt);
  if (previous.level !== 'unknown' && previous.level !== 'no-page' && age <= HOLD_MS) return { ...previous, error: reason, stale: age > STALE_MS };
  return { ...previous, level: 'unknown', error: reason, summary: reason, stale: age > STALE_MS };
}
export class State {
  private companies = new Map<string, Company>();
  private healthy = new Map<string, Company>();
  readonly events = new EventBuffer();
  constructor(sources: Source[], readonly demo: boolean, private broadcast: (message: ServerMessage) => void = () => {}) {
    for (const source of sources) this.companies.set(source.id, initialCompany(source));
  }
  get(id: string) { return this.companies.get(id)!; }
  apply(next: Company, now = Date.now()) {
    const previous = this.companies.get(next.id);
    const baseline = this.healthy.get(next.id);
    const good = !next.error && !next.stale && next.level !== 'unknown' && next.level !== 'no-page';
    let events: WeatherEvent[] = [];
    if (good) {
      next.recentIncidents = [...new Map([...(previous?.recentIncidents ?? []), ...next.recentIncidents].map(i => [i.id, i])).values()].filter(i => !next.openIncidents.some(open => open.id === i.id));
      // Compare incidents to the last healthy read even if intervening polls failed.
      events = diffCompany(baseline, next, new Date(now).toISOString());
      if (baseline && previous && previous.level !== baseline.level) {
        events = events.filter(e => e.type !== 'level_changed');
        events.unshift(...diffCompany({ ...baseline, level: previous.level }, next, new Date(now).toISOString()).filter(e => e.type === 'level_changed'));
      }
      for (const event of events) if (event.type === 'incident_resolved' && event.incident && !next.recentIncidents.some(i => i.id === event.incident!.id)) next.recentIncidents.push(event.incident);
      this.healthy.set(next.id, next);
    } else if (baseline && previous) {
      events = diffCompany(previous, next, new Date(now).toISOString());
    }
    next.recentIncidents = next.recentIncidents.filter(i => i.resolvedAt && now - Date.parse(i.resolvedAt) <= 86_400_000).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.companies.set(next.id, next);
    this.events.add(events);
    for (const event of events) this.broadcast({ t: 'event', data: event, company: next });
    // Refresh fetchedAt silently; publish only meaningful company changes.
    const signature = (c: Company | undefined) => JSON.stringify(c && { ...c, fetchedAt: '' });
    if (!events.length && signature(previous) !== signature(next)) this.broadcast({ t: 'company', data: next });
  }
  expire(now = Date.now()) {
    for (const company of this.companies.values()) {
      if (company.sourceKind === 'none' || company.level === 'unknown') continue;
      const age = now - Date.parse(company.fetchedAt);
      // stale after 5 minutes without a good read; grey once the held reading is older than HOLD_MS
      if ((!company.stale && age > STALE_MS) || age > HOLD_MS)
        this.apply(failedCompany(company, company.error ?? 'Source stale: no successful read for over 5 minutes', now), now);
    }
  }
  snapshot(): Snapshot { return { serverTime: new Date().toISOString(), demo: this.demo, companies: [...this.companies.values()], events: this.events.all() }; }
}
