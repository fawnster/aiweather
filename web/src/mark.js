// The approved aiweather mark (option C, "live line"), same geometry as design/logo/marks.mjs.
const f = n => +n.toFixed(2);
const L = { x: 31, y: 56, r: 15 }, M = { x: 52, y: 43, r: 22 }, R = { x: 72, y: 57, r: 14 }, BASE = 71;
function cw(c, p, q) {
  const a1 = Math.atan2(p.y - c.y, p.x - c.x), a2 = Math.atan2(q.y - c.y, q.x - c.x);
  let s = a2 - a1; while (s < 0) s += 2 * Math.PI;
  return `${s > Math.PI ? 1 : 0} 1`;
}
function intersect(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  const l = (a.r * a.r - b.r * b.r + d * d) / (2 * d), h = Math.sqrt(a.r * a.r - l * l);
  const mx = a.x + (dx * l) / d, my = a.y + (dy * l) / d;
  const p1 = { x: mx + (h * dy) / d, y: my - (h * dx) / d }, p2 = { x: mx - (h * dy) / d, y: my + (h * dx) / d };
  return p1.y < p2.y ? p1 : p2;
}
const pLM = intersect(L, M), pMR = intersect(M, R);
const start = { x: 47, y: BASE }, lB = { x: L.x, y: BASE }, rB = { x: R.x, y: BASE };
export const MARK_PATH = [`M ${start.x} ${start.y}`, `L ${lB.x} ${lB.y}`,
  `A ${L.r} ${L.r} 0 ${cw(L, lB, pLM)} ${f(pLM.x)} ${f(pLM.y)}`,
  `A ${M.r} ${M.r} 0 ${cw(M, pLM, pMR)} ${f(pMR.x)} ${f(pMR.y)}`,
  `A ${R.r} ${R.r} 0 ${cw(R, pMR, rB)} ${f(rB.x)} ${f(rB.y)}`].join(' ');
export const DOT = { cx: (start.x + rB.x) / 2, cy: BASE, r: f(6.2 * .62) };
export const markSvg = (color = 'currentColor', dot = 'currentColor', extra = '') =>
  `<svg viewBox="10 14 80 64" xmlns="http://www.w3.org/2000/svg" ${extra}><path d="${MARK_PATH}" fill="none" stroke="${color}" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/><circle class="dot" cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="${dot}"/></svg>`;
