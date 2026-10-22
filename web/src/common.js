// Shared state, constants and helpers for the home view, company pages and the list editor.

import { LEVEL_RANK, phaseOf } from './weather.js';

export const $ = s => document.querySelector(s);

export const LEVEL = {
  operational: { word: 'Operational', sky: 'Clear', color: '#3DDC84', cond: 'clear' },
  maintenance: { word: 'Maintenance', sky: 'Fog', color: '#7FA8F5', cond: 'fog' },
  degraded:    { word: 'Degraded', sky: 'Overcast', color: '#F2B33D', cond: 'overcast' },
  partial:     { word: 'Partial outage', sky: 'Rain', color: '#FF8A3D', cond: 'rain' },
  major:       { word: 'Major outage', sky: 'Storm', color: '#E5484D', cond: 'storm' },
  unknown:     { word: "Can't read the source", sky: 'Unknown', color: '#8A8F98', cond: 'fog' },
  'no-page':   { word: 'On its own page', sky: 'Fog', color: '#8A8F98', cond: 'fog' },
};
export const CATEGORY = { lab: 'AI lab', coding: 'Coding tool', host: 'Inference cloud', creative: 'Creative AI', platform: 'Platform' };
// AI model providers first: the labs, then the clouds that serve models; then coding tools, creative tools, platforms
const CAT_ORDER = { lab: 0, host: 1, coding: 2, creative: 3, platform: 4 };
// inside a group, the best-known names first
const IMPORTANCE = ['openai', 'claude', 'gemini', 'grok', 'deepseek', 'qwen', 'kimi', 'minimax', 'cohere', 'perplexity', 'ai21', 'manus',
  'groq', 'together', 'fireworks', 'cerebras', 'openrouter', 'huggingface', 'baseten', 'lambda', 'modal', 'novita',
  'copilot', 'cursor', 'windsurf', 'devin', 'v0', 'lovable', 'bolt', 'warp', 'augment', 'amp', 'factory', 'zed',
  'elevenlabs', 'runway', 'stability', 'luma', 'ideogram', 'heygen', 'assemblyai', 'tavus', 'cartesia', 'udio', 'higgsfield', 'gamma',
  'poe', 'synteq'];
const importance = id => { const i = IMPORTANCE.indexOf(id); return i < 0 ? 999 : i; };
// a page we can't read right now is our problem, not theirs: it doesn't float up
const problem = level => (level === 'unknown' ? 0 : LEVEL_RANK[level] ?? 0);

// Every company has its real mark (see public/icons/CREDITS.md); all render as one-colour masks.
const ICONS = new Set(['claude', 'openai', 'gemini', 'grok', 'deepseek', 'qwen', 'kimi', 'minimax', 'perplexity', 'cohere', 'ai21', 'manus', 'devin', 'ideogram', 'stability', 'elevenlabs', 'runway', 'groq', 'cerebras', 'fireworks', 'lambda', 'together', 'huggingface', 'baseten', 'novita', 'luma', 'udio', 'poe', 'cursor', 'copilot', 'windsurf', 'amp', 'lovable', 'v0',
  'bolt', 'factory', 'zed', 'warp', 'augment', 'modal', 'cartesia', 'heygen', 'gamma', 'assemblyai', 'tavus', 'higgsfield', 'synteq', 'openrouter']);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const seen = iso => !!iso && Date.parse(iso) > 1e12; // the backend marks never-fetched sources with the epoch
export const ago = iso => {
  if (!seen(iso)) return '';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
};
export const clock = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const shortDate = iso => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
export const iconHtml = (c, cls = 'ico') => ICONS.has(c.id)
  ? `<span class="${cls}" data-icon="${c.id}" aria-hidden="true"></span>` // its mark is in icons.css (main.js loads it)
  : `<span class="${cls} mono" aria-hidden="true">${esc(c.name[0])}</span>`;

/** Weather glyph for a status level (moon instead of sun at night, in the viewer's own time). */
export function wxName(level, { night = phaseOf() === 'night' } = {}) {
  switch (level) {
    case 'operational': return night ? 'clear-night' : 'clear-day';
    case 'maintenance': return night ? 'fog-night' : 'fog-day';
    case 'degraded': return night ? 'overcast-night' : 'overcast-day';
    case 'partial': return 'rain';
    case 'major': return 'thunderstorms-rain';
    default: return 'not-available';
  }
}
// icons live next to this module in the build's hashed (cached-forever) folder; a new icon set gets a new folder
const WX = new URL('./wx/', import.meta.url).pathname;
export const wxImg = (level, cls = 'wx', opts) => `<img class="${cls}" src="${WX}${wxName(level, opts)}.svg" alt="" draggable="false">`;

