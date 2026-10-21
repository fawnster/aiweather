import type { Incident } from '../../../shared/types.js';
import { empty, iso, json, list, mapped, splitIncidents, text, worst, type Normalized } from './common.js';
const relevant = (i: any) => /Model Studio|Bailian|Qwen|百炼/i.test(`${i.title} ${JSON.stringify(i.products)}`);
function event(i: any, impact?: string): Incident {
  const closed = Boolean(i.endTime) && /Recovered/i.test(i.title);
  const status = closed ? 'resolved' : String(i.eventType);
  const level = mapped(impact ?? i.eventType, { alarm: 'partial', normal: 'operational', maintenance: 'maintenance', outage: 'major', degraded: 'degraded' }, 'Alibaba event type');
  return { id: String(i.id), title: text(i.title), level, status, startedAt: iso(i.startTime), updatedAt: iso(i.lastUpdateTime ?? i.endTime ?? i.startTime),
    ...(closed ? { resolvedAt: iso(i.endTime) } : {}), url: `https://status.alibabacloud.com/#/history?historyId=${encodeURIComponent(i.id)}` };
}
export function qwen(body: string, now: number, live = false): Normalized {
  const data = json(body);
  if (data.success !== true || !Array.isArray(data.data)) throw new Error('Invalid or unsuccessful Alibaba status response');
  let incidents: Incident[];
  if (live) {
    if (!data.data.length || data.data.some((d: any) => !d.productStatus || !d.eventDetails)) throw new Error('Invalid Alibaba current product status schema');
    // sfm is the official product id for Alibaba Cloud Model Studio, verified in the product catalogue.
    incidents = data.data.flatMap((d: any) => list(d.productStatus.sfm).map((r: any) => {
      const raw = d.eventDetails[r.eventId];
      if (!raw) throw new Error('Alibaba current status references a missing event');
      return event(raw, r.impactLevel);
    }));
  } else incidents = data.data.filter(relevant).map((i: any) => event(i));
  const split = splitIncidents(incidents, now);
  return { ...empty(), ...split, level: worst(split.openIncidents.map(i => i.level)), summary: split.openIncidents[0]?.title ?? (live ? 'No current Alibaba Cloud Model Studio events' : 'No open Qwen / Model Studio incidents in official history') };
}
