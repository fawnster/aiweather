import { Sky } from './sky.js';
import { WeatherController, conditionOf, sceneFor, LEVEL_RANK, clipsFor, phaseOf, forcePhase } from './weather.js';
import { markSvg } from './mark.js';
import { installSprings, rollNumber, reduced, S } from './motion.js';
import { $, LEVEL, esc, ago, clock, iconHtml, wxImg, wxName, seen, state, prefs, savePrefs, visible, customised, uptime, primaryOf, pctText, pctColor, uptimeOf, onData, preloadUptime, preloadNews, condForCompany, setBrowserUptime } from './common.js';
import { startBrowserSources, readInBrowser, inBrowser } from './browser-sources.js';
import { barsHtml, wireBars } from './bars.js';
import * as pages from './pages.js';
import { initEditor, openEditor, closeEditor, editorOpen } from './editor.js';
import { initArrange, arranging, exitArrange } from './arrange.js';

installSprings();
// every company's mark, one stylesheet next to this module (build.mjs); it waits behind the board's data and the sky
const marks = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('./icons.css', import.meta.url).pathname });
marks.fetchPriority = 'low';
document.head.append(marks);
const q = new URLSearchParams(location.search);
if (['night', 'day', 'dawn', 'dusk'].includes(q.get('time'))) forcePhase(q.get('time')); // QA: preview another time of day

// --- sky ------------------------------------------------------------------------
let sky = null, weather = null;
try {
  sky = new Sky($('#sky')).attach(window).start();
  sky.raw = false; // always the dot sky (the raw-footage option is gone)
  // one look for everyone: the cobalt sky (the colour picker is gone; an old saved choice is ignored)
  weather = new WeatherController(sky, { theme: 'cobalt' });
  weather.setTheme('cobalt');
} catch (err) {
  document.documentElement.classList.add('no-webgl');
  console.warn('aiweather: sky disabled,', err.message);
}

// phones always show the companies as a scrolling list (no grid, no calm); the saved layout is for wider screens
const phoneQ = matchMedia('(max-width: 640px)');
const viewNow = () => (phoneQ.matches ? 'list' : prefs.view);