// --- live data ------------------------------------------------------------------
export const state = { companies: new Map(), events: [], demo: false, connected: false, lastMessage: 0 };

// --- preferences, remembered in this browser ---------------------------------------
const KEY = 'aiweather.prefs.v1';
const DEFAULTS = { sky: 'dots', view: 'grid', order: null, hidden: [] };
function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export const prefs = load();
export function savePrefs() {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {}
}

/** Default order: model providers first (labs, then model clouds), then coding, creative, platforms.
 *  Inside a group a company with a problem rises to the top, then the best-known names, then A–Z. */
export function defaultOrder() {
  return [...state.companies.values()].sort((a, b) =>
    (CAT_ORDER[a.category] ?? 9) - (CAT_ORDER[b.category] ?? 9) ||
    problem(b.level) - problem(a.level) ||
    importance(a.id) - importance(b.id) ||
    a.name.localeCompare(b.name));
}
/** The viewer's list: their own order if they made one (new companies join at the end), minus hidden ones.
 *  Anything degraded or worse right now comes first, worst first, keeping the viewer's order among equals: the board
 *  is about what's broken. While arranging, the saved order shows as it is, so what the viewer moves is what's saved. */
export function visible({ float = true } = {}) {
  const hidden = new Set(prefs.hidden || []);
  let list;
  if (!prefs.order) list = defaultOrder().filter(c => !hidden.has(c.id));
  else {
    list = prefs.order.map(id => state.companies.get(id)).filter(Boolean);
    // a company new on the board (one the viewer never placed) goes where the default order puts it: right after the
    // nearest company before it that the viewer did place (Gemini lands after Claude), not at the bottom of the list
    const def = defaultOrder(), placed = new Set(list.map(c => c.id));
    def.forEach((c, i) => {
      if (placed.has(c.id)) return;
      let at = 0;
      for (let j = i - 1; j >= 0; j--) { const k = list.findIndex(x => x.id === def[j].id); if (k >= 0) { at = k + 1; break; } }
      list.splice(at, 0, c); placed.add(c.id);
    });
    list = list.filter(c => !hidden.has(c.id));
  }
  if (!float) return list;
  const hurt = list.filter(c => problem(c.level) >= LEVEL_RANK.degraded).sort((a, b) => problem(b.level) - problem(a.level));
  return hurt.length ? [...hurt, ...list.filter(c => !hurt.includes(c))] : list;
}
export const customised = () => !!prefs.order || (prefs.hidden?.length ?? 0) > 0;

// --- official uptime + news (via the backend, cached) --------------------------------
export const uptime = new Map(); // id -> CompanyUptime | null
export const news = new Map();   // id -> CompanyNews | null
const browserUptime = new Set(); // ids whose bars were read in this browser (the server can't read them)
export function setBrowserUptime(id, u) { browserUptime.add(id); uptime.set(id, u); emit('uptime', id); }
const listeners = new Set();
export const onData = fn => listeners.add(fn);
const emit = (kind, id) => listeners.forEach(fn => fn(kind, id));

/** A part has a history worth drawing when the page publishes a figure or at least one of its days is known
 *  (some sources, like Rootly's public API, only know today: 90 "unknown" days would look like 90 clear ones). */
export const hasHistory = x => !!x && (x.pct90 != null || x.pct30 != null || (x.days || []).some(d => d.level !== 'unknown'));
export function primaryOf(u) {
  const parts = (u?.components || []).filter(hasHistory);
  if (!parts.length) return null;
  return parts.find(c => c.name === u.primary) || parts[0];
}
export const pctText = v => (v == null ? '' : `${Number(v).toFixed(2)}%`);
/** Text for the dot font, with its decimal point drawn as a single dot (.dp in style.css). */
export const dotText = s => esc(s).replace(/\./g, '<span class="dp">.</span>');
/** The uptime figure's colour on the board: green at 100%, then lime, amber, orange and red as downtime grows.
 *  Over 90 days 99.9% is about 2 hours down, 99.5% about 11, 99% about a day. Company pages keep it white. */
