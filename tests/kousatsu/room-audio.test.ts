import assert from "node:assert/strict";
import test from "node:test";
import { RoomAudio, initialRoomSound, musicSamples, type RoomSoundState } from "../../src/components/observer-room/roomAudio";

class Parameter {
  value = 0;
  ramps: { value: number; time: number }[] = [];
  cancelScheduledValues() {}
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.ramps.push({ value, time }); }
}
class Node {
  gain = new Parameter(); frequency = new Parameter(); buffer: unknown; loop = false; stopped = false;
  connect(node: Node) { return node; }
  disconnect() {}
  start() {}
  stop() { this.stopped = true; }
}
class Context {
  currentTime = 5; state = "suspended"; destination = new Node(); onstatechange: (() => void) | null = null;
  gains: Node[] = []; filters: Node[] = []; sources: Node[] = [];
  resume = async () => { this.state = "running"; this.onstatechange?.(); };
  createGain() { const n = new Node(); this.gains.push(n); return n; }
  createBiquadFilter() { const n = new Node(); this.filters.push(n); return n; }
  createBufferSource() { const n = new Node(); this.sources.push(n); return n; }
  createBuffer(_channels: number, size: number) { return { getChannelData: () => new Float32Array(size) }; }
  async close() { this.state = "closed"; }
}
function fixture() {
  const context = new Context(); let state: RoomSoundState = structuredClone(initialRoomSound); let allocations = 0;
  const audio = new RoomAudio(value => { state = value; }, () => { allocations++; return context as unknown as AudioContext; });
  return { context, audio, get state() { return state; }, get allocations() { return allocations; } };
}

test("room sound starts silent, independently mixes layers and reaches exact zero", async () => {
  const h = fixture(); assert.equal(h.allocations, 0);
  h.audio.volume("music", 0.3); assert.equal(h.allocations, 0);
  await h.audio.play("music", true); await h.audio.play("rain", true);
  assert.equal(h.allocations, 1); assert.equal(h.state.music.status, "playing");
  assert.equal(h.context.gains[1].gain.value, 0.3);
  h.audio.volume("rain", 0); assert.equal(h.context.gains[2].gain.value, 0);
  assert.equal(h.context.gains[1].gain.value, 0.3);
  await h.audio.play("music", false); assert.equal(h.context.gains[1].gain.value, 0);
  assert.equal(h.state.rain.status, "playing"); h.audio.dispose();
  assert.ok(h.context.sources.every(source => source.stopped));
});
test("window fades and filters only the outdoor bus, even when opened before playback", async () => {
  const h = fixture(); h.audio.window(true); await h.audio.play("city", true); await h.audio.play("music", true);
  assert.equal(h.context.gains[0].gain.value, 1);
  const musicGain = h.context.gains[2].gain.value;
  h.audio.window(false);
  assert.deepEqual(h.context.gains[0].gain.ramps.at(-1), { value: 0.22, time: 5.55 });
  assert.equal(h.context.filters[0].frequency.value, 850);
  assert.equal(h.context.gains[2].gain.value, musicGain); assert.equal(h.state.music.status, "playing"); h.audio.dispose();
});
test("failed resume reports an error and a subsequent gesture retries", async () => {
  const h = fixture(); h.context.resume = async () => { throw new Error("blocked"); };
  await h.audio.play("rain", true); assert.equal(h.state.rain.status, "error");
  assert.ok(h.state.rain.error); assert.equal(h.context.gains[1].gain.value, 0);
  h.context.resume = async () => { h.context.state = "running"; };
  await h.audio.play("rain", true); assert.equal(h.state.rain.status, "playing"); assert.equal(h.state.rain.error, null); h.audio.dispose();
});
test("a pending resume cannot turn a stopped channel back on", async () => {
  const h = fixture(); let finish!: () => void;
  h.context.resume = () => new Promise<void>(resolve => { finish = () => { h.context.state = "running"; resolve(); }; });
  const starting = h.audio.play("music", true); await h.audio.play("music", false); finish(); await starting;
  assert.equal(h.state.music.status, "stopped"); assert.equal(h.context.gains[1].gain.value, 0); h.audio.dispose();
});
test("generated lofi has real finite audio energy and remains below clipping", () => {
  const samples = musicSamples(8000);
  assert.ok(samples.length > 100000);
  let energy = 0, peak = 0;
  for (const sample of samples) { assert.ok(Number.isFinite(sample)); energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  assert.ok(Math.sqrt(energy / samples.length) > 0.025); assert.ok(peak < 0.8);
  assert.equal(samples[0], 0);
});
test("a pending autoplay request becomes an honest gesture prompt and reuses its source on retry", async () => {
  const h = fixture(); h.context.resume = () => new Promise<void>(() => {});
  await h.audio.play("music", true);
  assert.equal(h.state.music.status, "blocked"); assert.equal(h.context.gains[1].gain.value, 0);
  h.context.resume = async () => { h.context.state = "running"; h.context.onstatechange?.(); };
  await h.audio.play("music", true); assert.equal(h.state.music.status, "playing"); assert.equal(h.context.sources.length, 1);
  h.audio.dispose();
});
