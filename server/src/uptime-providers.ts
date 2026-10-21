import type { ComponentUptime, Level, UptimeDay } from '../../shared/types.js';
import { json, mapped, text, worst } from './adapters/common.js';

const DAY = 86_400_000;
export function publishedPercentage(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Invalid published uptime percentage');
  return n;
}
function at(value: unknown): number {
  const n = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(n)) throw new Error('Invalid uptime timestamp');
  return n;
}
function dayDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(at(value)).toISOString().slice(0, 10) !== value) throw new Error('Invalid uptime day');
  return value;
}
const historyLevels: Record<string, Level> = {
  operational: 'operational', degraded: 'degraded', downtime: 'major', partial_outage: 'partial', maintenance: 'maintenance', unavailable: 'major', unknown: 'unknown', not_monitored: 'unknown', recovered: 'major',
};
export function betterstackUptime(body: string): ComponentUptime[] {
  const data = json(body);
  if (data.data?.type !== 'status_page' || !Array.isArray(data.included) || !Array.isArray(data.data.relationships?.resources?.data)) throw new Error('Invalid Better Stack uptime schema');
  const included = new Map(data.included.filter((r: any) => r.type === 'status_page_resource').map((r: any) => [r.id, r.attributes]));
  return data.data.relationships.resources.data.map((ref: any) => {
    const r: any = included.get(ref.id);
    if (!r || !text(r.public_name) || !Array.isArray(r.status_history)) throw new Error('Missing Better Stack uptime resource');
    if (r.availability != null && (typeof r.availability !== 'number' || r.availability < 0 || r.availability > 1)) throw new Error('Invalid Better Stack availability');
    const days = r.status_history.map((d: any): UptimeDay => {
      if (typeof d.downtime_duration !== 'number' || !Number.isFinite(d.downtime_duration) || d.downtime_duration < 0) throw new Error('Invalid Better Stack downtime duration');
      return { date: dayDate(d.day), level: mapped(d.status, historyLevels, 'Better Stack history'), ...(d.status === 'not_monitored' || d.status === 'unknown' ? {} : { downMinutes: d.downtime_duration / 60 }), events: [] };
    }).sort((a: UptimeDay, b: UptimeDay) => a.date.localeCompare(b.date)).slice(-90);
    // availability is the published ratio, not a percentage reconstructed from bars.
    // Better Stack displays three decimal places, truncating rather than rounding.
    return { name: text(r.public_name), ...(r.availability == null ? {} : { pct90: publishedPercentage(Math.floor(r.availability * 100_000 + 1e-8) / 1000) }), days };
  });
}

interface Impact { start: number; end: number; level: Level; event?: UptimeDay['events'][number] }
function intervalDays(first: number, last: number, available: number | undefined, impacts: Impact[]): UptimeDay[] {
  const start = Math.max(Math.floor(first / DAY) * DAY, Math.floor(last / DAY) * DAY - 89 * DAY);
  const days: UptimeDay[] = [];
  for (let d = start; d <= last; d += DAY) {
    const ranges: [number, number][] = [];
    const day: UptimeDay = { date: new Date(d).toISOString().slice(0, 10), level: available == null || d + DAY <= available ? 'unknown' : 'operational', events: [] };
    for (const i of impacts) {
      const from = Math.max(d, first, i.start), to = Math.min(d + DAY, last, i.end);
      if (to <= from) continue;
      day.level = day.level === 'unknown' ? i.level : worst([day.level, i.level]);
      if (i.level === 'partial' || i.level === 'major') ranges.push([from, to]);
      if (i.event) day.events.push(i.event);
    }
    if (day.level !== 'unknown') {
      ranges.sort((a, b) => a[0] - b[0]); let end = -Infinity, total = 0;
      for (const [a, b] of ranges) { total += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); }
      day.downMinutes = total / 60_000;
    }
    day.events = [...new Map(day.events.map(e => [e.url ?? e.title, e])).values()];
    days.push(day);
  }
  return days;
}

