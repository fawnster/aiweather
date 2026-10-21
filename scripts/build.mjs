import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const workspace of ['web', 'server']) {
  if (!existsSync(new URL(`../${workspace}/package.json`, import.meta.url))) continue;
  // a checkout without the web app (server work only) still builds
  if (workspace === 'web' && !existsSync(new URL('../web/index.html', import.meta.url))) {
    console.log('Skipping web: web/index.html is not present yet.');
    continue;
  }
  const result = spawnSync('npm', ['-w', workspace, 'run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
