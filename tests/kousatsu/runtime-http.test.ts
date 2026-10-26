import assert from "node:assert/strict";
import { execFile, fork } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { DeterministicProvider } from "../../src/lib/kousatsu/ai";
import { KousatsuDatabase } from "../../src/lib/kousatsu/database";
import { createResearchHttp } from "../../src/lib/kousatsu/runtime-http";
import { ResearchRuntime, researchNote, researchSnapshot } from "../../src/lib/kousatsu/runtime-service";
import type { ResearchSource } from "../../src/lib/kousatsu/runtime-types";

const run = promisify(execFile);
const base = "http://127.0.0.1:3000/api/kousatsu";
const source: ResearchSource = {
  id: "http-fixture", name: "HTTP fixture", feedUrl: "https://example.invalid/http.xml",
  enabled: true, topic: "AI検証", intervalMinutes: 15,
};

function request(method = "GET", payload?: unknown, extra: Record<string, string> = {}, url = base) {
  const headers = { host: new URL(url).host, ...extra };
  if (method === "POST") {
    Object.assign(headers, { origin: new URL(url).origin, "content-type": "application/json" }, extra);
  }
  return new Request(url, { method, headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
}

async function sandbox(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kousatsu-http-regression-"));
  const databasePath = path.join(directory, "research.sqlite");
  const outputDirectory = path.join(directory, "notes");
  const options = { databasePath, outputDirectory, sources: [source], provider: new DeterministicProvider() };
  const http = createResearchHttp({
    environment: () => ({ nodeEnv: "development" }),
    open: () => ResearchRuntime.open(options),
    snapshot: () => researchSnapshot(options),
    note: (id) => researchNote(id, options),
  });
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  return { directory, databasePath, outputDirectory, options, http };
}

test("HTTP reads never create or migrate an absent or pre-runtime database", async (t) => {
  const fixture = await sandbox(t);
  const absent = await fixture.http.GET(request());
  assert.equal(absent.status, 200);
  assert.equal((await absent.json()).initialized, false);
  assert.equal(existsSync(fixture.databasePath), false);
  assert.equal((await fixture.http.GET(request("GET", undefined, {}, `${base}?note=12345678-1234-1234-1234-123456789abc`))).status, 404);
  assert.equal(existsSync(fixture.databasePath), false);
  const old = new KousatsuDatabase(fixture.databasePath);
  old.close();
  const bytes = await readFile(fixture.databasePath);
  const response = await fixture.http.GET(request());
  assert.equal((await response.json()).initialized, false);
  assert.deepEqual(await readFile(fixture.databasePath), bytes);
  const reader = new DatabaseSync(fixture.databasePath, { readOnly: true });
  try {
    assert.equal(reader.prepare("SELECT name FROM sqlite_master WHERE name='research_schema'").get(), undefined);
  } finally { reader.close(); }
});

test("production access is disabled by default and explicit local access still requires loopback", async (t) => {
  const fixture = await sandbox(t);
  const disabled = createResearchHttp({ environment: () => ({ nodeEnv: "production" }) });
  assert.equal((await disabled.GET(request())).status, 403);
  assert.equal((await disabled.POST(request("POST", { action: "initialize" }))).status, 403);
  assert.equal(existsSync(fixture.databasePath), false);
  const enabled = createResearchHttp({
    environment: () => ({ nodeEnv: "production", enabled: "1" }),
    snapshot: () => researchSnapshot(fixture.options),
  });
  assert.equal((await enabled.GET(request())).status, 200);
  assert.equal((await enabled.GET(request("GET", undefined, {}, "http://example.invalid/api/kousatsu"))).status, 403);
});

test("origin, Host and proxy mismatches are rejected before any state access", async () => {
  let accessed = false;
  const http = createResearchHttp({ environment: () => ({ nodeEnv: "development" }),
    snapshot: async () => { accessed = true; throw new Error("must not reach storage"); },
    open: async () => { accessed = true; throw new Error("must not reach storage"); },
  });
  const wrongHeaders: Array<Record<string, string>> = [
    { origin: "http://external.invalid" }, { origin: "null" }, { origin: "http://localhost:3000" },
    { host: "localhost:3000" }, { forwarded: "for=127.0.0.1" },
    { "x-forwarded-host": "external.invalid" }, { "x-forwarded-port": "443" },
    { "x-forwarded-proto": "https" }, { "x-forwarded-for": "203.0.113.3" },
    { "x-forwarded-for": "127.0.0.1, 203.0.113.3" }, { "x-forwarded-unknown": "localhost" },
    { "sec-fetch-site": "cross-site" },
  ];
  for (const headers of wrongHeaders) {
    assert.equal((await http.GET(request("GET", undefined, headers))).status, 403, JSON.stringify(headers));
    assert.equal((await http.POST(request("POST", { action: "initialize" }, headers))).status, 403, JSON.stringify(headers));
  }
  const noOrigin = request("POST", { action: "initialize" });
  noOrigin.headers.delete("origin");
  assert.equal((await http.POST(noOrigin)).status, 403);
  assert.equal(accessed, false);
});

test("Next's consistent loopback forwarded headers and IPv6 remain usable without CORS", async (t) => {
  const fixture = await sandbox(t);
  const headers = {
    "x-forwarded-host": "127.0.0.1:3000", "x-forwarded-port": "3000",
    "x-forwarded-proto": "http", "x-forwarded-for": "::ffff:127.0.0.1",
  };
  const response = await fixture.http.GET(request("GET", undefined, headers));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal((await fixture.http.GET(request("GET", undefined, {}, "http://[::1]:3000/api/kousatsu"))).status, 200);
});

test("Next localhost normalization retains the browser Host origin and rejects incomplete or conflicting headers", async (t) => {
  const fixture = await sandbox(t);
  const headers = {
    host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000",
    "x-forwarded-host": "127.0.0.1:3000", "x-forwarded-port": "3000",
    "x-forwarded-proto": "http", "x-forwarded-for": "127.0.0.1",
  };
  const normalizedUrl = "http://localhost:3000/api/kousatsu";
  assert.equal((await fixture.http.GET(request("GET", undefined, headers, normalizedUrl))).status, 200);
  assert.equal((await fixture.http.POST(request("POST", { action: "initialize" }, headers, normalizedUrl))).status, 200);
  for (const override of [
    { origin: "http://localhost:3000" }, { "x-forwarded-host": "localhost:3000" },
    { "x-forwarded-for": "203.0.113.1" }, { "x-forwarded-port": "3001" },
    { host: "127.0.0.1:3001" }, { host: "external.invalid:3000" },
  ]) {
    assert.equal((await fixture.http.POST(request("POST", { action: "initialize" }, { ...headers, ...override }, normalizedUrl))).status, 403);
  }
  const incomplete = request("POST", { action: "initialize" }, headers, normalizedUrl);
  incomplete.headers.delete("x-forwarded-for");
  assert.equal((await fixture.http.POST(incomplete)).status, 403);
});

test("request size, JSON, identifiers and unexpected path or URL inputs fail before opening a DB", async (t) => {
  const fixture = await sandbox(t);
  const invalid = [
    { action: "enqueue", sourceId: source.id, fixturePath: "D:/private.xml" },
    { action: "enqueue", sourceId: source.id, feedUrl: "http://127.0.0.1/private" },
    { action: "initialize", databasePath: "D:/private.sqlite" },
    { action: "tick", outputDirectory: "D:/private" },
    { action: "__proto__" }, { action: "enqueue", sourceId: "../private" },
    { action: "enqueue", sourceId: source.id, topic: " " },
    { action: "retry", jobId: "../private" }, [], null,
  ];
  for (const value of invalid) assert.equal((await fixture.http.POST(request("POST", value))).status, 400);
  const text = request("POST", { action: "initialize" }, { "content-type": "text/plain" });
  assert.equal((await fixture.http.POST(text)).status, 415);
  const oversized = request("POST", { action: "initialize", extra: "x".repeat(5000) });
  assert.equal((await fixture.http.POST(oversized)).status, 413);
  assert.equal((await fixture.http.POST(request("POST", { action: "initialize" }, { "content-length": "5000" }))).status, 413);
  const malformed = new Request(base, { method: "POST", headers: {
    host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json",
  }, body: "{broken" });
  assert.equal((await fixture.http.POST(malformed)).status, 400);
  assert.equal((await fixture.http.GET(request("GET", undefined, {}, `${base}?note=..%2Fprivate`))).status, 400);
  assert.equal((await fixture.http.GET(request("GET", undefined, {}, `${base}?outputPath=private`))).status, 400);
  assert.equal(existsSync(fixture.databasePath), false);
});

test("initialize and enqueue use only configured sources and persist exactly one queued job", async (t) => {
  const fixture = await sandbox(t);
  assert.equal((await fixture.http.POST(request("POST", { action: "initialize" }))).status, 200);
  assert.equal(existsSync(fixture.databasePath), true);
  const queued = await fixture.http.POST(request("POST", { action: "enqueue", sourceId: source.id, topic: "AI research" }));
  assert.equal(queued.status, 202);
  const jobId = (await queued.json()).jobId;
  assert.equal((await fixture.http.POST(request("POST", { action: "enqueue", sourceId: "not-configured" }))).status, 400);
  const snapshot = await (await fixture.http.GET(request())).json();
  assert.equal(snapshot.jobs.length, 1);
  assert.equal(snapshot.jobs[0].id, jobId);
  assert.equal(snapshot.jobs[0].status, "pending");
  const reader = new DatabaseSync(fixture.databasePath, { readOnly: true });
  try {
    const input = JSON.parse(String(reader.prepare("SELECT input_json FROM jobs WHERE id=?").get(jobId)?.input_json));
    assert.equal(input.source.feedUrl, source.feedUrl);
    assert.equal(input.fixturePath, undefined);
  } finally { reader.close(); }
});

test("HTTP tick, read, canonical download and retry recover fixtures while preserving hand edits", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await ResearchRuntime.open(fixture.options);
  const jobId = runtime.enqueueInput({ source, topic: source.topic,
    fixturePath: path.resolve("tests/fixtures/kousatsu-sample.rss.xml") });
  runtime.close();
  const processed = await (await fixture.http.POST(request("POST", { action: "tick" }))).json();
  assert.equal(processed.status, "completed", JSON.stringify(processed));
  const articleId = processed.result.articleId;
  const url = `${base}?note=${articleId}`;
  const canonical = await readFile(processed.result.articlePath, "utf8");
  const before = await readFile(fixture.databasePath);
  const note = await (await fixture.http.GET(request("GET", undefined, {}, url))).json();
  assert.equal(note.markdown, canonical);
  assert.equal(note.artifact, "matching");
  assert.equal(note.verification.factCheckStatus, "unverified");
  assert.deepEqual(await readFile(fixture.databasePath), before, "GET does not mutate the DB");
  await writeFile(processed.result.articlePath, "Handwritten private note\n");
  const conflict = await (await fixture.http.GET(request("GET", undefined, {}, url))).json();
  assert.equal(conflict.artifact, "conflict");
  assert.equal(conflict.markdown, canonical);
  const download = await fixture.http.GET(request("GET", undefined, {}, `${url}&download=1`));
  assert.equal(await download.text(), canonical);
  assert.equal(download.headers.get("x-kousatsu-artifact"), "conflict");
  assert.match(download.headers.get("content-disposition")!, /attachment; filename="kousatsu-/);
  assert.equal(await readFile(processed.result.articlePath, "utf8"), "Handwritten private note\n");
  // Remove only this test's replacement file, then restore via an explicit POST.
  await unlink(processed.result.articlePath);
  assert.equal((await (await fixture.http.GET(request("GET", undefined, {}, url))).json()).artifact, "missing");
  assert.equal((await fixture.http.POST(request("POST", { action: "retry", jobId }))).status, 200);
  const repaired = await (await fixture.http.POST(request("POST", { action: "tick" }))).json();
  assert.equal(repaired.status, "completed");
  assert.equal(await readFile(processed.result.articlePath, "utf8"), canonical);
  assert.equal((await (await fixture.http.GET(request())).json()).notes.length, 1);
});

test("worker CLI validates arguments without touching data and processes a persisted fixture in --once mode", async (t) => {
  const fixture = await sandbox(t);
  const worker = path.resolve("scripts/kousatsu-worker.ts");
  const config = path.join(fixture.directory, "sources.json");
  await writeFile(config, JSON.stringify({ sources: [] }));
  const env = { ...process.env, KOUSATSU_AI_PROVIDER: "deterministic" };
  const help = await run(process.execPath, ["--import", "tsx", worker, "--help", "--db", fixture.databasePath], { env });
  assert.match(help.stdout, /--once/);
  assert.equal(existsSync(fixture.databasePath), false);
  await assert.rejects(run(process.execPath, ["--import", "tsx", worker, "--db", fixture.databasePath, "--poll-seconds", "0"], { env }));
  assert.equal(existsSync(fixture.databasePath), false);
  const runtime = await ResearchRuntime.open(fixture.options);
  runtime.enqueueInput({ source, topic: source.topic, fixturePath: path.resolve("tests/fixtures/kousatsu-sample.rss.xml") });
  runtime.close();
  const result = await run(process.execPath, ["--import", "tsx", worker, "--once", "--db", fixture.databasePath,
    "--output-dir", fixture.outputDirectory, "--sources", config], { env });
  assert.equal(JSON.parse(result.stdout.trim()).status, "completed");
  const snapshot = await researchSnapshot({ databasePath: fixture.databasePath, sources: [] });
  assert.equal(snapshot.notes.length, 1);
  assert.equal(snapshot.jobs[0].queue, "done");
  assert.equal(snapshot.worker.active, false);
});

test("worker shutdown requested during analysis waits for canonical publication and releases the lease", { timeout: 15_000 }, async (t) => {
  const fixture = await sandbox(t);
  const runtime = await ResearchRuntime.open(fixture.options);
  runtime.enqueueInput({ source, topic: source.topic, fixturePath: path.resolve("tests/fixtures/kousatsu-sample.rss.xml") });
  runtime.close();
  const config = path.join(fixture.directory, "sources.json");
  const launcher = path.join(fixture.directory, "controlled-worker.ts");
  await writeFile(config, JSON.stringify({ sources: [] }));
  // Deliver Node's signal event through IPC: Windows process.kill(SIGTERM)
  // terminates immediately and cannot exercise a graceful signal handler.
  await writeFile(launcher, `
    import { DeterministicProvider } from ${JSON.stringify(pathToFileURL(path.resolve("src/lib/kousatsu/ai.ts")).href)};
    const analyze = DeterministicProvider.prototype.analyze;
    DeterministicProvider.prototype.analyze = async function(context) {
      await new Promise(resolve => {
        process.once('message', () => { process.emit('SIGTERM'); resolve(); });
        process.send?.('analysis-started');
      });
      return analyze.call(this, context);
    };
    import(${JSON.stringify(pathToFileURL(path.resolve("scripts/kousatsu-worker.ts")).href)});
  `);
  const child = fork(launcher, ["--db", fixture.databasePath, "--output-dir", fixture.outputDirectory,
    "--sources", config, "--poll-seconds", "1"], {
    execArgv: ["--import", "tsx"], cwd: process.cwd(), silent: true,
    env: { ...process.env, KOUSATSU_AI_PROVIDER: "deterministic" },
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stderr = "";
  let stdout = "";
  child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
  await Promise.race([
    once(child, "message").then(([message]) => assert.equal(message, "analysis-started")),
    once(child, "exit").then(([code]) => { throw new Error(`Worker exited before analysis (${code}): ${stderr}`); }),
  ]);
  const exited = once(child, "exit");
  child.send("stop-after-current-job", () => child.disconnect());
  const [code] = await exited;
  assert.equal(code, 0, stderr);
  assert.equal(JSON.parse(stdout.trim()).status, "completed");
  const snapshot = await researchSnapshot({ databasePath: fixture.databasePath, sources: [] });
  assert.equal(snapshot.notes.length, 1);
  assert.equal(snapshot.jobs[0].queue, "done");
  assert.equal(snapshot.worker.active, false);
  assert.equal((await researchNote(snapshot.notes[0].id, fixture.options))?.artifact, "matching");
});
