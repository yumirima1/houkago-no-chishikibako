import { readFile } from "node:fs/promises";

import { generateConversationSkeleton } from "./lib/conversation-skeleton-generator";
import { EpisodeSeed } from "./lib/episode-seed-generator";

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
      'Usage: npm run episode:skeleton -- --theme "なぜ人は通知を開くのか"',
      "   or: npm run episode:skeleton -- --seed-file path/to/seed.json",
    ].join("\n"),
  );
}

function parseSeed(value: unknown): EpisodeSeed {
  if (!value || typeof value !== "object") {
    throw new Error("Seed file must contain a JSON object.");
  }

  const seed = value as Partial<EpisodeSeed>;

  if (
    typeof seed.theme !== "string" ||
    typeof seed.structureTemplate !== "string" ||
    !Array.isArray(seed.events) ||
    typeof seed.atmosphere !== "string" ||
    typeof seed.tone !== "string"
  ) {
    throw new Error(
      "Seed file must include theme, structureTemplate, events, atmosphere, and tone.",
    );
  }

  return {
    atmosphere: seed.atmosphere,
    events: seed.events.map((eventId) => String(eventId)),
    rarityMix: seed.rarityMix ?? {
      Common: 0.7,
      Epic: 0.08,
      Legendary: 0.02,
      Rare: 0.2,
    },
    structureTemplate: seed.structureTemplate,
    theme: seed.theme,
    tone: seed.tone,
  };
}

async function main() {
  const theme = readArgValue("theme");
  const seedFile = readArgValue("seed-file");

  if (!theme && !seedFile) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (theme && seedFile) {
    console.error("Use either --theme or --seed-file, not both.");
    process.exitCode = 1;
    return;
  }

  const skeleton = seedFile
    ? await generateConversationSkeleton({
        seed: parseSeed(JSON.parse(await readFile(seedFile, "utf8"))),
      })
    : await generateConversationSkeleton({ theme: theme ?? "" });

  console.log(JSON.stringify(skeleton, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
