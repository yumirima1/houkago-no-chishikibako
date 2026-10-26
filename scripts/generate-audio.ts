import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  ensureProductionDirs,
  findLatestJsonFile,
  generatedAudioDir,
  getStringArg,
  parseArgs,
  publicAudioDir,
  readJsonFile,
  reviewedDir,
  toProjectPath,
} from "./lib/episode-fs";
import {
  concatWavs,
  encodeWavToMp3File,
  parsePcm16Wav,
  wavToBuffer,
} from "./lib/audio-codec";
import { assertEpisodeScript, EpisodeSpeakerLine } from "./lib/episode-schema";
import { VoicevoxProvider } from "./lib/tts-provider";
import {
  audioManifestPath,
  readAudioManifest,
  writeAudioManifest,
  type AudioBuildMode,
  type AudioManifest,
} from "./lib/audio-manifest";

type CacheStats = {
  hits: number;
  misses: number;
};

type AudioLineJob = {
  cacheKey: string;
  cacheMetadataPath: string;
  cachePath: string;
  line: EpisodeSpeakerLine;
  signature: unknown;
};

async function resolveInputPath(args: Record<string, string | boolean>) {
  const explicitInput = getStringArg(args, "input");
  const id = getStringArg(args, "id");

  if (explicitInput) return path.resolve(explicitInput);
  if (id) return path.join(reviewedDir, `${id}.json`);

  const latest = await findLatestJsonFile(reviewedDir);

  if (!latest) {
    throw new Error("No reviewed JSON found. Run npm run episode:review first.");
  }

  return latest;
}

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getConcurrency(args: Record<string, string | boolean>) {
  return getPositiveInteger(
    getStringArg(args, "concurrency") ?? process.env.TTS_CONCURRENCY,
    1,
  );
}

function getPreviewLineCount(args: Record<string, string | boolean>) {
  return getPositiveInteger(
    getStringArg(args, "preview-lines") ?? process.env.TTS_PREVIEW_LINES,
    12,
  );
}

function isPreviewMode(args: Record<string, string | boolean>) {
  return args.preview === true || getStringArg(args, "mode") === "preview";
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function createCacheKey(signature: unknown) {
  return createHash("sha256")
    .update(stableStringify(signature))
    .digest("hex")
    .slice(0, 32);
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function manifestMatches(
  manifest: AudioManifest | null,
  {
    cacheKeys,
    inputPath,
    lineCount,
    mode,
    outputPath,
    scriptId,
  }: Omit<AudioManifest, "actualDurationSeconds" | "updatedAt">,
) {
  return (
    manifest?.mode === mode &&
    typeof manifest.actualDurationSeconds === "number" &&
    manifest.scriptId === scriptId &&
    manifest.inputPath === inputPath &&
    manifest.outputPath === outputPath &&
    manifest.lineCount === lineCount &&
    manifest.cacheKeys.length === cacheKeys.length &&
    manifest.cacheKeys.every((cacheKey, index) => cacheKey === cacheKeys[index])
  );
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await worker(items[currentIndex], currentIndex);
      }
    }),
  );
}

function selectLinesForMode(
  speakers: EpisodeSpeakerLine[],
  mode: AudioBuildMode,
  previewLineCount: number,
) {
  if (mode === "production") {
    return speakers;
  }

  return speakers.slice(0, previewLineCount);
}

function outputMp3PathForMode(scriptId: string, mode: AudioBuildMode) {
  if (mode === "production") {
    return path.join(publicAudioDir, `${scriptId}.mp3`);
  }

  return path.join(generatedAudioDir, "previews", `${scriptId}.preview.mp3`);
}

