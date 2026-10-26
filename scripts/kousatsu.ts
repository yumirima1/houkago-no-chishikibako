import { readFile } from "node:fs/promises";
import path from "node:path";

import { KousatsuDatabase } from "../src/lib/kousatsu/database";
import { collectFeedXml } from "../src/lib/kousatsu/ingest";
import { KousatsuPipeline } from "../src/lib/kousatsu/pipeline";
import type { SourceInput } from "../src/lib/kousatsu/types";

function parseArgs(values: string[]) {
  const args = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index];
    if (!current.startsWith("--")) continue;
    const name = current.slice(2);
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(name, next);
      index += 1;
    } else {
      args.set(name, "true");
    }
  }
  return args;
}

function required(args: Map<string, string>, name: string) {
  const value = args.get(name);
  if (!value) throw new Error(`Missing required option: --${name}`);
  return value;
}

function sourceFromArgs(args: Map<string, string>): SourceInput {
  return {
    contentPolicy:
      args.get("content-policy") === "metadata-only"
        ? "metadata-only"
        : "metadata-and-feed-summary",
    feedUrl: args.get("feed-url") ?? "https://example.invalid/kousatsu-fixture.xml",
    id: args.get("source-id") ?? "local-fixture",
    name: args.get("source-name") ?? "Local fixture",
  };
}

function printHelp() {
  console.log(`考察箱 CLI

Commands:
  init [--db PATH]
  ingest --fixture PATH [--source-id ID --source-name NAME --feed-url URL]
  run --topic TEXT [--fixture PATH | --feed-url URL] [--output-dir PATH]
  resume --job ID
  recover [--stale-minutes N]
  backup --output PATH
  search --query TEXT [--limit N]
  status

AI provider:
  default: deterministic (no API or model required)
  Ollama:  KOUSATSU_AI_PROVIDER=ollama and KOUSATSU_OLLAMA_MODEL=<installed model>
`);
}

async function main() {
  const [command = "help", ...values] = process.argv.slice(2);
  const args = parseArgs(values);
  if (command === "help" || args.has("help")) {
    printHelp();
    return;
  }

  const database = new KousatsuDatabase(args.get("db"));
  try {
    if (command === "init") {
      console.log(JSON.stringify({ database: database.filePath, counts: database.getCounts() }, null, 2));
      return;
    }
    if (command === "status") {
      console.log(
        JSON.stringify(
          {
            database: database.filePath,
            counts: database.getCounts(),
            recentJobs: database.listJobs(20),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (command === "backup") {
      const output = await database.backupTo(required(args, "output"));
      console.log(JSON.stringify({ backup: output, source: database.filePath }, null, 2));
      return;
    }
    if (command === "recover") {
      const staleMinutes = Math.max(1, Number(args.get("stale-minutes") ?? 30));
      const olderThan = new Date(Date.now() - staleMinutes * 60_000).toISOString();
      const recovered = database.markStaleJobsForRetry(olderThan);
      console.log(JSON.stringify({ olderThan, recovered }, null, 2));
      return;
    }
    if (command === "search") {
      const limit = Number(args.get("limit") ?? 20);
      console.log(JSON.stringify(database.search(required(args, "query"), limit), null, 2));
      return;
    }
    if (command === "ingest") {
      const fixturePath = path.resolve(required(args, "fixture"));
      const xml = await readFile(fixturePath, "utf8");
      const result = collectFeedXml(database, sourceFromArgs(args), xml);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "run") {
      const source = sourceFromArgs(args);
      if (args.get("feed-url")) source.feedUrl = required(args, "feed-url");
      const pipeline = new KousatsuPipeline(database);
      const result = await pipeline.run({
        feedUrl: args.get("feed-url"),
        fixturePath: args.get("fixture")
          ? path.resolve(required(args, "fixture"))
          : undefined,
        maxAttempts: Number(args.get("max-attempts") ?? 3),
        outputDirectory: args.get("output-dir")
          ? path.resolve(required(args, "output-dir"))
          : undefined,
        source,
        topic: required(args, "topic"),
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (command === "resume") {
      const pipeline = new KousatsuPipeline(database);
      console.log(JSON.stringify(await pipeline.resume(required(args, "job")), null, 2));
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
