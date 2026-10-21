import { createHash } from 'node:crypto';
import type { Company, Incident, WeatherEvent } from '../../shared/types.js';

const resolved = (i: Incident) => Boolean(i.resolvedAt) || /^(resolved|completed|closed)$/i.test(i.status);
export function diffCompany(previous: Company | undefined, next: Company, at = new Date().toISOString()): WeatherEvent[] {
  if (!previous) return []; // A successful first read seeds the baseline silently.
  const events: WeatherEvent[] = [];
  const emit = (type: WeatherEvent['type'], incident?: Incident) => {
    const revision = incident?.updatedAt ?? next.fetchedAt;
    const key = `${next.id}|${incident?.id ?? `${previous.level}>${next.level}`}|${type}|${revision}`;
    events.push({ id: createHash('sha256').update(key).digest('hex').slice(0, 32), type, companyId: next.id, at,
      ...(incident ? { incident } : { from: previous.level, to: next.level }) });
  };
  if (previous.level !== next.level) emit('level_changed');
  if (next.level === 'unknown' || next.level === 'no-page' || next.error || next.stale) return events;
  const old = new Map(previous.openIncidents.map(i => [i.id, i]));
  const current = new Map(next.openIncidents.map(i => [i.id, i]));
  for (const incident of next.openIncidents) {
    const before = old.get(incident.id);
    if (!before) emit('incident_opened', incident);
    else if (incident.updatedAt !== before.updatedAt || incident.status !== before.status) emit('incident_updated', incident);
  }
  for (const before of old.values()) {
    const currentIncident = current.get(before.id);
    const closed = next.recentIncidents.find(i => i.id === before.id && resolved(i));
    if (closed || !currentIncident || resolved(currentIncident)) {
      emit('incident_resolved', closed ?? (currentIncident && resolved(currentIncident) ? currentIncident : { ...before, status: 'resolved', resolvedAt: at, updatedAt: at }));
    }
  }
  return events;
}

export class EventBuffer {
  private items: WeatherEvent[] = [];
  add(events: WeatherEvent[]) {
    const seen = new Set(this.items.map(e => e.id));
    for (const event of events) if (!seen.has(event.id)) { this.items.unshift(event); seen.add(event.id); }
    this.items.length = Math.min(this.items.length, 200);
  }
  all() { return [...this.items]; }
}
