import type { ComponentUptime, Level, UptimeDay } from '../../shared/types.js';
import { json } from './adapters/common.js';

// Port of the official Datadog status-page app, version 35.146178534:
// Pg (daily notices), wj (coverage), PG / wH / wF (displayed uptime).
// Provenance and executable upstream excerpts: fixtures/openrouter-uptime/.
// The page uses the viewer's calendar. This API deliberately uses UTC, as
// required by our uptime contract; it otherwise preserves the page's rules.
const DAY = 86_400_000;
const ranks = { operational: 0, maintenance: 1, degraded: 2, partial_outage: 3, major_outage: 4 };
type Status = keyof typeof ranks;
const levels: Record<Status, Level> = { operational: 'operational', maintenance: 'maintenance', degraded: 'degraded', partial_outage: 'partial', major_outage: 'major' };
interface Component { id: string; name: string; status: Status }
interface Update { time: number; deleted: boolean; affected: Component[] }
interface Notice { id: string; title: string; end: number; start?: number; timeline: Update[] }
const date = (time: number) => new Date(time).toISOString().slice(0, 10);
const valid = (value: unknown): number => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return new Date(time).getUTCFullYear() > 1 ? time : NaN;
};
const timestamp = (u: any) => Number.isFinite(valid(u.startedAt)) ? valid(u.startedAt) : Date.parse(u.createdAt);
const array = (value: unknown): any[] => {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('Invalid Datadog uptime list');
  return value;
};
function component(c: any): Component {
  if (!c || typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name || !Object.hasOwn(ranks, c.status)) throw new Error('Invalid Datadog uptime component/status');
  return { id: c.id, name: c.name, status: c.status };
}

// Pg records the worst of the carried state and all updates on a calendar day,
// then carries only that day's LAST state forward. Omitted components recover.
function daily(notice: Notice, days: string[], add: (id: string, day: string, status: Status) => void) {
  const timeline = notice.timeline.filter(u => Number.isFinite(u.time)).sort((a, b) => a.time - b.time);
  if (!timeline.length) return;
  const first = date(notice.start ?? timeline[0].time), last = date(notice.end);
  if (days.at(-1)! < first || days[0] > last) return;
  const worstByDay = new Map<string, Map<string, Status>>(), lastByDay = new Map<string, Map<string, Status>>();
  const seen = new Set<string>();
  for (const update of timeline) {
    if (update.deleted) continue;
    const day = date(update.time), worst = worstByDay.get(day) ?? new Map<string, Status>(), latest = lastByDay.get(day) ?? new Map<string, Status>();
    const affected = new Set(update.affected.map(c => c.id));
    const set = (id: string, status: Status) => { const old = worst.get(id); worst.set(id, old && ranks[old] > ranks[status] ? old : status); latest.set(id, status); };
    for (const id of seen) if (!affected.has(id)) set(id, 'operational');
    for (const c of update.affected) { seen.add(c.id); set(c.id, c.status); }
    worstByDay.set(day, worst); lastByDay.set(day, latest);
  }
  const carried = new Map<string, Status>();
  if (first < days[0]) {
    const seenBefore = new Set<string>();
    for (const update of timeline) {
      if (date(update.time) >= days[0]) break;
      if (update.deleted) continue;
      const affected = new Set(update.affected.map(c => c.id));
      for (const id of seenBefore) if (!affected.has(id)) carried.set(id, 'operational');
      for (const c of update.affected) { seenBefore.add(c.id); carried.set(c.id, c.status); }
    }
  }
  for (const day of days) {
    if (day < first || day > last) continue;
    for (const id of seen) {
      const before = carried.get(id), changed = worstByDay.get(day)?.get(id), latest = lastByDay.get(day)?.get(id);
      const status = changed ? before && ranks[before] > ranks[changed] ? before : changed : before;
      if (status) add(id, day, status);
      if (latest) carried.set(id, latest);
    }
  }
}

