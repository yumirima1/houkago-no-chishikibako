import { access } from "node:fs/promises";
import path from "node:path";

import {
  ConversationBeat,
  ConversationClosingStyle,
  ConversationSkeleton,
  ConversationTemperature,
  ConversationTemperatureLevel,
} from "./lib/conversation-skeleton-generator";
import { generateDraftScript, DraftScript } from "./lib/draft-script-generator";
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
import {
  EpisodeDurationType,
  EpisodeScript,
  EpisodeSpeakerLine,
} from "./lib/episode-schema";
import {
  buildRadioScript,
  getRadioScriptStats,
} from "./lib/radio-script-builder";

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

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

function toSourceObject(source: unknown) {
  return source && typeof source === "object" && !Array.isArray(source)
    ? source
    : {};
}

function parseConversationBeat(value: unknown, index: number): ConversationBeat {
  if (!value || typeof value !== "object") {
    throw new Error(`beats[${index}] must be an object.`);
  }

  const beat = value as Partial<ConversationBeat>;

  if (typeof beat.order !== "number") {
    throw new Error(`beats[${index}].order must be a number.`);
  }

  assertString(beat.speaker, `beats[${index}].speaker`);
  assertString(beat.role, `beats[${index}].role`);
  assertString(beat.purpose, `beats[${index}].purpose`);
  assertString(beat.cue, `beats[${index}].cue`);

  return {
    cue: beat.cue,
    ...(beat.eventId ? { eventId: String(beat.eventId) } : {}),
    ...(beat.eventKind ? { eventKind: beat.eventKind } : {}),
    order: beat.order,
    purpose: beat.purpose,
    ...(typeof beat.required === "boolean" ? { required: beat.required } : {}),
    role: beat.role,
    speaker: beat.speaker,
  } as ConversationBeat;
}

function parseConversationTemperature(value: unknown): ConversationTemperature {
  if (
    value === "warm" ||
    value === "normal" ||
    value === "deep" ||
    value === "funny" ||
    value === "quiet"
  ) {
    return value;
  }

  return "normal";
}

