import { generateEpisodeSeed } from "./lib/episode-seed-generator";

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
    'Usage: npm run episode:seed -- --theme "なぜ人は通知を開くのか"',
  );
}

async function main() {
  const theme = readArgValue("theme");
  const eventCountArg = readArgValue("events");
  const eventCount = eventCountArg ? Number(eventCountArg) : undefined;

  if (!theme) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const seed = await generateEpisodeSeed({
    eventCount,
    theme,
  });

  console.log(JSON.stringify(seed, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
