import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { observerDesktopSnapshot, createObserverReaders } from "../../src/lib/observer-room-data";
import { autonomousPaths, type AutonomousConfig } from "../../src/lib/kousatsu/autonomous-config";
import { ResearchRuntime } from "../../src/lib/kousatsu/runtime-service";
import { DeterministicProvider } from "../../src/lib/kousatsu/ai";
import { createResearchHttp } from "../../src/lib/kousatsu/runtime-http";
import { roomCameraPosition, ROOM_CAMERA, trainPosition } from "../../src/components/observer-room/roomMotion";

async function fixture() {
  const root = path.resolve("tmp");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "observer-room-test-"));
  const config: AutonomousConfig = {
    dataDirectory: directory, sourcesPath: path.join(directory, "sources.json"), pollSeconds: 30,
    maxJobsPerCycle: 6, maxJobsPerDay: 100, maxDatabaseMiB: 100, minFreeMiB: 100,
    maxKnowledgeFiles: 1000, exploration: 0.25, ai: { provider: "deterministic", model: "rules-v1", timeoutMs: 1000 },
  };
  await writeFile(config.sourcesPath, JSON.stringify({ sources: [{ id: "fixture", name: "Stored source", feedUrl: "https://example.invalid/feed", enabled: true, topic: "AI検証", intervalMinutes: 60 }] }));
  return { config, paths: autonomousPaths(config) };
}

test("Observer GET of an absent data store neither creates a database nor invents records", async () => {
  const { config, paths } = await fixture();
  const snapshot = await observerDesktopSnapshot(config);
  assert.equal(snapshot.initialized, false);
  assert.deepEqual(snapshot.notes, []);
  assert.deepEqual(snapshot.news, []);
  assert.equal(snapshot.system.supervisorActive, false);
  assert.equal(snapshot.system.access, "read-only");
  assert.equal(existsSync(paths.database), false);
});

test("Observer reads real saved notes/news without changing DB or manually edited Markdown", async () => {
  const { config, paths } = await fixture();
  await mkdir(path.dirname(paths.database), { recursive: true });
  const runtime = await ResearchRuntime.open({ databasePath: paths.database, outputDirectory: paths.notes, sources: [], provider: new DeterministicProvider() });
  let articleId: string;
  let articlePath: string;
  try {
    runtime.enqueueInput({ source: { id: "fixture", name: "Stored source", feedUrl: "https://example.invalid/feed" }, topic: "AI検証", fixturePath: path.resolve("tests/fixtures/kousatsu-sample.rss.xml") });
    const result = await runtime.tick({ schedule: false });
    assert.equal(result.status, "completed");
    if (result.status !== "completed") throw new Error("fixture must complete");
    articleId = result.result.articleId!; articlePath = result.result.articlePath!;
  } finally { runtime.close(); }
  await writeFile(articlePath, "# Preserved handwritten content\n");
  const before = createHash("sha256").update(await readFile(paths.database)).digest("hex");
  const readers = createObserverReaders(Promise.resolve(config));
  const snapshot = await readers.snapshot();
  assert.ok(snapshot.notes.some((note) => note.id === articleId));
  assert.ok(snapshot.news.length > 0);
  assert.ok(snapshot.news.every((news) => news.source === "Stored source" && news.title && news.url.startsWith("https:")));
  const note = await readers.note(articleId);
  assert.equal(note?.artifact, "conflict");
  assert.ok(note?.markdown.startsWith("#"));
  assert.equal(await readFile(articlePath, "utf8"), "# Preserved handwritten content\n");
  assert.equal(createHash("sha256").update(await readFile(paths.database)).digest("hex"), before);
  const db = new DatabaseSync(paths.database, { readOnly: true });
  try { assert.equal(db.prepare("SELECT count(*) AS n FROM jobs").get()?.n, 1); } finally { db.close(); }
});

test("Observer endpoint retains local access validation before reading any private store", async () => {
  let calls = 0;
  const http = createResearchHttp({ environment: () => ({ nodeEnv: "development" }), snapshot: async () => { calls++; throw new Error("must not read"); } });
  const denied = await http.GET(new Request("http://outside.invalid/api/observer-room", { headers: { host: "outside.invalid" } }));
  assert.equal(denied.status, 403); assert.equal(calls, 0);
  const malformed = await http.GET(new Request("http://127.0.0.1:3000/api/observer-room?note=../../private", { headers: { host: "127.0.0.1:3000" } }));
  assert.equal(malformed.status, 400); assert.equal(calls, 0);
});

test("Camera stays bounded at extreme pointer input and the train resets out of view", () => {
  for (const x of [-1000, -1, 0, 1, 1000, NaN]) for (const y of [-1000, 0, 1000]) {
    const position = roomCameraPosition(x, y);
    assert.ok(Math.abs(position[0] - ROOM_CAMERA.position[0]) <= 0.05501);
    assert.ok(Math.abs(position[1] - ROOM_CAMERA.position[1]) <= 0.03501);
    assert.equal(position[2], ROOM_CAMERA.position[2]);
  }
  assert.deepEqual(roomCameraPosition(1, 1, 16 / 9, true), ROOM_CAMERA.position);
  assert.deepEqual(roomCameraPosition(0, 0), ROOM_CAMERA.position);
  assert.ok(roomCameraPosition(0, 0, 0.5)[2] > ROOM_CAMERA.position[2]);
  assert.ok(trainPosition(1) > trainPosition(0));
  for (let time = 0; time < 120; time += 0.1) {
    const a = trainPosition(time), b = trainPosition(time + 0.1);
    if (b < a) { assert.ok(a > 25); assert.ok(b < -19); }
  }
});

test("Bundled GLBs and their local texture dependencies are valid within the 650 KB asset budget", async () => {
  let total = 0, count = 0;
  const dependencies = new Set<string>();
  for (const category of ["furniture", "city"]) {
    const directory = path.resolve("public/assets/observer-room", category);
    assert.match(await readFile(path.join(directory, "LICENSE.txt"), "utf8"), /CC0/);
    for (const file of await readdir(directory)) {
      if (!file.endsWith(".glb")) continue;
      const bytes = await readFile(path.join(directory, file));
      total += bytes.length; count++;
      assert.equal(bytes.toString("ascii", 0, 4), "glTF");
      assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
      const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
      for (const resource of [...(gltf.images ?? []), ...gltf.buffers]) {
        if (!resource.uri || resource.uri.startsWith("data:")) continue;
        assert.ok(!/[:?#]/.test(resource.uri));
        const dependency = path.resolve(directory, resource.uri);
        assert.ok(dependency.startsWith(directory + path.sep), "resource must stay in the asset directory");
        const contents = await readFile(dependency);
        assert.ok(contents.length > 0);
        if (!dependencies.has(dependency)) { dependencies.add(dependency); total += contents.length; }
      }
      assert.ok(gltf.meshes.length > 0);
    }
  }
  assert.equal(count, 14); assert.ok(total < 650000);
});