async function main() {
  const startedAt = performance.now();
  const args = parseArgs();
  const mode: AudioBuildMode = isPreviewMode(args) ? "preview" : "production";
  const concurrency = getConcurrency(args);
  const previewLineCount = getPreviewLineCount(args);

  await ensureProductionDirs();

  const inputPath = await resolveInputPath(args);
  const script = await readJsonFile<unknown>(inputPath);
  assertEpisodeScript(script);

  const provider = new VoicevoxProvider();
  const episodeAudioDir = path.join(generatedAudioDir, script.id);
  const cacheDir = path.join(generatedAudioDir, "cache");
  const previewDir = path.join(generatedAudioDir, "previews");
  const suffix = mode === "preview" ? ".preview" : "";
  const combinedWavPath = path.join(episodeAudioDir, `${script.id}${suffix}.wav`);
  const manifestPath = audioManifestPath(generatedAudioDir, script.id, mode);
  const mp3Path = outputMp3PathForMode(script.id, mode);

  await Promise.all([
    mkdir(episodeAudioDir, { recursive: true }),
    mkdir(cacheDir, { recursive: true }),
    mkdir(previewDir, { recursive: true }),
  ]);

  const lines = selectLinesForMode(script.speakers, mode, previewLineCount);
  const jobs: AudioLineJob[] = lines.map((line) => {
    const signature = provider.getSynthesisSignature({
      speakerName: line.name,
      text: line.text,
      voice: line.voice,
    });
    const cacheKey = createCacheKey(signature);

    return {
      cacheKey,
      cacheMetadataPath: path.join(cacheDir, `${cacheKey}.json`),
      cachePath: path.join(cacheDir, `${cacheKey}.wav`),
      line,
      signature,
    };
  });
  const cacheKeys = jobs.map((job) => job.cacheKey);
  const nextManifest = {
    cacheKeys,
    inputPath: toProjectPath(inputPath),
    lineCount: lines.length,
    mode,
    outputPath: toProjectPath(mp3Path),
    scriptId: script.id,
  };
  const force = args.force === true;
  let existingManifest: AudioManifest | null = null;
  if (!force && (await fileExists(manifestPath))) {
    try {
      existingManifest = await readAudioManifest(generatedAudioDir, script.id, mode);
    } catch (error) {
      // Invalid cache metadata cannot mark an audio output as up to date.
      console.warn(error instanceof Error ? error.message : error);
    }
  }

  if (
    !force &&
    (await fileExists(mp3Path)) &&
    manifestMatches(existingManifest, nextManifest)
  ) {
    const elapsedSeconds = (performance.now() - startedAt) / 1000;

    console.log(`Mode: ${mode}`);
    console.log(`Lines: ${lines.length}/${script.speakers.length}`);
    console.log("Audio output is already up to date.");
    console.log(`${mode === "preview" ? "Preview" : "Episode"} MP3: ${toProjectPath(mp3Path)}`);
    console.log(`Manifest: ${toProjectPath(manifestPath)}`);
    console.log(`Elapsed: ${elapsedSeconds.toFixed(1)} seconds`);
    return;
  }

  await provider.assertAvailable();

  const wavPaths = Array<string>(lines.length);
  const cacheStats: CacheStats = { hits: 0, misses: 0 };
  const cacheTasks = new Map<string, Promise<string>>();

  await runWithConcurrency(jobs, concurrency, async (job, index) => {
    let task = cacheTasks.get(job.cacheKey);

    if (!task) {
      task = (async () => {
        if (await fileExists(job.cachePath)) {
          cacheStats.hits += 1;
          console.log(`TTS cache hit: ${job.line.name} ${job.cacheKey}`);
          return job.cachePath;
        }

        cacheStats.misses += 1;
        await provider.synthesizeToWav({
          outputPath: job.cachePath,
          speakerName: job.line.name,
          text: job.line.text,
          voice: job.line.voice,
        });
        await writeFile(
          job.cacheMetadataPath,
          `${JSON.stringify(
            {
              cacheKey: job.cacheKey,
              createdAt: new Date().toISOString(),
              signature: job.signature,
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
        console.log(`Generated cached WAV: ${toProjectPath(job.cachePath)}`);
        return job.cachePath;
      })();
      cacheTasks.set(job.cacheKey, task);
    }

    wavPaths[index] = await task;
  });

  const wavs = await Promise.all(
    wavPaths.map(async (wavPath) => parsePcm16Wav(await readFile(wavPath))),
  );
  const combinedWav = concatWavs(wavs, 280);
  const actualDurationSeconds =
    combinedWav.samples.length / (combinedWav.sampleRate * combinedWav.channels);

  await writeFile(combinedWavPath, wavToBuffer(combinedWav));
  await encodeWavToMp3File(combinedWav, mp3Path);
  await writeAudioManifest(generatedAudioDir, {
    ...nextManifest,
    actualDurationSeconds,
    updatedAt: new Date().toISOString(),
  });

  const elapsedSeconds = (performance.now() - startedAt) / 1000;

  console.log(`Mode: ${mode}`);
  console.log(`Lines: ${lines.length}/${script.speakers.length}`);
  console.log(`TTS concurrency: ${concurrency}`);
  console.log(`TTS cache: ${toProjectPath(cacheDir)}`);
  console.log(`TTS cache hits: ${cacheStats.hits}`);
  console.log(`TTS cache misses: ${cacheStats.misses}`);
  console.log(`Combined WAV: ${toProjectPath(combinedWavPath)}`);
  console.log(`${mode === "preview" ? "Preview" : "Episode"} MP3: ${toProjectPath(mp3Path)}`);
  console.log(`Manifest: ${toProjectPath(manifestPath)}`);
  console.log(`Elapsed: ${elapsedSeconds.toFixed(1)} seconds`);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});
