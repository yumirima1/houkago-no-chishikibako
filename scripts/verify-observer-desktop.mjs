// React DOM regression checks in jsdom. This is NOT a rendering browser and
// cannot verify WebGL, native dialog focus trapping, screenshots or GPU speed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const dependencyPath = process.argv[process.argv.indexOf('--dependencies') + 1];
if (!process.argv.includes('--dependencies') || !dependencyPath) throw new Error('--dependencies <isolated React/jsdom directory> is required');
const requireFixture = createRequire(path.resolve(dependencyPath, 'package.json'));
const React = requireFixture('react');
const { createRoot } = requireFixture('react-dom/client');
const { JSDOM } = requireFixture('jsdom');
assert.equal(React.version, JSON.parse(readFileSync('node_modules/react/package.json', 'utf8')).version);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixtureSnapshot = {
  initialized: true, notes: [
    { id: 'note-a', title: '保存済み考察A', createdAt: '2026-10-26T05:00:00Z', status: 'draft', published: true },
    { id: 'note-b', title: '保存済み考察B', createdAt: '2026-10-26T06:00:00Z', status: 'draft', published: true },
  ],
  news: [{ id: 'news-a', title: '収集済み記事', source: 'Fixture Source', url: 'https://example.invalid/article', publishedAt: null, fetchedAt: '2026-10-26T06:00:00Z', summary: 'Saved summary', content: 'Saved news body', truncated: false }],
  system: { readAt: '2026-10-26T06:00:00Z', supervisorActive: true, pollSeconds: 30, maxJobsPerCycle: 6, provider: 'deterministic', model: 'rules-v1', access: 'read-only' },
  worker: { active: false, lastSeenAt: null }, sources: [], jobs: [], memories: [], interests: [],
};
const response = (value, status = 200) => ({ ok: status === 200, status, json: async () => value });
const pending = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

async function harness(fetcher, webgl = true) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  const globals = new Map();
  for (const [key, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.HTMLCanvasElement.prototype.getContext = () => webgl ? { getExtension: () => null } : null;
  // jsdom lacks dialog methods. Only our component's lifecycle is tested here.
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const context = vm.createContext({ window, document: window.document, console, AbortController, URL, process:{env:{}},setInterval,clearInterval, requestAnimationFrame: window.requestAnimationFrame.bind(window), fetch: fetcher });
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const compiledModule = { exports: {} };
    modules.set(name, compiledModule.exports);
    const file = path.resolve('src/components/observer-room', `${name}.tsx`);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const requireModule = (id) => {
      if (id === 'next/dynamic') return () => function Scene({ onOpen }) { return React.createElement('button', { 'data-scene': 'true', onClick: onOpen }, '3D scene stub'); };
      if (id.endsWith('.css')) return new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
      if (id.startsWith('./')) return load(id.slice(2));
      return requireFixture(id);
    };
    vm.runInContext(`(function(require,module,exports){${source}\n})`, context, { filename: file })(requireModule, compiledModule, compiledModule.exports);
    modules.set(name, compiledModule.exports);
    return compiledModule.exports;
  }
  const Root = load('ObserverStudyRoot').ObserverStudyRoot;
  const root = createRoot(window.document.getElementById('root'));
  await React.act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(Root))); });
  const click = async (element) => { assert.ok(element, 'element must exist'); await React.act(async () => { element.click(); }); };
  const button = (text) => [...window.document.querySelectorAll('button')].find((element) => element.textContent.includes(text));
  return { window, document: window.document, click, button, load, async close() {
    await React.act(async () => root.unmount()); window.close();
    for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
  } };
}

const results = [];
const a = pending(), b = pending(), requests = [];
let snapshot = fixtureSnapshot;
const h = await harness(async (url, options) => {
  requests.push({ url, options });
  if (url.includes('note=note-a')) return a.promise;
  if (url.includes('note=note-b')) return b.promise;
  return response(snapshot);
});
try {
  assert.equal(h.document.querySelector('dialog'), null);
  assert.equal(requests.length, 0, 'initial room does not request private data');
  await h.click(h.document.querySelector('[data-scene]'));
  assert.ok(h.document.querySelector('dialog[open]'));
  assert.ok(h.document.querySelector('.scene').hasAttribute('inert'));
  await h.click(h.button('考察アーカイブ'));
  assert.equal(h.document.activeElement.id, 'app-heading');
  await h.click(h.button('保存済み考察A'));
  await h.click(h.button('保存済み考察B'));
  assert.ok(requests.find((request) => request.url.includes('note=note-a')).options.signal.aborted);
  await React.act(async () => { b.resolve(response({ id: 'note-b', title: '保存済み考察B', markdown: '# Body B\n<script>unsafe()</script>', artifact: 'conflict' })); });
  await React.act(async () => { a.resolve(response({ id: 'note-a', title: '保存済み考察A', markdown: '# Stale A', artifact: 'matching' })); });
  assert.match(h.document.querySelector('pre').textContent, /Body B/);
  assert.doesNotMatch(h.document.querySelector('pre').textContent, /Stale A/);
  assert.equal(h.document.querySelector('script'), null);
  assert.match(h.document.body.textContent, /保存先を変更しません/);
  await h.click(h.button('収集ニュース'));
  await h.click(h.button('収集済み記事'));
  assert.match(h.document.body.textContent, /Saved news body/);
  assert.equal(h.document.querySelector('a[target="_blank"]').getAttribute('rel'), 'noopener noreferrer');
  await h.click(h.button('システム'));
  assert.match(h.document.body.textContent, /監視プロセスの応答あり/);
  assert.match(h.document.body.textContent, /rules-v1/);
  snapshot = { ...fixtureSnapshot, notes: [], news: [] };
  await h.click(h.button('再読込'));
  await h.click(h.button('考察アーカイブ'));
  assert.match(h.document.body.textContent, /保存された考察はまだありません/);
  assert.equal(h.document.querySelector('pre'), null, 'reload clears stale detail');
  await React.act(async () => { h.document.querySelector('dialog').dispatchEvent(new h.window.Event('cancel', { cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 30)); });
  await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  assert.equal(h.document.querySelector('dialog'), null);
  assert.equal(h.document.querySelector('.scene').hasAttribute('inert'), false);
  assert.equal(h.document.activeElement.textContent, 'CRTモニターを開く');
  assert.ok(requests.every((request) => !request.options.method || request.options.method === 'GET'));
  const { safeSourceUrl } = h.load('ObserverDesktop');
  assert.equal(safeSourceUrl('javascript:alert(1)'), null);
  assert.equal(safeSourceUrl('https://user:secret@example.invalid'), null);
  results.push('initial room isolation, desktop open/close, inert scene, heading/return focus, abort race, safe Markdown, news, real settings, reload, GET-only access');
} finally { await h.close(); }

const offline = await harness(async () => response({}, 403), false);
try {
  assert.match(offline.document.body.textContent, /3Dの部屋を表示できません/);
  await offline.click(offline.button('端末を開く'));
  await offline.click(offline.button('考察アーカイブ'));
  assert.match(offline.document.querySelector('[role="alert"]').textContent, /ローカル環境/);
  assert.equal(offline.document.querySelector('pre'), null);
  results.push('WebGL fallback still opens desktop; denied access shows no fake data');
} finally { await offline.close(); }
console.log(JSON.stringify({ react: React.version, environment: 'jsdom; not a rendering browser', success: true, results }, null, 2));
