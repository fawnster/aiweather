import { load, type Cheerio, type CheerioAPI } from 'cheerio/slim';
import type { AnyNode } from 'domhandler';
import type { CompanyNews, NewsItem } from '../../shared/types.js';
import { HttpSource } from './http-source.js';
import { newsSources, type NewsSource } from './news-sources.js';
import { RefreshCache, WorkQueue } from './refresh-cache.js';

const clean = (value: string): string => {
  const $ = load(value); $('script,style,noscript').remove();
  return $.root().text().replace(/\s+/g, ' ').trim();
};
const iso = (value: string | undefined): string | undefined => {
  if (!value?.trim()) return undefined;
  const raw = value.trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  // Dates without a published timezone are calendar dates, interpreted as UTC.
  const ms = Date.parse(/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(raw) ? raw.replace(/[/.]/g, '-') + 'T00:00:00Z' : /(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)\s*$/i.test(raw) ? raw : raw + ' UTC');
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
};
function officialUrl(value: string | undefined, source: NewsSource, base = source.url ?? source.sourceUrl): string | undefined {
  try {
    if (!value?.trim()) return undefined;
    const url = new URL(value.trim(), base);
    const hosts = source.hosts ?? [new URL(source.sourceUrl).hostname, new URL(source.url ?? source.sourceUrl).hostname];
    if (source.articlePath && !source.articlePath.test(url.pathname)) return undefined;
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !hosts.includes(url.hostname)) return undefined;
    return url.href;
  } catch { return undefined; }
}
function finish(items: NewsItem[]): NewsItem[] {
  const unique = new Map<string, NewsItem>();
  for (const item of items) {
    if (!item.title.trim() || !item.url) continue;
    const previous = unique.get(item.url);
    unique.set(item.url, previous ? { ...item, ...previous, ...(!previous.publishedAt && item.publishedAt ? { publishedAt: item.publishedAt } : {}), ...(!previous.summary && item.summary ? { summary: item.summary } : {}) } : item);
  }
  return [...unique.values()].sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0)).slice(0, 10);
}
function item(title: string, url: string | undefined, date?: string, description?: string): NewsItem | undefined {
  title = title.trim(); if (!title || !url) return undefined;
  const publishedAt = iso(date), summary = description ? [...clean(description)].slice(0, 200).join('') : '';
  return { title, url, ...(publishedAt ? { publishedAt } : {}), ...(summary ? { summary } : {}) };
}
const local = (name: string) => name.split(':').pop()!.toLowerCase();
function children(row: Cheerio<AnyNode>, name: string): Cheerio<AnyNode> { return row.children().filter((_, e) => 'name' in e && local(e.name) === name); }
function xmlFeed(body: string, source: NewsSource): NewsItem[] {
  const $ = load(body, { xml: { decodeEntities: true } });
  const root = $.root().children().first(), name = root[0] && 'name' in root[0] ? local(root[0].name) : '';
  const atom = name === 'feed';
  if ((source.kind === 'atom' && !atom) || (source.kind === 'rss' && !['rss', 'rdf'].includes(name))) throw new Error('Official source did not return the expected feed');
  const entries = atom ? children(root, 'entry') : name === 'rss' ? children(children(root, 'channel'), 'item') : children(root, 'item');
  const out: NewsItem[] = [];
  entries.each((_, node) => {
    const row = $(node), title = children(row, 'title').first();
    const titleText = title.attr('type') === 'html' ? clean(title.text()) : title.text().trim();
    const links = children(row, 'link');
    const link = atom ? links.filter((_, e) => !$(e).attr('rel') || $(e).attr('rel') === 'alternate').first() : links.first();
    const base = row.attr('xml:base') ?? root.attr('xml:base') ?? source.url;
    const url = officialUrl(atom ? link.attr('href') : link.text(), source, base);
    const date = atom ? children(row, 'published').text() || children(row, 'updated').text() : children(row, 'pubdate').text() || children(row, 'date').text();
    const description = children(row, atom ? 'summary' : 'description').first();
    const result = item(titleText, url, date, description.text());
    if (result) out.push(result);
  });
  return finish(out);
}
function jsonFeed(body: string, source: NewsSource): NewsItem[] {
  const data = JSON.parse(body);
  if (!/^https:\/\/jsonfeed.org\/version\//.test(data.version) || !Array.isArray(data.items)) throw new Error('Official source did not return JSON Feed');
  return finish(data.items.flatMap((row: Record<string, unknown> | null) => {
    if (!row || typeof row !== 'object') return [];
    if (typeof row.title !== 'string') return [];
    const result = item(row.title, officialUrl(typeof row.url === 'string' ? row.url : undefined, source), typeof row.date_published === 'string' ? row.date_published : undefined, typeof row.summary === 'string' ? row.summary : undefined);
    return result ? [result] : [];
  }));
}
const datePattern = /(?:\b\d{4}[-/.]\d{2}[-/.]\d{2}|\b\d{1,2}\/\d{1,2}\/\d{4}|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\s*$/i;
function htmlDate($: CheerioAPI, row: Cheerio<AnyNode>): string | undefined {
  const time = row.find('time').first();
  if (time.length) return time.attr('datetime') ?? time.text();
  // Only standalone date nodes (or a date trailing a category label), never slugs.
  for (const node of row.find('span,p,div').toArray()) {
    const candidate = $(node);
    if (candidate.find('h1,h2,h3,h4,p').length || candidate.text().length > 80) continue;
    const match = candidate.text().trim().match(datePattern);
    if (match) return match[0];
  }
  return undefined;
}
function htmlListing(body: string, source: NewsSource): NewsItem[] {
  const recipe = source.html!;
  const $ = load(body); $('script,style,template').remove();
  const out: NewsItem[] = [];
  $(recipe.rows).each((_, node) => {
    const row = $(node), title = recipe.title === '.' ? row : row.find(recipe.title).first();
    // Permalink icons are not part of the published headline (e.g. AssemblyAI's #).
    const visibleTitle = title.clone(); visibleTitle.find('[aria-hidden="true"]').remove();
    const titleText = visibleTitle.text().replace(/\s+/g, ' ').trim();
    const rawUrl = recipe.link === '#' ? row.attr('id') ? `#${row.attr('id')}` : undefined : (recipe.link ? row.find(recipe.link).first().attr('href') : row.attr('href'));
    const date = source.companyId === 'deepseek' ? titleText.match(datePattern)?.[0] : htmlDate($, recipe.dateScope ? row.closest(recipe.dateScope) : row);
    const result = item(titleText, officialUrl(rawUrl, source), date, recipe.summary ? row.find(recipe.summary).first().html() ?? undefined : undefined);
    if (result) out.push(result);
  });
  if (!out.length) throw new Error('Official listing has no readable server-rendered posts');
  return finish(out);
}
export function parseNews(body: string, source: NewsSource): NewsItem[] {
  if (source.kind === 'json') return jsonFeed(body, source);
  if (source.kind === 'html') return htmlListing(body, source);
  return xmlFeed(body, source);
}
export class NewsService {
  private cache: RefreshCache<CompanyNews>;
  constructor(registry = newsSources, read?: (url: string) => Promise<string>, now = Date.now, queue = new WorkQueue(4)) {
    const http = new HttpSource({ cache: false, allowHtml: true, accept: 'application/rss+xml, application/atom+xml, application/feed+json, application/xml, text/html;q=0.9' });
    read ??= url => http.read(url);
    const sources = new Map(registry.map(s => [s.companyId, s]));
    const empty = (id: string, note?: string): CompanyNews => {
      const source = sources.get(id)!;
      return { companyId: id, sourceName: source.sourceName, sourceUrl: source.sourceUrl, items: [], fetchedAt: new Date(now()).toISOString(), ...(note ? { note } : {}) };
    };
    this.cache = new RefreshCache({
      ids: [...sources.keys()], ttl: 60 * 60_000, queue, now, maxEntryBytes: 128 * 1024, maxBytes: 4 * 1024 * 1024,
      pending: id => empty(id, 'Awaiting first official news fetch'),
      load: async id => {
        const source = sources.get(id)!;
        if (!source.url) return empty(id, 'No official news feed found');
        const items = parseNews(await read(source.url), source);
        return { ...empty(id), items, ...(!items.length ? { note: 'Official feed currently contains no posts' } : {}) };
      },
      failure: (id, error, previous) => {
        const message = error instanceof Error ? error.message.slice(0, 200) : 'source read failed';
        const note = `Official news unavailable: ${message}`;
        // Access challenges must return [], even when the source previously worked.
        if (/403|challenge|captcha/i.test(message)) return empty(id, note);
        return previous ? { ...previous, note: `${note}. Last successful data retained.` } : empty(id, note);
      },
    });
  }
  get(id: string): Promise<CompanyNews> | undefined { return this.cache.get(id); }
  all(): Promise<CompanyNews[]> { return this.cache.all(); }
  refresh(id: string): Promise<CompanyNews> { return this.cache.refresh(id); }
  start(): void { this.cache.start(); }
  stop(): void { this.cache.stop(); }
}
