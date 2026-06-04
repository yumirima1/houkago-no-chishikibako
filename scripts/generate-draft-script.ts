import { readFile } from "node:fs/promises";

import {
  ConversationBeat,
  ConversationSkeleton,
} from "./lib/conversation-skeleton-generator";
import { generateConversationSkeleton } from "./lib/conversation-skeleton-generator";
import { generateDraftScript } from "./lib/draft-script-generator";

function readArgValue(name: string) {
  const equalsArg = process.argv.find((arg) => arg.startsWith(`--${name}=`));

  if (equalsArg) {
    return equalsArg.slice(name.length + 3);
  }

  const index = process.argv.indexOf(`--${name}`);

  if (index >= 0) {
    return process.argv[index + 1];
  }

  return undefined;
}

function printUsage() {
  console.error(
    [
      'Usage: npm run episode:draft -- --theme "なぜ人は通知を開くのか"',
      "   or: npm run episode:draft -- --skeleton-file path/to/skeleton.json",
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
    theme: skeleton.theme,
    tone: skeleton.tone,
  };
}

async function main() {
  const theme = readArgValue("theme");
  const skeletonFile = readArgValue("skeleton-file");

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

  const skeleton = skeletonFile
    ? parseSkeleton(JSON.parse(await readFile(skeletonFile, "utf8")))
    : await generateConversationSkeleton({ theme: theme ?? "" });
  const draft = generateDraftScript({ skeleton });

  console.log(JSON.stringify(draft, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
