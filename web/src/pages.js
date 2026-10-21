// Company pages, laid out like the Weather app: a sideways strip of pages (native scroll-snap, so
// swiping and paging run on the compositor), one per company in the viewer's list. Only the page in
// view and its neighbours are built; the sky follows whichever page settles in view.

import { $, LEVEL, CATEGORY, esc, ago, shortDate, iconHtml, wxImg, visible, uptime, news, primaryOf, hasHistory, pctText, dotText, uptimeOf, onData, condForCompany, state, seen } from './common.js';
import { S, reduced, rollNumber } from './motion.js';
import { barsHtml, wireBars } from './bars.js';

const root = $('#pages'), track = $('#track'), dotsEl = $('#dots');
const HOME_TITLE = document.title;
let api = null;            // { weather, sky, tileRect(id), onClose() }
let order = [];            // company ids, in the viewer's order
let current = -1;
const pages = new Map();   // id -> <article>
const built = new Set();   // ids whose page content is up to date
export const isOpen = () => !root.hidden;
export const currentId = () => order[current] ?? null;

// ---------------------------------------------------------------------------- page content
const fmtMin = v => { const m = Math.max(1, Math.round(v)); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m} min`; };
const dayLabel = (date, i) => (i === 0 ? 'Today' : new Date(`${date}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' }));
const DAY_WORD = { unknown: '–', degraded: 'Cloudy' }; // short enough for a day's column; the icon says the rest
const dayWord = d => (d.level === 'operational' ? 'OK' : d.downMinutes ? fmtMin(d.downMinutes).replace(' min', 'm') : DAY_WORD[d.level] ?? LEVEL[d.level]?.sky ?? '');
// how many days a part's bars cover: the same window as its figure (a page that only publishes 30 days shows 30)
const spanOf = x => (x.pct90 == null && x.pct30 != null ? 30 : 90);
// A company's parts, most important first: the one the headline uses, then any with a problem right now, then the
// ones people use (the API, the app, the chat, the site itself), then the rest in the status page's own order, with
// admin, billing, docs and support-type parts last (Grok used to lead with "Admin APIs").
const KEY_PART = /\bapi\b|inference|completion|chat|\bapp\b|\.com\b|\.ai\b|\bweb\b|platform|model|agent|editor|\bide\b|console/i;
const SIDE_PART = /admin|billing|support|\bdocs?\b|documentation|status|dashboard|\bsso\b|login|sign.?(in|up)|account|marketing|blog|community|forum|careers?|payment|webhook/i;
function partsOf(u, p, c) {
  const hurt = x => { const lv = c?.components?.find(y => y.name === x.name)?.level; return lv && lv !== 'operational' && lv !== 'unknown'; };
  const score = x => (x.name === p?.name ? 0 : 1000) + (hurt(x) ? 0 : 100) + (SIDE_PART.test(x.name) ? 20 : KEY_PART.test(x.name) ? 0 : 10);
  return (u?.components ?? []).filter(hasHistory).map((x, i) => [x, score(x), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([x]) => x);
}


/** One plain sentence, built only from what the official source says. */
function summary(c, u, p) {
  const lv = LEVEL[c.level] ?? LEVEL.unknown;
  if (c.sourceKind === 'none') return /^https:\/\/status\./.test(c.officialUrl || '')
    ? `${c.name} publishes its status on its own page, and that page blocks other sites (this one included) from reading it. Open it above to see it live.`
    : `${c.name} doesn't publish a status page.`;
  if (c.level === 'unknown') return `${c.name}'s status page isn't answering right now.`;
  if (c.openIncidents.length) {
    const i = c.openIncidents[0], more = c.openIncidents.length - 1;
    return `Happening now: “${i.title}” (${i.status || lv.word.toLowerCase()}), started ${ago(i.startedAt)}.${more > 0 ? ` ${more} more open.` : ''}`;
  }
  if (c.level !== 'operational') return `${c.name} reports ${lv.word.toLowerCase()}.`;
  const days = p?.days ?? [];
  for (let k = days.length - 1; k >= 0; k--) {
    const d = days[k];
    if ((d.level === 'operational' || d.level === 'unknown') && !d.events?.length) continue;
    const when = new Date(`${d.date}T12:00:00Z`).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const what = d.events?.length ? `“${d.events[0].title}”` : (LEVEL[d.level]?.word ?? 'an incident').toLowerCase();
    return `No open incidents. Last incident ${when}: ${what}${d.downMinutes ? ` (${fmtMin(d.downMinutes)})` : ''}.`;
  }
  const known = days.filter(d => d.level !== 'unknown').length;
  if (known) return `No open incidents, and none in the last ${known} days.`;
  if (u?.feedIncidents90d != null) return `No open incidents. ${u.feedIncidents90d} on the official feed in the last 90 days.`;
  return 'No open incidents.';
}

function hero(c, p) {
  const lv = LEVEL[c.level] ?? LEVEL.unknown;
  const up = uptimeOf(p), val = up?.value;
  const hl = up ? up.label : ''; // one number, one plain label for what it covers
  return `
    <header class="cp-hero">
      <p class="cp-kicker">${iconHtml(c, 'ico tiny')}<span>${esc(CATEGORY[c.category] ?? '')}</span></p>
      <h1 class="cp-name">${esc(c.name)}</h1>
      ${val != null
        ? `<p class="cp-big dot-num" aria-label="${esc(pctText(val))} uptime"><span class="cp-roll" data-v="${esc(pctText(val))}">${dotText(pctText(val))}</span></p>`
        : c.level === 'no-page' && c.officialUrl
          ? `<p class="cp-big open"><a class="cp-open" href="${esc(c.officialUrl)}" target="_blank" rel="noopener">Open ${esc(c.name)}'s status page<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a></p>`
          : `<p class="cp-big icon">${wxImg(c.level, 'wx hero')}</p>`}
      <p class="cp-cond">${esc(c.level === 'operational' ? 'Clear' : lv.sky === 'Unknown' || c.level === 'no-page' ? lv.word : `${lv.sky} · ${lv.word}`)}</p>
      <p class="cp-hl">${esc(hl || (c.sourceKind === 'none' ? (/^https:\/\/status\./.test(c.officialUrl || '') ? '' : 'No status page') : 'No uptime published'))}</p>
    </header>
    <div class="cp-mini" aria-hidden="true"><b>${esc(c.name)}</b>${val != null ? `<span>${esc(pctText(val))}</span>` : ''}<span>${esc(c.level === 'operational' ? 'Clear' : lv.sky)}</span></div>`;
}

// the uptime history can lag the live page: while an incident is open, Today shows at least what the status page says now
const RANK = { operational: 0, maintenance: 1, degraded: 2, partial: 3, major: 4 };
function withLive(d, c) {
  return (RANK[c.level] ?? -1) > (RANK[d.level] ?? 0) ? { ...d, level: c.level } : d;
}

// What's happening now, in the company's own words: title, status, when it started, its latest update, the post.
function openIncidents(c) {
  return `<ol class="incidents">${c.openIncidents.slice(0, 3).map(i => `
    <li style="--c:${LEVEL[i.level]?.color ?? 'var(--unk)'}">
      <p class="i-title">${esc(i.title)}</p>
      <p class="i-meta">${esc(i.status ? i.status[0].toUpperCase() + i.status.slice(1) : 'Open')} · started ${esc(ago(i.startedAt))}${i.url ? ` · <a href="${esc(i.url)}" target="_blank" rel="noopener">Official post</a>` : ''}</p>
      ${i.latestUpdate ? `<p class="i-update">${esc(i.latestUpdate)}</p>` : ''}
    </li>`).join('')}</ol>${c.openIncidents.length > 3 ? `<p class="i-more">${c.openIncidents.length - 3} more open on the official page.</p>` : ''}`;
}

function nowCard(c, u, p) {
  const days = (p?.days ?? []).slice(-14).reverse().map((d, i) => (i === 0 ? withLive(d, c) : d));
  const open = c.openIncidents?.length > 0;
  return `
    <section class="card now">
      ${open ? openIncidents(c) : `<p class="cp-summary">${esc(summary(c, u, p))}</p>`}
      ${!open && c.summary && !/all systems operational|^demo:/i.test(c.summary) && c.sourceKind !== 'none' ? `<p class="cp-quote">“${esc(c.summary.length > 170 ? `${c.summary.slice(0, 167)}…` : c.summary)}”</p>` : ''}
      ${days.length ? `<div class="days" role="list">${days.map((d, i) => `
        <div class="day" role="listitem" data-i="${days.length - 1 - i}" style="--c:${LEVEL[d.level]?.color}">
          <span class="d-label">${esc(dayLabel(d.date, i))}</span>${wxImg(d.level, 'wx day', { night: false })}<span class="d-val${d.level === 'operational' ? ' ok' : ''}">${esc(dayWord(d))}</span>
        </div>`).join('')}</div>` : ''}
    </section>`;
}

function uptimeCard(p) {
  if (!p?.days?.length) return '';
  return `
    <section class="card">
      <h2 class="card-h"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M9 19v-9M14 19v-6M19 19V8"/></svg>${p.days.length}-day uptime · ${esc(p.name)}</h2>
      ${barsHtml(p.days, 'big')}
      <div class="bars-axis"><span>${p.days.length} days ago</span><span>today</span></div>
    </section>`;
}

// a date-only post comes through as midnight UTC: show that calendar day, not the evening before in the Americas
const newsDate = iso => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', ...(/T00:00:00(\.000)?Z$/.test(iso) ? { timeZone: 'UTC' } : {}) });
function newsCard(c) {
  const n = news.get(c.id);
  if (!n || (!n.items?.length && /awaiting/i.test(n.note || ''))) return ''; // not fetched yet: no card rather than a placeholder
  const items = (n.items || []).slice(0, 6);
  return `
    <section class="card">
      <h2 class="card-h"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h11v14H7a2 2 0 0 1-2-2zM16 9h3v8a2 2 0 0 1-2 2"/><path d="M8 9h5M8 12.5h5M8 16h3"/></svg>Latest news${n.sourceName ? ` · ${esc(n.sourceName)}` : ''}</h2>
      ${items.length ? `<ol class="news">${items.map(it => `
        <li><a href="${esc(it.url)}" target="_blank" rel="noopener">
          <span class="n-date">${it.publishedAt ? esc(newsDate(it.publishedAt)) : ''}</span>
          <span class="n-title">${esc(it.title)}</span>
          <svg class="n-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </a></li>`).join('')}</ol>`
        : `<p class="card-note">${esc(/\b40[13]\b|blocked/i.test(n.note || '') ? `${c.name}'s news page blocks other sites from reading it.` : n.note || `No official news feed found for ${c.name}.`)}</p>`}
    </section>`;
}

function tiles(c, u, p) {
  const out = [];
  if (c.waitTimes?.length) out.push(`
    <div class="tile wide">
      <h3>Wait times</h3>
      <ul class="waits">${c.waitTimes.slice(0, 6).map(w => `<li><span>${esc(w.label)}</span><span>fast ${esc(w.formattedFast ?? '–')}</span><span>relax ${esc(w.formattedRelax ?? '–')}</span></li>`).join('')}</ul>
    </div>`);
  const comps = partsOf(u, p, c);
  const nowOf = name => c.components?.find(p => p.name === name)?.level;
  comps.forEach((x, k) => {
    const up = uptimeOf(x), v = up?.value, lvNow = nowOf(x.name), span = spanOf(x);
    out.push(`
      <div class="tile${k >= 8 ? ' more' : ''}">
        <h3>${esc(x.name)}</h3>
        ${v != null ? `<p class="t-num dot-num"><span>${dotText(pctText(v))}</span></p>`
          : lvNow ? `<p class="t-num small">${wxImg(lvNow, 'wx t-wx')}${esc(lvNow === 'operational' ? 'Clear' : LEVEL[lvNow]?.word ?? lvNow)}</p>` : '<p class="t-num">—</p>'}
        ${x.days?.length ? barsHtml(x.days.slice(-span), 'mini', `data-c="${k}"`) : ''}
        <p class="t-sub">${up ? up.short : x.days?.length ? `Last ${Math.min(span, x.days.length)} days` : 'No percentage published'}</p>
      </div>`);
  });
  if (!comps.length && c.components?.length) c.components.forEach(x => out.push(`
      <div class="tile" style="--c:${LEVEL[x.level]?.color}">
        <h3>${esc(x.name)}</h3>
        <p class="t-num small">${wxImg(x.level, 'wx t-wx')}${esc(x.level === 'operational' ? 'Clear' : LEVEL[x.level]?.word ?? x.level)}</p>
      </div>`));
  if (!out.length) return '';
  return `
    <section class="tiles${comps.length > 8 ? ' collapsed' : ''}">
      ${out.join('')}
      ${comps.length > 8 ? `<button type="button" class="tile show-all">Show all ${comps.length} parts</button>` : ''}
    </section>`;
}

function foot(c) {
  const kind = c.readIn === 'browser' ? 'Read in your browser from the official status data' : c.sourceKind === 'live' ? 'Read from the official status page' : c.sourceKind === 'incident-feed' ? 'Read from the official incident feed' : 'No readable official status page';
  return `
    <footer class="cp-foot">
      ${c.officialUrl ? `<a class="official" href="${esc(c.officialUrl)}" target="_blank" rel="noopener"><span>Official status page</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg></a>` : ''}
      <p class="src">${esc([kind, seen(c.fetchedAt) ? (c.stale ? `last good read ${ago(c.fetchedAt)}` : `checked ${ago(c.fetchedAt)}`) : ''].filter(Boolean).join(', '))}</p>
    </footer>`;
}

function build(id) {
  const el = pages.get(id), c = state.companies.get(id);
  if (!el || !c) return;
  if (tipOwner === el) hideTip(); // its bars are about to be replaced
  const u = uptime.get(id), p = primaryOf(u);
  const keep = el.scrollTop;
  el.dataset.level = c.level;
  el.innerHTML = `<div class="cp-col">${hero(c, p)}${nowCard(c, u, p)}${uptimeCard(p)}${newsCard(c)}${tiles(c, u, p)}${foot(c)}</div>`;
  el.scrollTop = keep;
  el.querySelector('.show-all')?.addEventListener('click', e => { e.currentTarget.closest('.tiles').classList.remove('collapsed'); e.currentTarget.remove(); });
  wireTips(el, p, u, c);
  wireBars(el);
  built.add(id);
}

// bar tooltips. The bars can be redrawn under the pointer (live data), which never sends "pointer left",
// so the tip also hides on any move off the bars, on scroll, on redraw and when the page changes.
const tip = $('#tip');
let tipOwner = null; // the page whose bars the tip belongs to
const hideTip = () => { tipOwner = null; if (!tip.hidden) tip.hidden = true; };
const offBars = e => { if (!e.target.closest?.('.bars')) hideTip(); };
document.addEventListener('pointermove', offBars, { passive: true });
document.addEventListener('pointerdown', offBars, { passive: true });
addEventListener('blur', hideTip);
root.addEventListener('scroll', hideTip, { passive: true, capture: true }); // the page's own scroll and the sideways strip
function wireTips(el, p, u, c) {
  el.querySelectorAll('.bars.big, .bars.mini').forEach(b => {
    const big = b.classList.contains('big');
    const comp = big ? p : partsOf(u, p, c)[+b.dataset.c]; // same list, same order the tiles were drawn from
    const days = big ? p?.days : comp?.days?.slice(-spanOf(comp));
    let last = -1;
    b.addEventListener('pointermove', e => {
      const n = days?.length ?? 0; if (!n) return;
      const r = b.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n)));
      if (i === last && !tip.hidden) return;
      last = i;
      const d = days[i];
      tip.innerHTML = `<b>${esc(shortDate(`${d.date}T12:00:00Z`))}</b><span style="--c:${d.level === 'operational' ? 'var(--ok)' : LEVEL[d.level]?.color}">${esc(d.level === 'operational' ? 'No incidents' : LEVEL[d.level]?.word)}${d.downMinutes ? ` · ${fmtMin(d.downMinutes)}` : ''}</span>${(d.events || []).slice(0, 3).map(ev => `<em>${esc(ev.title)}</em>`).join('')}`;
      tip.hidden = false; tipOwner = el;
      const tw = tip.offsetWidth, x = r.left + (i + .5) * r.width / n; // over the bar the pointer is on
      tip.style.left = `${Math.min(innerWidth - tw - 12, Math.max(12, x - tw / 2))}px`;
      tip.style.top = `${Math.max(12, r.top - tip.offsetHeight - 10)}px`;
    });
    b.addEventListener('pointerleave', () => { last = -1; tip.hidden = true; });
  });
}

// ---------------------------------------------------------------------------- the strip
const io = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting && !built.has(e.target.dataset.id)) build(e.target.dataset.id);
}, { root: track, rootMargin: '0px 100% 0px 100%' });

function shells() {
  const ids = visible().map(c => c.id);
  if (ids.join() === order.join()) return;
  order = ids;
  const frag = document.createDocumentFragment();
  for (const id of ids) {
    let el = pages.get(id);
    if (!el) { el = document.createElement('article'); el.className = 'cp'; el.dataset.id = id; el.tabIndex = -1; pages.set(id, el); io.observe(el); }
    frag.append(el);
  }
  track.replaceChildren(frag);
  for (const [id, el] of pages) if (!ids.includes(id)) { io.unobserve(el); pages.delete(id); built.delete(id); }
}

function renderDots() {
  const n = order.length, max = 9;
  const start = Math.max(0, Math.min(current - 4, n - max)), end = Math.min(n, start + max);
  let html = '';
  for (let i = start; i < end; i++) {
    const edge = (i === start && start > 0) || (i === end - 1 && end < n);
    const c = state.companies.get(order[i]);
    html += `<button type="button" class="dot${i === current ? ' on' : ''}${edge ? ' small' : ''}" data-i="${i}" aria-label="${esc(c?.name ?? '')}"${i === current ? ' aria-current="true"' : ''}></button>`;
  }
  dotsEl.innerHTML = html;
  $('#pg-prev').disabled = current <= 0;
  $('#pg-next').disabled = current >= n - 1;
}

/** The big number rolls up from zero, like the old pages did. */
function rollHero(id) {
  const el = pages.get(id)?.querySelector('.cp-roll');
  if (!el || reduced()) return;
  el.dataset.value = ''; el.textContent = '';
  rollNumber(el, el.dataset.v);
}

let skyTimer = 0;
function settle() {
  const idx = Math.max(0, Math.min(order.length - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
  if (idx === current) return;
  current = idx;
  const id = order[idx];
  renderDots();
  if (location.pathname !== `/${id}`) history.replaceState({ id }, '', `/${id}`);
  document.title = `${state.companies.get(id)?.name ?? 'aiweather'} · aiweather`;
  for (const k of [idx - 1, idx, idx + 1]) if (order[k] && !built.has(order[k])) build(order[k]);
  clearTimeout(skyTimer);
  skyTimer = setTimeout(() => {
    const c = state.companies.get(order[current]);
    if (c && isOpen()) api.weather.set(condForCompany(c), { origin: [.5, .55], fast: true });
  }, 140);
}
let ticking = false;
track.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; settle(); }); } }, { passive: true });

export function goTo(i, smooth = true) {
  i = Math.max(0, Math.min(order.length - 1, i));
  track.scrollTo({ left: i * track.clientWidth, behavior: smooth && !reduced() ? 'smooth' : 'instant' });
}
export const step = dir => goTo(current + dir);

// ---------------------------------------------------------------------------- open / close
// --- the morph: the company's logo, name and number fly from its tile into its page, and back on close.
// Everything else on the page just fades where it is: nothing slides up from the bottom. On the way they also take on
// the colour and glow of where they're going (the board's coloured figure is white on a page), so nothing switches
// when they land. A flight can be turned around mid-air (Esc while a page is still opening, a tap on the tile while
// it's closing): everything heads back from wherever it is on screen, instead of being measured half-way and snapping.
const css = el => getComputedStyle(el);
function flyPairs(id) {
  const tile = api.tileEl?.(id), page = pages.get(id);
  if (!tile || !page) return [];
  const pct = tile.querySelector('.pct'), roll = page.querySelector('.cp-big.dot-num .cp-roll');
  const pairs = [
    [tile.querySelector('.ico'), page.querySelector('.cp-kicker .ico'), false],
    [tile.querySelector('.name'), page.querySelector('.cp-name'), true],
    roll && pct && !pct.hidden ? [pct, roll, true] : [tile.querySelector('.st-wx .wx, .row-wx .wx'), page.querySelector('.cp-big.icon .wx'), false],
  ];
  return pairs.filter(([a, b]) => a && b && a.getClientRects().length && b.getClientRects().length);
}
// for text, the words themselves (a tile's name box is wider than the name). A rolling number is measured by its own
// box: its digits sit in tall 0-9 columns, and measuring those would put the number a line or more off.
function inkBox(el, text) {
  if (!text || el.querySelector('.rd, .rd-col, .rc')) return el.getBoundingClientRect();
  const r = document.createRange(); r.selectNodeContents(el);
  const box = r.getBoundingClientRect();
  return box.width ? box : el.getBoundingClientRect();
}
/** Keyframe that lays page element b exactly over tile element a: same centre, text scaled by font size. */
function over(a, b, text) {
  const ra = inkBox(a, text), rb = inkBox(b, text), bb = b.getBoundingClientRect();
  const s = text ? parseFloat(css(a).fontSize) / parseFloat(css(b).fontSize) : ra.width / Math.max(1, rb.width);
  const cx = rb.left + rb.width / 2, cy = rb.top + rb.height / 2;
  const dx = ra.left + ra.width / 2 - cx, dy = ra.top + ra.height / 2 - cy;
  return { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(4)})`, transformOrigin: `${(cx - bb.left).toFixed(1)}px ${(cy - bb.top).toFixed(1)}px` };
}
/** The page's own parts that fade (everything except what flies). */
function fadeParts(page, fliers) {
  const flies = el => fliers.some(f => f === el || el.contains(f));
  return [...page.querySelectorAll('.cp-kicker > :not(.ico), .cp-cond, .cp-hl, .cp-big, .cp-col > :not(.cp-hero):not(.cp-mini)')].filter(el => !flies(el));
}
let tileHolds = []; // opacity animations keeping a tile's own text hidden while its copy is out on the page
function hideTileParts(els, ms = 0) {
  for (const el of els) tileHolds.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' }));
}
function showTileParts() { tileHolds.forEach(a => a.cancel()); tileHolds = []; }

