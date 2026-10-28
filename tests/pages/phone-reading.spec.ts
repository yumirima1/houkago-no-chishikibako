import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { seedRoom, mockWeather, roomReady, observeRoom, observeSound, readSound } from './room-support';

test.describe('touch phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('the phone itself approaches a stationary camera, then presents a separate mobile reader', async ({ page, baseURL }, info) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await seedRoom(page); await mockWeather(page, false); await observeRoom(page); await observeSound(page); await page.emulateMedia({ reducedMotion: 'no-preference' });
    await roomReady(page, baseURL!);
    await expect(page.locator('[data-window][data-phase="opening"]')).toHaveCount(1, { timeout: 15000 });
    await page.waitForTimeout(400); await page.screenshot({ path: info.outputPath('phone-approach.png') });
    const dialog = page.locator('dialog[data-device="phone"][data-phase="desktop"]'); await expect(dialog).toBeVisible();
    const samples = await page.evaluate(() => window.__roomView.samples.filter(sample => sample.phase === 'opening' && sample.phone));
    expect(samples.length).toBeGreaterThanOrEqual(2);
    const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
    expect(distance(samples[0].camera, samples.at(-1)!.camera)).toBeLessThan(0.001);
    expect(distance(samples[0].phone!, samples.at(-1)!.phone!)).toBeGreaterThan(2);
    expect(distance(samples.at(-1)!.phone!, samples.at(-1)!.camera)).toBeLessThan(2.3);
    await expect(dialog.locator('[class*="computerFrame"]')).toHaveCount(0); await page.screenshot({ path: info.outputPath('phone-home.png') });
    await dialog.getByRole('button', { name: /考察アーカイブ/ }).tap();
    const list = page.locator('[aria-label="考察一覧"]'); await expect(list).toBeVisible(); await expect(page.locator('[aria-label="考察本文"]')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('phone-list.png') }); await list.locator('button').first().tap();
    const content = page.locator('[data-document-content]'); await expect(content).toBeVisible(); await expect(list).toHaveCount(0);
    expect(await content.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.locator('dialog').evaluate(el => el.clientWidth)).toBe(390);
    const scroll = page.locator('[aria-label="考察本文"]'); await scroll.evaluate(el => el.scrollTop = el.scrollHeight); await expect(page.getByRole('button', { name: '一覧に戻る', exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('phone-reader-sources.png') }); await scroll.evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: info.outputPath('phone-reader.png') });
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const back = page.getByRole('button', { name: '一覧に戻る', exact: true }), bounds = await back.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.x).toBeGreaterThanOrEqual(0);
    await back.tap(); await expect(list).toBeVisible(); await expect(page.locator('[aria-label="考察本文"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'アプリを閉じる', exact: true }).tap();
    await dialog.locator('summary').tap(); await expect(dialog.getByRole('slider')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'ローファイを再生', exact: true }).tap();
    await expect.poll(async () => (await readSound(page)).music.rms).toBeGreaterThan(0.001);
    const slider = dialog.getByRole('slider', { name: 'ローファイの音量', exact: true }); await slider.scrollIntoViewIfNeeded();
    const target = await slider.boundingBox(); expect(target!.height).toBeGreaterThanOrEqual(44);
    await page.touchscreen.tap(target!.x + target!.width * 0.65, target!.y + target!.height / 2);
    await expect.poll(async () => (await readSound(page)).music.gain).toBeGreaterThan(0.45);
    await dialog.getByRole('button', { name: '窓を開ける', exact: true }).tap(); await expect(page.locator('[data-window="open"]')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'モニターを閉じて部屋に戻る', exact: true }).tap(); await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.locator('[data-window][data-phase="room"]')).toHaveCount(1); await page.waitForTimeout(1200); await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '端末を開く', exact: true })).toBeVisible(); expect(errors).toEqual([]);
    await info.attach('phone-movement', { body: JSON.stringify({ samples, errors }), contentType: 'application/json' });
  });
});

test('a failed backend can retry, and leaving an unfinished reader cannot overwrite the next note', async ({ page, baseURL }, info) => {
  const snapshot = JSON.parse(await readFile('public/research/snapshot.json', 'utf8'));
  const first = snapshot.notes[0], second = snapshot.notes[1]; expect(second).toBeTruthy();
  const firstNote = JSON.parse(await readFile(`public/research/notes/${first.id}.json`, 'utf8'));
  const secondNote = JSON.parse(await readFile(`public/research/notes/${second.id}.json`, 'utf8'));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let failSnapshot = true, release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await seedRoom(page); await mockWeather(page, false);
  await page.route(url => url.pathname.endsWith('/research/snapshot.json') || url.pathname === '/api/observer-room' && !url.searchParams.has('note'), route => route.fulfill({ status: failSnapshot ? 503 : 200, json: failSnapshot ? { error: 'Fixture outage' } : snapshot }));
  await page.route(url => url.pathname.includes('/research/notes/') && url.pathname.endsWith('.json') || url.pathname === '/api/observer-room' && url.searchParams.has('note'), async route => {
    const url = new URL(route.request().url()), id = url.searchParams.get('note') ?? url.pathname.split('/').at(-1)!.replace('.json', '');
    if (id === first.id) { await pending; await route.fulfill({ json: firstNote }).catch(() => {}); }
    else await route.fulfill({ json: { ...secondNote, markdown: `# ${secondNote.title}\n\n## 読み込みの確認\n\nSecond current body.\n\n<script>window.badReaderScript=true</script>\n\n[unsafe](javascript:alert(1))` } });
  });
  await roomReady(page, baseURL!); await page.getByRole('button', { name: 'CRTモニターを開く', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('dialog[data-phase="desktop"]')).toBeVisible(); await page.getByRole('button', { name: '考察アーカイブ', exact: true }).click();
  await expect(page.locator('dialog [role="alert"]')).toContainText('保存データを読み込めません');
  failSnapshot = false; await page.getByRole('button', { name: '再試行', exact: true }).click();
  await page.locator(`[data-record-id="${first.id}"]`).click(); await expect(page.getByText('本文を開いています…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '一覧に戻る', exact: true }).click(); await page.locator(`[data-record-id="${second.id}"]`).click();
  const content = page.locator('[data-document-content]'); await expect(content).toContainText('Second current body.');
  release(); await page.waitForTimeout(150); await expect(content).toContainText('Second current body.');
  await expect(content.locator('script')).toHaveCount(0); await expect(content.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => 'badReaderScript' in window)).toBe(false); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('reader-safe-content.png') });
});
