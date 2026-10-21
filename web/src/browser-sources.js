// Official sources our server can't read but every visitor's browser can, read exactly the way the official
// page reads them. xAI publishes Grok's status as plain JSON that any site may fetch (its CORS is open);
// Cloudflare only turns away servers. Nothing here is guessed: unknown words stay 'unknown'.

const XAI = 'https://data.x.ai/status';
// the words xAI's own data uses (summary components + 90-day history)
const PART = { available: 'operational', operational: 'operational', degraded: 'degraded', disruption: 'partial', outage: 'major', maintenance: 'maintenance' };
// incident impact / page indicator, the usual status-page scale
const IMPACT = { none: 'operational', minor: 'degraded', major: 'partial', critical: 'major', maintenance: 'maintenance' };
const RANK = { operational: 0, maintenance: 1, degraded: 2, partial: 3, major: 4 };
const worst = levels => levels.filter(l => l in RANK).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'operational');
const getJson = url => fetch(url, { credentials: 'omit', cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

const patches = new Map();   // id -> fields read in this browser, laid over the server's copy
const server = new Map();    // id -> the server's latest copy, so a reading from here can be lifted off again
/** A company as this browser shows it: the server's copy with anything read here laid over it. */
export function readInBrowser(c) { server.set(c.id, c); return patches.has(c.id) ? { ...c, ...patches.get(c.id) } : c; }
/** The same, for a company whose reading here just changed. */
export const inBrowser = id => (server.has(id) ? readInBrowser(server.get(id)) : undefined);

function incident(x) {
  const ups = [...(x.incident_updates || [])].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const closed = x.status === 'resolved' || !!x.resolved_at;
  return {
    id: String(x.id), title: String(x.name || 'Incident'), level: IMPACT[x.impact] ?? 'unknown', status: String(x.status || ''),
    startedAt: x.created_at, updatedAt: x.updated_at || x.created_at,
    ...(closed ? { resolvedAt: x.resolved_at || x.updated_at } : {}),
    ...(ups[0]?.body ? { latestUpdate: String(ups[0].body).slice(0, 280) } : {}),
    // xAI's first post says what happened ("We are investigating an outage on…"); the last one usually just says it's fixed
    firstUpdate: ups.length ? String(ups[ups.length - 1].body || '').slice(0, 280) : '',
    parts: [...new Set(ups.flatMap(u => u.affected_components || []))],
  };
}

let grokNames = new Map();
async function readGrok(api) {
  const [s, inc] = await Promise.all([getJson(`${XAI}/summary.json`), getJson(`${XAI}/incidents.json`)]);
  grokNames = new Map((s.components || []).map(c => [c.id, c.name]));
  const components = (s.components || []).map(c => ({ name: String(c.name), level: PART[c.status] ?? 'unknown' }));
  const seen = new Set(), all = [];
  for (const x of [...(s.incidents || []), ...(inc.incidents || [])]) if (x?.id && !seen.has(x.id)) { seen.add(x.id); all.push(incident(x)); }
  const open = all.filter(i => !i.resolvedAt);
  const recent = all.filter(i => i.resolvedAt && Date.now() - Date.parse(i.resolvedAt) < 864e5);
  const level = worst([IMPACT[s.status?.indicator] ?? 'operational', ...components.map(c => c.level), ...open.map(i => i.level)]);
  patches.set('grok', {
    sourceKind: 'live', readIn: 'browser', level, summary: String(s.status?.description || ''), components,
    openIncidents: open, recentIncidents: recent, fetchedAt: new Date().toISOString(), stale: false, error: undefined,
  });
  api.changed('grok');
  return all;
}

// xAI's 90-day history buckets days in Pacific time (an incident at 00:24 UTC on Oct 7 sits on its Oct 6 bar)
const pacificDay = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const DOWN = new Set(['partial', 'major']); // the same rule as the other sources: partial or major impact is downtime

async function readGrokUptime(api, incidents) {
  const u = await getJson(`${XAI}/uptime.json`);
  const titles = new Map();  // "part|day" -> what happened, for the bars' tooltips
  const minutes = new Map(); // "part|day" -> minutes of partial/major impact, from xAI's own incident times
  for (const i of incidents) {
    const day = pacificDay(i.startedAt);
    for (const p of i.parts) titles.set(`${p}|${day}`, [...(titles.get(`${p}|${day}`) || []), { title: i.firstUpdate || i.title }]);
    if (!DOWN.has(i.level)) continue;
    const end = Math.min(Date.now(), Date.parse(i.resolvedAt || '') || Date.now());
    for (let t = Date.parse(i.startedAt); t < end; t += 60_000) {
      const key = pacificDay(t);
      for (const p of i.parts) minutes.set(`${p}|${key}`, (minutes.get(`${p}|${key}`) || 0) + 1);
    }
  }
  const components = (u.components || []).map(c => {
    const days = (c.history || []).map(h => ({ date: h.day, level: PART[h.status] ?? 'unknown', events: titles.get(`${c.id}|${h.day}`) || [] }));
    // minutes only when every outage day on the bars is matched by an incident with times; otherwise none are
    // attached and the figure is the share of clear days instead (the label says which)
    const covered = days.every(d => !DOWN.has(d.level) || minutes.get(`${c.id}|${d.date}`) > 0);
    if (covered) for (const d of days) d.downMinutes = minutes.get(`${c.id}|${d.date}`) || 0;
    return { name: grokNames.get(c.id) ?? c.id, days };
  });
  api.setUptime('grok', { companyId: 'grok', source: 'browser', primary: 'grok.com', components, fetchedAt: new Date().toISOString() });
}

/** Start reading. api: { changed(id), setUptime(id, u) } */
export function startBrowserSources(api) {
  let incidents = [], lastOk = 0;
  const live = () => readGrok(api).then(all => { incidents = all; lastOk = Date.now(); }).catch(() => {
    // this browser can't reach xAI's data right now (offline, or turned away by Cloudflare): after five minutes its
    // last reading is dropped and the card goes back to the server's reading of xAI's official feed (or "couldn't
    // check"), instead of showing an old status as if it were current
    if (patches.has('grok') && Date.now() - lastOk > 5 * 60_000) { patches.delete('grok'); api.changed('grok'); }
  });
  const bars = () => readGrokUptime(api, incidents).catch(() => {});
  live().then(bars);
  setInterval(live, 60_000);
  setInterval(bars, 30 * 60_000);
}
