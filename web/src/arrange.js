// Arranging the home screen, the iOS way: long-press any company (finger or mouse) to start. Every tile gets a
// "−" to take it off your board, and tiles can be dragged into your own order (the one you're holding lifts and
// follows you; the rest slide out of the way). Done, Esc, or a tap on the empty sky ends it. Saved in this browser.
// Calm on purpose: no wobble.
import { $, prefs, savePrefs, defaultOrder } from './common.js';
import { S, reduced } from './motion.js';

const host = $('#stations');
const HOLD = 450;      // ms to hold before arranging starts
const PICK = 160;      // ms to hold a tile (touch, already arranging) before it lifts; a quicker swipe still scrolls
const SLOP = 8;        // px a finger may drift during a hold

let on = false, api = {};
let press = null;          // a pending hold
let drag = null;           // the tile being moved
let swallowUntil = 0;      // the click that ends a hold or a drag must not open the company
let edgeRaf = 0;

export const arranging = () => on;
export const swallowClick = () => performance.now() < swallowUntil;

const tiles = () => [...host.querySelectorAll(':scope > [data-id]')];
const tileOf = el => el?.closest?.('#stations > [data-id]');
const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** Where a tile sits in the layout, ignoring any animation or drag transform on it. */
function slot(t) {
  const p = t.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const left = p.left + t.offsetLeft, top = p.top + t.offsetTop;
  return { left, top, right: left + t.offsetWidth, bottom: top + t.offsetHeight };
}

/** Move tiles in the DOM and let the others slide from where they were to where they are now. */
function flip(mutate, skip) {
  const before = new Map(tiles().map(t => [t, t.getBoundingClientRect()]));
  mutate();
  if (reduced()) return;
  for (const t of tiles()) {
    if (t === skip || !before.has(t)) continue;
    t.getAnimations().forEach(a => a.cancel());
    const a = before.get(t), b = t.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) + Math.abs(dy) < .5) continue;
    t.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: S.slide?.ms ?? 260, easing: S.slide?.ease ?? 'ease-out' });
  }
}

/** Save the order on screen; an order that matches the default stays "default" so new problems still float up. */
function commitOrder() {
  const order = tiles().map(t => t.dataset.id);
  const hidden = prefs.hidden || [];
  const def = defaultOrder().map(c => c.id).filter(id => !hidden.includes(id));
  prefs.order = order.join() === def.join() ? null : order;
  savePrefs();
}

export function enterArrange() {
  if (on) return;
  on = true;
  // the "−" badges grow in one after another, in reading order across the tiles you can see (CSS does the motion)
  let n = 0;
  for (const t of tiles()) {
    const r = t.getBoundingClientRect(), seen = r.bottom > 0 && r.top < innerHeight;
    t.querySelector('.del')?.style.setProperty('--del-in', seen ? `${Math.min(n++, 24) * 14}ms` : '0ms');
  }
  document.body.classList.add('arranging');
  api.onChange?.(true);
}
export function exitArrange() {
  if (!on) return;
  endDrag(true);
  on = false;
  document.body.classList.remove('arranging');
  api.onChange?.(false);
  api.changed?.();
}

function remove(t) {
  const id = t.dataset.id;
  const finish = () => {
    flip(() => t.remove());
    t.getAnimations().forEach(a => a.cancel()); // it may come back later (Edit list), so no leftover fade
    prefs.hidden = [...new Set([...(prefs.hidden || []), id])];
    commitOrder();
    api.changed?.();
    api.onChange?.(true);
  };
  if (reduced()) { finish(); return; }
  t.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.86)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' })
    .finished.then(finish, finish);
}

