// Turns the official status data into weather, and weather into sky parameters.
// Nothing here invents status: the condition is a pure function of the companies' levels.

import { hexToRgb } from './sky.js';

export const LEVEL_WEIGHT = { operational: 0, maintenance: .4, degraded: 1, partial: 2, major: 3, unknown: 0, 'no-page': 0 };
export const LEVEL_RANK = { major: 5, partial: 4, degraded: 3, maintenance: 2, unknown: 1, 'no-page': 0, operational: 0 };
const MARQUEE = new Set(['claude', 'openai', 'gemini', 'grok', 'deepseek', 'qwen', 'kimi', 'copilot', 'cursor']);

/** clear → fair → overcast → rain → storm, plus fog when only maintenance is happening. */
export function conditionOf(companies) {
  let score = 0, majors = [], partial = [], degraded = [], maint = [];
  for (const c of companies) {
    const w = LEVEL_WEIGHT[c.level] ?? 0;
    score += w * (MARQUEE.has(c.id) ? 1.5 : 1);
    if (c.level === 'major') majors.push(c); else if (c.level === 'partial') partial.push(c);
    else if (c.level === 'degraded') degraded.push(c); else if (c.level === 'maintenance') maint.push(c);
  }
  let id;
  if (majors.length) id = 'storm';
  else if (score >= 4) id = 'rain';
  else if (score >= 2) id = 'overcast';
  else if (score > .5) id = 'fair';
  else if (maint.length) id = 'fog';
  else id = 'clear';
  const intensity = Math.min(1, score / 9); // 0..1 within the condition, for rain density / wind
  return { id, score, intensity, majors, partial, degraded, maint };
}

// --- time of day, in the viewer's own timezone ---------------------------------------------
let forced = null; // QA only: ?time=night
export const forcePhase = p => { forced = p; };
/** night · dawn · day · dusk from the viewer's local clock. */
export function phaseOf(date = new Date()) {
  if (forced) return forced;
  const h = date.getHours() + date.getMinutes() / 60;
  return h < 5.5 || h >= 20.5 ? 'night' : h < 7.5 ? 'dawn' : h < 17.5 ? 'day' : 'dusk';
}

// --- footage --------------------------------------------------------------------------------
// Real clips (web/public/video, Mixkit free licence). contrast/lift map each clip's measured 10th–90th
// luminance percentiles (ffmpeg signalstats) onto the dot palette; night clips stay dark on purpose.
const CLIP = {
  'clear-day':      { video: 'video/clear-day.mp4', img: 'photos/fair.jpg', contrast: 2.18, lift: -.30, sun: [.8, .83, 1, .078] },
  fair:             { video: 'video/clear.mp4', img: 'photos/clear.jpg', contrast: 1.7, lift: .02, sun: [.8, .83, .5, .07] },
  overcast:         { video: 'video/overcast.mp4', img: 'photos/overcast.jpg', contrast: 1.7, lift: -.08 },
  rain:             { video: 'video/rain.mp4', img: 'photos/rain.jpg', contrast: 1.85, lift: .04 },
  storm:            { video: 'video/storm.mp4', img: 'photos/storm.jpg', contrast: 1.77, lift: .146 },
  'clear-night':    { video: 'video/clear-night.mp4', img: 'photos/fair.jpg', contrast: 3.74, lift: 1.224, night: true },
  'overcast-night': { video: 'video/overcast-night.mp4', img: 'photos/overcast.jpg', contrast: 3.7, lift: 1.14, night: true },
  'storm-night':    { video: 'video/storm-night.mp4', img: 'photos/storm.jpg', contrast: 4, lift: 1.284, night: true },
};
const DAY = { clear: 'clear-day', fair: 'fair', fog: 'overcast', overcast: 'overcast', rain: 'rain', storm: 'storm' };
const NIGHT = { clear: 'clear-night', fair: 'clear-night', fog: 'overcast-night', overcast: 'overcast-night', rain: 'overcast-night', storm: 'storm-night' };
export function sceneFor(cond, phase = phaseOf()) {
  const key = (phase === 'night' ? NIGHT : DAY)[cond] || 'fair';
  return { id: `${key}`, cell: 7, focus: [.5, .5], zoom: 1, drift: .15, ...CLIP[key] };
}
/** Every clip the current phase might need, so a weather change never waits on the network. */
export const clipsFor = (phase = phaseOf()) => [...new Set(Object.values(phase === 'night' ? NIGHT : DAY))].map(k => CLIP[k].video);