/** A flier's colour and glow on its page (read while nothing is animating it) and in its tile. */
const pageLook = el => ({ color: css(el).color, textShadow: css(el).textShadow });
const tileLook = el => ({ color: css(el).color, textShadow: css(el).textShadow });

let flight = null; // what's in the air: { dir: 'open' | 'close', id, anims, watch: elements, timer, hero }
/** Stops the flight in the air and says how each of its parts looks on screen at this moment. */
function grab() {
  const f = flight;
  if (!f) return null;
  flight = null;
  clearTimeout(f.timer);
  const look = new Map();
  for (const el of f.watch) {
    const s = css(el);
    look.set(el, { transform: s.transform, opacity: +s.opacity, color: s.color, textShadow: s.textShadow });
  }
  f.anims.forEach(a => a.cancel());
  releaseHero(f.hero);
  return { ...f, look };
}
/** A page scrolled down still flies home: its header's scroll-linked fade is held exactly where it is (no jump), so
 *  the name and number inside it can fly; the close then brings the header up to full strength under them. */
function holdHero(page) {
  const hero = page && page.scrollTop > 0 ? page.querySelector('.cp-hero') : null;
  if (!hero) return null;
  const s = css(hero);
  hero.style.animation = 'none';
  hero.style.opacity = s.opacity;
  hero.style.transform = s.transform === 'none' ? '' : s.transform;
  return hero;
}
function releaseHero(hero) {
  if (!hero) return;
  hero.style.animation = ''; hero.style.opacity = ''; hero.style.transform = '';
}
const landed = (me, then) => Promise.all(me.anims.map(a => a.finished.catch(() => {}))).then(() => { if (flight === me) { flight = null; then?.(); } });

