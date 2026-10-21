// "Your list": pick which companies show and drag them into your own order. Saved in this browser.

import { $, LEVEL, esc, iconHtml, wxImg, state, prefs, savePrefs, visible, defaultOrder } from './common.js';
import { S, reduced } from './motion.js';

const root = $('#editor'), onList = $('#ed-on'), offList = $('#ed-off');
let changed = () => {};
let lastFocus = null;

const grip = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
function row(c, on) {
  const lv = LEVEL[c.level] ?? LEVEL.unknown;
  const li = document.createElement('li');
  li.className = 'ed-row'; li.dataset.id = c.id;
  li.innerHTML = `
    <button type="button" class="ed-grip" aria-label="Move ${esc(c.name)}. Use the arrow keys." ${on ? '' : 'disabled'}>${grip}</button>
    ${iconHtml(c)}
    <span class="ed-name">${esc(c.name)}</span>
    <span class="ed-cond">${wxImg(c.level, 'wx ed')}<span>${esc(c.level === 'operational' ? 'Clear' : lv.sky === 'Unknown' ? 'Unknown' : lv.sky)}</span></span>
    <button type="button" class="ed-toggle" role="switch" aria-checked="${on}" aria-label="${on ? 'Hide' : 'Show'} ${esc(c.name)}"><i></i></button>`;
  return li;
}

function counts() {
  $('#ed-count-on').textContent = onList.children.length;
  $('#ed-count-off').textContent = offList.children.length;
  $('#ed-off-wrap').hidden = !offList.children.length;
}

function render() {
  const shown = visible({ float: false }), hidden = new Set(prefs.hidden || []); // the viewer's own order, as saved
  onList.replaceChildren(...shown.map(c => row(c, true)));
  offList.replaceChildren(...[...state.companies.values()].filter(c => hidden.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map(c => row(c, false)));
  counts();
}

/** Write the lists back to prefs; a list that matches the default stays "default" so new problems still float up. */
function commit() {
  const order = [...onList.children].map(li => li.dataset.id);
  const hidden = [...offList.children].map(li => li.dataset.id);
  const def = defaultOrder().map(c => c.id).filter(id => !hidden.includes(id));
  prefs.order = order.join() === def.join() ? null : order;
  prefs.hidden = hidden;
  savePrefs();
  changed();
}

// FLIP helper: animate rows from where they were to where they are now
function flip(mutate) {
  const rows = [...root.querySelectorAll('.ed-row')];
  const before = new Map(rows.map(r => [r, r.getBoundingClientRect().top]));
  mutate();
  if (reduced()) return;
  for (const r of root.querySelectorAll('.ed-row')) {
    const was = before.get(r); if (was == null) continue;
    const dy = was - r.getBoundingClientRect().top;
    if (Math.abs(dy) > .5) r.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: S.slide?.ms ?? 280, easing: S.slide?.ease ?? 'ease-out' });
  }
}

function toggle(li) {
  const on = li.parentElement === onList;
  flip(() => {
    const c = state.companies.get(li.dataset.id);
    const fresh = row(c, !on);
    li.replaceWith(fresh);
    if (on) {
      const after = [...offList.children].find(x => state.companies.get(x.dataset.id)?.name.localeCompare(c.name) > 0);
      offList.insertBefore(fresh, after || null);
    } else onList.append(fresh);
    counts();
  });
  commit();
}