// Decode JSON strings in Next's server-rendered Flight payload; never execute JS.
function instatusProps(body: string): any {
  let stream = '';
  for (const m of body.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    const chunk = json(m[1]);
    if (chunk[0] === 1 && typeof chunk[1] === 'string') stream += chunk[1];
  }
  function find(value: any): any {
    if (!value || typeof value !== 'object') return;
    if (value.componentsUptime && value.site) return value;
    for (const child of Object.values(value)) { const found = find(child); if (found) return found; }
  }
  for (const line of stream.split('\n')) {
    const payload = line.slice(line.indexOf(':') + 1);
    if (!/^[\[{]/.test(payload)) continue;
    const found = find(json(payload)); if (found) return found;
  }
  throw new Error('Missing Instatus server-rendered uptime data');
}
const instatusLevels: Record<string, Level> = { operational: 'operational', degradedperformance: 'degraded', partialoutage: 'partial', majoroutage: 'major', undermaintenance: 'maintenance' };
export function instatusUptime(body: string): { components: ComponentUptime[]; period: number } {
  const p = instatusProps(body), period = p.site.maxUptimeDays;
  if (!Array.isArray(p.site.components) || !Number.isInteger(period) || period <= 0) throw new Error('Invalid Instatus uptime schema');
  const first = at(p.startDate), last = at(p.endDate), language = p.language ?? 'en';
  const name = (v: any) => text(typeof v === 'string' ? v : v?.[language] ?? v?.default);
  const all: any[] = [];
  function visit(rows: any[]) { for (const c of rows) { all.push(c); if (Array.isArray(c.children)) visit(c.children); } }
  visit(p.site.components);
  const components = [...new Map(all.map(c => [c.id, c])).values()].filter(c => c.showUptime && !c.archivedAt && p.componentsUptime[c.id]).sort((a, b) => a.order - b.order).map(c => {
    const u = p.componentsUptime[c.id];
    if (!name(c.name) || !Array.isArray(u.outages)) throw new Error('Invalid Instatus component uptime');
    const impacts: Impact[] = u.outages.map((o: any) => {
      const notice = p.notices?.[o.noticeId];
      return { start: at(o.from), end: o.to == null ? last : at(o.to), level: mapped(o.status, instatusLevels, 'Instatus history'), ...(notice && name(notice.name) ? { event: { title: name(notice.name).slice(0, 280) } } : {}) };
    });
    return { name: name(c.name), ...(period === 90 ? { pct90: publishedPercentage(u.uptime) } : period === 30 ? { pct30: publishedPercentage(u.uptime) } : {}), days: intervalDays(first, last, c.startDate == null ? first : at(c.startDate), impacts) };
  });
  if (!components.length) throw new Error('No published Instatus component uptime');
  return { components, period };
}

const flashLevels: Record<string, Level> = { operational: 'operational', degraded: 'degraded', partial_outage: 'partial', full_outage: 'major', maintenance: 'maintenance', under_maintenance: 'maintenance' };
export function flashdutyUptime(body: string, activeBody: string, now: number): ComponentUptime[] {
  const d = json(body).data, page = json(activeBody).data?.page;
  if (!Array.isArray(page?.components) || !Array.isArray(page.sections) || !Array.isArray(d?.component_uptimes) || !Array.isArray(d.section_uptimes) || !Array.isArray(d.component_impacts) || !Array.isArray(d.section_impacts) || !Array.isArray(d.linked_changes)) throw new Error('Invalid FlashDuty uptime schema');
  function seconds(v: any): number { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error('Invalid FlashDuty timestamp'); return v * 1000; }
  const hidden = new Set(page.sections.filter((s: any) => s.hide_all).map((s: any) => s.section_id));
  const groups = [
    ...page.components.filter((c: any) => !hidden.has(c.section_id)).map((c: any) => ({ id: c.component_id, name: c.name, available: c.available_since_seconds, uptimes: d.component_uptimes, impacts: d.component_impacts, field: 'component_id' })),
    ...page.sections.filter((s: any) => !s.hide_all && !s.hide_uptime).map((s: any) => ({ id: s.section_id, name: s.name, available: s.available_since_seconds, uptimes: d.section_uptimes, impacts: d.section_impacts, field: 'section_id' })),
  ];
  return groups.map(g => {
    const u = g.uptimes.find((u: any) => u[g.field] === g.id);
    if (!text(g.name) || !u) throw new Error('Missing FlashDuty published component uptime');
    const available = u.available_since_seconds ?? g.available;
    const impacts = g.impacts.filter((i: any) => i[g.field] === g.id).map((i: any): Impact => {
      const link = d.linked_changes.find((c: any) => c.id === i.change_id);
      return { start: seconds(i.start_at_seconds), end: i.end_at_seconds ? seconds(i.end_at_seconds) : now, level: mapped(i.status, flashLevels, 'FlashDuty history'), ...(link && text(link.title) ? { event: { title: text(link.title).slice(0, 280) } } : {}) };
    });
    return { name: text(g.name), pct90: publishedPercentage(u.uptime), days: intervalDays(now - 90 * DAY, now, available == null ? undefined : seconds(available), impacts) };
  });
}

// The endpoint accepts 1,000 dates; 10,000 timed out. The contract retains 90.
export const QWEN_HISTORY_DAYS = 1000;
export function alibabaUptime(body: string): ComponentUptime[] {
  const d = json(body);
  if (d.success !== true || !Array.isArray(d.data) || !d.data.length) throw new Error('Invalid Alibaba daily history schema');
  const days: UptimeDay[] = d.data.map((row: any) => {
    if (typeof row.date !== 'number' || !Number.isFinite(row.date) || !row.productStatusDetail?.productStatus || !row.productStatusDetail.eventDetails) throw new Error('Invalid Alibaba daily product status');
    // Product sfm is Model Studio / 百炼 in the official non-regional catalogue.
    const impacts = row.productStatusDetail.productStatus.sfm ?? [];
    if (!Array.isArray(impacts)) throw new Error('Invalid Model Studio daily impacts');
    const levels = impacts.map((i: any) => mapped(i.impactLevel, { normal: 'operational', alarm: 'partial', maintenance: 'maintenance', outage: 'major', degraded: 'degraded' }, 'Alibaba daily impact'));
    const events = impacts.map((i: any) => row.productStatusDetail.eventDetails[i.eventId]).filter(Boolean).map((e: any) => ({ title: text(e.title).slice(0, 280), url: `https://status.alibabacloud.com/#/history?historyId=${encodeURIComponent(e.id)}` }));
    // Label the source's daily timestamps in UTC; the endpoint preserves
    // the requested endTime's clock portion. No percentages are published.
    return { date: new Date(row.date).toISOString().slice(0, 10), level: worst(levels), events };
  }).sort((a: UptimeDay, b: UptimeDay) => a.date.localeCompare(b.date)).slice(-90);
  return [{ name: 'Alibaba Cloud Model Studio', days }];
}
