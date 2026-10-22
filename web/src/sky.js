// aiweather sky: the reactive background.
// Ported from mote's sky engine (~/dev/mote/engine/sky.js): a small stable-fluids sim stirs a
// photo, and the display pass mosaics + ordered-dithers it into a 5-colour palette. Added here:
// round dot-matrix cells, rain streaks, fog, lightning (the clouds flash; no drawn bolt), and palettes
// that the weather controller rewrites every frame.

export const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

const VOID = { id: 'void', img: null, cell: 5, palette: ['#000000', '#000000', '#000000', '#000000', '#000000'], focus: [.5, .5] };

const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;

const HEAD = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;`;

const FS = {
  splat: `${HEAD}
uniform sampler2D uTarget; uniform vec2 uPoint; uniform vec3 uValue; uniform float uRadius, uAspect, uRadial;
void main(){
  vec2 d = vUv - uPoint; d.x *= uAspect;
  float g = exp(-dot(d, d) / uRadius);
  vec3 v = uRadial > .5 ? vec3(normalize(d + 1e-6) * uValue.x, 0.) : uValue;
  o = vec4(texture(uTarget, vUv).xyz + g * v, 1.);
}`,
  advect: `${HEAD}
uniform sampler2D uVel, uSrc; uniform vec2 uTexel; uniform float uDt, uDiss;
void main(){
  vec2 c = vUv - uDt * texture(uVel, vUv).xy * uTexel;
  o = texture(uSrc, c) * uDiss;
}`,
  offset: `${HEAD}
uniform sampler2D uVel, uOff; uniform vec2 uTexel; uniform float uDt, uRelax;
void main(){
  vec2 v = uDt * texture(uVel, vUv).xy * uTexel;
  vec2 off = (texture(uOff, vUv - v).xy - v) * uRelax;
  o = vec4(clamp(off, -.3, .3), 0., 1.);
}`,
  divergence: `${HEAD}
uniform sampler2D uVel; uniform vec2 uTexel;
void main(){
  float L = texture(uVel, vUv - vec2(uTexel.x, 0.)).x, R = texture(uVel, vUv + vec2(uTexel.x, 0.)).x;
  float B = texture(uVel, vUv - vec2(0., uTexel.y)).y, T = texture(uVel, vUv + vec2(0., uTexel.y)).y;
  o = vec4(.5 * (R - L + T - B), 0., 0., 1.);
}`,
  pressure: `${HEAD}
uniform sampler2D uP, uDiv; uniform vec2 uTexel;
void main(){
  float L = texture(uP, vUv - vec2(uTexel.x, 0.)).x, R = texture(uP, vUv + vec2(uTexel.x, 0.)).x;
  float B = texture(uP, vUv - vec2(0., uTexel.y)).x, T = texture(uP, vUv + vec2(0., uTexel.y)).x;
  o = vec4((L + R + B + T - texture(uDiv, vUv).x) * .25, 0., 0., 1.);
}`,
  gradient: `${HEAD}
uniform sampler2D uP, uVel; uniform vec2 uTexel;
void main(){
  float L = texture(uP, vUv - vec2(uTexel.x, 0.)).x, R = texture(uP, vUv + vec2(uTexel.x, 0.)).x;
  float B = texture(uP, vUv - vec2(0., uTexel.y)).x, T = texture(uP, vUv + vec2(0., uTexel.y)).x;
  o = vec4(texture(uVel, vUv).xy - .5 * vec2(R - L, T - B), 0., 1.);
}`,
  scale: `${HEAD}
uniform sampler2D uSrc; uniform float uK;
void main(){ o = texture(uSrc, vUv) * uK; }`,

  display: `${HEAD}