/** Builds a company's page and its neighbours ahead of a tap (on press, or after a short hover), so opening has
 *  nothing left to build and the flight starts on the very next frame. */
export function prepare(id) {
  if (isOpen()) return;
  shells();
  const i = order.indexOf(id);
  for (const k of [i, i + 1, i - 1]) if (order[k] && !built.has(order[k])) build(order[k]);
}

export function open(id, { push = true } = {}) {
  if (flight?.dir === 'open' && flight.id === id) return true; // already on its way in
  shells();
  const i = order.indexOf(id);
  if (i < 0) return false;
  const turning = flight?.dir === 'close' && flight.id === id; // its page is still flying back to the tile: turn round
  const wasClosing = flight?.dir === 'close';
  const back = grab();
  root.classList.remove('leaving');
  if (push && location.pathname !== `/${id}`) history.pushState({ id }, '', `/${id}`);
  const wasOpen = isOpen() && !wasClosing;
  root.hidden = false;
  document.body.classList.add('paging');
  $('#home').inert = true;
  for (const k of [i - 1, i, i + 1]) if (order[k] && !built.has(order[k])) build(order[k]); // built pages are kept (live data marks them stale)
  if (!turning) {
    current = -1;
    track.scrollLeft = i * track.clientWidth;
    settle();
  }
  const c = state.companies.get(id);
  clearTimeout(skyTimer);
  api.weather.previewing = false;
  api.weather.set(condForCompany(c), { origin: [.5, .55] });
  let numberFlew = false;
  showTileParts();
  if (!wasOpen && !reduced()) {
    const page = pages.get(id);
    if (!turning) page.scrollTop = 0;
    const pairs = flyPairs(id), fliers = pairs.map(p => p[1]), parts = fadeParts(page, fliers);
    const ms = S.settle?.ms ?? 560, ease = S.settle?.ease ?? 'cubic-bezier(.2, .8, .2, 1)';
    const anims = [];
    for (const [from, to, text] of pairs) {
      const k = over(from, to, text), was = back?.look.get(to);
      const start = was ? { transform: was.transform, transformOrigin: k.transformOrigin, color: was.color, textShadow: was.textShadow } : { ...k, ...tileLook(from) };
      anims.push(to.animate([start, { transform: 'none', transformOrigin: k.transformOrigin, ...pageLook(to) }], { duration: ms, easing: ease }));
      // it starts exactly on the tile's own text (same place, size and colour), so the two swap in one frame
      if (was && was.opacity < 1) anims.push(to.animate([{ opacity: was.opacity }, { opacity: 1 }], { duration: 90, easing: 'linear' }));
      if (to.classList.contains('cp-roll')) numberFlew = true;
    }
    hideTileParts(pairs.map(p => p[0])); // it left the tile
    // the hero's small lines wait for the flying name and number to land; the cards below come in sooner
    for (const el of parts) {
      const was = back?.look.get(el);
      anims.push(was ? el.animate([{ opacity: was.opacity }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
        : el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: el.closest('.cp-hero') ? 260 : 110, easing: 'ease-out', fill: 'backwards' }));
    }
    const rootWas = back?.look.get(root)?.opacity ?? 1;
    if (rootWas < 1) anims.push(root.animate([{ opacity: rootWas }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }));
    const me = flight = { dir: 'open', id, anims, watch: [...fliers, ...parts, root], timer: 0, hero: null };
    if (!turning) {
      // the arrows, dots bar and Back fade in (CSS) once the flight is under way
      root.classList.add('leaving');
      requestAnimationFrame(() => requestAnimationFrame(() => { if (flight === me) root.classList.remove('leaving'); }));
    }
    landed(me, () => { if (isOpen() && !built.has(id)) build(id); }); // news that came in while it flew
  }
  if (!numberFlew) rollHero(id);
  pages.get(id)?.focus({ preventScroll: true });
  return true;
}

