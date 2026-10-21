import type { Endpoint, Source } from '../registry.js';
import { statuspage } from './statuspage.js';
import { betterstack } from './betterstack.js';
import { rss } from './rss.js';
import { qwen } from './qwen.js';
import { datadog } from './datadog.js';
import { gcp } from './gcp.js';
import { worst, type Normalized } from './common.js';
export function normalize(body: string, endpoint: Endpoint, source: Source, now = Date.now()): Normalized {
  switch (endpoint.adapter) {
    case 'statuspage': return statuspage(body, source, now);
    case 'statuspage-incidents': return statuspage(body, source, now, true);
    case 'betterstack': return betterstack(body, source.officialUrl, now);
    case 'rss': return rss(body, now);
    case 'qwen': return qwen(body, now);
    case 'qwen-live': return qwen(body, now, true);
    case 'datadog': return datadog(body, source.officialUrl, now);
    case 'gcp': return gcp(body, now);
  }
}
export function combine(results: Normalized[]): Normalized {
  const incidents = (key: 'openIncidents' | 'recentIncidents') => [...new Map(results.flatMap(r => r[key]).map(i => [i.id, i])).values()];
  return { level: worst(results.map(r => r.level)), summary: [...new Set([...results].sort((a, b) => a.level === 'operational' ? 1 : b.level === 'operational' ? -1 : 0).map(r => r.summary).filter(Boolean))].join('; '),
    components: results.flatMap(r => r.components), openIncidents: incidents('openIncidents'), recentIncidents: incidents('recentIncidents') };
}
