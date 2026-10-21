// Day bars, drawn on one canvas per chart instead of one element per day. A company page could carry 1,350 bar
// elements and the board 1,470, and restyling them all made opening a page stutter. Each canvas keeps its days as a
// short code (one letter a day) and paints itself whenever it gets or changes size; nothing reads layout to draw it.

const CODE = { operational: 'o', maintenance: 'm', degraded: 'd', partial: 'p', major: 'x', unknown: 'u' };
const LEVEL_OF = Object.fromEntries(Object.entries(CODE).map(([k, v]) => [v, k]));
// the same colours as LEVEL in common.js (a canvas can't read CSS variables, so the clear-day colours are read once)
const COLOUR = { m: '#7FA8F5', d: '#F2B33D', p: '#FF8A3D', x: '#E5484D', u: '#8A8F98' };
// page charts step their heights by how bad the day was; the board's strips are flat
const HEIGHT = { o: .62, m: .8, d: .8, p: 1, x: 1, u: 1 };
// per kind: [largest gap, smallest gap, corner radius] in CSS px (times --k)
const KIND = { big: [2.5, .5, 2], mini: [1.5, .5, 2], strip: [1.5, .5, 1] };

export const levelAt = (canvas, i) => LEVEL_OF[canvas.dataset.l?.[i]] ?? 'unknown';

/** The markup for a chart: `kind` is 'big', 'mini' or 'strip'. */
export function barsHtml(days, kind, attrs = '') {
  const code = days.map(d => CODE[d.level] ?? 'u').join('');
  return `<canvas class="${kind === 'strip' ? 'strip-bars' : `bars ${kind}`}" data-kind="${kind}" data-l="${code}" ${attrs} role="img" aria-label="Daily status for the last ${days.length} days"></canvas>`;
}

let k = 1, okPage = 'rgba(241,238,230,.22)';
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  k = parseFloat(cs.getPropertyValue('--k')) || 1;
  okPage = cs.getPropertyValue('--bar-ok').trim() || okPage;
}

function paint(cv, w = cv.clientWidth, h = cv.clientHeight) {
  const code = cv.dataset.l || '', n = code.length;
  if (!n || !w || !h) return;
  const dpr = devicePixelRatio || 1, W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  const kind = cv.dataset.kind, flat = kind === 'strip', cs = getComputedStyle(cv);
  let [gMax, gMin, rad] = KIND[kind] || KIND.mini;
  gMax = parseFloat(cs.getPropertyValue('--bar-gap')) || gMax; rad = parseFloat(cs.getPropertyValue('--bar-r')) || rad;
  // the gap shrinks on narrow charts so the bars never vanish, like the CSS this replaces
  const gap = Math.max(gMin * k, Math.min(gMax * k, (w - 2 * n) / n)) * dpr;
  const bw = (W - gap * (n - 1)) / n, r = Math.min(rad * k * dpr, bw / 2);
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {
    const c = code[i], bh = flat ? H : H * HEIGHT[c];
    g.fillStyle = c === 'o' ? (flat ? 'rgba(241,238,230,.32)' : okPage) : COLOUR[c];
    g.beginPath(); g.roundRect(i * (bw + gap), H - bh, bw, bh, r); g.fill();
  }
}

const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
  for (const e of entries) {
    const box = e.contentBoxSize?.[0];
    paint(e.target, box ? box.inlineSize : e.contentRect.width, box ? box.blockSize : e.contentRect.height);
  }
}) : null;

/** Paint every chart under `root` now and whenever it resizes. */
export function wireBars(root) {
  for (const cv of root.querySelectorAll('canvas[data-l]')) ro ? ro.observe(cv) : paint(cv);
}

// a new screen density (window moved to another display) or a new --k: repaint everything that's on the page
function repaintAll() { readTheme(); for (const cv of document.querySelectorAll('canvas[data-l]')) paint(cv); }
readTheme();
addEventListener('resize', () => { const was = k; readTheme(); if (k !== was) repaintAll(); });
let dprQuery = null;
function watchDpr() {
  dprQuery?.removeEventListener('change', onDpr);
  dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  dprQuery.addEventListener('change', onDpr);
}
function onDpr() { repaintAll(); watchDpr(); }
watchDpr();
