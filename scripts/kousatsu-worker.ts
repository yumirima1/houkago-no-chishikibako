import path from "node:path";

import { loadResearchSources } from "../src/lib/kousatsu/runtime-config";
import { ResearchRuntime } from "../src/lib/kousatsu/runtime-service";

function argumentsFor(values: string[]) {
  const options = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const option = values[index];
    if (!["--once", "--help", "--poll-seconds", "--db", "--output-dir", "--sources"].includes(option) || options.has(option)) {
      throw new Error(`Invalid or duplicate option: ${option}`);
    }
    if (option === "--once" || option === "--help") { options.set(option, "true"); continue; }
    const value = values[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value: ${option}`);
    options.set(option, value);
  }
  return options;
}

async function main() {
  const args = argumentsFor(process.argv.slice(2));
  if (args.has("--help")) {
    console.log(`考察箱 ローカル継続ワーカー

Usage: npm run kousatsu:worker -- [--once] [--poll-seconds 1..3600]
       [--db PATH] [--output-dir PATH] [--sources PATH]

Configured enabled sources are collected at their persisted schedule.
SIGINT/SIGTERM stops after the current job and closes the database.
No OS scheduler is registered. The default provider requires no external AI API.`);
    return;
  }
  const pollSeconds = Number(args.get("--poll-seconds") ?? process.env.KOUSATSU_POLL_SECONDS ?? "30");
  if (!Number.isInteger(pollSeconds) || pollSeconds < 1 || pollSeconds > 3600) {
    throw new Error("--poll-seconds must be an integer between 1 and 3600.");
  }
  let stopping = false;
  let wake: (() => void) | undefined;
  const stop = () => { stopping = true; wake?.(); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let runtime: ResearchRuntime | undefined;
  try {
    runtime = await ResearchRuntime.open({
      databasePath: args.get("--db"), outputDirectory: args.get("--output-dir"),
      sources: args.has("--sources") ? await loadResearchSources(path.resolve(args.get("--sources")!)) : undefined,
    });
    while (!stopping) {
      const result = await runtime.tick();
      console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
      if (args.has("--once")) {
        if (result.status === "blocked" || result.status === "retry_wait") process.exitCode = 1;
        break;
      }
      if (stopping) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollSeconds * 1000);
        wake = () => { clearTimeout(timer); resolve(); };
      });
      wake = undefined;
    }
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    runtime?.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Research worker failed.");
  process.exitCode = 1;
});