export async function close({ push = true } = {}) {
  if (!isOpen() || flight?.dir === 'close') return;
  hideTip();
  const id = order[current];
  const back = flight?.dir === 'open' && flight.id === id ? grab() : (grab(), null); // turning round mid-flight
  // a sideways glide still running would carry the page (and its flying text) along: stop it on the page in view
  if (current >= 0 && !back) track.scrollTo({ left: current * track.clientWidth, behavior: 'instant' });
  if (push && location.pathname !== '/') history.pushState({}, '', '/');
  $('#home').inert = false;
  if (!reduced()) {
    const page = pages.get(id), tile = api.tileEl?.(id);
    if (tile) {
      // the tile has to be fully on screen (and not under the header) or the text would fly somewhere you can't see
      const r = tile.getBoundingClientRect(), under = document.querySelector('.top')?.getBoundingClientRect().bottom ?? 0;
      if (r.top < under + 8 || r.bottom > innerHeight - 8) tile.scrollIntoView({ block: 'center', behavior: 'instant' }); // the list is hidden, so the jump isn't seen
    }
    showTileParts();
    const hero = holdHero(page);
    const pairs = page ? flyPairs(id) : [], fliers = pairs.map(p => p[1]);
    const parts = page ? [...fadeParts(page, fliers), ...(hero ? [page.querySelector('.cp-mini')].filter(Boolean) : [])] : [];
    // the flight; then the tile's own text comes up underneath the landed copy (same place, size and colour) and only
    // then does the copy go, so the text never dims the way a crossfade of two half-clear copies does
    const MOVE = 340, SHOW = 60, FADE = 90;
    const anims = [];
    root.classList.add('leaving'); // arrows, dots bar, Back and the bottom shade fade out (CSS)
    for (const [from, to, text] of pairs) {
      const k = over(from, to, text), was = back?.look.get(to);
      let start = was ? { transform: was.transform, transformOrigin: k.transformOrigin, color: was.color, textShadow: was.textShadow }
        : { transform: 'translate(0px, 0px) scale(1)', transformOrigin: k.transformOrigin, ...pageLook(to) };
      if (!was) {
        // scrolled far down: the name and number come in from just above the window, not from far off
        const r = to.getBoundingClientRect(), top = -r.height - 12;
        if (r.top < top) start = { ...start, transform: `translate(0px, ${(top - r.top).toFixed(1)}px) scale(1)` };
      }
      anims.push(to.animate([start, { ...k, ...tileLook(from) }], { duration: MOVE, easing: 'cubic-bezier(.32, .72, 0, 1)', fill: 'forwards' }));
      if (was && was.opacity < 1) anims.push(to.animate([{ opacity: was.opacity }, { opacity: 1 }], { duration: 90, easing: 'linear', fill: 'forwards' }));
      anims.push(to.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE, delay: MOVE + SHOW, easing: 'linear', fill: 'forwards' }));
      anims.push(from.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SHOW, delay: MOVE, easing: 'linear', fill: 'both' }));
    }
    for (const el of parts) anims.push(el.animate([{ opacity: back?.look.get(el)?.opacity ?? 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' }));
    if (hero && pairs.length) anims.push(hero.animate([{ opacity: +hero.style.opacity }, { opacity: 1 }], { duration: 160, easing: 'ease-out', fill: 'forwards' }));
    if (!pairs.length) anims.push(root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }));
    // the list fades in once the page's cards are nearly gone, so the two never sit on top of each other
    const me = flight = { dir: 'close', id, anims, watch: [...fliers, ...parts, root], timer: setTimeout(() => document.body.classList.remove('paging'), 100), hero };
    await Promise.all(anims.map(x => x.finished.catch(() => {})));
    if (flight !== me) return; // turned round (or replaced) meanwhile
    flight = null;
    root.hidden = true;
    root.classList.remove('leaving');
    anims.forEach(x => x.cancel());
    releaseHero(hero);
  }
  document.body.classList.remove('paging');
  root.hidden = true;
  current = -1;
  document.title = HOME_TITLE;
  api.onClose(id);
}

