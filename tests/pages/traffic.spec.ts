import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { Mesh, PlaneGeometry } from "three";
import { mockWeather, observeRoom, roomReady, seedRoom } from "./room-support";

type Vehicle = { id: string; position: number[]; heading: number; throughWindow: boolean; screen: number[] };
type TrafficFrame = { time: number; phase: string | null; train: Vehicle; cars: Vehicle[] };
declare global { interface Window { __trafficFrames: TrafficFrame[] } }

async function recordTraffic(page: Page) {
  await page.waitForFunction(() => Boolean(window.__roomView.scene?.getObjectByName("night-train")));
  await page.evaluate(() => {
    const scene = window.__roomView.scene!;
    const previous = scene.onAfterRender;
    window.__trafficFrames = [];
    scene.onAfterRender = function (...args) {
      previous.apply(this, args);
      const camera = args[2], mask = scene.getObjectByName("exterior-window-mask")! as Mesh<PlaneGeometry>;
      const eye = mask.worldToLocal(camera.getWorldPosition(camera.position.clone()));
      const { width, height } = mask.geometry.parameters;
      const vehicle = (name: string, offsets: number[]): Vehicle => {
        const object = scene.getObjectByName(name)!;
        let throughWindow = false;
        const screen: number[] = [];
        for (const x of offsets) {
          const world = object.localToWorld(object.position.clone().set(x, 0.2, 0));
          const local = mask.worldToLocal(world.clone()), t = -eye.z / (local.z - eye.z);
          const intersection = eye.clone().lerp(local, t), projected = world.project(camera);
          if (screen.length === 0) screen.push(...projected.toArray());
          if (t > 0 && t < 1 && Math.abs(intersection.x) < width / 2 && Math.abs(intersection.y) < height / 2
            && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1) throughWindow = true;
        }
        return { id: object.uuid, position: object.position.toArray(), heading: object.rotation.y, throughWindow, screen };
      };
      window.__trafficFrames.push({ time: performance.now(), phase: document.querySelector("[data-window][data-phase]")?.getAttribute("data-phase") ?? null,
        train: vehicle("night-train", [0, -2.65, -5.3, -7.95]), cars: [0, 1, 2, 3].map(index => vehicle(`street-car-${index}`, [0])) });
      if (window.__trafficFrames.length > 8000) window.__trafficFrames.shift();
    };
  });
}

const travelled = (a: number, b: number, period: number) => ((b - a + period * 1.5) % period) - period / 2;

function checkMovement(frames: TrafficFrame[], rate: number) {
  expect(frames.length).toBeGreaterThanOrEqual(4);
  const pairs = frames.slice(1).map((frame, index) => [frames[index], frame] as const)
    .filter(([a, b]) => a.phase === "room" && b.phase === "room" && b.time - a.time > 0 && b.time - a.time < 5000);
  const seconds = pairs.reduce((total, [a, b]) => total + (b.time - a.time) / 1000, 0);
  expect(seconds).toBeGreaterThan(2);
  const velocities = Array.from({ length: 5 }, (_, index) => {
    const speed = index === 0 ? 1.45 : index % 2 ? 1.6 : -1.8, period = index === 0 ? 80 : 70;
    const vehicle = (frame: TrafficFrame) => index === 0 ? frame.train : frame.cars[index - 1];
    let total = 0;
    for (const [a, b] of pairs) {
      const before = vehicle(a), after = vehicle(b), delta = travelled(before.position[0], after.position[0], period);
      expect(after.id).toBe(before.id);
      expect(after.position[1]).toBe(before.position[1]); expect(after.position[2]).toBe(before.position[2]);
      expect(delta * Math.sign(speed)).toBeGreaterThanOrEqual(-0.00001);
      total += delta;
    }
    const measured = total / seconds;
    // Compare sustained actual frame times. Loose bounds allow software-rendering
    // submission latency while still rejecting frame-count-based slow motion.
    expect(Math.abs(measured)).toBeGreaterThan(Math.abs(speed) * rate * 0.65);
    expect(Math.abs(measured)).toBeLessThan(Math.abs(speed) * rate * 1.4);
    return measured;
  });
  for (const frame of frames) for (let index = 0; index < 4; index++) {
    expect(frame.cars[index].heading).toBeCloseTo(index % 2 ? Math.PI : 0, 6);
    expect(frame.cars[index].position[2]).toBeCloseTo(index % 2 ? -1.05 : 1.05, 6);
    expect(Math.abs(travelled(frame.cars[index].position[0], frame.cars[(index + 2) % 4].position[0], 70))).toBeCloseTo(32, 5);
  }
  return { seconds, velocities, frames: frames.length };
}

