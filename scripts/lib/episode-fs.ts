import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const projectRoot = process.cwd();
export const contentRoot = path.join(projectRoot, "content");
export const draftDir = path.join(contentRoot, "drafts");
export const scriptDraftDir = path.join(contentRoot, "script-drafts");
export const reviewedDir = path.join(contentRoot, "reviewed");
export const builtEpisodeDir = path.join(contentRoot, "episodes");
export const generatedAudioDir = path.join(projectRoot, "generated-audio");
export const publicAudioDir = path.join(projectRoot, "public", "audio");
export const generatedEpisodesFile = path.join(
  projectRoot,
  "src",
  "data",
  "generatedEpisodes.ts",
);

export async function ensureProductionDirs() {
  await Promise.all([
    mkdir(draftDir, { recursive: true }),
    mkdir(scriptDraftDir, { recursive: true }),
    mkdir(reviewedDir, { recursive: true }),
    mkdir(builtEpisodeDir, { recursive: true }),
    mkdir(generatedAudioDir, { recursive: true }),
    mkdir(publicAudioDir, { recursive: true }),
  ]);
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJsonFile(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function listJsonFiles(directory: string) {
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

export async function findLatestJsonFile(directory: string) {
  const files = await listJsonFiles(directory);
  return files.at(-1);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const equalsIndex = token.indexOf("=");

    if (equalsIndex > 2) {
      args[token.slice(2, equalsIndex)] = token.slice(equalsIndex + 1);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

export function getStringArg(
  args: Record<string, string | boolean>,
  key: string,
  fallback?: string,
) {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function toProjectPath(filePath: string) {
  return path.relative(projectRoot, filePath).replaceAll("\\", "/");
}
