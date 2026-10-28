import { test, expect } from '@playwright/test';
import { seedRoom, mockWeather, roomReady } from './room-support';

for (const [open, music] of [[true, true], [false, true], [true, false], [false, false]]) {
  test(`initial state window=${open} music=${music} remains chosen during interaction`, async ({ page, baseURL }) => {
    await seedRoom(page, open, music); await mockWeather(page, false); await roomReady(page, baseURL!);
    const root = page.locator('[data-initial-window][data-initial-music]');
    await expect(root).toHaveAttribute('data-initial-window', open ? 'open' : 'closed'); await expect(root).toHaveAttribute('data-initial-music', music ? 'on' : 'off');
    await expect(root).toHaveAttribute('data-window', open ? 'open' : 'closed');
    const controls = page.locator('details').first(); await controls.locator('summary').click();
    await controls.getByRole('button', { name: open ? '窓を閉める' : '窓を開ける', exact: true }).click();
    await expect(root).toHaveAttribute('data-window', open ? 'closed' : 'open'); await page.waitForTimeout(300);
    await expect(root).toHaveAttribute('data-initial-window', open ? 'open' : 'closed'); await expect(root).toHaveAttribute('data-initial-music', music ? 'on' : 'off');
    await page.reload({ waitUntil: 'domcontentloaded' }); await expect(root).toHaveAttribute('data-window', open ? 'open' : 'closed');
  });
}
