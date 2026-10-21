import type { Category, SourceKind } from '../../shared/types.js';

export type Adapter = 'statuspage' | 'statuspage-incidents' | 'betterstack' | 'rss' | 'qwen' | 'qwen-live' | 'datadog' | 'gcp';
export interface Endpoint { key: string; url: string; adapter: Adapter; intervalMs?: number }
export interface Source {
  id: string; name: string; category: Category; officialUrl: string;
  kind: SourceKind; endpoints: Endpoint[]; filter?: 'kimi' | 'copilot' | 'v0'; note?: string;
  uptime?: 'statuspage' | 'incident.io' | 'betterstack' | 'instatus' | 'flashduty' | 'alibaba' | 'datadog' | 'gcp'; primaryComponent?: RegExp;
}
// incident.io's summary omits incidents; its public incidents.json is needed for open-incident detection.
const needsIncidentList = new Set(['openai', 'perplexity', 'cohere', 'elevenlabs', 'stability', 'heygen', 'cartesia', 'groq', 'fireworks', 'lambda', 'poe', 'lovable', 'bolt', 'amp']);
// Names verified against official component lists. OpenAI publishes individual API
// endpoints rather than a single API component; Chat Completions is the headline.
const primaryComponents: Record<string, RegExp> = {
  claude: /^Claude API\b/i, openai: /^Chat Completions$/i, kimi: /^Open API$/i,
  minimax: /^Global: Large Language Models/i, perplexity: /^API$/i, cohere: /^All Endpoints$/i,
  manus: /^api\.manus\.im$/i, elevenlabs: /^Text to Speech$/i, stability: /^Stability.ai Platform/i,
  ideogram: /^API$/i, runway: /^Public API$/i, heygen: /^https:\/\/api\.heygen\.com$/i,
  cartesia: /^Text to Speech \(US\)$/i,
  groq: /^API$/i, cerebras: /^GPT-OSS-120B$/i, lambda: /^Chat Completions API$/i,
  poe: /^api\.poe\.com$/i, cursor: /^IDE$/i, copilot: /^Copilot$/i,
  windsurf: /^Cascade$/i, amp: /^Amp Agent$/i, factory: /^api\.factory\.ai$/i,
  ai21: /^AI21 Gateway$/i, augment: /^API$/i, warp: /^Warp Client$/i,
  baseten: /^Dedicated Inference$/i, tavus: /^Conversational Video Interface$/i, assemblyai: /^Asynchronous API$/i,
  devin: /^Cloud Agent$/i, lovable: /^Editor$/i, bolt: /^Prompting$/i, v0: /^v0$/i,
};
const page = (id: string, name: string, category: Category, base: string, filter?: Source['filter']): Source => ({
  id, name, category, officialUrl: base, kind: 'live', filter,
  uptime: needsIncidentList.has(id) ? 'incident.io' : ['gamma', 'zed', 'synteq'].includes(id) ? 'instatus' : 'statuspage',
  primaryComponent: primaryComponents[id],
  endpoints: [{ key: id, url: `${base}/api/v2/summary.json`, adapter: 'statuspage' },
    ...(needsIncidentList.has(id) ? [{ key: `${id}-history`, url: `${base}/api/v2/incidents.json`, adapter: 'statuspage-incidents' as const, intervalMs: 300_000 }] : [])],
});
const feed = (id: string, name: string, category: Category, base: string, path = '/feed.rss'): Source => ({
  id, name, category, officialUrl: base, kind: 'incident-feed', uptime: id === 'deepseek' ? 'flashduty' : undefined,
  endpoints: [{ key: id, url: base + path, adapter: 'rss' }],
});
const better = (id: string, name: string, category: Category, base: string): Source => ({
  id, name, category, officialUrl: base, kind: 'live', uptime: 'betterstack', endpoints: [{ key: `${id}-betterstack`, url: `${base}/index.json`, adapter: 'betterstack' }],
});
export const sources: Source[] = [
  page('claude', 'Claude', 'lab', 'https://status.claude.com'),
  page('openai', 'OpenAI', 'lab', 'https://status.openai.com'),
  page('kimi', 'Kimi', 'lab', 'https://status.moonshot.cn', 'kimi'),
  { ...page('minimax', 'MiniMax', 'lab', 'https://status.minimax.io'), endpoints: [
    { key: 'minimax', url: 'https://status.minimax.io/api/v2/summary.json', adapter: 'statuspage' },
    { key: 'minimax-cn', url: 'https://status.minimaxi.com/api/v2/summary.json', adapter: 'statuspage' },
  ] },
  page('perplexity', 'Perplexity', 'lab', 'https://status.perplexity.com'),
  page('cohere', 'Cohere', 'lab', 'https://status.cohere.com'),
  page('manus', 'Manus', 'lab', 'https://status.manus.im'),
  page('elevenlabs', 'ElevenLabs', 'creative', 'https://status.elevenlabs.io'),
  page('stability', 'Stability AI', 'creative', 'https://status.stability.ai'),
  page('ideogram', 'Ideogram', 'creative', 'https://status.ideogram.ai'),
  page('runway', 'Runway', 'creative', 'https://status.runwayml.com'),
  page('heygen', 'HeyGen', 'creative', 'https://status.heygen.com'),
  page('gamma', 'Gamma', 'creative', 'https://status.gamma.app'),
  page('cartesia', 'Cartesia', 'creative', 'https://status.cartesia.ai'),
  page('groq', 'Groq', 'host', 'https://groqstatus.com'),
  page('cerebras', 'Cerebras', 'host', 'https://status.cerebras.ai'),
  page('fireworks', 'Fireworks', 'host', 'https://status.fireworks.ai'),
  page('lambda', 'Lambda', 'host', 'https://status.lambda.ai'),
  { id: 'openrouter', name: 'OpenRouter', category: 'host', officialUrl: 'https://status.openrouter.ai', kind: 'live', uptime: 'datadog', primaryComponent: /^Chat \(/, endpoints: [
    { key: 'openrouter', url: 'https://status.openrouter.ai/config.json', adapter: 'datadog' },
  ], note: 'Datadog: daily history and displayed percentages reproduce the official page bundle from config.json incident timelines; UTC buckets.' },
  page('poe', 'Poe', 'platform', 'https://status.poe.com'),
  page('cursor', 'Cursor', 'coding', 'https://status.cursor.com'),
  page('copilot', 'GitHub Copilot', 'coding', 'https://www.githubstatus.com', 'copilot'),
  page('windsurf', 'Windsurf', 'coding', 'https://status.windsurf.com'),
  page('amp', 'Amp', 'coding', 'https://ampcodestatus.com'),
  page('factory', 'Factory', 'coding', 'https://status.factory.ai'),
  page('devin', 'Devin', 'coding', 'https://devinstatus.com'),
  page('lovable', 'Lovable', 'coding', 'https://status.lovable.dev'),
  page('bolt', 'Bolt', 'coding', 'https://status.bolt.new'),
  page('v0', 'Vercel v0', 'coding', 'https://www.vercel-status.com', 'v0'),
  page('zed', 'Zed', 'coding', 'https://status.zed.dev'),
  page('synteq', 'Synteq', 'platform', 'https://status.synteq.com'),
  feed('grok', 'Grok', 'lab', 'https://status.x.ai', '/feed.xml'),
  feed('deepseek', 'DeepSeek', 'lab', 'https://status.deepseek.com', '/history.rss'),
  { id: 'qwen', name: 'Qwen', category: 'lab', officialUrl: 'https://status.alibabacloud.com/#/?region=non-regional', kind: 'live', uptime: 'alibaba', endpoints: [
    { key: 'qwen-current', url: 'https://status.alibabacloud.com/api/status/listCurrentProductStatus?regionId=non-regional', adapter: 'qwen-live' },
    { key: 'qwen', url: 'https://status.alibabacloud.com/api/status/listHistoryEvent?pageNumber=1&pageSize=50', adapter: 'qwen' },
  ] },
  better('together', 'Together AI', 'host', 'https://status.together.ai'),
  better('huggingface', 'Hugging Face', 'host', 'https://status.huggingface.co'),
  better('luma', 'Luma', 'creative', 'https://status.lumalabs.ai'),
  better('novita', 'Novita', 'host', 'https://status.novita.ai'),
  better('modal', 'Modal', 'host', 'https://status.modal.com'),
  better('udio', 'Udio', 'creative', 'https://status.udio.com'),
  better('higgsfield', 'Higgsfield', 'creative', 'https://status.higgsfield.ai'),
  page('ai21', 'AI21 Labs', 'lab', 'https://status.ai21.com'),
  page('augment', 'Augment Code', 'coding', 'https://status.augmentcode.com'),
  page('warp', 'Warp', 'coding', 'https://status.warp.dev'),
  page('baseten', 'Baseten', 'host', 'https://status.baseten.co'),
  page('tavus', 'Tavus', 'creative', 'https://status.tavus.io'),
  page('assemblyai', 'AssemblyAI', 'creative', 'https://status.assemblyai.com'),
  // Google Cloud's official incident history scopes Gemini by affected product title.
  { id: 'gemini', name: 'Gemini', category: 'lab', officialUrl: 'https://status.cloud.google.com/', kind: 'live', uptime: 'gcp', primaryComponent: /^Vertex Gemini API$/i, endpoints: [
    { key: 'gemini-gcp', url: 'https://status.cloud.google.com/incidents.json', adapter: 'gcp' },
  ] },
];
export const USER_AGENT = 'aiweather/1.0 (+https://aiweather.synteq.app)';
