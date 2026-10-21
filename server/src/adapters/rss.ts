import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Incident, Level } from '../../../shared/types.js';
import { iso, list, mapped, splitIncidents, text, worst, type Normalized } from './common.js';
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
function english(title: string) {
  const match = title.match(/[（(]([A-Za-z][^（）()]*)[）)]/);
  return /[\u3400-\u9fff]/.test(title) && match ? match[1].trim() : title;
}
export function rssIncidents(body: string): Incident[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(body) || XMLValidator.validate(body) !== true) throw new Error('Invalid or unsafe incident feed XML');
  const data = parser.parse(body);
  const channel = data.rss?.channel;
  if (!channel || typeof channel !== 'object' || !channel.title) throw new Error('Invalid RSS incident feed schema');
  const latest = new Map<string, Incident>();
  for (const item of list(channel.item)) {
    const description = text(item.description);
    const title = english(text(item.title));
    const statusMatch = description.match(/Status:\s*([a-z_ -]+?)(?=\s+(?:Severity:|Resolved:|Updates:|Affected components:)|$)/i) ?? description.match(/^\[([^\]]+)\]/);
    // Statuspage's Status field is followed by prose, rather than another labelled field.
    const status = (description.match(/Status:\s*(resolved|completed|investigating|identified|monitoring|in_progress|scheduled|update)/i)?.[1] ?? statusMatch?.[1])?.trim();
    if (!status) throw new Error('Incident feed item has no explicit status');
    if (/scheduled/i.test(status)) continue;
    const closed = /^(resolved|completed|closed)$/i.test(status);
    const severity = description.match(/Severity:\s*([a-z_-]+)/i)?.[1];
    let level: Level = 'operational';
    if (severity) level = mapped(severity, { outage: 'major', disruption: 'partial', degraded: 'degraded', maintenance: 'maintenance' }, 'feed severity');
    else if (/maintenance/i.test(title)) level = 'maintenance';
    else if (/partial|disruption/i.test(title)) level = 'partial';
    else if (/major outage|\boutage\b|\bdown\b/i.test(title)) level = 'major';
    else if (/degrad|latenc|slow/i.test(title)) level = 'degraded';
    else if (!closed) throw new Error('Open feed incident has no readable severity');
    const startedAt = iso(item.pubDate);
    const times = [...String(item.description).matchAll(/<strong>([^<]+)<\/strong>/gi)].map(m => Date.parse(m[1])).filter(Number.isFinite);
    const resolvedTime = description.match(/Resolved:\s*(.+?)(?:\s+Updates:|$)/i)?.[1];
    const updatedAt = times.length ? new Date(Math.max(...times)).toISOString() : startedAt;
    const id = text(item.link || item.guid).split('#')[0];
    if (!id) throw new Error('Incident feed item missing identity');
    const incident: Incident = { id, title, level, status: status.toLowerCase(), startedAt, updatedAt,
      ...(closed ? { resolvedAt: resolvedTime ? iso(resolvedTime) : updatedAt } : {}), url: text(item.link), latestUpdate: description.slice(0, 280) };
    const before = latest.get(id);
    if (!before || before.updatedAt < updatedAt) latest.set(id, incident);
  }
  return [...latest.values()];
}
export function rss(body: string, now: number): Normalized {
  const split = splitIncidents(rssIncidents(body), now);
  return { ...split, components: [], level: worst(split.openIncidents.map(i => i.level)), summary: split.openIncidents[0]?.title ?? 'No open incidents in official feed' };
}
