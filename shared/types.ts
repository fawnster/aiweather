// The contract between server/ and web/: the shapes the server sends and the page reads. Change both sides together.
// Everything here comes from official status sources. Nothing is estimated or invented.

/** Worst-first ordering is: major > partial > degraded > maintenance > operational. */
export type Level =
  | 'operational'
  | 'maintenance'   // scheduled maintenance in progress
  | 'degraded'      // degraded performance / minor
  | 'partial'       // partial outage
  | 'major'         // major outage
  | 'unknown'       // we could not read the source (fetch failed, stale, blocked)
  | 'no-page';      // the company publishes no official status page we can read

export type Category = 'lab' | 'host' | 'coding' | 'creative' | 'platform';

/** live = the source states current status. incident-feed = current status derived from open incidents. */
export type SourceKind = 'live' | 'incident-feed' | 'none';

export interface Incident {
  id: string;
  title: string;
  level: Level;              // impact mapped onto Level
  status: string;            // the source's own words: investigating / identified / monitoring / resolved ...
  startedAt: string;         // ISO 8601
  updatedAt: string;         // ISO 8601
  resolvedAt?: string;       // ISO 8601, absent while open
  url?: string;              // link to the incident on the official page
  latestUpdate?: string;     // newest update text, trimmed to ~280 chars
}

export interface Component {
  name: string;
  level: Level;
}

/** Midjourney publishes per-model wait times. The only official speed number we have. */
export interface WaitTime {
  label: string;             // e.g. "V8 Model"
  fastSeconds?: number;
  relaxSeconds?: number;
  formattedFast?: string;    // the source's own text, e.g. "< 1s"
  formattedRelax?: string;
}

export interface Company {
  id: string;                // stable slug: 'claude', 'openai', 'grok', ...
  name: string;              // display name
  category: Category;
  officialUrl: string;       // the human status page we cite
  sourceUrl?: string;        // the machine-readable URL we poll
  sourceKind: SourceKind;
  level: Level;              // worst current level
  summary: string;           // one line, from the source (e.g. "All Systems Operational")
  components: Component[];   // only the components that matter (may be empty)
  openIncidents: Incident[];
  recentIncidents: Incident[]; // resolved in the last 24h, newest first
  waitTimes?: WaitTime[];
  fetchedAt: string;         // ISO time of the last successful read
  stale: boolean;            // true when the last good read is older than 5 minutes
  error?: string;            // short reason when level is 'unknown'
}

export type EventType =
  | 'incident_opened'
  | 'incident_updated'
  | 'incident_resolved'
  | 'level_changed';

export interface WeatherEvent {
  id: string;                // unique, stable across reconnects
  type: EventType;
  companyId: string;
  at: string;                // ISO time we detected it
  from?: Level;              // for level_changed
  to?: Level;
  incident?: Incident;
}

export interface Snapshot {
  serverTime: string;
  demo: boolean;             // true ONLY in demo/replay mode. The UI must show a DEMO badge.
  companies: Company[];
  events: WeatherEvent[];    // newest first, up to 200
}

/** WebSocket messages, server → client. */
export type ServerMessage =
  | { t: 'snapshot'; data: Snapshot }
  | { t: 'event'; data: WeatherEvent; company: Company }
  | { t: 'company'; data: Company }            // a company changed without a discrete event (e.g. went stale)
  | { t: 'ping'; at: string };

/** WebSocket messages, client → server. */
export type ClientMessage = { t: 'pong' };

// --- Uptime (added 2026-10-20). Official numbers only, from the status page's own uptime data. ---

export interface UptimeDay {
  date: string;              // YYYY-MM-DD (the status page's own day buckets)
  level: Level;              // worst impact that day; 'operational' when none
  downMinutes?: number;      // minutes of partial/major impact that day, when the source gives ranges
  events: { title: string; url?: string }[];
}

export interface ComponentUptime {
  name: string;
  pct30?: number;            // e.g. 99.92 — exactly as published
  pct90?: number;
  days: UptimeDay[];         // oldest → newest, up to 90
}

export interface CompanyUptime {
  companyId: string;
  source: 'statuspage' | 'incident.io' | 'none';
  /** the component we headline (registry-chosen "main" component, else the first) */
  primary?: string;
  components: ComponentUptime[];
  /** for incident-feed companies with no published uptime: incidents in the last 90 days from their feed */
  feedIncidents90d?: number;
  fetchedAt: string;
  note?: string;             // e.g. "This company doesn't publish uptime percentages."
}

// --- News (added 2026-10-20). Each company's own newsroom / blog / changelog. Titles verbatim, never rewritten. ---

export interface NewsItem {
  title: string;             // exactly as published
  url: string;               // the official article
  publishedAt?: string;      // ISO 8601, as published (omit when the source gives no date)
  summary?: string;          // the source's own description, plain text, trimmed to ~200 chars; omit if none
}

export interface CompanyNews {
  companyId: string;
  sourceName: string;        // e.g. "Anthropic News", "OpenAI News", "GitHub Changelog (Copilot)"
  sourceUrl: string;         // the human page we cite
  items: NewsItem[];         // newest first, at most 10
  fetchedAt: string;
  note?: string;             // e.g. "No official news feed found" or "Blocked by the site (403)"
}
