import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AudioBuildMode = "preview" | "production";

export type AudioManifest = {
  actualDurationSeconds: number;
  cacheKeys: string[];
  inputPath: string;
  lineCount: number;
  mode: AudioBuildMode;
  outputPath: string;
  scriptId: string;
  updatedAt: string;
};

export function audioManifestPath(
  audioRoot: string,
  scriptId: string,
  mode: AudioBuildMode = "production",
) {
  const suffix = mode === "preview" ? ".preview" : "";
  return path.join(audioRoot, scriptId, `${scriptId}${suffix}.manifest.json`);
}

function assertAudioManifest(
  value: unknown,
  scriptId: string,
  mode: AudioBuildMode,
): asserts value is AudioManifest {
  if (!value || typeof value !== "object") {
    throw new Error("expected a manifest object");
  }
  const manifest = value as Record<string, unknown>;
  if (
    typeof manifest.actualDurationSeconds !== "number" ||
    !Number.isFinite(manifest.actualDurationSeconds) ||
    manifest.actualDurationSeconds <= 0
  ) {
    throw new Error("actualDurationSeconds must be a positive finite number");
  }
  if (manifest.scriptId !== scriptId || manifest.mode !== mode) {
    throw new Error("scriptId or mode does not match the requested audio");
  }
  if (
    !Array.isArray(manifest.cacheKeys) ||
    !manifest.cacheKeys.every((key: unknown) => typeof key === "string") ||
    !Number.isInteger(manifest.lineCount) ||
    (manifest.lineCount as number) < 0 ||
    typeof manifest.inputPath !== "string" ||
    typeof manifest.outputPath !== "string" ||
    typeof manifest.updatedAt !== "string"
  ) {
    throw new Error("manifest metadata is invalid");
  }
}

export async function readAudioManifest(
  audioRoot: string,
  scriptId: string,
  mode: AudioBuildMode = "production",
) {
  const filePath = audioManifestPath(audioRoot, scriptId, mode);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `Audio manifest is missing or unreadable: ${filePath}. Run npm run episode:audio again.`,
      { cause: error },
    );
  }
  try {
    const manifest: unknown = JSON.parse(raw);
    assertAudioManifest(manifest, scriptId, mode);
    return manifest;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(
      `Audio manifest is invalid: ${filePath}: ${detail}. Run npm run episode:audio again.`,
      { cause: error },
    );
  }
}

export async function writeAudioManifest(audioRoot: string, manifest: AudioManifest) {
  assertAudioManifest(manifest, manifest.scriptId, manifest.mode);
  const filePath = audioManifestPath(audioRoot, manifest.scriptId, manifest.mode);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return filePath;
}