type Range = [number, number];
function union(ranges: Range[]): Range[] {
  const result: Range[] = [];
  for (const range of ranges.sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else result.push([...range]);
  }
  return result;
}
function percentage(id: string, incidents: Notice[], coverage: number | undefined, period: number, now: number): number {
  const age = coverage == null ? period : (now - coverage) / DAY;
  const days = age > 0 ? Math.min(period, age) : period;
  const from = new Date(now);
  // Preserve the page's setDate semantics even for a fractional coverage age.
  from.setUTCDate(from.getUTCDate() - days);
  const ranges: Range[] = [];
  for (const incident of incidents) {
    let start: number | undefined;
    for (const update of incident.timeline.filter(u => !u.deleted).sort((a, b) => a.time - b.time)) {
      const down = update.affected.some(c => c.id === id && (c.status === 'partial_outage' || c.status === 'major_outage'));
      if (down && start == null) start = update.time;
      else if (!down && start != null) { ranges.push([start, update.time]); start = undefined; }
    }
    if (start != null) ranges.push([start, now]);
  }
  const downtime = union(ranges).filter(([start, end]) => end >= +from && start <= now)
    .reduce((total, [start, end]) => total + Math.max(0, Math.min(end, now) - Math.max(start, +from)), 0);
  const duration = DAY * days;
  const value = !Number.isFinite(duration) || duration <= 0 ? 100 : 100 * Math.max(0, Math.min(1, (duration - downtime) / duration));
  return Number(value.toFixed(2)); // PV displays exactly two decimal places.
}

export function datadogUptime(body: string, now: number): ComponentUptime[] {
  const data = json(body);
  if (!Array.isArray(data.components) || !Array.isArray(data.incidents) || !['bars_only', 'bars_and_uptime_percentage'].includes(data.visualizationType)) throw new Error('Invalid Datadog uptime schema/visualization');
  const components: Component[] = data.components.flatMap((c: any) => c?.type === 'ComponentGroup' ? array(c.components).map(component) : [component(c)]);
  if (!components.length) throw new Error('No Datadog uptime components');
  let coverage = Number.isFinite(valid(data.created)) ? valid(data.created) : undefined;
  const parse = (row: any, maintenance: boolean): Notice => {
    if (!row || typeof row.id !== 'string' || !row.id || typeof row.title !== 'string') throw new Error('Invalid Datadog uptime notice');
    const timeline = array(row.timeline).map((u: any): Update => {
      if (!u || typeof u !== 'object') throw new Error('Invalid Datadog uptime update');
      const time = timestamp(u), deleted = typeof u.deletedAt === 'string';
      // wj includes deleted updates when establishing the page's coverage.
      if (Number.isFinite(time) && new Date(time).getUTCFullYear() > 1) coverage = Math.min(coverage ?? time, time);
      return { time, deleted, affected: deleted ? [] : array(u.componentsAffected).map(component) };
    });
    const resolved = maintenance ? row.currentStatus === 'completed' : row.resolved === true;
    const endValue = maintenance ? row.completedDate : row.resolvedDate;
    const end = resolved && endValue ? Date.parse(endValue) : now;
    if (!Number.isFinite(end)) throw new Error('Invalid Datadog uptime resolution');
    const start = maintenance ? Date.parse(row.startDate) : NaN;
    return { id: row.id, title: row.title, end, start: Number.isFinite(start) ? start : undefined, timeline };
  };
  const incidents: Notice[] = data.incidents.map((r: any) => parse(r, false));
  // Parse all maintenance for wj, including scheduled/canceled entries.
  const maintenanceRows = array(data.maintenances);
  const maintenances = maintenanceRows.map((r: any) => parse(r, true)).filter((_: Notice, i: number) => maintenanceRows[i].currentStatus !== 'scheduled')
    .map((n: Notice) => ({ ...n, timeline: n.timeline.filter(u => !u.deleted).map(u => ({ ...u, affected: u.affected.map(c => ({ ...c, status: 'maintenance' as const })) })) }));
  const today = Math.floor(now / DAY) * DAY;
  const dates = Array.from({ length: 90 }, (_, i) => date(today - (89 - i) * DAY));
  const history = new Map(components.map((c: Component) => [c.id, new Map<string, { status: Status; notice: Notice }[]>()]));
  for (const notice of [...incidents, ...maintenances]) daily(notice, dates, (id, day, status) => {
    const component = history.get(id);
    if (component) { const events = component.get(day) ?? []; events.push({ status, notice }); component.set(day, events); }
  });
  return components.map((c: Component) => ({
    name: c.name,
    ...(data.visualizationType === 'bars_and_uptime_percentage' ? { pct30: percentage(c.id, incidents, coverage, 30, now), pct90: percentage(c.id, incidents, coverage, 90, now) } : {}),
    days: dates.map((day): UptimeDay => {
      const events = (history.get(c.id)!.get(day) ?? []).sort((a, b) => ranks[b.status] - ranks[a.status]);
      const unavailable = coverage != null && day < date(coverage);
      return { date: day, level: unavailable ? 'unknown' : levels[events[0]?.status ?? 'operational'],
        events: unavailable ? [] : events.map(({ notice }) => ({ title: notice.title })) };
    }),
  }));
}
