import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
import { assertEpisodeScript } from "./lib/episode-schema";
import { VoicevoxProvider } from "./lib/tts-provider";

async function resolveInputPath() {
  const args = parseArgs();
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

function lineFileName(index: number, voice: string) {
  return `${String(index + 1).padStart(3, "0")}-${voice}.wav`;
}

async function main() {
  await ensureProductionDirs();

  const inputPath = await resolveInputPath();
  const script = await readJsonFile<unknown>(inputPath);
  assertEpisodeScript(script);

  const provider = new VoicevoxProvider();
  await provider.assertAvailable();

  const episodeAudioDir = path.join(generatedAudioDir, script.id);
  await mkdir(episodeAudioDir, { recursive: true });

  const wavPaths: string[] = [];

  for (const [index, line] of script.speakers.entries()) {
    const outputPath = path.join(episodeAudioDir, lineFileName(index, line.voice));

    await provider.synthesizeToWav({
      outputPath,
      speakerName: line.name,
      text: line.text,
      voice: line.voice,
    });
    wavPaths.push(outputPath);
    console.log(`Generated WAV: ${toProjectPath(outputPath)}`);
  }

  const wavs = await Promise.all(
    wavPaths.map(async (wavPath) => parsePcm16Wav(await readFile(wavPath))),
  );
  const combinedWav = concatWavs(wavs, 280);
  const combinedWavPath = path.join(episodeAudioDir, `${script.id}.wav`);
  const mp3Path = path.join(publicAudioDir, `${script.id}.mp3`);

  await writeFile(combinedWavPath, wavToBuffer(combinedWav));
  await encodeWavToMp3File(combinedWav, mp3Path);

  console.log(`Combined WAV: ${toProjectPath(combinedWavPath)}`);
  console.log(`Episode MP3: ${toProjectPath(mp3Path)}`);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});
