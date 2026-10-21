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
function build() {
  // the weather icons count toward the hash and ship inside the hashed folder, so a new icon set is never served stale
  const tag = 's-' + hashDir(here + 'public/wx', hashDir(here + 'src')).digest('hex').slice(0, 10);
  // the last few builds' hashed folders stay: a tab opened before a rebuild or deploy keeps finding the icons its code
  // asks for (they were 404ing as broken images in pages left open across a build)
  const old = existsSync(dist) ? readdirSync(dist).filter(f => /^s-[0-9a-f]{10}$/.test(f) && f !== tag) : [];
  const keep = new Set(old.map(f => [f, statSync(`${dist}/${f}`).mtimeMs]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f]) => f));
  mkdirSync(dist, { recursive: true });
  for (const f of readdirSync(dist)) if (!keep.has(f)) rmSync(`${dist}/${f}`, { recursive: true, force: true });
  cpSync(here + 'public', dist, { recursive: true, filter: s => !s.endsWith('CREDITS.md') });
  cpSync(here + 'src', `${dist}/${tag}`, { recursive: true });
  cpSync(here + 'public/wx', `${dist}/${tag}/wx`, { recursive: true, filter: s => !s.endsWith('CREDITS.md') });
  writeFileSync(`${dist}/index.html`, readFileSync(here + 'index.html', 'utf8').replaceAll('/src/', `/${tag}/`));
  console.log(`web built → ${dist} (${tag})`);
}
build();
if (process.argv.includes('--watch')) {
  let t; const again = () => { clearTimeout(t); t = setTimeout(build, 80); };
  for (const p of ['src', 'public']) watch(here + p, { recursive: true }, again);
  watch(here + 'index.html', again);
}
