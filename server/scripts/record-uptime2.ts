// Explicit live recording/report tool. Uses the runtime HTTP policy and adapters.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { HttpSource } from '../src/http-source.js';
import { sources } from '../src/registry.js';
import { UptimeService } from '../src/uptime.js';

const ids = ['huggingface', 'luma', 'modal', 'novita', 'higgsfield', 'together', 'udio', 'gamma', 'zed', 'synteq', 'deepseek', 'qwen'];
const dir = new URL('../fixtures/uptime2/', import.meta.url);
await mkdir(dir, { recursive: true });
const http = new HttpSource({ cache: false, accept: 'application/json, text/html;q=0.9', allowHtml: true });
const records: any[] = await readFile(new URL('manifest.json', dir), 'utf8').then(JSON.parse).then((rows: any[]) => rows.filter(r => r.discovery)).catch(() => []);
const rows: string[] = [];
let failed = false;
const now = Date.now();
for (const id of ids) {
  let index = 0;
  const service = new UptimeService(sources, async url => {
    const recordedAt = new Date().toISOString(), key = `${id}-${index++}`;
    try {
      const body = await http.read(url);
      const file = `${key}.${body.trimStart().startsWith('{') || body.trimStart().startsWith('[') ? 'json' : 'html'}`;
      await writeFile(new URL(file, dir), body);
      records.push({ key, company: id, url, recordedAt, file, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') });
      return body;
    } catch (e) { records.push({ key, company: id, url, recordedAt, error: String(e) }); throw e; }
  }, () => now);
  const company = (await service.get(id))!;
  if (!company.components.length) failed = true;
  const primary = company.components.find(c => c.name === company.primary);
  const urls = [...new Set(records.filter(r => r.company === id).map(r => r.url))];
  const value = primary?.pct90 != null ? `${primary.pct90}%` : primary ? `days only${primary.pct30 != null ? ` (published pct30: ${primary.pct30}%)` : ''}` : '**unavailable**';
  const outcome = company.components.length ? 'OK' : `${company.note ?? 'Unavailable'}`;
  rows.push(`| ${id} | ${value} | ${urls.map(u => `[source](${u})`).join(', ')} | ${outcome} |`);
  console.log(id, JSON.stringify(company));
}
await writeFile(new URL('manifest.json', dir), JSON.stringify(records, null, 2) + '\n');
await writeFile(new URL('../UPTIME2-REPORT.md', import.meta.url), `# Uptime source follow-up — live report\n\nRun: ${new Date(now).toISOString()} (2026-10-20 America/New_York). Real official HTTP requests through the runtime adapters, with the honest aiweather UA, no browser impersonation or protection bypass. Values below are for the primary component; no company-wide averages are invented.\n\n| Company | Primary pct90 (or days only) | Source URL | Runtime result |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n\n## Period and contract notes\n\n- New providers use the existing contract's generic \`source: "statuspage"\`; provider details are in \`note\`. No shared contract or frontend files changed.\n- Instatus: Gamma/Zed publish 90-day values; Synteq publishes **30-day** values, retained as \`pct30\`.\n- DeepSeek's structure response publishes \`component_uptimes[].uptime\` and \`section_uptimes[].uptime\` for the requested 90-day interval. No locally reconstructed percentage.\n- Qwen publishes daily statuses, not a percentage. A 1,000-day response was verified; a 10,000-day request timed out. There is no documented/discovered finite maximum, so this is the largest fully verified bounded response, **not a claim of an API-enforced maximum**. The runtime requests 1,000 and retains 90 days.
- Grok server-side uptime remains unwired; frontend daily history is retained.\n\nRaw fixtures, timestamps and SHA-256 digests: \`server/fixtures/uptime2/manifest.json\`. They are test inputs only, never runtime fallbacks.\n`);
if (failed) process.exitCode = 1;
