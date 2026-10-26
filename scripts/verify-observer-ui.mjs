// Actual Chrome/WebGL verification. Weather mocks intercept the real provider;
// there is no production query flag, test button, or separate rendering path.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
for (const name of ['--url', '--dependencies', '--output']) if (!process.argv.includes(name)) throw new Error(`${name} is required`);
const url = argument('--url'), output = path.resolve(argument('--output'));
const local = process.argv.includes('--local');
const { chromium } = createRequire(path.resolve(argument('--dependencies'), 'package.json'))('playwright-core');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { url, browser: await browser.version(), cases: [] };
const ready = async (page) => {
  await page.locator('canvas').waitFor({ timeout: 60000 });
  await page.getByText('部屋を準備しています…', { exact: true }).first().waitFor({ state: 'hidden', timeout: 60000 });
  await page.locator('[data-weather-status]:not([data-weather-status="loading"])').waitFor({ timeout: 20000 });
  await page.mouse.move(720, 450); await page.waitForTimeout(1300);
};
const phase = (page) => page.locator('[data-weather][data-phase]');
const save = (page, name) => page.screenshot({ path: path.join(output, name) });
const open = async (page, point = [792, 477]) => {
  await page.mouse.click(...point);
  await page.locator('dialog[data-phase="desktop"]').waitFor();
};
const close = async (page, escape = true) => {
  if (escape) await page.keyboard.press('Escape');
  else await page.getByRole('button', { name: 'モニターを閉じて部屋に戻る' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.mouse.move(720, 450); await page.waitForTimeout(1200);
};
const weatherBody = (code) => ({ current: { time: Math.floor(Date.now() / 1000), weather_code: code, precipitation: code === 63 ? 1.2 : 0 } });
async function contextFor(name, mode, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
  const page = await context.newPage();
  const result = { name, errors: [], consoleErrors: [], failedResponses: [], weatherRequests: [], apiRequests: [] };
  page.on('pageerror', (error) => result.errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') result.consoleErrors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) result.failedResponses.push({ url: response.url(), status: response.status() }); });
  page.on('request', (request) => {
    if (request.url().includes('api.open-meteo.com')) result.weatherRequests.push(request.url());
    if (new URL(request.url()).pathname.includes('/api/')) result.apiRequests.push(request.url());
  });
  if (mode !== 'live') await page.route('https://api.open-meteo.com/**', (route) => mode === 'failure'
    ? route.abort('failed') : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weatherBody(mode === 'rain' ? 63 : 0)) }));
  report.cases.push(result);
  return { context, page, result };
}
try {
  const { context, page, result } = await contextFor('live-provider-and-PC', 'live');
  await page.goto(url, { waitUntil: 'networkidle' }); await ready(page);
  result.weather = { mode: await phase(page).getAttribute('data-weather'), status: await phase(page).getAttribute('data-weather-status') };
  assert.equal(await page.getByRole('dialog').count(), 0);
  await save(page, 'room-live-weather.png');
  // A click starts one transition, even when further clicks arrive immediately.
  await page.mouse.click(792, 477, { clickCount: 2, delay: 30 });
  assert.equal(await phase(page).getAttribute('data-phase'), 'opening');
  const dialog = page.getByRole('dialog');
  result.fade = await dialog.evaluate((element) => ({ opacityDuringOpening: getComputedStyle(element).opacity,
    duration: getComputedStyle(element).animationDuration }));
  await save(page, 'crt-opening.png');
  await page.locator('dialog[data-phase="desktop"]').waitFor();
  assert.equal(await dialog.count(), 1);
  const actualClock = await page.getByLabel('PCの現在時刻').textContent();
  const expectedClock = await page.evaluate(() => `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`);
  assert.equal(actualClock, expectedClock); result.clock = { actual: actualClock, expected: expectedClock };
  await save(page, 'desktop-clock.png');
  if (local) {
    await page.getByRole('button', { name: '考察アーカイブ', exact: true }).click();
    const noteList = page.locator('[aria-label="考察一覧"]');
    await noteList.getByRole('button').first().click();
    await page.locator('pre').waitFor();
    const characters = (await page.locator('pre').textContent()).length;
    assert.ok(characters > 100);
    await save(page, 'local-archive-article.png');
    await page.getByRole('button', { name: '収集ニュース', exact: true }).click();
    await page.locator('[aria-label="収集ニュース一覧"]').getByRole('button').first().click();
    await page.getByRole('link', { name: '元の記事を開く ↗' }).waitFor();
    await save(page, 'local-news-article.png');
    result.savedData = { articleCharacters: characters, newsOpened: true };
  }
  for (const app of ['考察アーカイブ', '収集ニュース', 'システム']) {
    await page.getByRole('button', { name: app, exact: true }).click();
    await page.getByRole('heading', { name: app, exact: true }).waitFor();
  }
  await page.getByRole('region', { name: '窓の外の天候' }).waitFor();
  await save(page, 'system-weather.png');
  await page.getByRole('button', { name: 'モニターを閉じて部屋に戻る' }).click();
  assert.equal(await phase(page).getAttribute('data-phase'), 'closing');
  await save(page, 'crt-closing.png');
  await dialog.waitFor({ state: 'detached' }); await page.mouse.move(720, 450); await page.waitForTimeout(1300);
  // Both physical input devices are valid entry points, not only the CRT glass.
  await open(page, [760, 660]); await close(page);
  await open(page, [998, 685]); await close(page, false);
  result.inputDevices = { monitor: true, keyboard: true, mouse: true, escape: true, returnButton: true, repeatedClicks: true };
  assert.deepEqual(result.errors, []); assert.deepEqual(result.failedResponses, []);
  if (local) assert.ok(result.apiRequests.length > 0); else assert.deepEqual(result.apiRequests, []);
  assert.deepEqual(result.consoleErrors, []);
  await context.close();

  for (const mode of ['clear', 'rain', 'failure']) {
    const { context, page, result } = await contextFor(`mock-${mode}`, mode);
    await page.goto(url, { waitUntil: 'networkidle' }); await ready(page);
    const actualMode = await phase(page).getAttribute('data-weather');
    assert.equal(actualMode, mode === 'rain' ? 'rain' : 'clear');
    result.weather = { mode: actualMode, status: await phase(page).getAttribute('data-weather-status') };
    assert.equal(result.weather.status, mode === 'failure' ? 'fallback' : 'live');
    await save(page, `room-${mode}.png`);
    await open(page); await save(page, `desktop-${mode}.png`); await close(page);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.failedResponses, []);
    if (!local) assert.deepEqual(result.apiRequests, []);
    if (mode !== 'failure') assert.deepEqual(result.consoleErrors, []);
    else result.expectedNetworkFailure = true;
    await context.close();
  }

  const cached = await contextFor('stale-rain-cache-with-failed-provider', 'failure');
  await cached.page.addInitScript(() => {
    const old = Date.now() - 20 * 60_000;
    localStorage.setItem('observer-weather-v1:33.6,130.41667', JSON.stringify({ mode: 'rain', code: 63, observedAt: old, fetchedAt: old }));
  });
  await cached.page.goto(url, { waitUntil: 'networkidle' }); await ready(cached.page);
  assert.equal(await phase(cached.page).getAttribute('data-weather'), 'rain');
  assert.equal(await phase(cached.page).getAttribute('data-weather-status'), 'cached');
  await save(cached.page, 'room-cached-rain-on-failure.png');
  await open(cached.page); await close(cached.page);
  cached.result.expectedNetworkFailure = true;
  assert.deepEqual(cached.result.errors, []);
  await cached.context.close();

  const reduced = await contextFor('reduced-motion-and-clock-update', 'clear', 'reduce');
  await reduced.page.clock.install();
  await reduced.page.goto(url, { waitUntil: 'networkidle' }); await ready(reduced.page);
  await reduced.page.evaluate(() => { globalThis.__observerOpeningDuration = new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('dialog[data-phase="opening"]');
      if (dialog) { resolve(getComputedStyle(dialog).animationDuration); observer.disconnect(); }
    }); observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  }); });
  await open(reduced.page);
  const duration = await Promise.race([reduced.page.evaluate(() => globalThis.__observerOpeningDuration),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Opening animation observation timed out')), 10000))]);
  assert.equal(duration, '0.12s');
  const first = await reduced.page.getByLabel('PCの現在時刻').textContent();
  await reduced.page.clock.fastForward(61_000);
  const second = await reduced.page.getByLabel('PCの現在時刻').textContent();
  assert.notEqual(first, second);
  await close(reduced.page); await reduced.page.clock.fastForward(61_000); await open(reduced.page);
  const reopened = await reduced.page.getByLabel('PCの現在時刻').textContent();
  assert.notEqual(second, reopened);
  reduced.result.clock = { first, second, reopened, reducedMotionDuration: duration };
  await save(reduced.page, 'reduced-motion-clock.png');
  assert.deepEqual(reduced.result.errors, []); assert.deepEqual(reduced.result.consoleErrors, []);
  await reduced.context.close();
  report.success = true;
} catch (error) {
  report.success = false; report.failure = error.message;
  for (const context of browser.contexts()) for (const page of context.pages()) await save(page, 'failure.png').catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output, 'ui-browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); await browser.close();
}
