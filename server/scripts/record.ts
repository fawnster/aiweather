// Explicit developer tool. Never called by the production server.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sources, USER_AGENT } from '../src/registry.js';
const dir = new URL('../fixtures/', import.meta.url);
await mkdir(dir, { recursive: true });
const jobs = sources.flatMap(s => s.endpoints.map(e => ({ ...e, id: s.id })));
for (const s of sources.filter(s => s.endpoints[0]?.adapter === 'rss')) {
  for (const [suffix, adapter] of [['/index.json', 'betterstack'], ['/api/v2/summary.json', 'statuspage']] as const)
    jobs.push({ id: s.id, key: `${s.id}-${adapter}`, url: s.officialUrl + suffix, adapter });
}
const probes = [
 ['aistudio-page', 'https://aistudio.google.com/status'],
 ['qwen-bundle', 'https://g.alicdn.com/aliyun-next/status/0.0.19/index.js'],
 ['qwen-products', 'https://status.alibabacloud.com/api/status/listProductForAllTypeInRegion?regionId=non-regional'],
 ['glm-docs', 'https://docs.z.ai'], ['glm-bigmodel', 'https://bigmodel.cn'], ['glm-open', 'https://open.bigmodel.cn'],
 ['mistral-page', 'https://status.mistral.ai'], ['mistral-rss', 'https://status.mistral.ai/feed.rss'],
 ['mistral-summary', 'https://status.mistral.ai/api/v2/summary.json'], ['mistral-index', 'https://status.mistral.ai/index.json'],
 ['meta-page', 'https://metastatus.com'], ['meta-llama', 'https://www.llama.com'],
];
for (const [key, url] of probes) jobs.push({ id: key.split('-')[0], key, url, adapter: 'rss' });
const records: object[] = [];
let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++]; const started = Date.now();
    try {
      const res = await fetch(job.url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) });
      const body = await res.text();
      const extension = body.trim().startsWith('{') || body.trim().startsWith('[') ? 'json' : body.trim().startsWith('<?xml') || body.includes('<rss') || body.includes('<feed') ? 'xml' : 'txt';
      const file = `${job.key}.${extension}`;
      // Discovery HTML/JS is not an adapter fixture; it can embed public client keys.
      // Never persist credential-like material, even when present in a public response.
      const omit = extension === 'txt' || /AIza[A-Za-z0-9_-]{35}|(?:sk-|ghp_)[A-Za-z0-9]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(body);
      if (!omit) await writeFile(new URL(file, dir), body);
      const record = { ...job, ...(omit ? { bodyOmitted: 'Discovery HTML/JS or credential-like material; metadata only' } : { file }), sha256: createHash('sha256').update(body).digest('hex'), status: res.status, contentType: res.headers.get('content-type'), etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified'), recordedAt: new Date().toISOString(), latencyMs: Date.now() - started, bytes: Buffer.byteLength(body) };
      records.push(record); console.log(JSON.stringify(record));
    } catch (error) { const record = { ...job, error: String(error), recordedAt: new Date().toISOString() }; records.push(record); console.log(JSON.stringify(record)); }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const previous: any[] = await readFile(new URL('manifest.json', dir), 'utf8').then(JSON.parse).catch(() => []);
await writeFile(new URL('manifest.json', dir), JSON.stringify([...new Map([...previous, ...records].map((r: any) => [r.key, r])).values()], null, 2) + '\n');
