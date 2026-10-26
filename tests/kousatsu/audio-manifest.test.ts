import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  audioManifestPath,
  readAudioManifest,
  writeAudioManifest,
  type AudioManifest,
} from "../../scripts/lib/audio-manifest";
import type { BuiltEpisode, EpisodeScript } from "../../scripts/lib/episode-schema";

function manifest(mode: AudioManifest["mode"] = "production"): AudioManifest {
  return {
    actualDurationSeconds: 1_200,
    cacheKeys: ["test-cache-key"],
    inputPath: "content/reviewed/episode-test.json",
    lineCount: 1,
    mode,
    outputPath: mode === "production"
      ? "public/audio/episode-test.mp3"
      : "generated-audio/previews/episode-test.preview.mp3",
    scriptId: "episode-test",
    updatedAt: new Date(0).toISOString(),
  };
}

test("manifest generation and loading share the production path and isolate previews", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "kousatsu-manifest-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const mode of ["production", "preview"] as const) {
    const value = manifest(mode);
    const suffix = mode === "preview" ? ".preview" : "";
    const expectedPath = path.join(root, value.scriptId, `${value.scriptId}${suffix}.manifest.json`);
    assert.equal(audioManifestPath(root, value.scriptId, mode), expectedPath);
    assert.equal(await writeAudioManifest(root, value), expectedPath);
    assert.deepEqual(await readAudioManifest(root, value.scriptId, mode), value);
  }
  assert.equal((await readAudioManifest(root, "episode-test")).mode, "production");
  await assert.rejects(() => readFile(path.join(root, "episodes", "episode-test", "episode-test.manifest.json")), /ENOENT/);
});

test("missing or invalid manifests fail with actionable errors", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "kousatsu-manifest-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(() => readAudioManifest(root, "episode-test"), /missing or unreadable.*episode:audio/);

  const filePath = await writeAudioManifest(root, manifest());
  for (const raw of ["{broken JSON", "null", "[]"]) {
    await writeFile(filePath, raw, "utf8");
    await assert.rejects(() => readAudioManifest(root, "episode-test"), /Audio manifest is invalid/);
  }
  for (const actualDurationSeconds of [0, -1, null, "1200", undefined]) {
    await writeFile(filePath, JSON.stringify({ ...manifest(), actualDurationSeconds }), "utf8");
    await assert.rejects(() => readAudioManifest(root, "episode-test"), /actualDurationSeconds/);
  }
  for (const actualDurationSeconds of [NaN, Infinity, -Infinity, 0]) {
    await assert.rejects(
      () => writeAudioManifest(root, { ...manifest(), actualDurationSeconds }),
      /actualDurationSeconds/,
    );
  }
});

test("manifest identity and cache metadata must match the requested audio", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "kousatsu-manifest-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filePath = await writeAudioManifest(root, manifest());
  for (const change of [{ scriptId: "another-episode" }, { mode: "preview" }, { cacheKeys: null }]) {
    await writeFile(filePath, JSON.stringify({ ...manifest(), ...change }), "utf8");
    await assert.rejects(() => readAudioManifest(root, "episode-test"), /Audio manifest is invalid/);
  }
});

test("episode builder consumes the generated production manifest in an isolated project", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "kousatsu-manifest-build-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const audio = manifest();
  const script: EpisodeScript = {
    createdAt: new Date(0).toISOString(),
    description: "manifest path regression fixture",
    durationTargetMinutes: 20,
    id: audio.scriptId,
    review: {
      changes: [],
      checks: {
        misinformationRisk: "fixture",
        narrationEase: "fixture",
        naturalConversation: "fixture",
        readability: "fixture",
        roleSeparation: "fixture",
      },
      reviewedAt: new Date(0).toISOString(),
      status: "reviewed",
      warnings: [],
    },
    speakers: [{ id: "rikei", name: "test", text: "test", voice: "rikei" }],
    theme: "test",
    themes: ["test"],
    title: "test",
    updatedAt: new Date(0).toISOString(),
  };
  await Promise.all([
    mkdir(path.join(root, "public", "audio"), { recursive: true }),
    mkdir(path.join(root, "content", "reviewed"), { recursive: true }),
    mkdir(path.join(root, "src", "data"), { recursive: true }),
  ]);
  await writeAudioManifest(path.join(root, "generated-audio"), audio);
  // Only file existence is relevant to metadata building; this is not playable audio.
  await writeFile(path.join(root, "public", "audio", `${audio.scriptId}.mp3`), "test placeholder");
  await writeFile(path.join(root, audio.inputPath), JSON.stringify(script), "utf8");
  const result = spawnSync(process.execPath, [
    "--import",
    pathToFileURL(path.resolve("node_modules/tsx/dist/loader.mjs")).href,
    path.resolve("scripts/build-episode.ts"),
    "--id",
    audio.scriptId,
  ], { cwd: root, encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const built = JSON.parse(await readFile(
    path.join(root, "content", "episodes", `${audio.scriptId}.json`), "utf8",
  )) as BuiltEpisode;
  assert.equal(built.source.actualDurationSeconds, audio.actualDurationSeconds);
  assert.equal(built.audioUrl, `/audio/${audio.scriptId}.mp3`);
});