const PCT_STOPS = [[100, 'var(--ok)'], [99.9, 'color-mix(in oklch, var(--ok) 55%, var(--warn))'], [99.5, 'var(--warn)'], [99, 'var(--part)'], [98, 'var(--bad)']];
export function pctColor(v) {
  if (v == null) return '';
  const x = Number(Number(v).toFixed(2)); // the colour follows the number as shown: "100.00%" is green
  if (x >= 100) return PCT_STOPS[0][1];
  for (let i = 1; i < PCT_STOPS.length; i++) {
    const [hi, ch] = PCT_STOPS[i - 1], [lo, cl] = PCT_STOPS[i];
    if (x >= lo) return `color-mix(in oklch, ${ch} ${Math.round((x - lo) / (hi - lo) * 100)}%, ${cl})`;
  }
  return PCT_STOPS[PCT_STOPS.length - 1][1];
}
/** One component's uptime figure: the page's own published number when it has one; otherwise worked out from its
 *  official daily history (minutes from the source's incident times when it gives them, else the share of clear days).
 *  The labels always say which it is. Null when there's too little history to say anything. */
export function uptimeOf(x) {
  if (!x) return null;
  if (x.pct90 != null) return { value: x.pct90, published: true, label: '90-day uptime', short: '90-day uptime' };
  if (x.pct30 != null) return { value: x.pct30, published: true, label: '30-day uptime', short: '30-day uptime' };
  const days = (x.days || []).filter(d => d.level !== 'unknown');
  const n = days.length;
  if (n < 7) return null;
  if (days.some(d => typeof d.downMinutes === 'number')) {
    const down = days.reduce((m, d) => m + (d.downMinutes || 0), 0);
    return { value: 100 * (1 - down / (n * 1440)), label: `${n}-day uptime from its incident times`, short: `${n}-day uptime, from incidents` };
  }
  const clear = days.filter(d => d.level === 'operational' || d.level === 'maintenance').length;
  return { value: 100 * clear / n, label: `Clear on ${clear} of the last ${n} days`, short: `${clear} of ${n} days clear` };
}

const inflight = new Map();
export function getUptime(id) {
  if (uptime.has(id)) return Promise.resolve(uptime.get(id));
  if (inflight.has(id)) return inflight.get(id);
  const p = fetch(`/api/uptime/${encodeURIComponent(id)}`).then(r => (r.ok ? r.json() : null)).catch(() => null)
    .then(u => { inflight.delete(id); if (browserUptime.has(id)) return uptime.get(id); uptime.set(id, u); emit('uptime', id); return u; });
  inflight.set(id, p);
  return p;
}
/** One request for everything when the backend has the bulk endpoint; per company otherwise. */
// right after the server starts, some histories are still being fetched: ask again until they've all arrived
const pending = u => !u?.components?.length && /awaiting/i.test(u?.note || '');
let recheck = 0;
// right after a server restart the histories are still being read: look again soon, then every half minute
const soon = n => [4_000, 8_000, 15_000][n] ?? 30_000;
export async function preloadUptime(ids) {
  try {
    const r = await fetch('/api/uptime', { cache: 'no-store' });
    if (r.ok) {
      const all = await r.json();
      if (Array.isArray(all)) {
        for (const u of all) if (!browserUptime.has(u.companyId) && JSON.stringify(uptime.get(u.companyId)) !== JSON.stringify(u)) { uptime.set(u.companyId, u); emit('uptime', u.companyId); }
        if (all.some(pending) && recheck < 12) setTimeout(() => preloadUptime(ids), soon(recheck++));
        return;
      }
    }
  } catch {}
  let i = 0;
  const worker = async () => { while (i < ids.length) await getUptime(ids[i++]); };
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
}
let newsRecheck = 0;
export async function preloadNews() {
  try {
    const r = await fetch('/api/news', { cache: 'no-store' });
    if (!r.ok) return;
    const all = await r.json();
    if (!Array.isArray(all)) return;
    for (const n of all) if (JSON.stringify(news.get(n.companyId)) !== JSON.stringify(n)) { news.set(n.companyId, n); emit('news', n.companyId); }
    if (all.some(pending) && newsRecheck < 12) setTimeout(preloadNews, soon(newsRecheck++)); // still being fetched after a restart
  } catch {}
}

export function condForCompany(c) {
  const id = LEVEL[c.level]?.cond ?? 'fog';
  return { id, intensity: c.level === 'major' ? 1 : .5, majors: c.level === 'major' ? [c] : [], partial: [], degraded: [], maint: [] };
}
