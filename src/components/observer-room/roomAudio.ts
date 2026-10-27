// Original, locally synthesized audio. No recordings, downloads or third-party samples.
export type SoundLayer = "music" | "rain" | "city";
export type SoundStatus = "stopped" | "starting" | "playing" | "error";
export type SoundState = { volume: number; status: SoundStatus; error: string | null };
export type RoomSoundState = Record<SoundLayer, SoundState>;
export const initialRoomSound: RoomSoundState = {
  music: { volume: 0.22, status: "stopped", error: null },
  rain: { volume: 0.18, status: "stopped", error: null },
  city: { volume: 0.12, status: "stopped", error: null },
};
export const soundVolume = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
export const outsideLevel = (open: boolean) => open ? 1 : 0.22;

/** A quiet 72 BPM, four-chord loop with swung keys, bass, kick and brushed hats. */
export function musicSamples(rate: number) {
  const beat = 60 / 72, duration = beat * 16;
  const data = new Float32Array(Math.ceil(duration * rate));
  const chords = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]];
  const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);
  for (let i = 0; i < data.length; i++) {
    const t = i / rate, bar = Math.min(3, Math.floor(t / (4 * beat))), local = t % (4 * beat);
    let value = 0;
    for (const onset of [0, 1.62 * beat, 3 * beat]) {
      const age = local - onset;
      if (age < 0) continue;
      const envelope = (1 - Math.exp(-age * 70)) * Math.exp(-age * 2.4);
      for (const note of chords[bar]) {
        const phase = 2 * Math.PI * frequency(note) * age;
        value += (Math.sin(phase) + 0.16 * Math.sin(phase * 2)) * envelope * 0.043;
      }
    }
    const pulse = t % beat;
    value += Math.sin(2 * Math.PI * frequency(chords[bar][0] - 24) * local) * Math.min(1, local * 30) * Math.exp(-pulse * 3) * 0.085;
    const kick = t % (beat * 2);
    value += Math.sin(2 * Math.PI * (45 * kick + 2.2 * (1 - Math.exp(-kick * 28)))) * Math.exp(-kick * 22) * 0.16;
    const hat = (t + beat * 0.34) % (beat / 2);
    value += Math.sin(i * 127.1) * Math.sin(i * 311.7) * Math.exp(-hat * 90) * 0.026;
    // Seamless silence at the wrap avoids a click without fading every bar.
    data[i] = Math.tanh(value) * Math.min(1, t * 80, (duration - t) * 80);
  }
  return data;
}

type Channel = { source: AudioBufferSourceNode; gain: GainNode };
export class RoomAudio {
  private context: AudioContext | null = null;
  private channels: Partial<Record<SoundLayer, Channel>> = {};
  private outdoor: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private requested = { music: false, rain: false, city: false };
  private revision = { music: 0, rain: 0, city: 0 };
  private state: RoomSoundState = structuredClone(initialRoomSound);
  private open = false;
  private disposed = false;
  constructor(private changed: (state: RoomSoundState) => void, private factory = () => new AudioContext()) {}
  private publish(layer: SoundLayer, patch: Partial<SoundState>) {
    this.state = { ...this.state, [layer]: { ...this.state[layer], ...patch } };
    if (!this.disposed) this.changed(this.state);
  }
  private ramp(parameter: AudioParam, value: number, seconds = 0.12) {
    const now = this.context!.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(value, now + seconds);
  }
  private ensure(layer: SoundLayer) {
    if (!this.context) {
      const context = this.factory();
      this.context = context;
      this.outdoor = context.createGain();
      this.outdoor.gain.value = outsideLevel(this.open);
      this.filter = context.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = this.open ? 12000 : 850;
      this.outdoor.connect(this.filter).connect(context.destination);
      context.onstatechange = () => {
        for (const key of ["music", "rain", "city"] as const) {
          if (this.requested[key]) this.publish(key, { status: context.state === "running" ? "playing" : "stopped" });
        }
      };
    }
    const context = this.context;
    if (!this.channels[layer]) {
      const rate = 22050;
      const samples = layer === "music" ? musicSamples(rate) : new Float32Array(rate * 8);
      if (layer !== "music") for (let i = 0; i < samples.length; i++) {
        const t = i / rate;
        samples[i] = (Math.random() * 2 - 1) * (layer === "rain" ? 0.38 + 0.06 * Math.sin(t * Math.PI / 2) : 0.12 + 0.1 * (1 + Math.sin(t * Math.PI / 4)));
      }
      const buffer = context.createBuffer(1, samples.length, rate);
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource(), gain = context.createGain(), tone = context.createBiquadFilter();
      source.buffer = buffer; source.loop = true; gain.gain.value = 0;
      tone.type = "lowpass"; tone.frequency.value = layer === "music" ? 3200 : layer === "rain" ? 6500 : 420;
      source.connect(tone).connect(gain).connect(layer === "music" ? context.destination : this.outdoor!);
      source.start(); this.channels[layer] = { source, gain };
    }
    return context;
  }
  async play(layer: SoundLayer, playing: boolean) {
    const revision = ++this.revision[layer];
    this.requested[layer] = playing;
    if (!playing) {
      if (this.channels[layer]) this.ramp(this.channels[layer]!.gain.gain, 0);
      this.publish(layer, { status: "stopped", error: null }); return;
    }
    this.publish(layer, { status: "starting", error: null });
    try {
      const context = this.ensure(layer);
      await context.resume();
      if (this.disposed || revision !== this.revision[layer]) return;
      if (context.state !== "running") throw new Error("AUDIO_SUSPENDED");
      this.ramp(this.channels[layer]!.gain.gain, this.state[layer].volume);
      this.publish(layer, { status: "playing", error: null });
    } catch {
      if (this.disposed || revision !== this.revision[layer]) return;
      this.requested[layer] = false;
      this.publish(layer, { status: "error", error: "音声を開始できませんでした。再生ボタンで再試行できます。" });
    }
  }
  volume(layer: SoundLayer, value: number) {
    const volume = soundVolume(value);
    this.publish(layer, { volume });
    if (this.channels[layer] && this.requested[layer]) this.ramp(this.channels[layer]!.gain.gain, volume, 0.06);
  }
  window(open: boolean) {
    this.open = open;
    if (!this.context) return;
    this.ramp(this.outdoor!.gain, outsideLevel(open), 0.55);
    this.ramp(this.filter!.frequency, open ? 12000 : 850, 0.55);
  }
  dispose() {
    this.disposed = true;
    if (this.context) {
      this.context.onstatechange = null;
      for (const channel of Object.values(this.channels)) { channel.source.stop(); channel.source.disconnect(); channel.gain.disconnect(); }
      void this.context.close().catch(() => {});
    }
  }
}
