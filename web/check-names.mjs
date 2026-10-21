// Fails when a frontend file uses a name that is defined nowhere (a function deleted by an edit, a typo).
// Uses the TypeScript checker already installed for the server; only "cannot find name" errors count.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const here = new URL('.', import.meta.url).pathname;
const tsc = join(here, '../node_modules/.bin/tsc');
if (!existsSync(tsc)) { console.log('names: TypeScript not installed, check skipped'); process.exit(0); }
const dir = mkdtempSync(join(tmpdir(), 'aiw-names-'));
writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { allowJs: true, checkJs: true, noEmit: true, target: 'es2022', module: 'es2022', moduleResolution: 'bundler', lib: ['es2023', 'dom', 'dom.iterable'], skipLibCheck: true },
  include: [join(here, 'src/*.js')],
}));
const out = spawnSync(tsc, ['-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' }).stdout ?? '';
rmSync(dir, { recursive: true, force: true });
const missing = out.split('\n').filter(l => /TS2304|TS2552/.test(l)).map(l => l.replace(/^.*\/web\//, ''));
if (missing.length) { console.error(`names: ${missing.length} undefined\n${missing.join('\n')}`); process.exit(1); }
console.log('names: all defined');
