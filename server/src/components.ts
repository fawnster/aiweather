import type { Source } from './registry.js';

/** Use the same scope for current status and historical uptime. */
export function keptComponents<T extends { name: string }>(all: T[], source: Source): T[] {
  if (source.filter === 'kimi') return all.filter(c => /^(Kimi|Open API|API Service|Kimi Code)$/i.test(c.name));
  if (source.filter === 'copilot') return all.filter(c => /^Copilot$/i.test(c.name));
  if (source.filter === 'v0' && all.some(c => /^v0$/i.test(c.name))) return all.filter(c => /^v0$/i.test(c.name));
  return all;
}