// --- home: stations ---------------------------------------------------------------
const stationEls = new Map();
function stationFor(c) {
  const key = `${viewNow()}:${c.id}`;
  let el = stationEls.get(key);
  if (!el) {
    el = document.createElement('button');
    el.type = 'button'; el.dataset.id = c.id;
    if (viewNow() === 'list') {
      el.className = 'row';
      el.innerHTML = `<span class="del" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.5 12h11"/></svg></span>${iconHtml(c)}<span class="row-text"><span class="name">${esc(c.name)}</span><span class="cond"></span></span>
        <span class="row-wx" aria-hidden="true"></span><span class="row-right"><span class="pct num" hidden></span><span class="strip" aria-hidden="true"></span></span>`;
    } else {
      el.className = 'st';
      el.innerHTML = `<span class="del" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.5 12h11"/></svg></span><span class="st-top">${iconHtml(c)}<span class="st-wx" aria-hidden="true"></span></span><span class="name">${esc(c.name)}</span><span class="st-foot"><span class="pct num" hidden></span><span class="word"></span></span><span class="strip st-strip" aria-hidden="true"></span>`;
    }
    el.addEventListener('animationend', e => { if (e.target === el) el.classList.remove('enter', 'hit', 'heal', 'nudge'); });
    el.addEventListener('click', () => openCompany(c.id));
    // its page is built while the finger or button is going down (or after a short hover), not when the tap lands
    el.addEventListener('pointerdown', () => pages.prepare(c.id));
    el.addEventListener('pointerenter', () => { hoverCompany(c.id, true); clearTimeout(prepTimer); prepTimer = setTimeout(() => (window.requestIdleCallback || setTimeout)(() => pages.prepare(c.id)), 140); });
    el.addEventListener('pointerleave', () => { hoverCompany(c.id, false); clearTimeout(prepTimer); });
    stationEls.set(key, el);
  }
  if (el.dataset.level !== c.level || el.dataset.phase !== phaseOf()) {
    el.dataset.level = c.level; el.dataset.phase = phaseOf();
    const wx = el.querySelector('.st-wx, .row-wx');
    // a company whose status page only opens on its own site gets an "opens elsewhere" mark, not a weather
    wx.innerHTML = c.level === 'no-page' ? '<svg class="ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>' : wxImg(c.level, 'wx');
    wx.title = LEVEL[c.level]?.word ?? '';
  }
  const lv = LEVEL[c.level] ?? LEVEL.unknown;
  syncWord(el, c);
  const cond = el.querySelector('.cond');
  if (cond) cond.innerHTML = c.level === 'operational' ? 'Clear'
    : `${lv.sky === 'Unknown' || c.level === 'no-page' ? '' : `<span class="cond-sky">${esc(lv.sky)} · </span>`}${esc(lv.word)}`;
  return el; // its name is its own text (name, condition, uptime), so what a screen reader says is what's on it
}
// a grid tile's second line: its status word, or "Clear" when it has no number to show (so no tile looks empty)
function syncWord(el, c) {
  const word = el.querySelector('.word'); if (!word || !c) return;
  const noNumber = el.querySelector('.pct')?.hidden !== false;
  // next to a number the sun says "clear" on its own; a screen reader still hears the word
  if (c.level === 'operational' && !noNumber) word.innerHTML = '<span class="vh">Clear</span>';
  else word.textContent = c.level === 'operational' ? 'Clear' : (LEVEL[c.level] ?? LEVEL.unknown).word;
}
function paintUptime(id) {
  const u = uptime.get(id), p = primaryOf(u);
  for (const v of ['grid', 'list']) {
    const el = stationEls.get(`${v}:${id}`); if (!el) continue;
    const pct = el.querySelector('.pct');
    const val = uptimeOf(p)?.value;
    if (val != null) { pct.hidden = false; rollNumber(pct, pctText(val)); pct.style.color = pctColor(val); } else pct.hidden = true;
    syncWord(el, state.companies.get(id));
    const strip = el.querySelector('.strip');
    if (strip && !p?.days?.length && u?.feedIncidents90d != null && !strip.childElementCount) {
      const n = u.feedIncidents90d;
      strip.innerHTML = `<span class="feedcount">${n} incident${n === 1 ? '' : 's'} · 90 days</span>`;
      strip.removeAttribute('aria-hidden'); // a count is words to read out; the bars are a picture
    }
    if (strip && p?.days?.length && (!strip.childElementCount || strip.querySelector('.feedcount'))) { // bars win over a feed count (Grok gets both)
      strip.innerHTML = barsHtml(p.days.slice(-30), 'strip'); wireBars(strip);
      strip.setAttribute('aria-hidden', 'true');
    }
  }
}
onData((kind, id) => { if (kind === 'uptime') paintUptime(id); });

let prepTimer = 0; // a short hover builds that company's page ahead of a click
let builtView = null, builtList = '';
function renderStations(cs) {
  const host = $('#stations');
  if (viewNow() === 'calm') { host.innerHTML = ''; host.className = 'stations calm'; builtView = 'calm'; return; }
  const ids = cs.map(c => c.id).join();
  const fresh = builtView !== viewNow();
  // while arranging, the tiles stay where the viewer is putting them (only their contents update), unless a company
  // was added or taken off, which the normal pass handles (the viewer's order is already saved by then)
  const sameSet = [...host.children].map(e => e.dataset.id).sort().join() === cs.map(c => c.id).sort().join();
  if (arranging() && !fresh && sameSet) { cs.forEach(c => { stationFor(c); if (uptime.has(c.id)) paintUptime(c.id); }); return; }
  if (fresh) { host.innerHTML = ''; host.className = `stations ${viewNow()}`; }
  // when the order changes (a company runs into trouble and moves up, or recovers and goes back), the tiles slide to
  // their new places instead of jumping: measured before the move, then animated from there
  const was = !fresh && !reduced() && [...host.children].map(e => e.dataset.id).join() !== ids
    ? new Map([...host.children].map(el => [el, el.getBoundingClientRect()])) : null;
  cs.forEach((c, i) => {
    const el = stationFor(c);
    if (host.children[i] !== el) host.insertBefore(el, host.children[i] || null);
    if (fresh && !reduced()) { el.style.animationDelay = `${Math.min(i, 30) * 12}ms`; el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
    if (uptime.has(c.id)) paintUptime(c.id);
  });
  while (host.children.length > cs.length) host.lastElementChild.remove();
  if (was) for (const el of host.children) {
    const a = was.get(el); if (!a) continue;
    const b = el.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) + Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: S.settle?.ms ?? 560, easing: S.settle?.ease ?? 'cubic-bezier(.2, .8, .2, 1)', composite: 'add' });
  }
  builtView = viewNow(); builtList = ids;
}

