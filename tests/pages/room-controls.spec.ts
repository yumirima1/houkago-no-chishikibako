import { test, expect } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { ROOM_CAMERA } from "../../src/components/observer-room/roomMotion";

declare global {
  interface Window {
    __roomAudioTest: { contexts: AudioContext[]; gains: GainNode[]; analysers: AnalyserNode[]; filters: BiquadFilterNode[] };
  }
}

test("room window, real audio output, independent gain and CRT survive the public build", async ({ page, baseURL }, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [], failures: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.route("https://api.open-meteo.com/**", route => route.fulfill({ json: { current: { time: Math.floor(Date.now() / 1000), weather_code: 63, precipitation: 1 } } }));
  await page.addInitScript(() => {
    const NativeContext = window.AudioContext;
    window.__roomAudioTest = { contexts: [], gains: [], analysers: [], filters: [] };
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) { super(options); window.__roomAudioTest.contexts.push(this); }
      createGain() {
        const gain = super.createGain(), analyser = super.createAnalyser();
        analyser.fftSize = 2048; gain.connect(analyser);
        window.__roomAudioTest.gains.push(gain); window.__roomAudioTest.analysers.push(analyser); return gain;
      }
      createBiquadFilter() { const filter = super.createBiquadFilter(); window.__roomAudioTest.filters.push(filter); return filter; }
    };
  });
  expect((await page.goto(baseURL!, { waitUntil: "networkidle" }))?.status()).toBe(200);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("部屋を準備しています…", { exact: true })).toHaveCount(0, { timeout: 30000 });
  expect(await page.evaluate(() => window.__roomAudioTest.contexts.length)).toBe(0);
  await expect(page.locator("details[open]")).toHaveCount(0);
  await page.mouse.move(720, 450); await page.waitForTimeout(1000);
  const camera = new PerspectiveCamera(42, 1440 / 900, 0.1, 100);
  camera.position.set(...ROOM_CAMERA.position); camera.lookAt(...ROOM_CAMERA.target); camera.updateMatrixWorld();
  const point = new Vector3(0.35, 2.95, -1.76).project(camera);
  const clickWindow = () => page.mouse.click((point.x + 1) * 720, (1 - point.y) * 450);
  await page.screenshot({ path: info.outputPath("room-closed.png") });
  await clickWindow(); await expect(page.locator('[data-window="open"]')).toHaveCount(1);
  await page.waitForTimeout(1000); await page.screenshot({ path: info.outputPath("room-open.png") });
  await clickWindow(); await expect(page.locator('[data-window="closed"]')).toHaveCount(1);
  await page.mouse.click(700, 790); await expect(page.locator('[data-window="closed"]')).toHaveCount(1);
  // Also exercise a live OS motion-preference change; static rendering then saves GPU work.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByText("部屋の音と窓", { exact: true }).click();
  const read = () => page.evaluate(() => {
    const t = window.__roomAudioTest;
    return { contexts: t.contexts.map(c => c.state), gains: t.gains.map(g => g.gain.value), filter: t.filters[0]?.frequency.value,
      rms: t.analysers.map(a => { const data = new Float32Array(a.fftSize); a.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length); }) };
  });
  await page.getByRole("button", { name: "ローファイを再生", exact: true }).click();
  await expect(page.getByRole("button", { name: "ローファイを停止" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await read()).rms[1]).toBeGreaterThan(0.001);
  await expect.poll(async () => (await read()).gains[1]).toBeCloseTo(0.22, 3);
  const music = (await read()).gains[1];
  await page.getByRole("button", { name: "雨音を再生", exact: true }).click();
  await expect.poll(async () => (await read()).rms[2]).toBeGreaterThan(0.001);
  await page.getByRole("button", { name: "街の遠音を再生", exact: true }).click();
  await expect.poll(async () => (await read()).rms[3]).toBeGreaterThan(0.0001);
  const closed = await read(); expect(closed.gains[0]).toBeCloseTo(0.22, 2);
  await page.getByRole("button", { name: "窓を開ける", exact: true }).click();
  await expect.poll(async () => (await read()).gains[0]).toBeCloseTo(1, 2);
  expect((await read()).filter).toBeCloseTo(12000, 0); expect((await read()).gains[1]).toBe(music);
  await page.getByRole("button", { name: "窓を閉める", exact: true }).click();
  await expect.poll(async () => (await read()).gains[0]).toBeCloseTo(0.22, 2);
  const setVolume = async (label: string, value: string) => {
    await page.getByRole("slider", { name: label, exact: true }).fill(value);
  };
  await setVolume("ローファイの音量", "0");
  await expect.poll(async () => (await read()).gains[1]).toBe(0);
  await expect.poll(async () => (await read()).rms[1]).toBeLessThan(0.000001);
  expect((await read()).gains[2]).toBeCloseTo(0.18, 3);
  await setVolume("ローファイの音量", "35");
  await expect.poll(async () => (await read()).gains[1]).toBeCloseTo(0.35, 3);
  await page.getByRole("button", { name: "ローファイを停止", exact: true }).click();
  await expect.poll(async () => (await read()).gains[1]).toBe(0);
  await page.getByRole("button", { name: "雨音を停止", exact: true }).click();
  await page.getByRole("button", { name: "街の遠音を停止", exact: true }).click();
  await page.getByText("部屋の音と窓", { exact: true }).click();
  const crt = new Vector3(0.12, 1.57, -0.44).project(camera);
  await page.mouse.click((crt.x + 1) * 720, (1 - crt.y) * 450);
  await expect(page.locator('dialog[data-phase="desktop"]')).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.locator("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "CRTモニターを開く", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator('dialog[data-phase="desktop"]')).toBeVisible();
  await page.getByRole("button", { name: "モニターを閉じて部屋に戻る" }).click(); await expect(page.locator("dialog")).toHaveCount(0);
  await page.reload(); await expect(page.locator("canvas")).toBeVisible();
  expect(await page.evaluate(() => window.__roomAudioTest.contexts.length)).toBe(0);
  expect(errors).toEqual([]); expect(failures).toEqual([]);
  await info.attach("audio-output", { body: JSON.stringify({ closed, errors, failures }), contentType: "application/json" });
});

test("audio startup failure stays stopped and can be retried", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    const resume = AudioContext.prototype.resume; let denied = true;
    AudioContext.prototype.resume = function () { if (denied) { denied = false; return Promise.reject(new Error("Simulated autoplay denial")); } return resume.call(this); };
  });
  await page.goto(baseURL!); await page.getByText("部屋の音と窓", { exact: true }).click();
  await page.getByRole("button", { name: "ローファイを再生", exact: true }).click();
  await expect(page.locator('details [role="alert"]')).toContainText("音声を開始できませんでした");
  await page.getByRole("button", { name: "ローファイを再生", exact: true }).click();
  await expect(page.getByRole("button", { name: "ローファイを停止", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("mobile controls and keyboard window access fit the viewport", async ({ page, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL!); await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("部屋を準備しています…", { exact: true })).toHaveCount(0, { timeout: 30000 });
  await page.getByText("部屋の音と窓", { exact: true }).focus(); await page.keyboard.press("Enter");
  const button = page.getByRole("button", { name: "窓を開ける", exact: true }); await button.focus(); await page.keyboard.press("Enter");
  await expect(page.locator('[data-window="open"]')).toHaveCount(1);
  const bounds = await page.locator("details").boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("room-mobile.png") });
  await page.getByText("部屋の音と窓", { exact: true }).click();
  await page.screenshot({ path: info.outputPath("room-mobile-closed-controls.png") });
});