async function captureVisibleMotion(page: Page, info: TestInfo, name: string) {
  const after = await page.evaluate(() => performance.now());
  await page.waitForFunction(after => {
    const frame = window.__trafficFrames.at(-1);
    return frame && frame.time >= after && frame.phase === "room" && frame.train.throughWindow && frame.cars.some(car => car.throughWindow);
  }, after, { timeout: 45000 });
  await page.screenshot({ path: info.outputPath(`${name}-before.png`) });
  const start = await page.evaluate(() => window.__trafficFrames.at(-1)!.time);
  await page.waitForFunction(start => window.__trafficFrames.at(-1)!.time - start >= 6500, start, { timeout: 20000 });
  await page.screenshot({ path: info.outputPath(`${name}-after.png`) });
  return page.evaluate(start => window.__trafficFrames.filter(frame => frame.time >= start), start);
}

async function prepare(page: Page, url: string, reduced: boolean) {
  await seedRoom(page); await mockWeather(page); await observeRoom(page);
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await roomReady(page, url);
}

test("traffic moves in the right window, pauses behind the terminal, resumes after resize, and reappears after a full pass", async ({ page, baseURL }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await prepare(page, baseURL!, false); await recordTraffic(page);
  const first = await captureVisibleMotion(page, info, "traffic-normal");
  const movement = checkMovement(first, 1);
  await page.getByRole("button", { name: "CRTモニターを開く", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator('dialog[data-phase="desktop"]')).toBeVisible();
  await page.waitForTimeout(750);
  const paused = await page.evaluate(() => ({ count: window.__trafficFrames.length, frame: window.__trafficFrames.at(-1)! }));
  await page.waitForTimeout(1500);
  const still = await page.evaluate(() => ({ count: window.__trafficFrames.length, frame: window.__trafficFrames.at(-1)! }));
  expect(still.count).toBeLessThanOrEqual(paused.count + 1);
  expect(still.frame.train.position).toEqual(paused.frame.train.position);
  await page.keyboard.press("Escape"); await expect(page.locator('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  const resumedAt = await page.evaluate(() => performance.now());
  await page.waitForFunction(start => window.__trafficFrames.at(-1)!.time - start >= 5000, resumedAt, { timeout: 20000 });
  const resumed = await page.evaluate(start => window.__trafficFrames.filter(frame => frame.phase === "room" && frame.time >= start), resumedAt);
  expect(resumed[0].train.id).toBe(paused.frame.train.id);
  const resumedMovement = checkMovement(resumed, 1);
  // Observe a real loop; never advance a mocked clock or change object positions.
  await page.waitForFunction(() => {
    const frames = window.__trafficFrames;
    const wrap = frames.findIndex((frame, index) => index > 0 && frame.train.position[0] < frames[index - 1].train.position[0] - 40);
    return wrap >= 0 && frames.slice(wrap).some(frame => frame.train.throughWindow);
  }, undefined, { timeout: 65000 });
  const frames = await page.evaluate(() => window.__trafficFrames);
  const wrap = frames.findIndex((frame, index) => index > 0 && frame.train.position[0] < frames[index - 1].train.position[0] - 40);
  expect(frames[wrap - 1].train.throughWindow).toBe(false); expect(frames[wrap].train.throughWindow).toBe(false);
  expect(frames.slice(0, wrap).some(frame => !frame.train.throughWindow)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("train-reappeared.png") });
  await info.attach("traffic-real-time", { body: JSON.stringify({ movement, resumedMovement, paused, still, wrap, errors, frames }), contentType: "application/json" });
});

test("reduced motion keeps slow continuous traffic visible through the right window", async ({ page, baseURL }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await prepare(page, baseURL!, true); await recordTraffic(page);
  const frames = await captureVisibleMotion(page, info, "traffic-reduced");
  const movement = checkMovement(frames, 0.35);
  expect(errors).toEqual([]);
  await info.attach("traffic-reduced-real-time", { body: JSON.stringify({ movement, errors, frames }), contentType: "application/json" });
});

test.describe("traffic on a touch phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("returning from the phone reveals moving trains and cars, including after orientation changes", async ({ page, baseURL }, info) => {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await prepare(page, baseURL!, false);
    await expect(page.locator('dialog[data-device="phone"][data-phase="desktop"]')).toBeVisible();
    await page.getByRole("button", { name: "モニターを閉じて部屋に戻る", exact: true }).tap();
    await expect(page.locator('dialog')).toHaveCount(0); await expect(page.locator('[data-window][data-phase="room"]')).toHaveCount(1);
    await recordTraffic(page);
    const portrait = await captureVisibleMotion(page, info, "traffic-phone-portrait"), portraitMovement = checkMovement(portrait, 1);
    const ids = portrait[0].cars.map(car => car.id);
    await page.setViewportSize({ width: 844, height: 390 });
    const landscape = await captureVisibleMotion(page, info, "traffic-phone-landscape"), landscapeMovement = checkMovement(landscape, 1);
    expect(landscape[0].cars.map(car => car.id)).toEqual(ids);
    expect(errors).toEqual([]);
    await info.attach("traffic-phone-real-time", { body: JSON.stringify({ portraitMovement, landscapeMovement, errors, portrait, landscape }), contentType: "application/json" });
  });
});
