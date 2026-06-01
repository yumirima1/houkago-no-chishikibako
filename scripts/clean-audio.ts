import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import {
  generatedAudioDir,
  parseArgs,
  toProjectPath,
} from "./lib/episode-fs";

async function clearDirectory(directory: string) {
  await rm(directory, { force: true, recursive: true });
  await mkdir(directory, { recursive: true });
  console.log(`Cleared: ${toProjectPath(directory)}`);
}

async function clearEpisodeWorkDirectories() {
  await mkdir(generatedAudioDir, { recursive: true });
  const entries = await readdir(generatedAudioDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "cache" || entry.name === "previews") {
      continue;
    }

    await clearDirectory(path.join(generatedAudioDir, entry.name));
  }
}

async function main() {
  const args = parseArgs();
  const shouldClearCache = args.cache === true || args.all === true;
  const shouldClearEpisodes = args.episodes === true || args.all === true;
  const shouldClearPreviews = args.previews === true || args.all === true;

  if (!shouldClearCache && !shouldClearEpisodes && !shouldClearPreviews) {
    console.log(
      [
        "Specify one of:",
        "--cache to clear generated-audio/cache",
        "--episodes to clear generated-audio episode work directories",
        "--previews to clear generated-audio/previews",
        "--all to clear generated-audio",
      ].join("\n"),
    );
    return;
  }

  if (args.all === true) {
    await clearDirectory(generatedAudioDir);
    return;
  }

  const targets: string[] = [];

  if (shouldClearCache) {
    targets.push(path.join(generatedAudioDir, "cache"));
  }

  if (shouldClearPreviews) {
    targets.push(path.join(generatedAudioDir, "previews"));
  }

  if (shouldClearEpisodes) {
    await clearEpisodeWorkDirectories();
  }

  for (const target of targets) {
    await clearDirectory(target);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
