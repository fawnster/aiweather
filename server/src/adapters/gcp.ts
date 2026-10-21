import type { Incident, Level } from '../../../shared/types.js';
import { iso, json, mapped, text, worst, type Normalized } from './common.js';

export const GCP_PRIMARY = 'Vertex Gemini API';
const levels: Record<string, Level> = { service_outage: 'major', service_disruption: 'partial', service_information: 'degraded' };
// Google writes its updates in Markdown ("# Incident Report ## Summary ..."): shown as plain sentences
const plain = (md: unknown) => String(md ?? '').replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, '').replace(/^[ \t]*[-+][ \t]+/gm, '');

// Match affected product titles, not a multi-product incident's prose or service_name.
// The API product name is verified in Google's feed; other Gemini parts come from it.
export function gcpIncidents(body: string): { incident: Incident; products: string[] }[] {
  const data = json(body);
  if (!Array.isArray(data)) throw new Error('Invalid Google Cloud incident list');
  return data.flatMap(raw => {
    if (!Array.isArray(raw?.affected_products) || raw.affected_products.some((p: any) => typeof p?.title !== 'string' || !p.title.trim()))
      throw new Error('Invalid Google Cloud affected products');
    const products = [...new Set<string>(raw.affected_products.filter((p: any) => /gemini/i.test(p.title)).map((p: any) => text(p.title)))];
    if (!products.length) return [];
    const title = typeof raw.external_desc === 'string' ? text(raw.external_desc.trim().split(/\r?\n/)[0]) : '';
    if (typeof raw.id !== 'string' || !raw.id || !title || typeof raw.uri !== 'string' || !/^incidents\/[^/?#]+$/.test(raw.uri))
      throw new Error('Invalid Google Cloud incident identity');
    const startedAt = iso(raw.begin), resolvedAt = raw.end == null ? undefined : iso(raw.end);
    if (resolvedAt && Date.parse(resolvedAt) < Date.parse(startedAt)) throw new Error('Invalid Google Cloud incident interval');
    const latest = raw.most_recent_update;
    const update = text(plain(latest?.text));
    const incident: Incident = {
      id: raw.id, title, level: mapped(raw.status_impact, levels, 'Google Cloud impact'),
      status: resolvedAt ? 'resolved' : 'ongoing', // Google's own field holds impact codes (SERVICE_OUTAGE), not words for people
      startedAt, updatedAt: iso(raw.modified ?? latest?.modified ?? latest?.when ?? raw.created ?? startedAt),
      ...(resolvedAt ? { resolvedAt } : {}), url: `https://status.cloud.google.com/${raw.uri}`,
      ...(update ? { latestUpdate: update.slice(0, 280) } : {}),
    };
    return [{ incident, products }];
  });
}

export function gcp(body: string, now: number): Normalized {
  const rows = gcpIncidents(body);
  const open = rows.filter(({ incident: i }) => !i.resolvedAt || Date.parse(i.resolvedAt) > now);
  const recentIncidents = rows.map(r => r.incident).filter(i => i.resolvedAt && Date.parse(i.resolvedAt) <= now && now - Date.parse(i.resolvedAt) <= 86_400_000)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const names = [...new Set([GCP_PRIMARY, ...rows.flatMap(r => r.products)])];
  const components = names.map(name => ({ name, level: worst(open.filter(r => r.products.includes(name)).map(r => r.incident.level)) }));
  const openIncidents = open.map(r => r.incident), level = worst(openIncidents.map(i => i.level));
  const active = openIncidents.find(i => i.level === level);
  return { level, components, openIncidents, recentIncidents, summary: active?.latestUpdate || active?.title || 'No open Gemini incidents in Google Cloud official history' };
}