function parseTemperatureLevel(value: unknown): ConversationTemperatureLevel {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function parseClosingStyle(value: unknown): ConversationClosingStyle {
  if (value === "soft" || value === "open" || value === "light") {
    return value;
  }

  return "soft";
}

function parseTemperaturePlan(
  value: unknown,
): ConversationSkeleton["temperaturePlan"] {
  if (!value || typeof value !== "object") {
    return {
      closing: "soft",
      detour: "medium",
      emotion: "medium",
      explanation: "medium",
      humor: "medium",
      silence: "medium",
    };
  }

  const plan = value as Partial<ConversationSkeleton["temperaturePlan"]>;

  return {
    closing: parseClosingStyle(plan.closing),
    detour: parseTemperatureLevel(plan.detour),
    emotion: parseTemperatureLevel(plan.emotion),
    explanation: parseTemperatureLevel(plan.explanation),
    humor: parseTemperatureLevel(plan.humor),
    silence: parseTemperatureLevel(plan.silence),
  };
}

function parseConversationSkeleton(value: unknown): ConversationSkeleton {
  if (!value || typeof value !== "object") {
    throw new Error("Skeleton file must contain a JSON object.");
  }

  const skeleton = value as Partial<ConversationSkeleton>;

  assertString(skeleton.theme, "theme");
  assertString(skeleton.structureTemplate, "structureTemplate");
  assertString(skeleton.atmosphere, "atmosphere");
  assertString(skeleton.tone, "tone");

  if (!Array.isArray(skeleton.beats)) {
    throw new Error("beats must be an array.");
  }

  return {
    atmosphere: skeleton.atmosphere,
    beats: skeleton.beats.map(parseConversationBeat),
    conversationTemperature: parseConversationTemperature(
      skeleton.conversationTemperature,
    ),
    eventPlan: skeleton.eventPlan ?? {
      notes: [],
      rarityMix: {
        Common: 0.7,
        Epic: 0.08,
        Legendary: 0.02,
        Rare: 0.2,
      },
      selectedEventIds: [],
      supportedEventKinds: [],
    },
    structureTemplate: skeleton.structureTemplate,
    temperaturePlan: parseTemperaturePlan(skeleton.temperaturePlan),
    theme: skeleton.theme,
    tone: skeleton.tone,
  };
}

function parseDraftScript(value: unknown): DraftScript {
  if (!value || typeof value !== "object") {
    throw new Error("Draft Script file must contain a JSON object.");
  }

  const draft = value as Partial<DraftScript>;

  assertString(draft.theme, "theme");
  assertString(draft.structureTemplate, "structureTemplate");
  assertString(draft.atmosphere, "atmosphere");
  assertString(draft.tone, "tone");

  if (!Array.isArray(draft.lines) || draft.lines.length === 0) {
    throw new Error("Draft Script lines must be a non-empty array.");
  }

  return {
    atmosphere: draft.atmosphere,
    conversationTemperature: parseConversationTemperature(
      draft.conversationTemperature,
    ),
    eventPlan: draft.eventPlan ?? {
      notes: [],
      rarityMix: {
        Common: 0.7,
        Epic: 0.08,
        Legendary: 0.02,
        Rare: 0.2,
      },
      selectedEventIds: [],
      supportedEventKinds: [],
    },
    lines: draft.lines.map((line, index) => {
      if (!line || typeof line !== "object") {
        throw new Error(`lines[${index}] must be an object.`);
      }

      assertString(line.speaker, `lines[${index}].speaker`);
      assertString(line.text, `lines[${index}].text`);

      return {
        ...line,
        order: typeof line.order === "number" ? line.order : index + 1,
        speaker: line.speaker,
        text: line.text,
      };
    }),
    productionNotes: Array.isArray(draft.productionNotes)
      ? draft.productionNotes.map(String)
      : [],
    source: draft.source,
    structureTemplate: draft.structureTemplate,
    temperaturePlan: parseTemperaturePlan(draft.temperaturePlan),
    theme: draft.theme,
    tone: draft.tone,
  };
}

function draftScriptSpeakers(draft: DraftScript): EpisodeSpeakerLine[] {
  return draft.lines.map((line) => {
    const isKana = line.speaker === "かな";

    return {
      id: isKana ? "bunkei" : "rikei",
      name: isKana ? "かな" : "タルタル",
      voice: isKana ? "bunkei" : "rikei",
      text: line.text,
    };
  });
}

async function resolveShowBibleReference() {
  const showBiblePath = path.join(contentRoot, "memory", "show-bible.md");

  await access(showBiblePath);

  return path.relative(process.cwd(), showBiblePath).replaceAll("\\", "/");
}

async function main() {
  await ensureProductionDirs();

  const args = parseArgs();
  const draftScriptFile = getStringArg(args, "draft-script-file");
  const skeletonFile = getStringArg(args, "skeleton-file");

  if (draftScriptFile && skeletonFile) {
    throw new Error("Use either --draft-script-file or --skeleton-file, not both.");
  }

  const draftScript = draftScriptFile
    ? parseDraftScript(await readJsonFile<unknown>(path.resolve(draftScriptFile)))
    : skeletonFile
      ? generateDraftScript({
          skeleton: parseConversationSkeleton(
            await readJsonFile<unknown>(path.resolve(skeletonFile)),
          ),
        })
      : undefined;
  const title =
    getStringArg(args, "title") ??
    draftScript?.theme ??
    "雨の日に考える、AIは本当に考えているのか";
  const theme = getStringArg(args, "theme", draftScript?.theme ?? "AIと思考")!;
  const id = getStringArg(args, "id") ?? (await createSequentialEpisodeId());
  const durationTargetMinutes = Number(
    getStringArg(args, "minutes", draftScript ? "20" : "5"),
  );
  const durationType: EpisodeDurationType =
    durationTargetMinutes >= 45 ? "long" : "normal";
  const episodeType = durationType === "long" ? "special" : "regular";
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
  const showBiblePath = await resolveShowBibleReference();
  const scriptBase: EpisodeScript = draftScript
    ? {
        id,
        title,
        theme,
        durationTargetMinutes,
        description,
        type: episodeType,
        durationType,
        tags: themes,
        themes,
        speakers: draftScriptSpeakers(draftScript),
        createdAt: existingDraft.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    : buildRadioScript({
        id,
        title,
        theme,
        durationTargetMinutes,
        durationType,
        description,
        type: episodeType,
        themes,
        memoryPhrase: memoryHints.phrase,
        runningJoke: memoryHints.runningJoke,
        createdAt: existingDraft.createdAt,
      });
  const script = {
    ...scriptBase,
    source: {
      ...toSourceObject(existingDraft.source),
      ...(draftScript
        ? {
            draftScriptEngine: {
              atmosphere: draftScript.atmosphere,
              eventPlan: draftScript.eventPlan,
              productionNotes: draftScript.productionNotes,
              structureTemplate: draftScript.structureTemplate,
              temperature: draftScript.conversationTemperature,
              temperaturePlan: draftScript.temperaturePlan,
              tone: draftScript.tone,
              ...(draftScriptFile
                ? {
                    draftScriptPath: path
                      .relative(process.cwd(), path.resolve(draftScriptFile))
                      .replaceAll("\\", "/"),
                  }
                : {}),
              ...(skeletonFile
                ? {
                    skeletonPath: path
                      .relative(process.cwd(), path.resolve(skeletonFile))
                      .replaceAll("\\", "/"),
                  }
                : {}),
            },
          }
        : {}),
      showBiblePath,
    },
  };
  const outputPath = path.join(draftDir, `${id}.json`);
  const stats = getRadioScriptStats(script);

  await writeJsonFile(outputPath, script);
  console.log(`Show bible: ${showBiblePath}`);
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
