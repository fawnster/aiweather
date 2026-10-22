// No bundler: the site is plain ES modules. Build = copy public/ into dist/, and src/ into a folder named
// after a hash of its contents, so every deploy busts browser caches for the whole module graph.
// `node build.mjs --watch` re-copies on change for local work.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, watch } from 'node:fs';
import { createHash } from 'node:crypto';
const here = new URL('.', import.meta.url).pathname, dist = here + 'dist';
function hashDir(dir, h = createHash('sha1')) {
  for (const f of readdirSync(dir).sort()) { const p = `${dir}/${f}`; statSync(p).isDirectory() ? hashDir(p, h) : h.update(f).update(readFileSync(p)); }
  return h;
}
// The company marks ship as one stylesheet next to the modules: one request instead of 48 (the host speaks HTTP/1.1, so
// a phone fetched them six at a time, ahead of the sky), cached for good with the rest of the build. Each mark is a data
// URI that the masks read through --icon (common.js iconHtml).
// what a mask never shows goes (titles, comments, the XML line); double quotes turn single where that's safe, as a
// double quote costs three characters in a data URI
function svgText(svg) {
  svg = svg.replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->|<title>[\s\S]*?<\/title>/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  return svg.includes("'") ? svg : svg.replaceAll('"', "'");
}
function iconsCss() {
  const dir = here + 'public/icons', safe = { '%20': ' ', '%3D': '=', '%3A': ':', '%2F': '/', '%2C': ',', '%3B': ';' };
  return readdirSync(dir).filter(f => /\.(svg|png)$/.test(f)).sort().map(f => {
    const body = readFileSync(`${dir}/${f}`);
    const uri = f.endsWith('.png') ? `data:image/png;base64,${body.toString('base64')}`
      : `data:image/svg+xml,${encodeURIComponent(svgText(body.toString('utf8'))).replace(/%(20|3D|3A|2F|2C|3B)/g, m => safe[m])}`;
    return `[data-icon="${f.replace(/\.(svg|png)$/, '')}"]{--icon:url("${uri}")}`;
  }).join('\n') + '\n';
}
function build() {
  // the weather icons, the company marks and this script (it writes icons.css) count toward the hash, so a new set is
  // never served stale
  const tag = 's-' + hashDir(here + 'public/icons', hashDir(here + 'public/wx', hashDir(here + 'src'))).update(readFileSync(here + 'build.mjs')).digest('hex').slice(0, 10);
  // the last few builds' hashed folders stay: a tab opened before a rebuild or deploy keeps finding the icons its code
  // asks for (they were 404ing as broken images in pages left open across a build)
  const old = existsSync(dist) ? readdirSync(dist).filter(f => /^s-[0-9a-f]{10}$/.test(f) && f !== tag) : [];
  const keep = new Set(old.map(f => [f, statSync(`${dist}/${f}`).mtimeMs]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f]) => f));
  mkdirSync(dist, { recursive: true });
  for (const f of readdirSync(dist)) if (!keep.has(f)) rmSync(`${dist}/${f}`, { recursive: true, force: true });
  cpSync(here + 'public', dist, { recursive: true, filter: s => !s.endsWith('CREDITS.md') });
  cpSync(here + 'src', `${dist}/${tag}`, { recursive: true });
  cpSync(here + 'public/wx', `${dist}/${tag}/wx`, { recursive: true, filter: s => !s.endsWith('CREDITS.md') });
  writeFileSync(`${dist}/${tag}/icons.css`, iconsCss());
  // every module is fetched at once (no waterfall of imports found one level at a time)
  const preload = readdirSync(here + 'src').filter(f => f.endsWith('.js')).sort().map(f => `<link rel="modulepreload" href="/src/${f}">`).join('\n');
  writeFileSync(`${dist}/index.html`, readFileSync(here + 'index.html', 'utf8').replace('</head>', `${preload}\n</head>`).replaceAll('/src/', `/${tag}/`));
  console.log(`web built → ${dist} (${tag})`);
}
build();
if (process.argv.includes('--watch')) {
  let t; const again = () => { clearTimeout(t); t = setTimeout(build, 80); };
  for (const p of ['src', 'public']) watch(here + p, { recursive: true }, again);
  watch(here + 'index.html', again);
}
