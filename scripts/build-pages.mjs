// Build a dedicated static UI without moving/deleting the live app's API routes.
import { cp, mkdir, mkdtemp, readFile, rename, symlink, writeFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/houkago-no-chishikibako';
if (!/^\/[A-Za-z0-9_-]+$/.test(basePath)) throw new Error('A single repository base path is required');
const tmp = path.join(root, 'tmp');
await mkdir(tmp, { recursive: true });
const stage = await mkdtemp(path.join(tmp, 'pages-build-'));
const sourceRoot = path.join(root, 'src');
await cp(sourceRoot, path.join(stage, 'src'), { recursive: true, filter: (source) => {
  const relative = path.relative(sourceRoot, source).replaceAll('\\', '/');
  return !['app/api', 'app/room-export'].some((excluded) => relative === excluded || relative.startsWith(excluded + '/'));
} });
for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs']) {
  await cp(path.join(root, file), path.join(stage, file));
}
for (const directory of ['assets/observer-room', 'fonts']) {
  await cp(path.join(root, 'public', directory), path.join(stage, 'public', directory), { recursive: true });
}
// CSS public URLs are not rewritten by Next's basePath. Rewrite this staged copy.
const fontFile = path.join(stage, 'src/app/geist-fonts.css');
await writeFile(fontFile, (await readFile(fontFile, 'utf8')).replaceAll('url(/fonts/', `url(${basePath}/fonts/`));
await symlink(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const commit = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const branch = process.env.GITHUB_REF_NAME ?? execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
await writeFile(path.join(stage, 'public/build-info.json'), JSON.stringify({ commit, branch, basePath, target: 'github-pages', builtAt: new Date().toISOString() }, null, 2));
await writeFile(path.join(stage, 'public/.nojekyll'), '');
const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build'], {
  cwd: stage, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_DEPLOY_TARGET: 'github-pages', NEXT_PUBLIC_BASE_PATH: basePath, PAGES_BUILD_ROOT: root },
});
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
if (code !== 0) throw new Error(`Static UI build failed (${code}); staging files retained at ${stage}`);
const output = path.join(root, 'out');
try { await access(output); await rename(output, path.join(tmp, `pages-output-before-${Date.now()}`)); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await cp(path.join(stage, 'out'), output, { recursive: true });
console.log(`GitHub Pages artifact: ${output}`);
