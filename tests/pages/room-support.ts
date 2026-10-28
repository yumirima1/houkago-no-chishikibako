import { expect, type Page } from "@playwright/test";
import type { Camera, Scene, WebGLRenderer } from "three";

type Sample = { phase: string | null; time: number; camera: number[]; phone: number[] | null; sash: number; car: number; train: number };
declare global {
  interface Window {
    __roomView: { scene?: Scene; camera?: Camera; samples: Sample[] };
    __THREE_DEVTOOLS__: EventTarget;
    __roomSound: { contexts: AudioContext[]; gains: GainNode[]; filters: BiquadFilterNode[]; sources: AudioBufferSourceNode[]; channels: Partial<Record<"music" | "rain" | "city", { gain: GainNode; analyser: AnalyserNode }>> };
  }
}

export async function seedRoom(page: Page, windowOpen = false, musicWanted = false) {
  await page.addInitScript(({ windowOpen, musicWanted }) => {
    const native = crypto.getRandomValues.bind(crypto); let seeded = false;
    crypto.getRandomValues = ((array: Uint32Array) => {
      if (!seeded && array instanceof Uint32Array && array.length === 2) { seeded = true; array[0] = windowOpen ? 0 : 0xffffffff; array[1] = musicWanted ? 0 : 0xffffffff; return array; }
      return native(array);
    }) as typeof crypto.getRandomValues;
  }, { windowOpen, musicWanted });
}
export async function mockWeather(page: Page, rain = true) {
  await page.route("https://api.open-meteo.com/**", route => route.fulfill({ json: { current: { time: Math.floor(Date.now() / 1000), weather_code: rain ? 63 : 0, precipitation: rain ? 1 : 0 } } }));
}
export async function observeRoom(page: Page) {
  await page.addInitScript(() => {
    window.__roomView = { samples: [] }; window.__THREE_DEVTOOLS__ = new EventTarget();
    window.__THREE_DEVTOOLS__.addEventListener("observe", event => {
      const object = (event as CustomEvent<Scene | WebGLRenderer>).detail;
      if (!("domElement" in object)) return;
      const render = object.render.bind(object);
      object.render = (scene, camera) => {
        render(scene, camera);
        if (!scene.getObjectByName("night-study")) return;
        window.__roomView.scene = scene as Scene; window.__roomView.camera = camera;
        const phone = scene.getObjectByName("floating-phone");
        window.__roomView.samples.push({ phase: document.querySelector("[data-window][data-phase]")?.getAttribute("data-phase") ?? null,
          time: performance.now(), camera: camera.position.toArray(), phone: phone?.position.toArray() ?? null,
          sash: scene.getObjectByName("moving-window-sash")?.position.x ?? 0,
          car: scene.getObjectByName("street-car-0")?.position.x ?? 0, train: scene.getObjectByName("night-train")?.position.x ?? 0 });
        if (window.__roomView.samples.length > 400) window.__roomView.samples.shift();
      };
    });
  });
}
export async function observeSound(page: Page) {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const analysers = new WeakMap<GainNode, AnalyserNode>();
    window.__roomSound = { contexts: [], gains: [], filters: [], sources: [], channels: {} };
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) { super(options); window.__roomSound.contexts.push(this); }
      createGain() { const gain = super.createGain(), analyser = super.createAnalyser(); gain.connect(analyser); analysers.set(gain, analyser); window.__roomSound.gains.push(gain); return gain; }
      createBufferSource() { const source = super.createBufferSource(); window.__roomSound.sources.push(source); return source; }
      createBiquadFilter() {
        const filter = super.createBiquadFilter(), connect = filter.connect.bind(filter);
        window.__roomSound.filters.push(filter);
        filter.connect = ((destination: AudioNode) => {
          const key = filter.frequency.value === 3200 ? "music" : filter.frequency.value === 6500 ? "rain" : filter.frequency.value === 420 ? "city" : null;
          if (key && destination instanceof GainNode) window.__roomSound.channels[key] = { gain: destination, analyser: analysers.get(destination)! };
          return connect(destination);
        }) as typeof filter.connect;
        return filter;
      }
    };
  });
}
export async function readSound(page: Page) {
  return page.evaluate(() => {
    const graph = window.__roomSound;
    const channel = (key: "music" | "rain" | "city") => {
      const node = graph.channels[key]; if (!node) return { gain: 0, rms: 0 };
      const data = new Float32Array(node.analyser.fftSize); node.analyser.getFloatTimeDomainData(data);
      return { gain: node.gain.gain.value, rms: Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length) };
    };
    return { contexts: graph.contexts.map(context => context.state), sources: graph.sources.length, outside: graph.gains[0]?.gain.value,
      filter: graph.filters[0]?.frequency.value, music: channel("music"), rain: channel("rain"), city: channel("city") };
  });
}
export async function roomReady(page: Page, url: string) {
  expect((await page.goto(url, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("部屋を準備しています…", { exact: true })).toHaveCount(0, { timeout: 45000 });
}
