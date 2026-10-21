import type { Component, Incident, Level } from '../../../shared/types.js';
import { iso, json, splitIncidents, text, worst, type Normalized } from './common.js';

// Values and maintenance lifecycle verified in the official status-page bundle.
const levels = new Map<string, Level>([
  ['operational', 'operational'], ['degraded', 'degraded'], ['partial_outage', 'partial'], ['major_outage', 'major'], ['maintenance', 'maintenance'],
]);
const incidentStatuses = new Set(['investigating', 'identified', 'monitoring', 'resolved']);
const maintenanceStatuses = new Set(['scheduled', 'in_progress', 'completed', 'canceled']);

function components(raw: unknown): Component[] {
  if (!Array.isArray(raw)) throw new Error('Invalid Datadog component list');
  return raw.flatMap(c => {
    if (!c || typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name.trim()) throw new Error('Invalid Datadog component identity');
    if (c.type === 'ComponentGroup') return components(c.components);
    if (c.type !== 'Component') throw new Error('Unrecognized Datadog component type');
    const level = levels.get(c.status);
    if (!level) throw new Error(`Unrecognized Datadog component status: ${text(c.status)}`);
    return [{ name: text(c.name), level }];
  });
}

function incident(raw: any, base: string, maintenance = false): Incident {
  if (typeof raw?.id !== 'string' || !raw.id || !text(raw.title)) throw new Error('Invalid Datadog incident identity');
  const status = raw.currentStatus;
  if (!(maintenance ? maintenanceStatuses : incidentStatuses).has(status)) throw new Error(`Unrecognized Datadog incident status: ${text(status)}`);
  if (raw.timeline != null && !Array.isArray(raw.timeline)) throw new Error('Invalid Datadog incident timeline');
  const timeline = (raw.timeline ?? []).filter((u: any) => u && !Object.hasOwn(u, 'deletedAt'))
    .sort((a: any, b: any) => iso(b.startedAt || b.createdAt).localeCompare(iso(a.startedAt || a.createdAt)));
  const latest = timeline[0];
  const startedAt = iso(maintenance ? raw.startDate : raw.publishedDate);
  const updatedAt = iso(raw.lastModifiedAt || latest?.lastModifiedAt || latest?.createdAt || raw.publishedDate || startedAt);
  const closed = raw.resolved === true || status === 'resolved';
  // Only the current affected-component snapshot determines an open incident's
  // impact. Resolved incidents retain their published historical severity.
  const affected = closed ? [raw.componentsAffected ?? [], ...timeline.map((u: any) => u.componentsAffected ?? [])].flat()
    : raw.componentsAffected?.length ? raw.componentsAffected : latest?.componentsAffected ?? [];
  const impacts = maintenance ? [] : components(affected).map(c => c.level);
  const level: Level = maintenance ? 'maintenance' : impacts.length ? worst(impacts) : 'unknown';
  const update = text(maintenance ? raw.inProgressDescription : latest?.description || raw.description);
  return {
    id: raw.id, title: text(raw.title), level, status, startedAt, updatedAt,
    ...(closed ? { resolvedAt: iso(raw.resolvedDate || updatedAt) } : {}),
    url: `${base}/${maintenance ? 'maintenances/' : ''}${encodeURIComponent(raw.id)}`,
    ...(update ? { latestUpdate: update.slice(0, 280) } : {}),
  };
}

export function datadog(body: string, officialUrl: string, now: number): Normalized {
  const data = json(body);
  if (!data || !Array.isArray(data.components) || !Array.isArray(data.incidents) || (data.maintenances != null && !Array.isArray(data.maintenances))) throw new Error('Invalid Datadog status-page schema');
  const current = components(data.components);
  if (!current.length) throw new Error('Missing Datadog current components');
  const maintenance = (data.maintenances ?? []).filter((m: any) => {
    if (!maintenanceStatuses.has(m?.currentStatus)) throw new Error('Unrecognized Datadog maintenance status');
    return m.currentStatus === 'in_progress';
  });
  const incidents = [...data.incidents.map((i: any) => incident(i, officialUrl)), ...maintenance.map((m: any) => incident(m, officialUrl, true))];
  const split = splitIncidents(incidents, now);
  // an open incident that names no affected part carries no severity: the components still tell us the level
  const level = worst([...current.map(c => c.level), ...split.openIncidents.map(i => i.level).filter(l => l !== 'unknown')]);
  const active = split.openIncidents.find(i => i.level === level) ?? split.openIncidents[0];
  return { ...split, components: current, level, summary: active?.latestUpdate || active?.title || '' };
}
