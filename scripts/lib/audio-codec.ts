import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

type Pcm16Wav = {
  channels: number;
  sampleRate: number;
  bitsPerSample: 16;
  samples: Int16Array;
};

type LameJsRuntime = {
  Mp3Encoder: new (
    channels: number,
    sampleRate: number,
    kbps: number,
  ) => {
    encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
    flush(): Uint8Array;
  };
};

function readChunkId(buffer: Buffer, offset: number) {
  return buffer.toString("ascii", offset, offset + 4);
}

export function parsePcm16Wav(buffer: Buffer): Pcm16Wav {
  if (readChunkId(buffer, 0) !== "RIFF" || readChunkId(buffer, 8) !== "WAVE") {
    throw new Error("VOICEVOX response is not a WAV file.");
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let data: Buffer | undefined;

  while (offset + 8 <= buffer.length) {
    const chunkId = readChunkId(buffer, offset);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      audioFormat = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    }

    if (chunkId === "data") {
      data = buffer.subarray(chunkStart, chunkStart + chunkSize);
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!data || audioFormat !== 1 || bitsPerSample !== 16 || channels < 1) {
    throw new Error("Only PCM 16-bit WAV audio is supported.");
  }

  return {
    channels,
    sampleRate,
    bitsPerSample: 16,
    samples: new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2),
  };
}

export function createSilenceSamples({
  channels,
  milliseconds,
  sampleRate,
}: {
  channels: number;
  milliseconds: number;
  sampleRate: number;
}) {
  return new Int16Array(Math.round((sampleRate * milliseconds * channels) / 1000));
}

export function concatWavs(wavs: Pcm16Wav[], silenceMilliseconds = 220): Pcm16Wav {
  if (wavs.length === 0) {
    throw new Error("No WAV files to concatenate.");
  }

  const [{ channels, sampleRate, bitsPerSample }] = wavs;

  for (const wav of wavs) {
    if (
      wav.channels !== channels ||
      wav.sampleRate !== sampleRate ||
      wav.bitsPerSample !== bitsPerSample
    ) {
      throw new Error("All WAV files must have the same format.");
    }
  }

  const silence = createSilenceSamples({
    channels,
    milliseconds: silenceMilliseconds,
    sampleRate,
  });
  const totalLength =
    wavs.reduce((total, wav) => total + wav.samples.length, 0) +
    silence.length * Math.max(0, wavs.length - 1);
  const samples = new Int16Array(totalLength);
  let offset = 0;

  wavs.forEach((wav, index) => {
    samples.set(wav.samples, offset);
    offset += wav.samples.length;

    if (index < wavs.length - 1) {
      samples.set(silence, offset);
      offset += silence.length;
    }
  });

  return { channels, sampleRate, bitsPerSample, samples };
}

export function wavToBuffer(wav: Pcm16Wav) {
  const dataSize = wav.samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(wav.channels, 22);
  buffer.writeUInt32LE(wav.sampleRate, 24);
  buffer.writeUInt32LE(wav.sampleRate * wav.channels * 2, 28);
  buffer.writeUInt16LE(wav.channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  Buffer.from(wav.samples.buffer, wav.samples.byteOffset, dataSize).copy(buffer, 44);

  return buffer;
}

function splitChannels(samples: Int16Array, channels: number) {
  if (channels === 1) {
    return { left: samples };
  }

  const frameCount = Math.floor(samples.length / channels);
  const left = new Int16Array(frameCount);
  const right = new Int16Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    left[frame] = samples[frame * channels];
    right[frame] = samples[frame * channels + 1] ?? left[frame];
  }

  return { left, right };
}

async function loadLameJs() {
  const require = createRequire(import.meta.url);
  const lameAllPath = require.resolve("lamejs/lame.all.js");
  const source = await readFile(lameAllPath, "utf8");
  const context: { console: Console; lamejs?: LameJsRuntime } = { console };

  vm.createContext(context);
  vm.runInContext(`${source}\nthis.lamejs = lamejs;`, context);

  if (!context.lamejs) {
    throw new Error("Failed to load MP3 encoder.");
  }

  return context.lamejs;
}

export async function encodeWavToMp3File(
  wav: Pcm16Wav,
  outputPath: string,
  kbps = 96,
) {
  const lamejs = await loadLameJs();
  const encoder = new lamejs.Mp3Encoder(wav.channels, wav.sampleRate, kbps);
  const { left, right } = splitChannels(wav.samples, wav.channels);
  const chunks: Buffer[] = [];
  const blockSize = 1152;

  for (let index = 0; index < left.length; index += blockSize) {
    const leftBlock = left.subarray(index, index + blockSize);
    const encoded =
      wav.channels === 1
        ? encoder.encodeBuffer(leftBlock)
        : encoder.encodeBuffer(leftBlock, right?.subarray(index, index + blockSize));

    if (encoded.length > 0) {
      chunks.push(Buffer.from(encoded));
    }
  }

  const finalChunk = encoder.flush();

  if (finalChunk.length > 0) {
    chunks.push(Buffer.from(finalChunk));
  }

  await writeFile(outputPath, Buffer.concat(chunks));
}