// --- home: forecast ------------------------------------------------------------------
const list = names => names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
const joinNames = n => n.length < 2 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
// Swap the headline with a short fade. A newer change cancels one still running and starts from what's on screen,
// so an old line can never stay half-faded behind the new one. Nothing is held once it has finished.
let headSwap = 0;
function setHeadline(text) {
  const h = $('#headline');
  if (h.dataset.text === text) return;
  const first = !h.dataset.text;
  h.dataset.text = text;
  const me = ++headSwap;
  h.getAnimations().forEach(a => a.cancel());
  if (first || reduced()) { h.textContent = text; return; }
  h.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' })
    .finished.then(() => {
      if (me !== headSwap) return; // a newer swap took over
      h.getAnimations().forEach(a => a.cancel());
      h.textContent = text;
      h.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: S.settle?.ms ?? 420, easing: S.settle?.ease ?? 'ease-out' });
    }, () => {});
}

// Phone only: the Weather app's top. A line saying where the weather is (worst first, each place with
// its own weather), then the big count under it.
const SKY_WORD = [['major', 'storm'], ['partial', 'rain'], ['degraded', 'clouds'], ['maintenance', 'fog']];
function placeLine(cs) {
  const groups = SKY_WORD.map(([lv, w]) => ({ w, names: cs.filter(c => c.sourceKind !== 'none' && c.level === lv).map(c => c.name) })).filter(g => g.names.length);
  if (!groups.length) return 'Not a cloud in sight';
  const total = groups.reduce((n, g) => n + g.names.length, 0);
  let shown = 0;
  const parts = groups.slice(0, 2).map(g => { const n = g.names.slice(0, 2); shown += n.length; return `${g.w} over ${n.join(' and ')}`; });
  const line = parts.join(', ') + (total > shown ? ` +${total - shown} more` : '');
  return line[0].toUpperCase() + line.slice(1);
}