/** Live data changed: rebuild what is on screen now, mark the rest to rebuild when they come into view. */
export function refresh(id) {
  if (!pages.has(id)) return;
  const near = Math.abs(order.indexOf(id) - current) <= 1;
  if (isOpen() && near && flight?.id !== id) build(id); else built.delete(id); // never under a flight: rebuilt once it lands
  // the company on screen changed weather: the sky follows it
  if (isOpen() && id === order[current]) {
    const c = state.companies.get(id);
    if (c) api.weather.set(condForCompany(c), { origin: [.5, .55] });
  }
}
/** The viewer's list changed (order, hidden companies). */
export function relist() {
  const id = order[current];
  shells();
  if (isOpen()) {
    const i = order.indexOf(id);
    if (i < 0) { close(); return; }
    current = -1;
    track.scrollLeft = i * track.clientWidth;
    settle();
  }
}

export function initPages(o) {
  api = o;
  $('#pg-prev').addEventListener('click', () => step(-1));
  $('#pg-next').addEventListener('click', () => step(1));
  dotsEl.addEventListener('click', e => { const b = e.target.closest('.dot'); if (b) goTo(+b.dataset.i); });
  $('#pg-home').addEventListener('click', () => close());
  $('#pg-back').addEventListener('click', () => close());
  addEventListener('resize', () => { if (isOpen() && current >= 0) track.scrollLeft = current * track.clientWidth; });
  onData((kind, id) => refresh(id));
}
