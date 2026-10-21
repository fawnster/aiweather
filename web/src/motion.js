// Motion, borrowed from Cove's CoveStyle.Motion: the same spring responses and damping,
// turned into CSS linear() easings so plain CSS transitions move like SwiftUI springs.

/** Sample a damped spring (SwiftUI's response/dampingFraction model) into a CSS linear() easing. */
function spring(response, damping) {
  const w0 = (2 * Math.PI) / response, z = Math.min(damping, 1);
  const wd = w0 * Math.sqrt(Math.max(1e-6, 1 - z * z));
  const x = t => z < 1
    ? 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t))
    : 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  // settle when it stays within 0.1% of rest
  let dur = response;
  for (let t = response; t < 4; t += .01) { let ok = true; for (let k = t; k < t + .2; k += .02) if (Math.abs(1 - x(k)) > .001) { ok = false; break; } if (ok) { dur = t; break; } }
  const n = 48, pts = [];
  for (let i = 0; i <= n; i++) pts.push(+x((i / n) * dur).toFixed(4));
  pts[n] = 1;
  return { ease: `linear(${pts.join(', ')})`, ms: Math.round(dur * 1000) };
}

// name: [response, dampingFraction], straight from Cove
export const SPRINGS = {
  press: [.16, .7], select: [.26, .78], reveal: [.34, .88], bubble: [.3, .76],
  fold: [.36, 1], settle: [.5, .94], slide: [.28, .8], mark: [.22, .55], menu: [.3, .8], bar: [.6, .62],
};
export const S = {};
export function installSprings(root = document.documentElement) {
  for (const [k, [r, d]] of Object.entries(SPRINGS)) {
    const s = spring(r, d); S[k] = s;
    root.style.setProperty(`--ease-${k}`, s.ease);
    root.style.setProperty(`--dur-${k}`, `${s.ms}ms`);
  }
}

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Cove's "pen to paper" scribble when the pointer arrives on an icon. */
export function wobble(el) {
  if (!el || reduced()) return;
  el.animate([{ rotate: '0deg' }, { rotate: '6deg' }, { rotate: '-4deg' }, { rotate: '4deg' }, { rotate: '0deg' }],
    { duration: 350, easing: 'cubic-bezier(.3,.7,.4,1)' });
}

/** Cove's fusion "pop": overshoot then settle. */
export function pop(el, to = 1.18) {
  if (!el || reduced()) return;
  el.animate([{ scale: 1 }, { scale: to, offset: .3 }, { scale: 1 }], { duration: S.mark?.ms ?? 420, easing: 'linear' });
}

/**
 * Rolling digits, like SwiftUI's .contentTransition(.numericText()).
 * Each character is a column; digits slide to their new value with the select spring. The ten-digit columns exist only
 * while a number rolls: at rest it's one plain character per position, laid out the same way (a whole board of
 * columns was thousands of elements to restyle every time a page opened or closed).
 */
const DIGITS = '0123456789'.split('').map(d => `<span>${d}</span>`).join('');
const restHtml = text => [...text].map(c => `<span class="rc${c === '.' ? ' dp' : ''}" aria-hidden="true">${c}</span>`).join('');
export function rollNumber(el, text) {
  const prev = el.dataset.value ?? '';
  if (prev === text) return;
  el.dataset.value = text;
  el.setAttribute('aria-label', text);
  clearTimeout(el._rest);
  if (reduced()) { el.innerHTML = restHtml(text); return; }
  const chars = [...text];
  const shape = s => [...s].map(c => (/\d/.test(c) ? '9' : c)).join('');
  const same = !!prev && shape(prev) === shape(text);
  if (!same || !el.querySelector('.rd-col')) {
    el.innerHTML = chars.map(c => /\d/.test(c)
      ? `<span class="rd" aria-hidden="true"><span class="rd-col">${DIGITS}</span></span>`
      : `<span class="rc${c === '.' ? ' dp' : ''}" aria-hidden="true">${c}</span>`).join('');
    // a number of the same shape rolls on from its old digits; a new one rolls up from zero
    const from = same ? [...prev].filter(c => /\d/.test(c)) : [];
    el.querySelectorAll('.rd-col').forEach((c, i) => { c.style.transition = 'none'; c.style.transform = `translateY(${-(+from[i] || 0) * 10}%)`; });
    void el.offsetWidth;
  }
  const digits = chars.filter(c => /\d/.test(c)), cols = el.querySelectorAll('.rd-col');
  cols.forEach((col, i) => {
    col.style.transition = `transform var(--dur-select) var(--ease-select) ${i * 28}ms`;
    col.style.transform = `translateY(${-(+digits[i]) * 10}%)`;
  });
  el._rest = setTimeout(() => { if (el.dataset.value === text) el.innerHTML = restHtml(text); }, (S.select?.ms ?? 400) + cols.length * 28 + 80);
}

/** Run DOM updates inside a View Transition when the browser supports it (the matched-geometry morph). */
export function morph(update) {
  if (!document.startViewTransition || reduced()) { update(); return Promise.resolve(); }
  return document.startViewTransition(update).finished.catch(() => {});
}

// --- preferences, remembered in this browser -------------------------------------
const KEY = 'aiweather.prefs.v1';
const DEFAULTS = { sky: 'dots', view: 'grid' };
export function loadPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
export function savePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}
