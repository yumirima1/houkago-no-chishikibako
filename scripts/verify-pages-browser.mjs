// Run with an isolated playwright-core installation and the installed Chrome.
// No user browser profile, cookies, local storage or login session is reused.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
for (const name of ['--url', '--dependencies', '--output']) if (!process.argv.includes(name)) throw new Error(`${name} is required`);
const url = argument('--url'), output = path.resolve(argument('--output'));
const requireBrowser = createRequire(path.resolve(argument('--dependencies'), 'package.json'));
const { chromium } = requireBrowser('playwright-core');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
const errors = [], consoleErrors = [], warnings = [], failedResponses = [], failedRequests = [], apiRequests = [], assets = new Set();
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
  if (message.type() === 'warning') warnings.push(message.text());
});
page.on('request', (request) => { if (new URL(request.url()).pathname.includes('/api/')) apiRequests.push(request.url()); });
page.on('requestfailed', (request) => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); });
page.on('response', (response) => {
  if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() });
  if (/\.(?:glb|png|woff2)(?:\?|$)/.test(response.url()) && response.ok()) assets.add(response.url());
});
const report = { url, browser: await browser.version(), viewport: { width: 1440, height: 900 } };
const screenshot = async (name, options = {}) => page.screenshot({ path: path.join(output, name), ...options });
const ready = async () => {
  await page.locator('canvas').waitFor({ timeout: 60000 });
  await page.getByText('部屋を準備しています…', { exact: true }).first().waitFor({ state: 'hidden', timeout: 60000 });
};
try {
  assert.equal((await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })).status(), 200);
  await ready();
  await page.mouse.move(720, 450); await page.waitForTimeout(1500);
  assert.equal(await page.locator('dialog').count(), 0);
  assert.equal(await page.locator('nav').count(), 0);
  report.webgl = await page.locator('canvas').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return { supported: Boolean(gl && !gl.isContextLost()), width: canvas.width, height: canvas.height,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable' };
  });
  assert.equal(report.webgl.supported, true);
  await screenshot('room-initial.png');
  await page.waitForTimeout(2500); await screenshot('room-train-later.png');
  const clip = { x: 670, y: 430, width: 200, height: 95 };
  const center = await screenshot('camera-center.png', { clip });
  await page.mouse.move(80, 100); await page.waitForTimeout(1500);
  const moved = await screenshot('camera-left.png', { clip });
  await page.mouse.move(720, 450); await page.waitForTimeout(2000);
  const returned = await screenshot('camera-returned.png', { clip });
  const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
  report.camera = { imageChanged: hash(center) !== hash(moved), exactReturnImage: hash(center) === hash(returned) };
  report.camera.pixelDifference = await page.evaluate(async (images) => {
    const decoded = [];
    for (const data of images) {
      const picture = new Image(); picture.src = `data:image/png;base64,${data}`; await picture.decode();
      const canvas = document.createElement('canvas'); canvas.width = picture.width; canvas.height = picture.height;
      const context = canvas.getContext('2d'); context.drawImage(picture, 0, 0);
      decoded.push(context.getImageData(0, 0, canvas.width, canvas.height).data);
    }
    const difference = (a, b) => {
      let sum = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i]);
      return Math.round(sum / (a.length * 0.75) * 10000) / 10000;
    };
    return { moved: difference(decoded[0], decoded[1]), returned: difference(decoded[0], decoded[2]) };
  }, [center, moved, returned].map((buffer) => buffer.toString('base64')));
  assert.ok(report.camera.imageChanged);
  assert.ok(report.camera.pixelDifference.returned < 0.8, 'camera must settle back near its original image');
  report.performance = await page.evaluate(() => new Promise((resolve) => {
    const start = performance.now(), intervals = []; let previous = start;
    const frame = (now) => {
      intervals.push(now - previous); previous = now;
      if (now - start < 3000) requestAnimationFrame(frame);
      else { intervals.sort((a, b) => a - b); resolve({ sampleMs: Math.round(now - start), frames: intervals.length,
        averageFps: Math.round(intervals.length * 10000 / (now - start)) / 10,
        p95FrameMs: Math.round(intervals[Math.floor(intervals.length * 0.95)] * 10) / 10 }); }
    }; requestAnimationFrame(frame);
  }));
  await page.mouse.click(792, 477); await page.locator('dialog[data-phase="desktop"]').waitFor({ state: 'visible' });
  await screenshot('desktop.png');
  for (const app of ['考察アーカイブ', '収集ニュース', 'システム']) {
    await page.getByRole('button', { name: app, exact: true }).click();
    await page.getByText('GitHub Pages公開版', { exact: true }).waitFor();
  }
  await screenshot('desktop-public-data-status.png');
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'detached' });
  report.desktop = { openedFromCRT: true, appsExplainLocalData: true, escapeReturnedToRoom: true };
  const direct = new URL('observer-room/', url.endsWith('/') ? url : url + '/').href;
  assert.equal((await page.goto(direct, { waitUntil: 'networkidle', timeout: 60000 })).status(), 200);
  await ready(); await screenshot('direct-observer-room.png');
  report.directRoute = direct;
  report.assets = [...assets]; report.apiRequests = apiRequests;
  report.errors = errors; report.consoleErrors = consoleErrors; report.warnings = [...new Set(warnings)];
  report.failedResponses = failedResponses; report.failedRequests = failedRequests;
  assert.equal(apiRequests.length, 0); assert.equal(errors.length, 0); assert.equal(consoleErrors.length, 0);
  assert.equal(failedResponses.length, 0); assert.equal(failedRequests.length, 0);
  assert.ok([...assets].filter((asset) => asset.includes('.glb')).length >= 14);
  report.success = true;
} catch (error) {
  report.success = false; report.failure = error.message;
  report.errors = errors; report.consoleErrors = consoleErrors; report.failedResponses = failedResponses;
  await screenshot('failure.png').catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