// --- drag to reorder (pointer), arrow keys on the grip ---------------------------------------
let drag = null;
function startDrag(e, li) {
  e.preventDefault();
  const items = [...onList.children], idx = items.indexOf(li);
  const rects = items.map(x => x.getBoundingClientRect());
  drag = { li, items, idx, target: idx, y0: e.clientY, rects, pitch: rects[1] ? rects[1].top - rects[0].top : rects[0].height, scroller: root.querySelector('.editor-sheet') };
  li.classList.add('lifted');
  li.setPointerCapture(e.pointerId);
  for (const x of items) if (x !== li) x.style.transition = `transform ${S.select?.ms ?? 260}ms ${S.select?.ease ?? 'ease-out'}`;
}
function moveDrag(e) {
  if (!drag) return;
  const { li, items, idx, pitch, rects, scroller } = drag;
  const dy = e.clientY - drag.y0;
  li.style.transform = `translateY(${dy}px) scale(1.02)`;
  const target = Math.max(0, Math.min(items.length - 1, Math.round(idx + dy / pitch)));
  if (target !== drag.target) {
    drag.target = target;
    items.forEach((x, k) => {
      if (x === li) return;
      const shift = idx < target ? (k > idx && k <= target ? -pitch : 0) : (k < idx && k >= target ? pitch : 0);
      x.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }
  // keep scrolling when the row is dragged to the sheet's edge
  const sr = scroller.getBoundingClientRect();
  if (e.clientY < sr.top + 60) scroller.scrollTop -= 8; else if (e.clientY > sr.bottom - 60) scroller.scrollTop += 8;
  void rects;
}
function endDrag() {
  if (!drag) return;
  const { li, items, idx, target } = drag;
  const from = li.getBoundingClientRect().top;
  items.forEach(x => { x.style.transition = ''; x.style.transform = ''; });
  li.classList.remove('lifted');
  if (target !== idx) onList.insertBefore(li, target > idx ? items[target].nextSibling : items[target]);
  const to = li.getBoundingClientRect().top;
  if (!reduced()) li.animate([{ transform: `translateY(${from - to}px) scale(1.02)` }, { transform: 'none' }], { duration: S.settle?.ms ?? 360, easing: S.settle?.ease ?? 'ease-out' });
  drag = null;
  if (target !== idx) commit();
}

function keyMove(li, dir) {
  const sib = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
  if (!sib) return;
  flip(() => onList.insertBefore(li, dir < 0 ? sib : sib.nextSibling));
  li.querySelector('.ed-grip').focus();
  commit();
}

export function openEditor() {
  lastFocus = document.activeElement;
  render();
  root.hidden = false;
  document.body.classList.add('editing');
  // appears where it sits (a small zoom and fade), the dimmed page behind it fades in: nothing slides up
  if (!reduced()) {
    root.animate([{ backgroundColor: 'rgba(2, 4, 12, 0)' }, { backgroundColor: 'rgba(2, 4, 12, .5)' }], { duration: 220, easing: 'ease-out' });
    root.querySelector('.editor-sheet').animate([{ transform: 'scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: S.reveal?.ms ?? 340, easing: S.reveal?.ease ?? 'ease-out' });
  }
  $('#editor-done').focus({ focusVisible: false });
}
export async function closeEditor() {
  if (root.hidden) return;
  document.body.classList.remove('editing');
  if (!reduced()) {
    root.animate([{ backgroundColor: 'rgba(2, 4, 12, .5)' }, { backgroundColor: 'rgba(2, 4, 12, 0)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    await root.querySelector('.editor-sheet').animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.97)', opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
  }
  root.hidden = true;
  root.getAnimations({ subtree: true }).forEach(x => x.cancel()); // drop the held fade so the next open starts clean
  lastFocus?.focus?.({ preventScroll: true });
}
export const editorOpen = () => !root.hidden;

export function initEditor({ onChange }) {
  changed = onChange;
  $('#editor-done').addEventListener('click', closeEditor);
  root.addEventListener('click', e => { if (e.target === root) closeEditor(); });
  $('#editor-reset').addEventListener('click', () => { prefs.order = null; prefs.hidden = []; savePrefs(); flip(render); changed(); });
  root.addEventListener('click', e => {
    const t = e.target.closest('.ed-toggle'); if (t) toggle(t.closest('.ed-row'));
  });
  onList.addEventListener('pointerdown', e => { const g = e.target.closest('.ed-grip'); if (g && e.button === 0) startDrag(e, g.closest('.ed-row')); });
  let hold = null;
  onList.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.ed-grip, .ed-toggle')) return;
    const li = e.target.closest('.ed-row'); if (!li) return;
    const x = e.clientX, y = e.clientY, pointerId = e.pointerId;
    hold = { x, y, pointerId, timer: setTimeout(() => {
      hold = null;
      try { navigator.vibrate?.(8); } catch { /* not on every device */ }
      startDrag({ clientY: y, pointerId, preventDefault() {} }, li);
    }, 420) };
  });
  onList.addEventListener('pointermove', e => {
    if (hold && e.pointerId === hold.pointerId && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) { clearTimeout(hold.timer); hold = null; }
  });
  const dropHold = e => { if (hold && e.pointerId === hold.pointerId) { clearTimeout(hold.timer); hold = null; } };
  onList.addEventListener('pointerup', dropHold);
  onList.addEventListener('pointercancel', dropHold);
  onList.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false }); // a lifted row doesn't scroll the sheet
  onList.addEventListener('contextmenu', e => { if (hold || drag) e.preventDefault(); });
  onList.addEventListener('pointermove', moveDrag);
  onList.addEventListener('pointerup', endDrag);
  onList.addEventListener('pointercancel', endDrag);
  onList.addEventListener('keydown', e => {
    const g = e.target.closest('.ed-grip'); if (!g) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); keyMove(g.closest('.ed-row'), -1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); keyMove(g.closest('.ed-row'), 1); }
  });
}
