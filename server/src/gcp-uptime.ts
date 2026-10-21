import type { ComponentUptime, UptimeDay } from '../../shared/types.js';
import { worst } from './adapters/common.js';
import { gcpIncidents, GCP_PRIMARY } from './adapters/gcp.js';

const DAY = 86_400_000;

// One headline series merges all Gemini products. Google publishes incident
// history, so dates without an incident are operational; no percentage is given.
export function gcpUptime(body: string, now: number): ComponentUptime[] {
  const incidents = gcpIncidents(body).map(r => r.incident);
  const first = Math.floor(now / DAY) * DAY - 89 * DAY;
  const days: UptimeDay[] = Array.from({ length: 90 }, (_, index) => {
    const dayStart = first + index * DAY, dayEnd = Math.min(dayStart + DAY, now);
    const day: UptimeDay = { date: new Date(dayStart).toISOString().slice(0, 10), level: 'operational', downMinutes: 0, events: [] };
    const ranges: [number, number][] = [];
    for (const incident of incidents) {
      const start = Math.max(dayStart, Date.parse(incident.startedAt));
      const end = Math.min(dayEnd, incident.resolvedAt ? Date.parse(incident.resolvedAt) : now);
      if (end <= start) continue;
      day.level = worst([day.level, incident.level]);
      // Keep the source interval alongside the existing event title/link fields.
      const event = { title: incident.title, url: incident.url, startedAt: incident.startedAt, ...(incident.resolvedAt ? { resolvedAt: incident.resolvedAt } : {}) };
      day.events.push(event);
      if (incident.level === 'partial' || incident.level === 'major') ranges.push([start, end]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let total = 0, end = -Infinity;
    for (const [start, stop] of ranges) { total += Math.max(0, stop - Math.max(start, end)); end = Math.max(end, stop); }
    day.downMinutes = total / 60_000;
    return day;
  });
  return [{ name: GCP_PRIMARY, days }];
}
