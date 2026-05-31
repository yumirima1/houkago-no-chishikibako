import { stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  builtEpisodeDir,
  ensureProductionDirs,
  findLatestJsonFile,
  getStringArg,
  parseArgs,
  publicAudioDir,
  readJsonFile,
  reviewedDir,
  toProjectPath,
  writeJsonFile,
} from "./lib/episode-fs";
import {
  toEpisodeSnippet,
  writeGeneratedEpisodesFile,
} from "./lib/episode-site-data";
import { assertEpisodeScript, BuiltEpisode } from "./lib/episode-schema";

function formatDuration(minutes: number) {
  const wholeMinutes = Math.max(1, Math.round(minutes));
  return `${String(wholeMinutes).padStart(2, "0")}:00`;
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureAudioFile(id: string) {
  const audioFileName = `${id}.mp3`;
  const targetPath = path.join(publicAudioDir, audioFileName);

  if (await fileExists(targetPath)) {
    return `/audio/${audioFileName}`;
  }

  throw new Error(
    [
      `Audio file is missing: ${path.relative(process.cwd(), targetPath)}`,
      "Run npm run episode:audio before npm run episode:build.",
      "デモ音源への自動フォールバックは初回体験改善のため廃止しました。",
    ].join("\n"),
  );
}

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

async function main() {
  await ensureProductionDirs();

  const inputPath = await resolveInputPath();
  const reviewedScript = await readJsonFile<unknown>(inputPath);
  assertEpisodeScript(reviewedScript);

  const audioUrl = await ensureAudioFile(reviewedScript.id);
  const publishedAt = new Date().toISOString().slice(0, 10);
  const rikeiVoice =
    reviewedScript.speakers.find((line) => line.id === "rikei")?.voice ?? "rikei";
  const bunkeiVoice =
    reviewedScript.speakers.find((line) => line.id === "bunkei")?.voice ?? "bunkei";
  const builtEpisode: BuiltEpisode = {
    id: reviewedScript.id,
    title: reviewedScript.title,
    description: reviewedScript.description,
    audioUrl,
    type:
      reviewedScript.type ??
      (reviewedScript.id === "episode-000" ? "anniversary" : "regular"),
    durationType: reviewedScript.durationType ?? "normal",
    publishedAt,
    duration: formatDuration(reviewedScript.durationTargetMinutes),
    tags: reviewedScript.tags ?? reviewedScript.themes,
    themes: reviewedScript.themes,
    speakers: {
      science: "理系担当",
      humanities: "文系担当",
    },
    productionStatus: "published",
    source: {
      reviewedScriptPath: toProjectPath(inputPath),
      durationTargetMinutes: reviewedScript.durationTargetMinutes,
      voices: {
        rikei: rikeiVoice,
        bunkei: bunkeiVoice,
      },
    },
  };
  const outputPath = path.join(builtEpisodeDir, `${builtEpisode.id}.json`);
  const snippetPath = path.join(builtEpisodeDir, `${builtEpisode.id}.snippet.txt`);

  await writeJsonFile(outputPath, builtEpisode);
  await writeFile(snippetPath, `${toEpisodeSnippet(builtEpisode)}\n`, "utf8");
  await writeGeneratedEpisodesFile();

  console.log(`Built episode metadata: ${toProjectPath(outputPath)}`);
  console.log(`Manual snippet: ${toProjectPath(snippetPath)}`);
  console.log("Generated site data: src/data/generatedEpisodes.ts");
  console.log(`Audio URL: ${builtEpisode.audioUrl}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
