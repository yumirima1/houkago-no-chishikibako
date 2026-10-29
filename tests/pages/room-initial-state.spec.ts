import { test, expect } from '@playwright/test';
import { seedRoom, mockWeather, roomReady, observeRoom, roomPoint } from './room-support';

for (const [open, music] of [[true, true], [false, true], [true, false], [false, false]]) {
  test(`initial state window=${open} music=${music} remains chosen during interaction`, async ({ page, baseURL }) => {
    await seedRoom(page, open, music); await mockWeather(page, false); await observeRoom(page); await roomReady(page, baseURL!);
    const root = page.locator('[data-initial-window][data-initial-music]');
    await expect(root).toHaveAttribute('data-initial-window', open ? 'open' : 'closed'); await expect(root).toHaveAttribute('data-initial-music', music ? 'on' : 'off');
    await expect(root).toHaveAttribute('data-window', open ? 'open' : 'closed');
    await expect(page.locator('[data-window][data-phase]').locator('button,details,input,dialog')).toHaveCount(0);
    const handle = await roomPoint(page, [3.56, 2.25, 0.3]); await page.mouse.click(handle.x, handle.y);
    await expect(root).toHaveAttribute('data-window', open ? 'closed' : 'open'); await page.waitForTimeout(300);
    await expect(root).toHaveAttribute('data-initial-window', open ? 'open' : 'closed'); await expect(root).toHaveAttribute('data-initial-music', music ? 'on' : 'off');
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(root).toHaveAttribute('data-window', open ? 'open' : 'closed');
  });
}
