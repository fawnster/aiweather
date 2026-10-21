// Explicit fixture recorder; never imported by the server. No keys or browser bypasses.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sources } from '../src/registry.js';
import { keptComponents } from '../src/components.js';
import { HttpSource } from '../src/http-source.js';

const dir = new URL('../fixtures/uptime/', import.meta.url);
await mkdir(dir, { recursive: true });
const http = new HttpSource({ cache: false, accept: 'application/json' });
const records: any[] = await readFile(new URL('manifest.json', dir), 'utf8').then(JSON.parse).catch(() => []);
async function record(key: string, url: string) {
  const recordedAt = new Date().toISOString();
  try {
    const body = await http.read(url);
    const data = JSON.parse(body); // Do not save HTML or challenge responses.
    await writeFile(new URL(`${key}.json`, dir), body);
    records.push({ key, url, recordedAt, file: `${key}.json`, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') });
    return data;
  } catch (error) {
    records.push({ key, url, recordedAt, error: String(error) });
    console.error(key, String(error));
    return undefined;
  }
}
const selected = process.argv.slice(2);
const now = Date.now();
let cursor = 0;
const jobs = sources.filter(s => (s.uptime === 'statuspage' || s.uptime === 'incident.io') && (!selected.length || selected.includes(s.id)));
async function worker() {
  while (cursor < jobs.length) {
    const source = jobs[cursor++];
    if (source.uptime === 'incident.io') {
      const proxy = `${source.officialUrl}/proxy/${new URL(source.officialUrl).host}`;
      await record(`${source.id}-summary`, proxy);
      await record(source.id, `${proxy}/component_impacts?start_at=${new Date(now - 90 * 86_400_000).toISOString()}&end_at=${new Date(now).toISOString()}`);
    } else {
      for (const endpoint of source.endpoints.filter(e => e.adapter === 'statuspage')) {
        const summary = await record(`${endpoint.key}-summary`, endpoint.url);
        if (!Array.isArray(summary?.components)) continue;
        const components = keptComponents(summary.components, source);
        const base = new URL(endpoint.url).origin;
        for (let i = 0; i < components.length; i += 60) {
          const codes = components.slice(i, i + 60).map((c: any) => c.id).join(',');
          await record(`${endpoint.key}${i ? `-${i / 60}` : ''}`, `${base}/uptime_showcase?components=${codes}`);
        }
      }
    }
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
await writeFile(new URL('manifest.json', dir), JSON.stringify([...new Map(records.map(r => [r.key, r])).values()], null, 2) + '\n');
console.log(`Recorded ${jobs.length} companies; see server/fixtures/uptime/manifest.json.`);
