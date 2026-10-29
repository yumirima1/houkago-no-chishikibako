import { test, expect } from '@playwright/test';
import { seedRoom, mockWeather, roomReady, observeRoom } from './room-support';

for (const mobile of [false, true]) test.describe(mobile ? 'phone initial room' : 'desktop initial room', () => {
  test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
  test('loads the current room without UI or rendering errors and survives resize/reload', async ({ page, baseURL }, info) => {
    const errors: string[] = [], failures: string[] = [], assets = new Set<string>();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(request.url()); });
    page.on('response', response => {
      if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
      if (response.url().endsWith('.glb') && response.ok()) assets.add(response.url());
    });
    await seedRoom(page); await mockWeather(page, false); await observeRoom(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await roomReady(page, baseURL!); await page.waitForTimeout(3500);
    await expect(page.locator('[data-window][data-phase="room"]')).toHaveCount(1);
    await expect(page.locator('[data-window][data-phase]').locator('button,input,summary,details,dialog,nav,aside,[role="toolbar"]')).toHaveCount(0);
    expect(await page.locator('body').innerText()).toBe('');
    expect(assets.size).toBe(13);
    await page.waitForFunction(() => window.__roomView?.samples.length > 4);
    const bounds = async () => page.evaluate(() => {
      const camera = window.__roomView.camera!;
      const projected = [];
      // Production uses an interior camera. Keep its CRT and right-wall window accessible.
      for (const [x, y, z] of [[0.85, 1.57, -0.44], [3.56, 2.25, 0.3]]) {
        const p = camera.position.clone().set(x, y, z).project(camera); projected.push([p.x, p.y, p.z]);
      }
      const canvas = document.querySelector('canvas')!, rect = canvas.getBoundingClientRect(), gl = canvas.getContext('webgl2');
      return { projected, rect: rect.toJSON(), width: innerWidth, height: innerHeight, webgl: Boolean(gl && !gl.isContextLost()), frames: window.__roomView.samples.length };
    });
    const initial = await bounds(); expect(initial.webgl).toBe(true);
    expect(initial.rect.width).toBe(initial.width); expect(initial.rect.height).toBe(initial.height);
    for (const [x, y, z] of initial.projected) { expect(Math.abs(x)).toBeLessThan(0.98); expect(Math.abs(y)).toBeLessThan(0.98); expect(z).toBeLessThan(1); }
    await page.screenshot({ path: info.outputPath(mobile ? 'phone.png' : 'desktop.png') });
    if (!mobile) {
      const camera = () => page.evaluate(() => window.__roomView.camera!.position.toArray());
      await page.mouse.move(200, 200); await page.waitForTimeout(700); const before = await camera();
      await page.mouse.move(1200, 700); await page.waitForTimeout(700); const after = await camera();
      expect(Math.abs(after[0] - before[0])).toBeGreaterThan(0.03);
    }
    await page.setViewportSize(mobile ? { width: 844, height: 390 } : { width: 1920, height: 1080 });
    if (!mobile) await page.mouse.move(960, 540);
    await page.waitForTimeout(1000);
    for (const [x, y] of (await bounds()).projected) { expect(Math.abs(x)).toBeLessThan(0.98); expect(Math.abs(y)).toBeLessThan(0.98); }
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 740 }); await page.waitForTimeout(1000);
      for (const [x, y] of (await bounds()).projected) { expect(Math.abs(x)).toBeLessThan(0.98); expect(Math.abs(y)).toBeLessThan(0.98); }
      await page.screenshot({ path: info.outputPath('phone-small.png') });
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('部屋を準備しています…', { exact: true })).toHaveCount(0, { timeout: 45000 });
    await expect(page.locator('[data-window][data-phase]').locator('button,input,summary,details,dialog')).toHaveCount(0);
    const alias = new URL('observer-room/', baseURL!).href;
    await roomReady(page, alias); await expect(page.locator('[data-window][data-phase]').locator('button,input,summary,details,dialog')).toHaveCount(0);
    expect(errors).toEqual([]); expect(failures).toEqual([]);
    await info.attach('render-evidence', { body: JSON.stringify({ assets: [...assets], initial, errors, failures }), contentType: 'application/json' });
  });
});
