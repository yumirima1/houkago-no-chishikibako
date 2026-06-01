import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { encodeWavToMp3File, wavToBuffer } from "./lib/audio-codec";

const sampleRate = 24000;
const channels = 1;
const publicJingleDir = path.join(process.cwd(), "public", "jingles");
const generatedJingleDir = path.join(process.cwd(), "generated-audio", "jingles");
const openingWavPath = path.join(generatedJingleDir, "opening-school-chime-v1.wav");
const openingMp3Path = path.join(publicJingleDir, "opening-school-chime-v1.mp3");
const endingWavPath = path.join(generatedJingleDir, "ending-door-rain-v1.wav");
const endingMp3Path = path.join(publicJingleDir, "ending-door-rain-v1.mp3");

type Note = {
  durationSeconds: number;
  frequency: number;
  startSeconds: number;
};

const notes: Note[] = [
  { frequency: 587.33, startSeconds: 0.12, durationSeconds: 0.88 },
  { frequency: 739.99, startSeconds: 0.82, durationSeconds: 0.88 },
  { frequency: 880.0, startSeconds: 1.52, durationSeconds: 0.88 },
  { frequency: 659.25, startSeconds: 2.22, durationSeconds: 0.92 },
  { frequency: 587.33, startSeconds: 3.0, durationSeconds: 0.95 },
];

function envelope(position: number, duration: number) {
  const attack = 0.035;
  const releaseStart = duration * 0.72;

  if (position < attack) {
    return position / attack;
  }

  if (position > releaseStart) {
    return Math.max(0, 1 - (position - releaseStart) / (duration - releaseStart));
  }

  return Math.exp(-position * 1.4);
}

function bellSample(time: number, note: Note) {
  const position = time - note.startSeconds;

  if (position < 0 || position > note.durationSeconds) {
    return 0;
  }

  const env = envelope(position, note.durationSeconds);
  const base = Math.sin(2 * Math.PI * note.frequency * position);
  const second = Math.sin(2 * Math.PI * note.frequency * 2.01 * position) * 0.42;
  const fifth = Math.sin(2 * Math.PI * note.frequency * 3.01 * position) * 0.18;

  return (base + second + fifth) * env;
}

function createOpeningJingleSamples() {
  const totalSeconds = 4.4;
  const totalSamples = Math.round(totalSeconds * sampleRate);
  const samples = new Int16Array(totalSamples);

  for (let index = 0; index < totalSamples; index += 1) {
    const time = index / sampleRate;
    const mixed = notes.reduce((sum, note) => sum + bellSample(time, note), 0);
    const roomTail = Math.sin(2 * Math.PI * 293.66 * time) * Math.exp(-time * 1.1) * 0.035;
    const value = Math.max(-1, Math.min(1, mixed * 0.24 + roomTail));

    samples[index] = Math.round(value * 32767);
  }

  return samples;
}

function createNoise(seed: number) {
  let value = seed;

  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function createEndingJingleSamples() {
  const totalSeconds = 8.2;
  const totalSamples = Math.round(totalSeconds * sampleRate);
  const samples = new Int16Array(totalSamples);
  const noise = createNoise(407);

  for (let index = 0; index < totalSamples; index += 1) {
    const time = index / sampleRate;
    const rainFade = Math.max(0, 1 - Math.max(0, time - 5.8) / 2.4);
    const rain = (noise() * 2 - 1) * 0.055 * rainFade;
    const roomTone = Math.sin(2 * Math.PI * 117 * time) * Math.exp(-time * 0.72) * 0.018;
    const doorPosition = Math.max(0, time - 2.15);
    const doorHit =
      doorPosition > 0 && doorPosition < 0.55
        ? Math.sin(2 * Math.PI * 72 * doorPosition) *
          Math.exp(-doorPosition * 9.5) *
          0.44
        : 0;
    const latchPosition = Math.max(0, time - 2.62);
    const latch =
      latchPosition > 0 && latchPosition < 0.28
        ? (noise() * 2 - 1) * Math.exp(-latchPosition * 16) * 0.12
        : 0;
    const value = Math.max(-1, Math.min(1, rain + roomTone + doorHit + latch));

    samples[index] = Math.round(value * 32767);
  }

  return samples;
}

async function writeJingle({
  label,
  mp3Path,
  samples,
  wavPath,
}: {
  label: string;
  mp3Path: string;
  samples: Int16Array;
  wavPath: string;
}) {
  const wav = {
    bitsPerSample: 16 as const,
    channels,
    sampleRate,
    samples,
  };
  const seconds = samples.length / sampleRate / channels;

  await writeFile(wavPath, wavToBuffer(wav));
  await encodeWavToMp3File(wav, mp3Path, 96);

  console.log(`${label} WAV: ${path.relative(process.cwd(), wavPath)}`);
  console.log(`${label} MP3: ${path.relative(process.cwd(), mp3Path)}`);
  console.log(`${label} duration: ${seconds.toFixed(1)} seconds`);
}

async function main() {
  await Promise.all([
    mkdir(generatedJingleDir, { recursive: true }),
    mkdir(publicJingleDir, { recursive: true }),
  ]);

  await writeJingle({
    label: "Opening jingle",
    mp3Path: openingMp3Path,
    samples: createOpeningJingleSamples(),
    wavPath: openingWavPath,
  });
  await writeJingle({
    label: "Ending jingle",
    mp3Path: endingMp3Path,
    samples: createEndingJingleSamples(),
    wavPath: endingWavPath,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
