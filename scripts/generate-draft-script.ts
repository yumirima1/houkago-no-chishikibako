import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  ConversationBeat,
  ConversationClosingStyle,
  ConversationSkeleton,
  ConversationTemperature,
  ConversationTemperatureLevel,
} from "./lib/conversation-skeleton-generator";
import { generateConversationSkeleton } from "./lib/conversation-skeleton-generator";
import { generateDraftScript } from "./lib/draft-script-generator";
import {
  ensureProductionDirs,
  getStringArg,
  parseArgs,
  scriptDraftDir,
  toProjectPath,
  writeJsonFile,
} from "./lib/episode-fs";

function printUsage() {
  console.error(
    [
      'Usage: npm run episode:draft -- --theme "なぜ人は通知を開くのか"',
      "   or: npm run episode:draft -- --skeleton-file path/to/skeleton.json",
      "   or: npm run episode:draft -- --theme \"なぜ人は通知を開くのか\" --save --id episode-025",
    ].join("\n"),
  );
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function parseBeat(value: unknown, index: number): ConversationBeat {
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

function parseSkeleton(value: unknown): ConversationSkeleton {
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
    beats: skeleton.beats.map(parseBeat),
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

async function main() {
  const args = parseArgs();
  const theme = getStringArg(args, "theme");
  const skeletonFile = getStringArg(args, "skeleton-file");
  const output = getStringArg(args, "output");
  const id = getStringArg(args, "id");
  const shouldSave = Boolean(args.save) || Boolean(output);

  if (!theme && !skeletonFile) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (theme && skeletonFile) {
    console.error("Use either --theme or --skeleton-file, not both.");
    process.exitCode = 1;
    return;
  }

  if (shouldSave && !output && !id) {
    console.error("Use --id when saving to content/script-drafts, or pass --output.");
    process.exitCode = 1;
    return;
  }

  await ensureProductionDirs();

  const skeleton = skeletonFile
    ? parseSkeleton(JSON.parse(await readFile(skeletonFile, "utf8")))
    : await generateConversationSkeleton({ theme: theme ?? "" });
  const draft = {
    ...generateDraftScript({ skeleton }),
    source: {
      generatedAt: new Date().toISOString(),
      generator: "draft-script-engine" as const,
      ...(skeletonFile ? { skeletonFile } : {}),
      ...(theme ? { theme } : {}),
    },
  };

  if (shouldSave) {
    const outputPath = output
      ? path.resolve(output)
      : path.join(scriptDraftDir, `${id}.json`);

    await writeJsonFile(outputPath, draft);
    console.log(`Draft Script saved: ${toProjectPath(outputPath)}`);
    return;
  }

  console.log(JSON.stringify(draft, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