function renderForecast(cs, cond) {
  const readable = cs.filter(c => c.sourceKind !== 'none' && c.level !== 'unknown');
  const hurt = readable.filter(c => ['degraded', 'partial', 'major'].includes(c.level));
  const names = arr => arr.map(c => c.name);
  const head = {
    storm: () => `Storm over ${list(names(cond.majors))}`,
    rain: () => `Rain over ${list(names([...cond.partial, ...cond.degraded]))}`,
    overcast: () => `Overcast over ${list(names([...cond.partial, ...cond.degraded]))}`,
    fair: () => 'Mostly clear',
    fog: () => `Fog over ${list(names(cond.maint))}`,
  }[cond.id]?.() ?? 'Clear skies';
  const headText = phoneQ.matches ? placeLine(cs) : head;
  setHeadline(headText);
  const scope = customised() ? 'services in your list' : 'AI services';
  const subText = hurt.length ? `${hurt.length} of ${readable.length} ${scope} report problems right now.` : `All ${readable.length} ${scope} report normal operation.`;
  // every live update re-renders the board, so each part is only rewritten when what it says has changed
  put($('#subline'), hurt.length
    ? `<span class="sub-big"><span class="num">${hurt.length}</span> <span class="of">of</span> <span class="num">${readable.length}</span></span> <span class="sub-rest">${scope} report problems right now.</span>`
    : `<span class="sub-big"><span class="of">All</span> <span class="num">${readable.length}</span></span> <span class="sub-rest">${scope} report normal operation.</span>`);
  const noPage = cs.filter(c => c.sourceKind === 'none').map(c => c.name);
  const silent = cs.filter(c => c.sourceKind !== 'none' && c.level === 'unknown').map(c => c.name);
  const foot = [
    noPage.length ? `${joinNames(noPage)}'s status ${noPage.length === 1 ? 'page only opens' : 'pages only open'} on ${noPage.length === 1 ? 'its' : 'their'} own site.` : '',
    silent.length ? `Status ${silent.length === 1 ? 'page' : 'pages'} not answering right now: ${silent.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  if ($('#footnote').textContent !== foot) $('#footnote').textContent = foot;
  const aff = $('#affected');
  if (put(aff, viewNow() === 'calm'
    ? cs.filter(c => LEVEL_RANK[c.level] >= 2).map(c => `<button class="aff" data-id="${esc(c.id)}" data-level="${esc(c.level)}">${iconHtml(c)}<span>${esc(c.name)}</span></button>`).join('')
    : '')) aff.querySelectorAll('.aff').forEach(b => b.addEventListener('click', () => openCompany(b.dataset.id)));
  // heard only when which companies are in trouble changes (not when the wording does, like phone and desktop's)
  say(readable.filter(c => LEVEL_RANK[c.level] >= 2).map(c => `${c.id}:${c.level}`).join(), `${headText}. ${subText}`);
}
const shown = new WeakMap(); // the markup each element was last given
function put(el, html) {
  if (shown.get(el) === html) return false;
  shown.set(el, html); el.innerHTML = html; return true;
}
// What a screen reader hears when the weather changes. Not on the first reading: the page itself says it then.
let saidFor = null;
function say(key, text) {
  if (saidFor !== null && key !== saidFor) $('#said').textContent = text;
  saidFor = key;
}

function setBrandDot(level) {
  const color = LEVEL[level]?.color ?? LEVEL.operational.color;
  document.querySelectorAll('.brand .dot').forEach(d => d.setAttribute('fill', color));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B1A4A"/>${markSvg('#F1EEE6', color, 'x="6" y="8" width="52" height="48"')}</svg>`;
  document.querySelector('link[rel=icon]').href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// Latest changes: a plain list, updated in place (rows are keyed by event id, never rebuilt under the pointer).
const feedEls = new Map();
let feedBooted = false;
function feedRow(e) {
  const c = state.companies.get(e.companyId); if (!c) return null;
  let li = feedEls.get(e.id);
  if (!li) {
    li = document.createElement('li');
    const what = e.incident ? `${esc(e.incident.title)}<span class="st8"> · ${esc(e.incident.status || '')}</span>` : `now ${esc((LEVEL[e.to]?.word ?? e.to).toLowerCase())}`;
    const lvl = e.type === 'incident_resolved' ? 'operational' : (e.incident?.level || e.to || 'degraded');
    const sameDay = new Date(e.at).toDateString() === new Date().toDateString();
    const when = sameDay ? clock(e.at) : new Date(e.at).toLocaleDateString([], { weekday: 'short' });
    li.innerHTML = `<button type="button" class="feed-row" style="--c:${LEVEL[lvl]?.color}"><span class="t num">${esc(when)}</span><span class="who">${esc(c.name)}</span><span class="what">${what}</span></button>`;
    li.querySelector('button').addEventListener('click', () => openCompany(c.id));
    feedEls.set(e.id, li);
  }
  return li;
}
// Right after a deploy the server has seen no changes yet, so the list fills up with the official incidents of
// the last 24 hours (open ones, and ones resolved), newest first. All of it is the companies' own posts.
function incidentItems(cs) {
  const out = [];
  for (const c of cs) {
    for (const i of [...(c.openIncidents || []), ...(c.recentIncidents || [])]) {
      const at = i.resolvedAt || i.updatedAt || i.startedAt;
      if (!at || Date.now() - Date.parse(at) > 864e5) continue;
      out.push({ id: `inc:${c.id}:${i.id}:${i.resolvedAt ? 'r' : 'o'}`, type: i.resolvedAt ? 'incident_resolved' : 'incident_opened', companyId: c.id, at,
        incident: { ...i, status: i.resolvedAt ? 'resolved' : i.status } });
    }
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
function renderFeed(cs) {
  const mine = new Set(cs.map(c => c.id));
  // our own read failures (to/from 'unknown') aren't news about the company, so they stay out of the list
  const live = state.events.filter(e => e.to !== 'unknown' && e.from !== 'unknown' && mine.has(e.companyId));
  const limit = innerWidth < 640 ? 4 : 5;
  const items = live.length >= limit ? live : [...live, ...incidentItems(cs).filter(x => !live.some(e => e.incident?.id === x.incident.id))];
  const ol = $('#feed'), want = items.slice(0, limit);
  if (!want.length) { if (!ol.querySelector('.quiet')) ol.innerHTML = '<li class="quiet">No incidents in the last 24 hours. Every official source is checked once a minute.</li>'; return; }
  ol.querySelector('.quiet')?.remove();
  const before = new Map([...ol.children].map(li => [li, li.getBoundingClientRect().top]));
  const rows = want.map(feedRow).filter(Boolean);
  rows.forEach((li, i) => { if (ol.children[i] !== li) ol.insertBefore(li, ol.children[i] || null); });
  [...ol.children].forEach(li => { if (!rows.includes(li)) li.remove(); });
  for (const [id, li] of feedEls) if (!li.isConnected) feedEls.delete(id);
  if (!feedBooted || reduced()) { feedBooted = true; return; }
  rows.forEach(li => {
    const was = before.get(li), now = li.getBoundingClientRect().top;
    if (was == null) li.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: S.slide?.ms ?? 300, easing: S.slide?.ease ?? 'ease-out' });
    else if (Math.abs(was - now) > .5) li.animate([{ transform: `translateY(${was - now}px)` }, { transform: 'none' }], { duration: S.slide?.ms ?? 300, easing: S.slide?.ease ?? 'ease-out' });
  });
}

// Hovering a company shows its own weather in the sky; leaving goes back to everyone's weather.
let hoverTimer = 0, leaveTimer = 0;
function hoverCompany(id, on) {
  if (!weather || pages.isOpen() || arranging()) return;
  clearTimeout(hoverTimer); clearTimeout(leaveTimer);
  if (on) {
    hoverTimer = setTimeout(() => {
      const c = state.companies.get(id); if (!c) return;
      weather.preview(condForCompany(c), { origin: uvOf(id) || [.5, .5] });
    }, 220);
  } else leaveTimer = setTimeout(() => weather.endPreview(), 260);
}

phoneQ.addEventListener('change', () => { document.body.dataset.view = viewNow(); closeMenuSheet(); render(); document.querySelectorAll('.opt').forEach(placeRule); });
new ResizeObserver(([e]) => document.documentElement.style.setProperty('--top-h', `${Math.round(e.target.getBoundingClientRect().bottom)}px`)).observe($('.top'), { box: 'border-box' }); // border box: the status bar's inset is padding
// the headline column (desktop): never moves while the list scrolls; only when it's taller than the window does it
// scroll up, just far enough to show its last line, and then stay
const forecastEl = $('.forecast');
function placeForecast() {
  const k = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--k')) || 1;
  forecastEl.style.setProperty('--fc-top', `${Math.min(104 * k, innerHeight - 48 * k - forecastEl.offsetHeight)}px`);
}
new ResizeObserver(placeForecast).observe(forecastEl);
addEventListener('resize', placeForecast);
const markScrolled = () => document.body.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', markScrolled, { passive: true }); markScrolled();

let lastCond = null;
function render() {
  const cs = visible({ float: !arranging() }); // problems first, except while the viewer is arranging their own order
  const cond = conditionOf(cs);
  renderForecast(cs, cond);
  renderStations(cs);
  const worst = cs.find(c => c.sourceKind !== 'none' && c.level !== 'unknown' && LEVEL_RANK[c.level] >= 2)?.level ?? 'operational';
  setBrandDot(worst);
  document.body.dataset.weather = cond.id;
  document.body.classList.toggle('demo-data', !!state.demo);
  if (weather && !pages.isOpen()) {
    const origin = cond.id !== lastCond && cond.majors[0] ? uvOf(cond.majors[0].id) : undefined;
    weather.set(cond, { origin });
  }
  lastCond = cond.id;
  renderFeed(cs);
}

function renderUpdated() {
  const el = $('#updated');
  $('.live').classList.toggle('off', !state.connected); // the dot is green only while the live connection is up
  if (!state.connected) { el.textContent = state.lastMessage ? 'Reconnecting' : 'Connecting'; return; }
  // scripted data says so in the header instead of a floating badge over the content
  if (state.demo) { el.innerHTML = 'Demo<span class="ago"> · not live data</span>'; return; }
  const newest = [...state.companies.values()].reduce((m, c) => Math.max(m, seen(c.fetchedAt) ? Date.parse(c.fetchedAt) : 0), 0);
  el.innerHTML = newest ? `Live<span class="ago"> · ${ago(new Date(newest).toISOString())}</span>` : 'Live';
}
setInterval(renderUpdated, 5000);

// --- company pages -----------------------------------------------------------------
function tileRect(id) {
  const el = stationEls.get(`${viewNow()}:${id}`);
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  return r.bottom < 0 || r.top > innerHeight || !r.width ? null : r;
}
function openCompany(id, opts) {
  clearTimeout(hoverTimer); clearTimeout(leaveTimer);
  closeMenuSheet(); // the menu button hides on company pages, so the menu can't stay open behind one
  pages.open(id, opts);
}
pages.initPages({
  get weather() { return weather ?? { set() {}, previewing: false }; },
  tileRect,
  tileEl(id) { const el = stationEls.get(`${viewNow()}:${id}`); return el?.isConnected ? el : null; },
  onClose(id) { render(); stationEls.get(`${viewNow()}:${id}`)?.focus({ preventScroll: true, focusVisible: false }); },
});
$('#pg-list').addEventListener('click', () => openEditor());

// --- live effects --------------------------------------------------------------------
function uvOf(id) {
  const r = tileRect(id) || (() => { const a = document.querySelector(`.aff[data-id="${CSS.escape(id)}"]`); return a?.getBoundingClientRect(); })();
  if (!r) return null;
  return [Math.min(.98, Math.max(.02, (r.left + r.width / 2) / innerWidth)), Math.min(.98, Math.max(.02, 1 - (r.top + r.height / 2) / innerHeight))];
}
function react(e) {
  if (e.to === 'unknown' || e.from === 'unknown') return; // a failed read on our side: no lightning
  if (!visible().some(c => c.id === e.companyId)) return;
  const el = stationEls.get(`${viewNow()}:${e.companyId}`);
  const worse = e.type === 'incident_opened' || (e.type === 'level_changed' && (LEVEL_RANK[e.to] ?? 0) > (LEVEL_RANK[e.from] ?? 0));
  const better = e.type === 'incident_resolved' || (e.type === 'level_changed' && (LEVEL_RANK[e.to] ?? 0) < (LEVEL_RANK[e.from] ?? 0));
  if (el) { el.classList.remove('hit', 'heal'); void el.offsetWidth; el.classList.add(worse ? 'hit' : better ? 'heal' : 'nudge'); }
  if (!sky) return;
  if (pages.isOpen() && pages.currentId() !== e.companyId) return;
  const p = pages.isOpen() ? [.5, .7] : uvOf(e.companyId) || [.3 + Math.random() * .3, .55];
  const lvl = e.incident?.level ?? e.to;
  if (worse) sky.strike(p[0], p[1], lvl === 'major' ? 1 : lvl === 'partial' ? .85 : .65);
  else sky.pulse(p[0], p[1], better ? .7 : .35);
}

// --- header: display controls, colours, your list, hide menu -----------------------------------
function placeRule(group) {
  const on = group.querySelector(`[data-value="${group.dataset.pref === 'view' ? viewNow() : prefs[group.dataset.pref]}"]`);
  group.querySelectorAll('[role=radio]').forEach(b => b.setAttribute('aria-checked', String(b === on)));
  const rule = group.querySelector('.rule');
  if (on) { rule.style.width = `${on.offsetWidth}px`; rule.style.transform = `translateX(${on.offsetLeft}px)`; }
}
function switchView(val) {
  const host = $('#stations');
  host.classList.add('out');
  setTimeout(() => { document.body.dataset.view = viewNow(); render(); host.classList.remove('out'); }, 170);
}
document.querySelectorAll('.opt').forEach(group => {
  placeRule(group);
  group.addEventListener('click', e => {
    const b = e.target.closest('[data-value]'); if (!b) return;
    const key = group.dataset.pref, val = b.dataset.value;
    if ((key === 'view' ? viewNow() : prefs[key]) === val) return;
    prefs[key] = val; savePrefs(); placeRule(group);
    if (key === 'view') switchView(val);
  });
});
$('#edit-list').addEventListener('click', () => { if (document.body.classList.contains('menu-open')) openMenuSheet(false); openEditor(); });
function openMenuSheet(open) {
  document.body.classList.toggle('menu-open', open);
  const t = $('#menu-toggle');
  t.textContent = open ? 'Done' : 'Menu';
  t.setAttribute('aria-expanded', String(open));
  $('#controls').inert = !open;
  if (open) requestAnimationFrame(() => document.querySelectorAll('.opt').forEach(placeRule));
  // the rows arrive one after another as the panel drops
  if (open && !reduced()) [...$('#controls').children].filter(el => el.offsetParent).forEach((el, i) =>
    el.animate([{ opacity: 0, transform: 'translateY(-5px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 40 + i * 35, easing: S.settle?.ease ?? 'ease-out', fill: 'backwards' }));
}
// the header is just the logo, Live and Menu; the options open in one panel (phone and desktop alike)
function closeMenuSheet() { if (document.body.classList.contains('menu-open')) openMenuSheet(false); }
$('#menu-toggle').addEventListener('click', () => { if (arranging()) { exitArrange(); return; } openMenuSheet(!document.body.classList.contains('menu-open')); });
document.addEventListener('pointerdown', e => {
  if (document.body.classList.contains('menu-open') && !e.target.closest('#controls, #menu-toggle')) openMenuSheet(false);
});
openMenuSheet(false);
document.fonts?.ready.then(() => document.querySelectorAll('.opt').forEach(placeRule));
addEventListener('resize', () => document.querySelectorAll('.opt').forEach(placeRule));
document.body.dataset.view = viewNow();

initEditor({ onChange() { render(); pages.relist(); } });
// long-press any company to arrange: "−" takes it off, drag to reorder; the header turns into Add · Done
initArrange({
  changed() { render(); pages.relist(); },
  onChange(on) {
    closeMenuSheet(); clearTimeout(hoverTimer); clearTimeout(leaveTimer); weather?.endPreview();
    const toggle = $('#menu-toggle'), label = on ? 'Done' : 'Menu';
    if (toggle.textContent !== label) { toggle.textContent = label; if (!reduced()) toggle.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); }
    $('#arrange-add').classList.toggle('can', on && !!prefs.hidden?.length); // fades in where the live indicator was
  },
});
$('#arrange-add').addEventListener('click', () => openEditor());

// --- routing, keys ----------------------------------------------------------------------
$('[data-home]').addEventListener('click', e => { if (pages.isOpen()) { e.preventDefault(); pages.close(); } });
addEventListener('popstate', () => {
  const id = location.pathname.slice(1);
  if (id && state.companies.has(id)) openCompany(id, { push: false }); else pages.close({ push: false });
});
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (arranging() && !editorOpen()) exitArrange(); else if (document.body.classList.contains('menu-open')) openMenuSheet(false); else if (editorOpen()) closeEditor(); else if (pages.isOpen()) pages.close(); }
  if (!pages.isOpen() || editorOpen() || e.target.closest?.('input, textarea')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); pages.step(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); pages.step(-1); }
});

// --- connection ---------------------------------------------------------------------------
let booted = false;
function apply(snapshot) {
  state.demo = snapshot.demo;
  state.companies = new Map(snapshot.companies.map(c => [c.id, readInBrowser(c)]));
  state.events = snapshot.events;
  if (!booted && sky) { // the first sky's still starts loading now, while the board is built
    const page = state.companies.get(location.pathname.slice(1));
    sky.still(sceneFor((page ? condForCompany(page) : conditionOf(visible())).id).img);
  }
  render(); renderUpdated();
  if (!booted) {
    booted = true;
    const id = location.pathname.slice(1);
    if (id && state.companies.has(id)) openCompany(id, { push: false });
    else if (id) history.replaceState({}, '', '/'); // a company that's no longer on the board: just the home page
    preloadUptime(visible().map(c => c.id));
    (window.requestIdleCallback || setTimeout)(() => preloadNews(), { timeout: 3000 }); // only company pages show news
    // Grok's official data only opens to browsers, so each visitor's browser reads it, like status.x.ai does
    startBrowserSources({
      changed(id) { const c = inBrowser(id); if (!c) return; state.companies.set(id, c); render(); pages.refresh(id); },
      setUptime: setBrowserUptime,
    });
    // every clip this time of day might need, fetched while idle so a weather change never waits
    (window.requestIdleCallback || setTimeout)(() => sky?.preload(clipsFor()), 1500);
  } else pages.relist();
  for (const c of snapshot.companies) pages.refresh(c.id);
}
let backoff = 1000, pollTimer = null, retryTimer = 0, socket = null;
function connect() {
  clearTimeout(retryTimer);
  const ws = socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { state.connected = true; state.lastMessage = Date.now(); backoff = 1000; clearInterval(pollTimer); pollTimer = null; renderUpdated(); };
  ws.onmessage = m => {
    state.lastMessage = Date.now();
    let msg; try { msg = JSON.parse(m.data); } catch { return; }
    if (msg.t === 'snapshot') apply(msg.data);
    else if (msg.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
    else if (msg.t === 'company') { state.companies.set(msg.data.id, readInBrowser(msg.data)); render(); pages.refresh(msg.data.id); }
    else if (msg.t === 'event') {
      state.companies.set(msg.company.id, readInBrowser(msg.company));
      if (!state.events.some(e => e.id === msg.data.id)) state.events.unshift(msg.data);
      state.events.length = Math.min(state.events.length, 200);
      render(); pages.refresh(msg.company.id); react(msg.data);
    }
  };
  ws.onclose = () => dropped(ws);
}
function dropped(ws) {
  if (ws !== socket) return; // one already given up on
  socket = null;
  state.connected = false; renderUpdated();
  if (!pollTimer) pollTimer = setInterval(poll, 30000);
  retryTimer = setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000);
}
// A connection can go quiet without closing (a laptop waking from sleep, a phone between networks). The server pings
// every 25 s, so a minute without a word means it's gone: it's dropped and opened again, instead of showing Live forever.
function checkQuiet() {
  const ws = socket;
  if (!ws || !state.connected || Date.now() - state.lastMessage < 60000) return;
  ws.onclose = null; try { ws.close(); } catch {}
  dropped(ws);
}
setInterval(checkQuiet, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkQuiet(); });
addEventListener('online', () => { if (!socket) { backoff = 1000; connect(); } }); // back on a network: no waiting out the backoff
async function poll() {
  try { const r = await fetch('/api/snapshot', { cache: 'no-store' }); if (r.ok) apply(await r.json()); } catch {}
}

document.querySelectorAll('[data-mark]').forEach(n => { n.innerHTML = markSvg('currentColor', LEVEL.operational.color, 'aria-hidden="true"'); });
// the first snapshot was asked for by index.html while the scripts loaded
const early = window.__snapshot; delete window.__snapshot;
(early ? early.then(s => (s ? apply(s) : poll())).catch(() => {}) : poll()).then(connect);

// QA hook, demo mode only: ?strike=claude fires lightning at a station. Never on live data.
if (q.has('strike')) setTimeout(() => { if (state.demo) react({ type: 'incident_opened', companyId: q.get('strike'), incident: { level: 'major' } }); }, 2500);
window.aiweather = { state, sky, weather, react, uptime, pages, prefs, openEditor, wxName };