// Video mode: day footage is warmed at dawn and dusk; night footage is already night.
const GRADE = { night: [1, 1, 1], dawn: [.96, .84, .84], day: [1, 1, 1], dusk: [1, .8, .7] };

// --- colour ------------------------------------------------------------------------------
// 5 stops, dark → light. Night leans on refs/bg-dither-clouds-navy, day on refs/bg-dither-clouds-blue.
const TIME = {
  night: ['#07122E', '#10245E', '#1F47A6', '#5289E2', '#DCE8FA'],
  dawn:  ['#0B0E2E', '#22307A', '#4A63C2', '#9DB3F2', '#FBE7DA'],
  day:   ['#08207A', '#1746C8', '#4F80FF', '#A3BEFF', '#F2F6FF'],
  dusk:  ['#0A0B26', '#1E2468', '#4450B4', '#9A9CE6', '#FFE1C7'],
};
/** Background colours the viewer can pick: a hue turn of the cobalt palette (mono drops the colour). */
export const THEMES = {
  cobalt: { name: 'Cobalt', hue: 0, sat: 1 },
  violet: { name: 'Violet', hue: 38, sat: 1 },
  teal:   { name: 'Teal', hue: -42, sat: .95 },
  rose:   { name: 'Rose', hue: 118, sat: .9 },
  amber:  { name: 'Amber', hue: 172, sat: .95 },
  mono:   { name: 'Mono', hue: 0, sat: .07 },
};
const WEATHER = {
  // [darken 0..1, desaturate 0..1, coldness 0..1]
  clear:    [0, 0, 0],
  fair:     [.04, .1, 0],
  fog:      [.0, .55, .1],
  overcast: [.16, .3, .15],
  rain:     [.28, .36, .25],
  storm:    [.4, .38, .6],
};

const lerp = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
function rgbToHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb([h, s, l]) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}
export function themed(palette, theme = 'cobalt') {
  const t = THEMES[theme] || THEMES.cobalt;
  if (!t.hue && t.sat === 1) return palette;
  return palette.map(c => { const [h, s, l] = rgbToHsl(c); return hslToRgb([(h + t.hue + 360) % 360, s * t.sat, l]); });
}

const KEYS = [[0, 'night'], [5.5, 'night'], [6.5, 'dawn'], [8.5, 'day'], [17, 'day'], [19, 'dusk'], [20.5, 'night'], [24, 'night']];
function blend(table, date) {
  if (forced) return table[forced];
  const h = date.getHours() + date.getMinutes() / 60;
  let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
  const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1], t = h1 > h0 ? (h - h0) / (h1 - h0) : 0;
  return { a: table[a], b: table[b], t };
}
/** Blend between the four time-of-day palettes by the viewer's local clock. */
export function timePalette(date = new Date()) {
  const r = blend(TIME, date);
  if (Array.isArray(r)) return r.map(hexToRgb);
  return r.a.map((c, k) => mixRgb(hexToRgb(c), hexToRgb(r.b[k]), r.t));
}
function timeGrade(date = new Date()) {
  const r = blend(GRADE, date);
  return Array.isArray(r) ? r : r.a.map((v, k) => lerp(v, r.b[k], r.t));
}

