import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('out');
const info = JSON.parse(await readFile(path.join(root, 'build-info.json'), 'utf8'));
assert.equal(info.target, 'github-pages');
assert.ok(info.commit && info.branch && info.basePath);
for (const file of ['index.html', 'observer-room/index.html']) {
  const html = await readFile(path.join(root, file), 'utf8');
  assert.ok(html.includes(`${info.basePath}/_next/`), 'Next scripts must use the repository path');
  assert.ok(!/(?:src|href)=["']\/_next\//.test(html), 'unprefixed bundle URL');
  assert.ok(html.includes('部屋を準備しています'), 'room must be the initial route');
  const scripts = [...html.matchAll(/src="([^"]+\.js(?:\?[^"]*)?)"/g)].map((match) => match[1]);
  for (const script of scripts) {
    assert.ok(script.startsWith(info.basePath + '/'));
    await access(path.join(root, script.slice(info.basePath.length).split('?')[0]));
  }
}
await assert.rejects(access(path.join(root, 'api')), 'server API must never be published');
for (const category of ['furniture', 'city']) {
  const directory = path.join(root, 'assets/observer-room', category);
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.glb')) continue;
    const bytes = await readFile(path.join(directory, file));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    const model = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    for (const resource of [...(model.images ?? []), ...model.buffers]) {
      if (resource.uri && !resource.uri.startsWith('data:')) await access(path.resolve(directory, resource.uri));
    }
  }
}
console.log(JSON.stringify({ artifact: root, source: info, staticRoutes: 2, resourcePaths: 'passed', serverAPI: 'excluded' }, null, 2));
