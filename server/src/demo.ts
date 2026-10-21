// Imported only behind DEMO=1. Production never reads fixture files or schedules synthetic changes.
import { readFile } from 'node:fs/promises';
import type { Company, Incident } from '../../shared/types.js';
import { normalize, combine } from './adapters/index.js';
import { sources } from './registry.js';
import { initialCompany, State } from './state.js';
export async function startDemo(state: State) {
  // Source and compiled paths differ; fixtures are not copied into dist.
  const directory = new URL(import.meta.url.includes('/dist/') ? '../../../fixtures/' : '../fixtures/', import.meta.url);
  const manifest: { key: string; file?: string; recordedAt: string; status?: number }[] = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  const baseline = new Map<string, Company>();
  for (const source of sources) {
    let company = initialCompany(source);
    if (source.endpoints.length) {
      const results = [];
      for (const endpoint of source.endpoints) {
        const recording = manifest.find(r => r.key === endpoint.key && r.status === 200 && r.file);
        if (!recording?.file) throw new Error(`Missing demo recording: ${endpoint.key}`);
        const body = await readFile(new URL(recording.file, directory), 'utf8');
        // Validate historical recordings against their capture time.
        results.push(normalize(body, endpoint, source, Date.parse(recording.recordedAt)));
      }
      company = { ...company, ...combine(results), fetchedAt: new Date().toISOString(), stale: false };
      delete company.error;
    }
    baseline.set(source.id, structuredClone(company)); state.apply(company);
  }
  const revision = (companyId: string, level: Company['level'], incident?: Incident) => {
    const base = structuredClone(baseline.get(companyId)!);
    const now = new Date().toISOString();
    state.apply({ ...base, level, fetchedAt: now, summary: `DEMO: ${level}`, openIncidents: incident && !incident.resolvedAt ? [incident] : [], recentIncidents: incident?.resolvedAt ? [incident] : [] });
  };
  let timers: NodeJS.Timeout[] = [];
  let cycle = 0;
  const schedule = () => {
    const cycleId = ++cycle;
    const make = (id: string, level: Incident['level'], status = 'investigating'): Incident => {
      const now = new Date().toISOString();
      return { id: `demo-${id}-${cycleId}`, title: `DEMO: ${id} scripted incident`, level, status, startedAt: now, updatedAt: now };
    };
    let openai: Incident; let claude: Incident;
    const after = (seconds: number, task: () => void) => timers.push(setTimeout(task, seconds * 1000));
    after(10, () => revision('openai', 'degraded'));
    after(20, () => { openai = make('openai', 'partial'); revision('openai', 'partial', openai); });
    after(35, () => { openai = { ...openai, level: 'major', status: 'identified', updatedAt: new Date().toISOString() }; revision('openai', 'major', openai); });
    after(60, () => { claude = make('claude', 'partial'); revision('claude', 'partial', claude); });
    after(90, () => {
      const now = new Date().toISOString();
      revision('openai', 'operational', { ...openai, status: 'resolved', updatedAt: now, resolvedAt: now });
      revision('claude', 'operational', { ...claude, status: 'resolved', updatedAt: now, resolvedAt: now });
      timers = []; schedule();
    });
  };
  schedule();
  return () => timers.forEach(clearTimeout);
}
