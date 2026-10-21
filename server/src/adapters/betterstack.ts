import type { Component, Incident, Level } from '../../../shared/types.js';
import { iso, json, list, mapped, splitIncidents, text, worst, type Normalized } from './common.js';
const levels: Record<string, Level> = { operational: 'operational', degraded: 'degraded', downtime: 'major', partial_outage: 'partial', maintenance: 'maintenance', resolved: 'operational', unavailable: 'major' };
export function betterstack(body: string, officialUrl: string, now: number): Normalized {
  const data = json(body);
  if (data.data?.type !== 'status_page' || !Array.isArray(data.included)) throw new Error('Invalid Better Stack response schema');
  const included = data.included;
  const components: Component[] = included.filter((i: any) => i.type === 'status_page_resource').map((i: any) => ({ name: String(i.attributes.public_name), level: mapped(i.attributes.status, levels, 'Better Stack resource status') }));
  const incidents: Incident[] = included.filter((i: any) => i.type === 'status_report').map((i: any) => {
    const a = i.attributes;
    const updateIds = new Set(list(i.relationships?.status_updates?.data).map(u => String(u.id)));
    const updates = included.filter((u: any) => u.type === 'status_update' && updateIds.has(String(u.id))).map((u: any) => u.attributes).sort((a: any, b: any) => String(b.published_at).localeCompare(String(a.published_at)));
    const status = String(a.aggregate_state);
    const updatedAt = iso(updates[0]?.published_at ?? a.starts_at);
    const closed = status === 'resolved';
    // Closed reports often replace affected resource impact with 'resolved'; retain the published impact from updates.
    const resources = closed ? [...list(a.affected_resources), ...updates.flatMap((u: any) => list(u.affected_resources))] : list(a.affected_resources).length ? list(a.affected_resources) : list(updates[0]?.affected_resources);
    const impacts = resources.map(r => mapped(r.status, levels, 'Better Stack incident impact'));
    const level = a.report_type === 'maintenance' ? 'maintenance' : worst([...impacts, mapped(status, levels, 'Better Stack report state')]);
    return { id: String(i.id), title: text(a.title), level, status, startedAt: iso(a.starts_at), updatedAt,
      ...(closed ? { resolvedAt: iso(a.ends_at ?? updatedAt) } : {}), url: `${officialUrl}/incident/${encodeURIComponent(i.id)}`,
      ...(updates[0] ? { latestUpdate: text(updates[0].message).slice(0, 280) } : {}) };
  }).filter((i: Incident) => Date.parse(i.startedAt) <= now);
  const split = splitIncidents(incidents, now);
  const aggregate = mapped(data.data.attributes.aggregate_state, levels, 'Better Stack aggregate state');
  return { ...split, components, level: worst([aggregate, ...components.map(c => c.level), ...split.openIncidents.map(i => i.level)]), summary: data.data.attributes.announcement ? text(data.data.attributes.announcement) : `${data.data.attributes.company_name}: ${data.data.attributes.aggregate_state}` };
}