// --- dragging ------------------------------------------------------------------------------------
// The held tile lifts (a little bigger, a deeper shadow), follows the pointer, and leans into the direction it's
// moving, easing back upright when you stop. The others slide out of its way.
function startDrag(t, x, y, pid) {
  for (const o of tiles()) o.classList.remove('enter', 'hit', 'heal', 'nudge'); // one-off animations must not replay as tiles move
  t.getAnimations().forEach(a => a.cancel());
  const r = t.getBoundingClientRect();
  drag = { t, pid, gx: x - r.left, gy: y - r.top, x, y, moved: false, lean: 0, push: 0, lastX: x, raf: 0, lift: 0 };
  t.classList.add('lifted');
  frame();
}
function frame() {
  if (!drag) return;
  // the lean follows the sideways speed and decays; the lift grows in over the first frames
  drag.push *= .82;
  drag.lean += (Math.max(-7, Math.min(7, drag.push * .9)) - drag.lean) * .25;
  drag.lift += (1 - drag.lift) * .3;
  follow();
  drag.raf = requestAnimationFrame(frame);
}
function follow() {
  const { t, gx, gy, x, y, lean, lift } = drag, s = slot(t);
  t.style.transform = `translate(${x - gx - s.left}px, ${y - gy - s.top}px) rotate(${lean.toFixed(2)}deg) scale(${(1 + .06 * lift).toFixed(3)})`;
}
function moveDrag(x, y) {
  drag.push += x - drag.lastX; drag.lastX = x;
  drag.x = x; drag.y = y; drag.moved = true;
  const over = tiles().find(o => o !== drag.t && inside(slot(o), x, y));
  if (over) {
    const list = tiles(), from = list.indexOf(drag.t), to = list.indexOf(over);
    flip(() => { if (to > from) over.after(drag.t); else over.before(drag.t); }, drag.t);
  }
  follow();
  // near the top or bottom edge, the page scrolls so the tile can travel the whole list
  if (!edgeRaf && (y < 90 || y > innerHeight - 90)) edgeRaf = requestAnimationFrame(edge);
}
function edge() {
  edgeRaf = 0;
  if (!drag) return;
  const d = drag.y < 90 ? -Math.ceil((90 - drag.y) / 6) : drag.y > innerHeight - 90 ? Math.ceil((drag.y - innerHeight + 90) / 6) : 0;
  if (!d) return;
  scrollBy(0, d);
  moveDrag(drag.x, drag.y);
}
function endDrag(cancel) {
  if (!drag) return;
  const { t, moved, raf } = drag;
  drag = null;
  cancelAnimationFrame(raf);
  cancelAnimationFrame(edgeRaf); edgeRaf = 0;
  const from = t.style.transform;
  t.style.transform = '';
  t.classList.remove('lifted');
  // it drops into its new place with a small, springy settle
  if (!reduced() && from) t.animate([{ transform: from }, { transform: 'none' }], { duration: S.bubble?.ms ?? 420, easing: S.bubble?.ease ?? 'cubic-bezier(.34, 1.4, .64, 1)' });
  if (moved && !cancel) { commitOrder(); api.changed?.(); }
  swallowUntil = performance.now() + 400;
}

function keyMove(t, dir) {
  const list = tiles(), i = list.indexOf(t), j = i + dir;
  if (j < 0 || j >= list.length) return;
  flip(() => (dir > 0 ? list[j].after(t) : list[j].before(t)));
  t.focus({ preventScroll: false, focusVisible: true });
  commitOrder(); api.changed?.();
}

export function initArrange(o) {
  api = o;
  host.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const t = tileOf(e.target);
    if (!t || e.target.closest('.del')) return;
    const touch = e.pointerType !== 'mouse';
    press = { t, x: e.clientX, y: e.clientY, pid: e.pointerId, touch, timer: 0 };
    if (!on) {
      // hold to start arranging; the held tile lifts right away so it can be dragged without letting go
      press.timer = setTimeout(() => {
        if (!press) return;
        const p = press; press = null;
        enterArrange();
        swallowUntil = performance.now() + 600;
        try { navigator.vibrate?.(8); } catch { /* not on every device */ }
        startDrag(p.t, p.x, p.y, p.pid);
      }, HOLD);
    } else if (touch) {
      press.timer = setTimeout(() => { if (!press) return; const p = press; press = null; startDrag(p.t, p.x, p.y, p.pid); }, PICK);
    }
  });
  addEventListener('pointermove', e => {
    if (drag && e.pointerId === drag.pid) { moveDrag(e.clientX, e.clientY); return; }
    if (!press || e.pointerId !== press.pid || Math.hypot(e.clientX - press.x, e.clientY - press.y) <= SLOP) return;
    const p = press; press = null; clearTimeout(p.timer);
    // with a mouse, arranging tiles move as soon as they're dragged; anything else was a scroll or a normal press
    if (on && !p.touch) { startDrag(p.t, p.x, p.y, p.pid); moveDrag(e.clientX, e.clientY); }
  });
  const up = e => {
    if (press && e.pointerId === press.pid) { clearTimeout(press.timer); press = null; }
    if (drag && e.pointerId === drag.pid) endDrag(e.type === 'pointercancel');
  };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  // while a tile is held, the page mustn't scroll under the finger (and no long-press menu or text selection)
  host.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  host.addEventListener('contextmenu', e => { if (press || drag || on) e.preventDefault(); });
  // while arranging, a tap on a tile does nothing and a tap on its "−" takes it off; runs before the tile's own click
  host.addEventListener('click', e => {
    const t = tileOf(e.target); if (!t) return;
    if (!on && !swallowClick()) return;
    e.stopPropagation(); e.preventDefault();
    if (on && e.target.closest('.del')) remove(t);
  }, true);
  // a tap on the empty sky ends arranging, like on a phone's home screen
  document.addEventListener('pointerdown', e => {
    if (on && !drag && !e.target.closest('#stations > [data-id], .top, #controls, .editor')) exitArrange();
  });
  // keyboard: arrows move the focused tile, Delete takes it off
  host.addEventListener('keydown', e => {
    if (!on) return;
    const t = tileOf(e.target); if (!t) return;
    if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); keyMove(t, -1); }
    if (['ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); keyMove(t, 1); }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(t); }
  });
}
