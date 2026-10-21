import type { Incident, Level } from '../../../shared/types.js';
import type { Source } from '../registry.js';
import { keptComponents } from '../components.js';
import { componentLevels, empty, impactLevels, iso, json, list, mapped, splitIncidents, text, worst, type Normalized } from './common.js';

// Instatus words (page status and incident impact)
const COMPACT_PAGE = { up: 'operational', operational: 'operational', hasissues: 'degraded', degraded: 'degraded', degradedperformance: 'degraded',
  partialoutage: 'partial', onemajoroutage: 'major', manymajoroutages: 'major', majoroutage: 'major', down: 'major',
  undermaintenance: 'maintenance', maintenance: 'maintenance' } as const;
const COMPACT_IMPACT = { degradedperformance: 'degraded', partialoutage: 'partial', majoroutage: 'major', undermaintenance: 'maintenance', operational: 'operational' } as const;

function incident(raw: any, source: Source): Incident {
  if (raw.id == null || !text(raw.name) || !raw.status) throw new Error('Missing Statuspage incident identity or status');
  const updates = list(raw.incident_updates).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const status = String(raw.status);
  const startedAt = iso(raw.started_at ?? raw.created_at);
  const updatedAt = iso(raw.updated_at ?? updates[0]?.created_at ?? startedAt);
  return { id: String(raw.id), title: text(raw.name), level: mapped(raw.impact ?? (status === 'in_progress' ? 'maintenance' : undefined), impactLevels, 'incident impact'), status,
    startedAt, updatedAt, ...(/^(resolved|completed)$/i.test(status) ? { resolvedAt: iso(raw.resolved_at ?? updatedAt) } : {}),
    url: raw.shortlink ?? `${source.officialUrl}/incidents/${encodeURIComponent(raw.id)}`,
    ...(updates[0]?.body ? { latestUpdate: text(updates[0].body).slice(0, 280) } : {}) };
}
export function statuspage(body: string, source: Source, now: number, incidentsOnly = false): Normalized {
  const data = json(body);
  // Instatus (Gamma, Zed, Synteq) publishes a smaller response on the same path: a page status word plus the
  // active incidents and maintenances. Words we don't know carry no level; the incidents still count.
  if (data.page?.status) {
    const result = empty();
    const word = String(data.page.status).toLowerCase();
    const pageLevel = (COMPACT_PAGE as Record<string, Level | undefined>)[word];
    const incidents: Incident[] = list(data.activeIncidents).filter(i => i?.id && text(i.name)).map(i => ({
      id: String(i.id), title: text(i.name), level: (COMPACT_IMPACT as Record<string, Level | undefined>)[String(i.impact).toLowerCase()] ?? 'degraded',
      status: String(i.status || '').toLowerCase(), startedAt: iso(i.started ?? i.updatedAt), updatedAt: iso(i.updatedAt ?? i.started),
      ...(i.url ? { url: String(i.url) } : {}),
    }));
    const active = list(data.activeMaintenances).filter(m => /^(inprogress|in_progress)$/i.test(m.status));
    const levels: Level[] = [...(pageLevel ? [pageLevel] : []), ...incidents.map(i => i.level), ...(active.length ? ['maintenance' as const] : [])];
    if (!levels.length) throw new Error(`Unrecognized Instatus page status: ${text(data.page.status).slice(0, 40)}`);
    result.level = worst(levels);
    result.openIncidents = incidents;
    result.summary = ''; // only the page's own words get quoted; this format has none beyond the incidents
    return result;
  }
  if (incidentsOnly ? !Array.isArray(data.incidents) : !data.page || !data.status || !Array.isArray(data.components)) throw new Error('Invalid Statuspage response schema');
  const all = list(data.components);
  const kept = keptComponents(all, source);
  const scoped = Boolean(source.filter && (source.filter !== 'v0' || kept !== all));
  if (scoped && !incidentsOnly && !kept.length) throw new Error('Required company component missing from official status page');
  const relevant = (i: any) => !scoped || list(i.components).some(c => kept.some(k => String(k.id) === String(c.id ?? c))) || (source.filter === 'copilot' ? /copilot/i : source.filter === 'v0' ? /\bv0\b/i : /kimi|open api|api service/i).test(i.name);
  const rawIncidents = list(data.incidents).filter(relevant);
  const maintenance = list(data.scheduled_maintenances).filter(m => m.status === 'in_progress' && relevant(m));
  const incidents = [...rawIncidents.map(i => incident(i, source)), ...maintenance.map(i => ({ ...incident(i, source), level: 'maintenance' as const }))];
  const components = kept.map(c => ({ name: String(c.name), level: mapped(c.status, componentLevels, 'component status') }));
  const split = splitIncidents(incidents, now);
  // Scoped companies take their level only from the requested components. A
  // five-minute incident supplement must not override the fresh live summary.
  const level = worst([...(incidentsOnly || scoped ? [] : [mapped(data.status.indicator, impactLevels, 'status indicator')]), ...components.map(c => c.level), ...(incidentsOnly || scoped ? [] : split.openIncidents.map(i => i.level))]);
  return { ...split, components, level, summary: scoped ? components.map(c => `${c.name}: ${c.level}`).join('; ') : text(data.status?.description) };
}
