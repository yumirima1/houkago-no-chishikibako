import path from "node:path";

import {
  contentRoot,
  draftDir,
  ensureProductionDirs,
  getStringArg,
  listJsonFiles,
  parseArgs,
  readJsonFile,
  writeJsonFile,
} from "./lib/episode-fs";
import { EpisodeDurationType } from "./lib/episode-schema";
import {
  buildRadioScript,
  getRadioScriptStats,
} from "./lib/radio-script-builder";

function inferThemes(title: string, theme: string) {
  const text = `${title} ${theme}`;
  const themes = new Set<string>();

  if (/AI|人工知能/i.test(text)) themes.add("AI");
  if (/量子|宇宙|科学/.test(text)) themes.add("科学");
  if (/コンピュータ|プログラミング|技術/.test(text)) themes.add("コンピュータ");
  if (/心理|陰謀論|信じ/.test(text)) themes.add("心理学");
  if (/哲学|考え|意識|思考/.test(text)) themes.add("哲学");
  if (themes.size === 0) themes.add("知識");

  return [...themes];
}

async function createSequentialEpisodeId() {
  const files = await listJsonFiles(draftDir);
  const existingNumbers = files
    .map((file) => path.basename(file, ".json").match(/^episode-(\d+)$/)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));
  const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

  return `episode-${String(nextNumber).padStart(3, "0")}`;
}

async function readProgramMemoryHints() {
  try {
    const memory = await readJsonFile<{
      recurringPhrases?: string[];
      runningJokes?: string[];
    }>(path.join(contentRoot, "memory", "program-memory.json"));

    return {
      phrase: memory.recurringPhrases?.[0],
      runningJoke: memory.runningJokes?.[0],
    };
  } catch {
    return {};
  }
}

async function readExistingDraftMetadata(id: string) {
  try {
    return await readJsonFile<{ createdAt?: string; source?: unknown }>(
      path.join(draftDir, `${id}.json`),
    );
  } catch {
    return {};
  }
}

async function main() {
  await ensureProductionDirs();

  const args = parseArgs();
  const title =
    getStringArg(args, "title") ??
    "雨の日に考える、AIは本当に考えているのか";
  const theme = getStringArg(args, "theme", "AIと思考")!;
  const id = getStringArg(args, "id") ?? (await createSequentialEpisodeId());
  const durationTargetMinutes = Number(getStringArg(args, "minutes", "5"));
  const durationType: EpisodeDurationType =
    durationTargetMinutes >= 45 ? "long" : "normal";
  const description =
    getStringArg(args, "description") ??
    `${title}について、理系担当と文系担当が静かな会話形式で考えます。`;
  const themes =
    getStringArg(args, "themes")
      ?.split(",")
      .map((themeName) => themeName.trim())
      .filter(Boolean) ?? inferThemes(title, theme);
  const memoryHints = await readProgramMemoryHints();
  const existingDraft = await readExistingDraftMetadata(id);
  const script = {
    ...buildRadioScript({
      id,
      title,
      theme,
      durationTargetMinutes,
      durationType,
      description,
      type: durationType === "long" ? "special" : "regular",
      themes,
      memoryPhrase: memoryHints.phrase,
      runningJoke: memoryHints.runningJoke,
      createdAt: existingDraft.createdAt,
    }),
    ...(existingDraft.source ? { source: existingDraft.source } : {}),
  };
  const outputPath = path.join(draftDir, `${id}.json`);
  const stats = getRadioScriptStats(script);

  await writeJsonFile(outputPath, script);
  console.log(`Draft script created: ${path.relative(process.cwd(), outputPath)}`);
  console.log(`Script characters: ${stats.characterCount}`);
  console.log(`Estimated playback: ${stats.estimatedMinutes.toFixed(1)} minutes`);
  console.log(
    `Speaker balance: rikei ${stats.balance.rikei}, bunkei ${stats.balance.bunkei}`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