uniform vec2 uRes; uniform float uDpr, uTime;
uniform sampler2D uOff, uInk, uImg0, uImg1;
uniform vec2 uPointer; uniform float uLens, uLensR;
uniform vec4 uRipples[6];
uniform float uMix; uniform vec2 uOrigin;
uniform vec2 uImgSize[2];
uniform vec3 uPal[10];
uniform vec4 uP1[2]; // cell(css px), gap, contrast, lift
uniform vec4 uP3[2]; // focus.xy, zoom, drift
uniform float uFlip[2];
uniform vec4 uSun[2];  // the sun on clear days: xy = where (uv), z = strength, w = size
uniform vec2 uParallax;
uniform vec4 uWx;   // rain, fog, flash, (unused)
uniform float uDots;
uniform float uRaw;  // 1 = show the footage itself (graded), 0 = dot-matrix dither
uniform vec3 uGrade; // time-of-day grade for raw footage
uniform float uTint;  // video mode: how far the footage leans into the chosen colour theme
uniform vec3 uLight; // xy = eased pointer (uv), z = strength: a soft light that follows the cursor

float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
float bayer4(vec2 a){ return bayer2(.5 * a) * .25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(.5 * a) * .25 + bayer2(a); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float luma(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
vec3 pal(int k, int i){ return uPal[k * 5 + clamp(i, 0, 4)]; }

float ripple(vec2 uv){
  float s = 0.; vec2 a = vec2(uRes.x / uRes.y, 1.);
  for (int i = 0; i < 6; i++){
    vec4 r = uRipples[i]; float age = uTime - r.z;
    if (r.w <= 0. || age < 0. || age > 2.4) continue;
    float d = length((uv - r.xy) * a), rad = age * .62, w = .035 + age * .03;
    s += r.w * exp(-pow((d - rad) / w, 2.)) * (1. - age / 2.4);
  }
  return s;
}
float glowAt(vec2 uv){
  vec2 d = (uv - uLight.xy) * vec2(uRes.x / uRes.y, 1.);
  return uLight.z * exp(-dot(d, d) / .05);
}
float lensAt(vec2 uv){
  vec2 a = vec2(uRes.x / uRes.y, 1.);
  float d = length((uv - uPointer) * a) * uRes.y / uDpr;
  float disc = (1. - smoothstep(uLensR * .3, uLensR, d)) * uLens;
  return clamp(max(disc, texture(uInk, uv).x * .85) + ripple(uv), 0., 1.);
}
vec2 coverUv(int k, vec2 uv){
  vec4 p3 = uP3[k];
  float ca = uRes.x / uRes.y, ia = uImgSize[k].x / uImgSize[k].y;
  vec2 s = ca > ia ? vec2(1., ia / ca) : vec2(ca / ia, 1.);
  float z = p3.z * 1.06; vec2 h = s / (2. * z);
  vec2 drift = vec2(sin(uTime * .031), cos(uTime * .023)) * .014 * p3.w;
  vec2 ctr = clamp(vec2(p3.x, 1. - p3.y) + drift + uParallax * .012, h, 1. - h);
  vec2 q = (uv - .5) * s / z + ctr;
  if (uFlip[k] > .5) q.x = 1. - q.x;
  return q;
}
vec3 img(int k, vec2 q){ return k == 0 ? texture(uImg0, q).rgb : texture(uImg1, q).rgb; }
vec3 gradientMap(int k, float l, float t){
  float f = clamp(l, 0., 1.) * 3.999; float i = floor(f);
  return pal(k, int(i + step(t, f - i)));
}
// rain: slanted streaks that fall through the cell grid
float rain(vec2 id, float rows){
  if (uWx.x <= 0.) return 0.;
  float col = id.x + floor(id.y * .35);
  float h = hash12(vec2(col, 7.));
  if (h > uWx.x * .55) return 0.;
  float ph = fract(id.y / rows * (1.6 + h) + uTime * (.9 + h * .9) + h * 13.);
  return smoothstep(.0, .02, ph) * (1. - smoothstep(.02, .09, ph));
}

vec3 shade(int k, vec2 frag){
  vec4 p1 = uP1[k];
  float big = max(1., floor(p1.x * uDpr + .5));
  vec2 bigId = floor(frag / big);
  float L = lensAt((bigId + .5) * big / uRes);
  // nested grids: the lens swaps a big cell for half cells, then for quarter cells
  float px = big;
  float th = bayer4(bigId);
  if (L > .18 + th * .45) px = max(1., big * .5);
  if (L > .62 + th * .33) px = max(1., floor(big * .25 + .5));
  vec2 id = floor(frag / px), c = (id + .5) * px, cuv = c / uRes;
  vec2 off = texture(uOff, cuv).xy;
  float ink = texture(uInk, cuv).x, rip = ripple(cuv);
  vec3 col = img(k, coverUv(k, cuv + off));
  col = clamp((col - .5) * p1.z + .5 + p1.w, 0., 1.);
  float t = bayer8(id);
  float l = luma(col);
  // weather on top of the photo
  l = mix(l, .42 + l * .2, uWx.y);                      // fog flattens toward a mid grey
  l += uWx.z * (.08 + .26 * l);                          // lightning: the clouds light up
  l += rain(id, uRes.y / px) * .55;
  l += glowAt(cuv) * .18;                                 // the cursor lights the dots around it
  // the sun (clear and fair days): a warm disc of light high in the sky, a soft halo and slow-turning rays, drawn in
  // the dots themselves; the dots it touches turn gold
  vec4 sn = uSun[k]; float warm = 0.;
  if (sn.z > 0.) {
    // a clear sky: the footage's clouds thin to a soft haze over a gradient, deepest blue high up (a fair day keeps
    // more of its clouds)
    l = mix(l, .64 - .34 * cuv.y + (l - .5) * .2, .74 * min(sn.z, 1.));
    vec2 d = (cuv - sn.xy) * vec2(uRes.x / uRes.y, 1.);
    float r = length(d) / sn.w;
    float rays = pow(max(0., sin(atan(d.y, d.x) * 7. + uTime * .035)), 9.) * exp(-r * .34);
    float s = sn.z * (1.6 * exp(-r * r * 1.1) + .55 * exp(-r * .5) + .34 * rays);
    l += s * .9;
    warm = clamp(s * 1.4, 0., 1.);
  }
  vec3 q = gradientMap(k, l + ink * .2 + rip * .25, t);
  // the sun's dots: white-gold at the core, amber further out
  if (warm > 0.) q = mix(q, mix(vec3(1., .56, .22), vec3(1., .9, .56), smoothstep(.2, .95, warm)) * (.82 + .26 * clamp(l, 0., 1.)), warm * .92);
  if (px >= 3.) {
    vec2 lc = fract(frag / px) - .5;
    if (uDots > .5) {
      // dot-matrix: round dots on a dark ground (refs/bg-dither-clouds-navy)
      float d = length(lc);
      q = mix(q, pal(k, 0) * .55, smoothstep(.38, .47, d));
    } else {
      q *= 1. - .16 * step(.5 - p1.y, max(abs(lc.x), abs(lc.y)));
    }
  }
  return q;
}

// the footage itself, graded for the time of day, with the same stir, rain and lightning on top
vec3 smoothMap(int k, float l){
  float f = clamp(l, 0., 1.) * 3.999; int i = int(floor(f));
  return mix(pal(k, i), pal(k, i + 1), fract(f));
}
vec3 shadeRaw(int k, vec2 frag){
  vec2 uv = frag / uRes;
  vec2 off = texture(uOff, uv).xy;
  float ink = texture(uInk, uv).x, rip = ripple(uv);
  vec3 col = img(k, coverUv(k, uv + off));
  col = clamp((col - .5) * 1.08 + .5, 0., 1.); // footage keeps its own exposure; the levels are for the dither
  col *= uGrade;
  if (uTint > 0.) col = mix(col, smoothMap(k, luma(col)) * (.75 + .5 * luma(col)), uTint);
  col += (ink * .04 + rip * .1) * vec3(.85, .9, 1.);
  float g = dot(col, vec3(.333));
  col = mix(col, vec3(g) * vec3(.86, .9, 1.) + .06, uWx.y * .55);
  col += uWx.z * (.06 + .32 * col);
  col += glowAt(uv) * vec3(.07, .08, .1);
  vec2 rid = floor(frag / (3. * uDpr));
  col += rain(rid, uRes.y / (3. * uDpr)) * .2 * vec3(.85, .9, 1.);
  return col;
}

void main(){
  vec2 frag = gl_FragCoord.xy, uv = frag / uRes;
  bool raw = uRaw > .5;
  vec3 col = raw ? shadeRaw(0, frag) : shade(0, frag);
  if (uMix > 0.) {
    vec2 a = vec2(uRes.x / uRes.y, 1.);
    float rr = length((uv - uOrigin) * a) / length(a);
    float edge = clamp((uMix * 1.4 - rr) / .4, 0., 1.);
    if (bayer8(floor(frag / max(1., floor(5. * uDpr)))) < edge) col = raw ? shadeRaw(1, frag) : shade(1, frag);
  }
  o = vec4(col, 1.);
}`,
};

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const cache = {};
  const u = name => (name in cache ? cache[name] : (cache[name] = gl.getUniformLocation(p, name)));
  return { p, u };
}

export class Sky {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = { lensRadius: 170, simSize: 96, pressureIters: 10, speed: .4, ...opts };
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.half = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    if (!this.half) throw new Error('float render targets are not available');
    this.gl = gl;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.progs = Object.fromEntries(Object.entries(FS).map(([k, src]) => [k, program(gl, src)]));
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.time = 0; this.last = 0; this.dpr = 1;
    this.tune = { force: 1, ghost: true };
    this.pointer = { x: .5, y: .5, px: .5, py: .5, lastMove: -1e9, inside: false };
    this.lens = 0; this.parallax = [0, 0];
    this.light = [.5, .5, 0];
    this.ripples = Array.from({ length: 6 }, () => [0, 0, -10, 0]); this.rippleNext = 0;
    this.mix = 0; this.origin = [.5, .5]; this.transition = null;
    this.slots = [null, null];
    this.wx = { rain: 0, fog: 0, flash: 0 };
    this.dots = true;
    this.videoPool = new Map(); // one <video> per clip, reused across weather changes
    this.stills = new Map(); // each clip's first-frame still, asked for once
    this.raw = false;          // Video mode
    this.grade = [1, 1, 1];    // set by the weather controller
    this.tint = 0;
    this.sceneReq = 0;
    this.dummy = this.texture(1, 1, new Uint8Array([0, 0, 0, 255]));
    this.strikes = [];
    this.resize();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas);
  }

  texture(w, h, data) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  target(w, h) {
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h };
  }
  double(w, h) { const a = this.target(w, h), b = this.target(w, h); return { read: a, write: b, swap() { [this.read, this.write] = [this.write, this.read]; } }; }

  resize() {
    const c = this.canvas;
    this.dpr = 1; // dots are 7 css px, so 1x looks the same and costs a quarter of a retina canvas
    const W = Math.max(2, Math.round((c.clientWidth || innerWidth) * this.dpr));
    const H = Math.max(2, Math.round((c.clientHeight || innerHeight) * this.dpr));
    if (c.width === W && c.height === H && this.vel) return;
    c.width = W; c.height = H;
    const s = this.opts.simSize, aspect = W / H;
    const sw = aspect >= 1 ? s : Math.round(s * aspect), sh = aspect >= 1 ? Math.round(s / aspect) : s;
    if (this.vel && this.vel.read.w === sw && this.vel.read.h === sh) return;
    this.vel = this.double(sw, sh); this.prs = this.double(sw, sh); this.off = this.double(sw, sh);
    this.ink = this.double(sw, sh); this.div = this.target(sw, sh);
    this.texel = [1 / sw, 1 / sh];
  }

  /** The <video> for a clip, shared across scenes; it starts loading the moment it's made. */
  video(url) {
    let v = this.videoPool.get(url);
    if (!v) {
      v = document.createElement('video');
      Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'auto', defaultPlaybackRate: this.opts.speed, playbackRate: this.opts.speed });
      v.addEventListener('loadeddata', () => { v.playbackRate = this.opts.speed; }, { once: true });
      v.addEventListener('error', () => this.videoPool.delete(url), { once: true });
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.src = url;
      v._frame = 1;
      const mark = () => { v._frame++; v.requestVideoFrameCallback?.(mark); };
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(mark); else v._always = true;
      this.videoPool.set(url, v);
    }
    return v;
  }
  /** Resolves once a clip has a frame to draw (or null after 6 s, or if it fails). */
  async clip(url) {
    const v = this.video(url);
    if (v.readyState >= 2) return v;
    return new Promise(res => {
      const done = ok => { clearTimeout(t); res(ok ? v : null); };
      const t = setTimeout(() => done(v.readyState >= 2), 6000);
      v.addEventListener('loadeddata', () => done(true), { once: true });
      v.addEventListener('error', () => done(false), { once: true });
    });
  }
  /** A clip's still, asked for once and kept (a few kB each). main.js asks for the first sky's while it builds the board. */
  still(url) {
    let im = this.stills.get(url);
    if (!im) { im = new Image(); im.fetchPriority = 'high'; im.src = url; this.stills.set(url, im); }
    return im;
  }
  /** Fetch clips in the background so a later weather change never waits on the network. */
  preload(urls) { if (!this.noVideo) for (const u of urls) this.video(u); }

  async makeSlot(scene) {
    const gl = this.gl;
    if (!scene.img && !scene.video) return { scene, tex: this.dummy, size: [1, 1] };
    // A clip that can already play is drawn as it is. Otherwise its still (the clip's own first frame, a few kB) is drawn
    // at once and the clip takes over in place as soon as it plays (uploadVideo): the sky never waits on the clip, and
    // the switch can't be seen because the frames match.
    // The still is asked for first and the clip only once it's in: on a slow line the clip (about 250 kB) would share
    // the connection with the still (about 10 kB) and hold the first sky back.
    const loaded = scene.video && !this.noVideo ? this.videoPool.get(scene.video) : null;
    let src = loaded && loaded.readyState >= 2 ? loaded : null;
    if (!src && scene.img) { const im = this.still(scene.img); try { await im.decode(); src = im; } catch {} }
    const video = scene.video && !this.noVideo ? this.video(scene.video) : null;
    video?.play().catch(() => {}); // low-power mode can refuse autoplay; the still, then the clip's first frame, still show
    if (!src && video) src = await this.clip(scene.video); // no still: wait for the clip itself
    if (!src) return { scene, tex: this.dummy, size: [1, 1], video };
    // create + bind the texture only now: the render loop binds other textures during the awaits above
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (!video) gl.generateMipmap(gl.TEXTURE_2D); // a still that stays a still
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, video ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT], [gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const size = src === video ? [video.videoWidth, video.videoHeight] : [src.naturalWidth, src.naturalHeight];
    return { scene, tex, size, video, frame: src === video ? video._frame : 0 };
  }
  dropSlot(slot) {
    if (!slot || slot.tex === this.dummy) return;
    if (!this.slots.some(s => s && s.tex === slot.tex)) this.gl.deleteTexture(slot.tex);
    if (slot.video && !this.slots.some(s => s && s.video === slot.video)) slot.video.pause();
  }

  /** new video frames → textures */
  uploadVideo() {
    const gl = this.gl;
    for (const slot of this.slots) {
      const v = slot?.video; if (!v || v.readyState < 2 || slot.tex === this.dummy) continue;
      if (v.paused && !document.hidden) v.play().catch(() => {});
      if (!v._always && slot.frame === v._frame) continue; // no new frame since this slot last uploaded
      slot.frame = v._frame;
      if (slot.size[0] !== v.videoWidth || slot.size[1] !== v.videoHeight) slot.size = [v.videoWidth, v.videoHeight]; // the clip took over from its still
      gl.bindTexture(gl.TEXTURE_2D, slot.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }
  }

  /** Switch footage with a cell-by-cell dissolve from `origin` (uv, y up). The newest request always wins. */
  async setScene(scene, { origin, reveal = false, fast = false } = {}) {
    const req = ++this.sceneReq;
    if (!this.slots[0]) {
      if (reveal && !this.reduced) this.slots[0] = { scene: { ...VOID }, tex: this.dummy, size: [1, 1] };
      else { const slot = await this.makeSlot(scene); if (req === this.sceneReq) this.slots[0] = slot; else this.dropSlot(slot); return; }
    }
    const target = this.transition ? this.slots[1] : this.slots[0];
    if (target?.scene.id === scene.id) return;
    const slot = await this.makeSlot(scene);
    if (req !== this.sceneReq) { this.dropSlot(slot); return; }
    if (this.transition) this.finishTransition();
    if (this.slots[0]?.scene.id === scene.id) { this.dropSlot(slot); return; }
    this.slots[1] = slot;
    this.origin = origin || [this.pointer.x, this.pointer.y];
    this.transition = { start: this.time, dur: this.reduced ? .35 : fast ? .9 : 1.6 };
  }
  get scene() { return (this.transition ? this.slots[1] : this.slots[0])?.scene; }
  finishTransition() {
    const old = this.slots[0];
    this.slots[0] = this.slots[1]; this.slots[1] = null;
    this.dropSlot(old);
    this.mix = 0; this.transition = null;
  }
  /** The weather controller writes the live palette here (5 rgb triplets, 0..1). */
  setPalette(rgb) { this.palette = rgb; }

  // --- input -------------------------------------------------------------
  attach(target = window) {
    const toUv = e => { const r = this.canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; };
    this.onMove = e => { const [x, y] = toUv(e); if (x < 0 || x > 1 || y < 0 || y > 1) { this.pointer.inside = false; return; } this.move(x, y); };
    this.onOut = e => { if (!e.relatedTarget) this.pointer.inside = false; };
    this.onVis = () => { if (!document.hidden) this.last = 0; };
    target.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('mouseout', this.onOut);
    document.addEventListener('visibilitychange', this.onVis);
    return this;
  }
  move(x, y) {
    const p = this.pointer;
    if (!p.inside) { p.px = x; p.py = y; }
    p.x = x; p.y = y; p.inside = true; p.lastMove = this.time;
  }
  /** A shockwave + outward push at (x, y) in canvas uv (0..1, y up). */
  pulse(x, y, strength = 1) {
    this.ripples[this.rippleNext] = [x, y, this.time, strength]; this.rippleNext = (this.rippleNext + 1) % 6;
  }

  /** Lightning near (x, y) in uv: the clouds flash with a real flicker (bright, dip, second flash, fade) and a ripple
   *  spreads from there. No bolt is drawn: a drawn line over real clouds looks fake. */
  strike(x, y, strength = 1) {
    if (this.reduced) { this.pulse(x, y, .5 * strength); return; }
    this.strikes.push({ t: this.time, k: strength });
    this.pulse(x, y, .9 * strength);
  }

  // --- simulation ---------------------------------------------------------
  pass(name, out, uniforms) {
    const gl = this.gl, { p, u } = this.progs[name]; gl.useProgram(p);
    let unit = 0;
    for (const [k, v] of Object.entries(uniforms)) {
      const loc = u(k); if (loc === null) continue;
      if (v && v.tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v.tex); gl.uniform1i(loc, unit++); }
      else if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2fv(loc, v); else if (v.length === 3) gl.uniform3fv(loc, v); else gl.uniform4fv(loc, v);
    }
    if (out) { gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo); gl.viewport(0, 0, out.w, out.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  splat(field, x, y, value, radiusCss, radial = false) {
    const hCss = this.canvas.height / this.dpr, r = radiusCss / hCss;
    this.pass('splat', field.write, { uTarget: field.read, uPoint: [x, y], uValue: value, uRadius: r * r, uAspect: this.canvas.width / this.canvas.height, uRadial: radial ? 1 : 0 });
    field.swap();
  }
  step(dt) {
    const T = this.texel, p = this.pointer;
    const dx = p.x - p.px, dy = p.y - p.py, speed = Math.hypot(dx * this.canvas.width / this.canvas.height, dy);
    // The pointer no longer smears the sky (it read as a glitch); it lights it instead, see `light` below.
    void speed; p.px = p.x; p.py = p.y;
    // No fluid warping: the footage is never bent or stirred (he found it ugly). The offset and ink
    // fields stay at zero, so the sim passes are skipped entirely, which also saves GPU time.
    void T;

    this.lens = 0; // the dot size never changes under the pointer
    const L = this.light, on = p.inside && !this.reduced ? 1 : 0;
    L[0] += (p.x - L[0]) * Math.min(1, dt * 7); L[1] += (p.y - L[1]) * Math.min(1, dt * 7);
    L[2] += (on - L[2]) * Math.min(1, dt * 3);
    this.parallax[0] += ((p.inside ? p.x - .5 : 0) - this.parallax[0]) * Math.min(1, dt * 1.5);
    this.parallax[1] += ((p.inside ? p.y - .5 : 0) - this.parallax[1]) * Math.min(1, dt * 1.5);

    // lightning envelope: bright, a dip, a second flicker, then a quick fade
    let flash = 0;
    this.strikes = this.strikes.filter(s => this.time - s.t < 1.6);
    for (const s of this.strikes) {
      const a = this.time - s.t;
      const env = a < .1 ? 1 : a < .16 ? .2 : a < .34 ? .9 : Math.exp(-(a - .34) * 4);
      flash = Math.max(flash, env * s.k * (a < .3 ? .9 : .4));
    }
    this.wx.flash = flash;

    if (this.transition) {
      const e = Math.min(1, (this.time - this.transition.start) / this.transition.dur);
      this.mix = e < .5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
      if (e >= 1) this.finishTransition();
    }
  }

  // --- display ------------------------------------------------------------
  draw() {
    this.uploadVideo();
    const gl = this.gl, { p, u } = this.progs.display; gl.useProgram(p);
    const bind = (name, tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u(name), unit); };
    bind('uOff', this.off.read.tex, 0); bind('uInk', this.ink.read.tex, 1);
    bind('uImg0', this.slots[0].tex, 2); bind('uImg1', (this.slots[1] || this.slots[0]).tex, 3);
    const S = { size: [], pal: [], p1: [], p3: [], flip: [], sun: [] };
    for (let k = 0; k < 2; k++) {
      const slot = this.slots[k] || this.slots[0], s = slot.scene;
      S.size.push(...slot.size);
      const live = s.id === 'void' ? s.palette.map(hexToRgb) : (this.palette || s.palette.map(hexToRgb));
      for (let i = 0; i < 5; i++) S.pal.push(...live[i]);
      S.p1.push(s.cell, s.gap || 0, s.contrast ?? 1, s.lift || 0);
      S.p3.push(s.focus[0], s.focus[1], s.zoom || 1, this.reduced ? 0 : (s.drift ?? 1));
      S.flip.push(s.flip ? 1 : 0);
      S.sun.push(...(s.sun || [0, 0, 0, 1]));
    }
    gl.uniform2f(u('uRes'), this.canvas.width, this.canvas.height);
    gl.uniform1f(u('uDpr'), this.dpr); gl.uniform1f(u('uTime'), this.time);
    gl.uniform2f(u('uPointer'), this.pointer.x, this.pointer.y);
    gl.uniform1f(u('uLens'), this.lens); gl.uniform1f(u('uLensR'), this.opts.lensRadius);
    gl.uniform4fv(u('uRipples'), this.ripples.flat());
    gl.uniform1f(u('uMix'), this.transition ? Math.max(.0001, this.mix) : 0); gl.uniform2fv(u('uOrigin'), this.origin);
    gl.uniform2fv(u('uImgSize'), S.size); gl.uniform3fv(u('uPal'), S.pal);
    gl.uniform4fv(u('uP1'), S.p1); gl.uniform4fv(u('uP3'), S.p3); gl.uniform1fv(u('uFlip'), S.flip); gl.uniform4fv(u('uSun'), S.sun);
    gl.uniform2fv(u('uParallax'), this.parallax);
    gl.uniform4f(u('uWx'), this.wx.rain, this.wx.fog, this.wx.flash, 0);
    gl.uniform1f(u('uDots'), this.dots ? 1 : 0);
    gl.uniform1f(u('uRaw'), this.raw ? 1 : 0);
    gl.uniform3fv(u('uGrade'), this.grade);
    gl.uniform1f(u('uTint'), this.tint);
    gl.uniform3fv(u('uLight'), this.light);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  frame = now => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden || !this.slots[0]) return;
    const dt = this.last ? Math.min((now - this.last) / 1000, 1 / 24) : 1 / 60; this.last = now;
    this.time += dt;
    this.onstep?.(dt, this);
    this.step(dt); this.draw();
  };
  start() { if (!this.raf) this.raf = requestAnimationFrame(this.frame); return this; }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
}
