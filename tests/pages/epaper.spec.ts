import { test, expect, type Page } from "@playwright/test";
import { mockWeather, observeRoom, roomReady, seedRoom } from "./room-support";
import type { Mesh, MeshBasicMaterial } from "three";

async function settings(page: Page) {
  await page.getByRole("region", { name: "観察者の部屋", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator('dialog[data-phase="desktop"]')).toBeVisible();
  await page.getByRole("button", { name: "システム", exact: true }).click();
  await page.getByText("壁の電子ペーパー", { exact: true }).click();
  await expect(page.getByLabel("電子ペーパー1の画像", { exact: true })).toBeEnabled();
}
async function image(page: Page, color: string) {
  return Buffer.from(await page.evaluate(color => {
    const canvas = document.createElement("canvas"); canvas.width = 60; canvas.height = 100;
    const context = canvas.getContext("2d")!; context.fillStyle = color; context.fillRect(0, 0, 60, 100);
    return canvas.toDataURL("image/png").split(",")[1];
  }, color), "base64");
}
async function posters(page: Page) {
  return page.evaluate(() => [1, 2].map(i => {
    const mesh = window.__roomView.scene?.getObjectByName(`epaper-image-${i}`);
    return Boolean(mesh?.userData.customImage);
  }));
}
async function colors(page: Page) {
  return page.evaluate(() => [1, 2].map(i => {
    const mesh = window.__roomView.scene?.getObjectByName(`epaper-image-${i}`) as Mesh | undefined;
    const map = (mesh?.material as MeshBasicMaterial | undefined)?.map;
    if (!map?.image) return null;
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!; context.drawImage(map.image as HTMLImageElement, 0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
  }));
}
async function reloadRoom(page: Page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("部屋を準備しています…", { exact: true })).toHaveCount(0, { timeout: 45000 });
}

test("two local images persist independently, render on the wall, and can be replaced or removed", async ({ page, baseURL }, info) => {
  const errors: string[] = [], uploads: string[] = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("request", r => { if (r.method() === "POST" || r.method() === "PUT") uploads.push(r.url()); });
  await seedRoom(page); await mockWeather(page); await observeRoom(page); await roomReady(page, baseURL!); await settings(page);
  for (const slot of [1, 2]) {
    await page.getByLabel(`電子ペーパー${slot}の画像`, { exact: true }).setInputFiles({ name: `poster-${slot}.png`, mimeType: "image/png", buffer: await image(page, slot === 1 ? "#dd3322" : "#2266dd") });
    await expect(page.getByRole("status").filter({ hasText: `電子ペーパー${slot}の画像を保存しました。` })).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath("epaper-settings.png") }); await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0); await expect.poll(() => posters(page)).toEqual([true, true]);
  await page.screenshot({ path: info.outputPath("epaper-wall.png") });
  await reloadRoom(page); await expect.poll(() => posters(page), { timeout: 15000 }).toEqual([true, true]);
  const saved = await colors(page); expect(saved[0]![0]).toBeGreaterThan(200); expect(saved[0]![2]).toBeLessThan(70); expect(saved[1]![2]).toBeGreaterThan(200); expect(saved[1]![0]).toBeLessThan(70);
  await settings(page);
  for (const slot of [1, 2]) await expect(page.getByRole("img", { name: `電子ペーパー${slot}の保存画像` })).toBeVisible();
  await page.getByLabel("電子ペーパー1の画像", { exact: true }).setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: await image(page, "#22aa66") });
  await expect(page.getByRole("status").filter({ hasText: "電子ペーパー1の画像を保存しました。" })).toBeVisible();
  await page.getByRole("button", { name: "電子ペーパー2を初期表示に戻す", exact: true }).click();
  await expect(page.getByRole("img", { name: "電子ペーパー2の保存画像" })).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(page.locator("dialog")).toHaveCount(0); await expect.poll(() => posters(page)).toEqual([true, false]);
  await reloadRoom(page); await expect.poll(() => posters(page), { timeout: 15000 }).toEqual([true, false]);
  const replaced = await colors(page); expect(replaced[0]![1]).toBeGreaterThan(150); expect(replaced[0]![0]).toBeLessThan(70);
  expect(errors).toEqual([]); expect(uploads).toEqual([]);
});

test("bad images and quota failure preserve the last saved image and the working room", async ({ page, baseURL }) => {
  await seedRoom(page); await mockWeather(page); await observeRoom(page); await roomReady(page, baseURL!); await settings(page);
  const input = page.getByLabel("電子ペーパー1の画像", { exact: true });
  await input.setInputFiles({ name: "good.png", mimeType: "image/png", buffer: await image(page, "#ddaa33") });
  await expect(page.getByRole("status").filter({ hasText: "電子ペーパー1の画像を保存しました。" })).toBeVisible();
  for (const bad of [
    { name: "active.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") },
    { name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<script>bad</script>") },
    { name: "large.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
    { name: "broken.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]) },
  ]) { await input.setInputFiles(bad); await expect(page.locator('[class*="epaperSettings"] [role="alert"]')).toBeVisible(); await expect(page.getByRole("img", { name: "電子ペーパー1の保存画像" })).toBeVisible(); }
  await page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new DOMException("No space", "QuotaExceededError"); }; });
  await input.setInputFiles({ name: "valid.png", mimeType: "image/png", buffer: await image(page, "#3366dd") });
  await expect(page.getByRole("alert").filter({ hasText: "保存容量が不足しています" })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.locator("dialog")).toHaveCount(0); await expect.poll(() => posters(page)).toEqual([true, false]);
  await reloadRoom(page); await expect.poll(() => posters(page), { timeout: 15000 }).toEqual([true, false]);
});

test("the first-person camera and diagonal bridge leave real road clearance and visible traffic", async ({ page, baseURL }, info) => {
  await seedRoom(page); await mockWeather(page); await observeRoom(page); await roomReady(page, baseURL!);
  const geometry = await page.evaluate(() => {
    const { scene, camera } = window.__roomView;
    const corridor = scene!.getObjectByName("diagonal-viaduct-corridor")!, deck = scene!.getObjectByName("viaduct-deck")!, car = scene!.getObjectByName("street-car-0")!, train = scene!.getObjectByName("night-train")!;
    const world = (object: typeof deck) => object.getWorldPosition(object.position.clone()).toArray();
    return { eye: camera!.position.toArray(), angle: corridor.rotation.y, deck: world(deck), car: world(car), train: world(train), chair: Boolean(scene!.getObjectByName("office-chair")), shelf: Boolean(scene!.getObjectByName("corner-bookshelf")), reflection: Boolean(scene!.getObjectByName("car-headlight-reflection-0")) };
  });
  expect(geometry.eye[1]).toBeGreaterThan(1.5); expect(geometry.eye[1]).toBeLessThan(2); expect(geometry.eye[2]).toBeLessThan(3.4);
  expect(Math.abs(geometry.angle)).toBeGreaterThan(0.2); expect(geometry.deck[1] - geometry.car[1]).toBeGreaterThan(2); expect(geometry.train[1]).toBeGreaterThan(geometry.deck[1]);
  expect(geometry.chair && geometry.shelf && geometry.reflection).toBe(true);
  await page.screenshot({ path: info.outputPath("first-person-rain.png") });
  await info.attach("world-geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
});
