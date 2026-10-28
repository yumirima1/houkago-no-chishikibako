import { test, expect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { ROOM_CAMERA } from '../../src/components/observer-room/roomMotion';
import { seedRoom, mockWeather, roomReady, observeRoom, observeSound, readSound } from './room-support';

test('the second-floor room keeps two CRTs, has no bed or flat monitor and a continuous reversible window', async ({ page, baseURL }, info) => {
  await seedRoom(page); await mockWeather(page); await observeRoom(page);
  await roomReady(page, baseURL!);
  await page.waitForFunction(() => Boolean(window.__roomView.scene));
  const geometry = await page.evaluate(() => {
    const scene = window.__roomView.scene!;
    return { bed: Boolean(scene.getObjectByName('bed')), flat: Boolean(scene.getObjectByName('second-monitor')), main: Boolean(scene.getObjectByName('interactive-crt')),
      small: scene.getObjectByName('small-crt')?.scale.x, posters: [1, 2].map(i => scene.getObjectByName(`epaper-poster-${i}`)?.position.y),
      road: scene.getObjectByName('second-floor-street')?.children[0].position.y, train: scene.getObjectByName('night-train')?.position.y };
  });
  expect(geometry.bed).toBe(false); expect(geometry.flat).toBe(false); expect(geometry.main).toBe(true); expect(geometry.small).toBeLessThan(1);
  expect(geometry.posters[0]).not.toBe(geometry.posters[1]); expect(geometry.road!).toBeLessThan(-3); expect(geometry.train!).toBeLessThan(0);
  await page.screenshot({ path: info.outputPath('room.png') }); await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.mouse.move(720, 450); await page.waitForTimeout(300);
  const camera = new PerspectiveCamera(ROOM_CAMERA.fov, 1440 / 900, 0.1, 100); camera.position.set(...ROOM_CAMERA.position); camera.lookAt(...ROOM_CAMERA.target); camera.updateMatrixWorld();
  const p = new Vector3(-0.6, 2.25, -1.76).project(camera), clickWindow = () => page.mouse.click((p.x + 1) * 720, (1 - p.y) * 450);
  const sash = () => page.evaluate(() => window.__roomView.scene!.getObjectByName('moving-window-sash')!.position.x);
  await clickWindow(); await expect(page.locator('[data-window="open"]')).toHaveCount(1); await page.waitForTimeout(160);
  await clickWindow(); await expect(page.locator('[data-window="closed"]')).toHaveCount(1);
  await page.waitForTimeout(120); await clickWindow(); await expect(page.locator('[data-window="open"]')).toHaveCount(1);
  await expect.poll(sash, { timeout: 15000 }).toBeCloseTo(-1.93, 1); await expect(page.locator('[data-window-motion="open"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('window-open.png') });
  const movement = await page.evaluate(() => window.__roomView.samples.filter(s => s.phase === 'room'));
  expect(movement.some(sample => sample.sash < -0.05 && sample.sash > -1.8)).toBe(true);
  // Compare actual consecutive frames, not two RPC reads separated by rendering latency.
  for (let i = 1; i < movement.length; i++) expect(Math.abs(movement[i].sash - movement[i - 1].sash)).toBeLessThan(0.45);
  expect(Math.abs(movement.at(-1)!.car - movement[0].car)).toBeGreaterThan(0.5); expect(Math.abs(movement.at(-1)!.train - movement[0].train)).toBeGreaterThan(0.5);
  await page.mouse.click(700, 790); await expect(page.locator('[data-window="open"]')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150);
  const crt = new Vector3(0.37, 1.57, -0.44).project(camera); await page.mouse.click((crt.x + 1) * 720, (1 - crt.y) * 450);
  await expect(page.locator('dialog[data-phase="desktop"]')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('dialog')).toHaveCount(0);
  await info.attach('room-geometry', { body: JSON.stringify(geometry), contentType: 'application/json' });
});

test('real lofi and automatic outdoor audio use one graph, fade with the window and reach silence', async ({ page, baseURL }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await seedRoom(page); await mockWeather(page); await observeSound(page); await roomReady(page, baseURL!);
  const controls = page.locator('details').first(); await controls.locator('summary').click(); await expect(controls.getByRole('slider')).toHaveCount(1);
  if (await controls.getByRole('button', { name: '音を有効にする', exact: true }).isVisible()) await controls.getByRole('button', { name: '音を有効にする', exact: true }).click();
  else if (await controls.getByRole('button', { name: '外の音を聴く', exact: true }).isVisible()) await controls.getByRole('button', { name: '外の音を聴く', exact: true }).click();
  await expect.poll(async () => (await readSound(page)).city.rms).toBeGreaterThan(0.0001);
  await expect.poll(async () => (await readSound(page)).rain.rms).toBeGreaterThan(0.001);
  await controls.getByRole('button', { name: 'ローファイを再生', exact: true }).click();
  await expect.poll(async () => (await readSound(page)).music.rms).toBeGreaterThan(0.001);
  await expect.poll(async () => (await readSound(page)).music.gain).toBeCloseTo(0.22, 3);
  const before = await readSound(page);
  await controls.getByRole('button', { name: '窓を開ける', exact: true }).click();
  await expect.poll(async () => (await readSound(page)).outside).toBeCloseTo(1, 2); expect((await readSound(page)).filter).toBeCloseTo(12000, 0);
  expect((await readSound(page)).music.gain).toBe(before.music.gain);
  await controls.getByRole('button', { name: '窓を閉める', exact: true }).click(); await expect.poll(async () => (await readSound(page)).outside).toBeCloseTo(0.22, 2);
  await controls.getByRole('slider', { name: 'ローファイの音量', exact: true }).fill('0');
  await expect.poll(async () => (await readSound(page)).music.gain).toBe(0); await expect.poll(async () => (await readSound(page)).music.rms).toBeLessThan(0.000001);
  expect((await readSound(page)).rain.rms).toBeGreaterThan(0.001);
  await controls.getByRole('slider', { name: 'ローファイの音量', exact: true }).fill('35'); await expect.poll(async () => (await readSound(page)).music.gain).toBeCloseTo(0.35, 3);
  await controls.getByRole('button', { name: 'ローファイを停止', exact: true }).click(); await expect.poll(async () => (await readSound(page)).music.gain).toBe(0);
  await controls.getByRole('button', { name: '外の音を止める', exact: true }).click(); await expect.poll(async () => (await readSound(page)).city.gain).toBe(0);
  await controls.getByRole('button', { name: '外の音を聴く', exact: true }).click(); await expect.poll(async () => (await readSound(page)).city.rms).toBeGreaterThan(0.0001);
  const after = await readSound(page); expect(after.contexts).toEqual(['running']); expect(after.sources).toBe(3); expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('sound-controls.png') }); await info.attach('audio-output', { body: JSON.stringify({ before, after, errors }), contentType: 'application/json' });
});

test('autoplay waiting is honest and a gesture starts the selected music without duplicating sources', async ({ page, baseURL }) => {
  await seedRoom(page, true, true); await mockWeather(page, false); await observeSound(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, '__allowRoomAudio', { value: false, writable: true });
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () { return (window as unknown as { __allowRoomAudio: boolean }).__allowRoomAudio ? resume.call(this) : new Promise<void>(() => {}); };
  });
  await roomReady(page, baseURL!); await page.waitForTimeout(600);
  await expect(page.locator('[data-initial-window="open"][data-initial-music="on"]')).toHaveCount(1);
  const controls = page.locator('details').first(); await expect(controls.locator('summary')).toContainText('音は待機中'); await controls.locator('summary').click();
  await expect(controls.getByRole('button', { name: 'ローファイを再生', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect((await readSound(page)).music.rms).toBe(0);
  await page.evaluate(() => { (window as unknown as { __allowRoomAudio: boolean }).__allowRoomAudio = true; });
  await controls.getByRole('button', { name: '音を有効にする', exact: true }).click();
  await expect(controls.getByRole('button', { name: 'ローファイを停止', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await readSound(page)).music.rms).toBeGreaterThan(0.001);
  expect((await readSound(page)).contexts.length).toBe(1); expect((await readSound(page)).sources).toBe(2);
});
