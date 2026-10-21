import type { Component, Incident, Level } from '../../../shared/types.js';
export interface Normalized { level: Level; summary: string; components: Component[]; openIncidents: Incident[]; recentIncidents: Incident[] }
export const empty = (): Normalized => ({ level: 'operational', summary: '', components: [], openIncidents: [], recentIncidents: [] });
const rank: Record<Level, number> = { 'no-page': -2, unknown: -1, operational: 0, maintenance: 1, degraded: 2, partial: 3, major: 4 };
export function worst(levels: Level[]): Level { return levels.includes('unknown') ? 'unknown' : levels.reduce((a, b) => rank[a] >= rank[b] ? a : b, 'operational'); }
export function mapped(value: unknown, map: Record<string, Level>, context: string): Level {
  const level = map[String(value).toLowerCase()];
  if (!level) throw new Error(`Unrecognized ${context}: ${String(value).slice(0, 80)}`);
  return level;
}
export const componentLevels: Record<string, Level> = {
  operational: 'operational', degraded_performance: 'degraded', partial_outage: 'partial', major_outage: 'major', under_maintenance: 'maintenance',
  // incident.io pages (Amp, OpenAI, …) publish a whole part being down as full_outage on the same summary path
  full_outage: 'major',
};
export const impactLevels: Record<string, Level> = { none: 'operational', minor: 'degraded', major: 'partial', critical: 'major', maintenance: 'maintenance' };
export function text(value: unknown): string {
  if (value && typeof value === 'object') return text((value as any)['#text']);
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
export const iso = (value: unknown): string => {
  const date = new Date(value as string | number);
  if (value == null || value === '' || !Number.isFinite(date.getTime())) throw new Error('Missing or invalid source timestamp');
  return date.toISOString();
};
export const list = <T = any>(value: T | T[] | undefined | null): T[] => value == null ? [] : Array.isArray(value) ? value : [value];
export function splitIncidents(incidents: Incident[], now: number): Pick<Normalized, 'openIncidents' | 'recentIncidents'> {
  return { openIncidents: incidents.filter(i => !i.resolvedAt), recentIncidents: incidents.filter(i => i.resolvedAt && now - Date.parse(i.resolvedAt) <= 86_400_000 && Date.parse(i.resolvedAt) <= now).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
}
export function json(body: string): any { try { return JSON.parse(body); } catch { throw new Error('Invalid JSON from official source'); } }