export function weatherPalette(base, condition) {
  const [dark, desat, cold] = WEATHER[condition] || WEATHER.clear;
  const slate = [.36, .42, .52];
  return base.map((c, i) => {
    const l = c[0] * .299 + c[1] * .587 + c[2] * .114;
    let out = mixRgb(c, [l, l, l], desat);
    out = mixRgb(out, out.map((v, k) => v * slate[k] / .43), cold * .5);
    const keep = i === 4 ? .15 : 1; // the brightest stop stays bright so lightning still reads
    if (i === 4) out = mixRgb(out, [.9, .94, 1], cold); // and turns cold white in bad weather
    return out.map(v => Math.max(0, Math.min(1, v * (1 - dark * keep))));
  });
}

/** Eases the sky toward the target weather every frame. */
export class WeatherController {
  constructor(sky, { theme = 'cobalt' } = {}) {
    this.sky = sky;
    this.theme = theme;
    this.condition = null; // first apply() reveals the sky from black
    this.phase = phaseOf();
    this.target = { rain: 0, fog: 0, wind: 1 };
    this.palette = themed(weatherPalette(timePalette(), 'clear'), theme);
    this.nextAmbient = 0;
    this.lastPhaseCheck = 0;
    sky.setPalette(this.palette);
    sky.onstep = dt => this.step(dt);
  }
  setTheme(theme) { this.theme = theme; this.sky.tint = theme === 'cobalt' ? 0 : .38; }
  /** The weather everyone shares. While a company is being hovered, it is remembered and applied afterwards. */
  set(cond, opts = {}) {
    this.base = cond;
    if (!this.previewing) this.apply(cond, opts);
  }
  /** Show one company's weather (hover preview). */
  preview(cond, opts = {}) { this.previewing = true; this.apply(cond, opts); }
  endPreview(opts = {}) {
    if (!this.previewing) return;
    this.previewing = false;
    if (this.base) this.apply(this.base, opts);
  }
  apply(cond, { origin, fast = false } = {}) {
    const id = cond.id;
    const rain = id === 'storm' ? .75 + cond.intensity * .25 : id === 'rain' ? .35 + cond.intensity * .4 : id === 'overcast' ? .05 : 0;
    this.target = { rain, fog: id === 'fog' ? .55 : id === 'overcast' ? .12 : 0, wind: { clear: .8, fair: 1, fog: .5, overcast: 1.3, rain: 1.7, storm: 2.4 }[id] };
    if (id !== this.condition || this.phase !== phaseOf()) {
      const first = this.condition === null;
      this.condition = id;
      this.phase = phaseOf();
      const scene = sceneFor(id, this.phase);
      document.querySelector('.veil')?.classList.toggle('sunny', !!scene.sun); // the veil opens around the sun (style.css)
      this.sky.setScene(scene, { origin, reveal: first, fast });
    }
  }
  step(dt) {
    const s = this.sky, k = Math.min(1, dt * .8);
    s.wx.rain = lerp(s.wx.rain, this.target.rain, k);
    s.wx.fog = lerp(s.wx.fog, this.target.fog, k);
    s.tune.wind = lerp(s.tune.wind ?? 1, this.target.wind, k);
    const want = themed(weatherPalette(timePalette(), this.condition), this.theme);
    this.palette = this.palette.map((c, i) => mixRgb(c, want[i], Math.min(1, dt * 1.6)));
    s.setPalette(this.palette);
    s.grade = s.scene?.night ? GRADE.night : timeGrade();
    // the viewer's clock crossed into night or day: swap the footage
    if (s.time - this.lastPhaseCheck > 30) {
      this.lastPhaseCheck = s.time;
      if (this.condition && this.phase !== phaseOf()) this.apply({ id: this.condition, intensity: .5 });
    }
    // a storm throws its own lightning between real events
    if (this.condition === 'storm' && !s.reduced) {
      if (!this.nextAmbient) this.nextAmbient = s.time + 3 + Math.random() * 6;
      if (s.time > this.nextAmbient) {
        s.strike(.06 + Math.random() * .45, .12 + Math.random() * .3, .55);
        this.nextAmbient = s.time + 6 + Math.random() * 9;
      }
    } else this.nextAmbient = 0;
  }
}
