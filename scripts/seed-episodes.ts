import path from "node:path";

import {
  builtEpisodeDir,
  contentRoot,
  draftDir,
  ensureProductionDirs,
  getStringArg,
  parseArgs,
  readJsonFile,
  toProjectPath,
  writeJsonFile,
} from "./lib/episode-fs";
import { writeGeneratedEpisodesFile } from "./lib/episode-site-data";
import { EpisodeType } from "./lib/episode-schema";
import { buildRadioScript } from "./lib/radio-script-builder";

type RoadmapEpisode = {
  category: string;
  estimatedDurationMinutes: number;
  id: string;
  summary: string;
  tags: string[];
  title: string;
};

type EpisodeRoadmap = {
  regularEpisodes: RoadmapEpisode[];
};

type ExistingEpisode = {
  productionStatus?: string;
};

function formatDuration(minutes: number) {
  const wholeMinutes = Math.max(1, Math.round(minutes));
  return `${String(wholeMinutes).padStart(2, "0")}:00`;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getPlannedSunday(index: number) {
  const firstSeedDate = new Date("2026-06-07T03:00:00+09:00");
  const date = new Date(firstSeedDate);

  date.setDate(firstSeedDate.getDate() + index * 7);

  return formatDate(date);
}

async function readExistingEpisode(filePath: string) {
  try {
    return await readJsonFile<ExistingEpisode>(filePath);
  } catch {
    return null;
  }
}

async function main() {
  await ensureProductionDirs();

  const args = parseArgs();
  const count = Number(getStringArg(args, "count", "20"));
  const startNumber = Number(getStringArg(args, "start", "5"));
  const roadmapPath = path.join(contentRoot, "plans", "episode-roadmap.json");
  const roadmap = await readJsonFile<EpisodeRoadmap>(roadmapPath);
  const selectedEpisodes = roadmap.regularEpisodes.slice(0, count);
  let writtenCount = 0;
  let skippedCount = 0;

  for (const [index, roadmapEpisode] of selectedEpisodes.entries()) {
    const episodeNumber = startNumber + index;
    const id = `episode-${String(episodeNumber).padStart(3, "0")}`;
    const outputPath = path.join(builtEpisodeDir, `${id}.json`);
    const draftPath = path.join(draftDir, `${id}.json`);
    const existingEpisode = await readExistingEpisode(outputPath);

    if (existingEpisode?.productionStatus === "published") {
      skippedCount += 1;
      continue;
    }

    const tags = [...new Set([roadmapEpisode.category, ...roadmapEpisode.tags])];
    const now = new Date().toISOString();
    const scriptDraft = {
      ...buildRadioScript({
        id,
        title: roadmapEpisode.title,
        theme: roadmapEpisode.category,
        durationTargetMinutes: roadmapEpisode.estimatedDurationMinutes,
        description: roadmapEpisode.summary,
        type: "regular" satisfies EpisodeType,
        durationType: "normal",
        tags,
        themes: tags,
        createdAt: now,
      }),
      updatedAt: now,
      source: {
        roadmapPath: toProjectPath(roadmapPath),
        roadmapId: roadmapEpisode.id,
        category: roadmapEpisode.category,
        seededBy: "npm run episode:seed",
      },
    };
    const seededEpisode = {
      id,
      title: roadmapEpisode.title,
      description: roadmapEpisode.summary,
      type: "regular" satisfies EpisodeType,
      durationType: "normal",
      publishedAt: getPlannedSunday(index),
      duration: formatDuration(roadmapEpisode.estimatedDurationMinutes),
      tags,
      themes: tags,
      speakers: {
        science: "理系担当",
        humanities: "文系担当",
      },
      productionStatus: "draft",
      source: {
        roadmapPath: toProjectPath(roadmapPath),
        roadmapId: roadmapEpisode.id,
        category: roadmapEpisode.category,
        seededBy: "npm run episode:seed",
      },
    };

    await writeJsonFile(draftPath, scriptDraft);
    await writeJsonFile(outputPath, seededEpisode);
    writtenCount += 1;
  }

  await writeGeneratedEpisodesFile();

  console.log(
    `Seeded ${writtenCount} draft episodes from ${toProjectPath(roadmapPath)}.`,
  );
  if (skippedCount > 0) {
    console.log(`Skipped ${skippedCount} already published episodes.`);
  }
  console.log("Generated site data: src/data/generatedEpisodes.ts");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
