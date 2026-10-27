import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { pathToFileURL } from "node:url";

import { DeterministicProvider, OllamaProvider } from "../../src/lib/kousatsu/ai";
import { KousatsuDatabase } from "../../src/lib/kousatsu/database";
import { collectFeedXml } from "../../src/lib/kousatsu/ingest";
import { extractSourceClaims } from "../../src/lib/kousatsu/knowledge";
import { KousatsuPipeline } from "../../src/lib/kousatsu/pipeline";

const fixtureSource = path.resolve("tests/fixtures/kousatsu-sample.rss.xml");

async function setup(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kousatsu-p1-pipeline-"));
  const dbPath = path.join(directory, "test.sqlite");
  const fixturePath = path.join(directory, "feed.xml");
  await writeFile(fixturePath, await readFile(fixtureSource));
  const connections: KousatsuDatabase[] = [];
  const connect = () => {
    const db = new KousatsuDatabase(dbPath);
    connections.push(db);
    return db;
  };
  t.after(async () => {
    for (const db of connections) db.close();
    // Only this test's freshly created directory is removed.
    await rm(directory, { recursive: true, force: true });
  });
  const database = connect();
  const input = {
    fixturePath, outputDirectory: path.join(directory, "notes"),
    maxAttempts: 5, topic: "AI検証",
    source: { id: "fixture", name: "Fixture", feedUrl: "https://example.invalid/feed.xml" },
  };
  return { database, dbPath, directory, connect, input };
}

for (const boundary of ["analyze", "draft", "verify", "export-manifest", "export-markdown", "export-verification", "export"]) {
  test(`retry after ${boundary} commits neither duplicate DB records nor conflicting artifacts`, async (t) => {
    const { database, input } = await setup(t);
    const jobId = database.createJob(input);
    await assert.rejects(new KousatsuPipeline(database, { failAfterStage: boundary }).resume(jobId), /Injected failure/);
    const result = await new KousatsuPipeline(database).resume(jobId);
    assert.equal(result.status, "succeeded");
    assert.equal(database.getCounts().articles, 1);
    assert.equal(database.getCounts().verifications, 1);
    const raw = new DatabaseSync(database.filePath, { readOnly: true });
    try {
      assert.equal(raw.prepare("SELECT count(*) AS count FROM analyses").get()?.count, 1);
      assert.equal(raw.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
    } finally { raw.close(); }
    const article = database.getArticle(result.articleId!)!;
    assert.equal(await readFile(result.articlePath!, "utf8"), article.markdown);
    assert.equal(article.outputPath, result.articlePath);
    assert.equal(JSON.parse(await readFile(result.verificationPath!, "utf8")).scope, "structure-and-references");
  });
}

test("completed-job resume restores missing exports from the DB but preserves hand edits", async (t) => {
  const { database, input } = await setup(t);
  const result = await new KousatsuPipeline(database).run(input);
  const canonical = await readFile(result.articlePath!, "utf8");
  await unlink(result.articlePath!);
  const recovered = await new KousatsuPipeline(database).resume(result.jobId);
  assert.equal(recovered.articlePath, result.articlePath);
  assert.equal(await readFile(result.articlePath!, "utf8"), canonical);
  await writeFile(result.articlePath!, "my handwritten note\n");
  await assert.rejects(new KousatsuPipeline(database).resume(result.jobId), /ARTIFACT_CONFLICT/);
  assert.equal(await readFile(result.articlePath!, "utf8"), "my handwritten note\n");
  assert.match(database.getJob(result.jobId)!.lastError!, /ARTIFACT_CONFLICT/);
  assert.equal(database.getCounts().articles, 1);
});

test("a completed historical note is restored after source revisions without requiring its old fixture or provider", async (t) => {
  const { database, input } = await setup(t);
  const result = await new KousatsuPipeline(database).run(input);
  const markdown = await readFile(result.articlePath!, "utf8");
  const verification = await readFile(result.verificationPath!, "utf8");
  const selected = database.getCheckpoint<{ items: Array<{ id: string; versionId: string }> }>(result.jobId, "selected-items")!;
  const xml = await readFile(input.fixturePath, "utf8");
  collectFeedXml(database, input.source, xml.replace("utm_source=test", "utm_source=refetched").replace("sample-001", "refetched-guid"));
  collectFeedXml(database, input.source, xml.replace("AI検証の記録を保存する", "改訂されたAI検証記事"));
  assert.ok(selected.items.some((item) => database.getItem(item.id)?.versionId !== item.versionId));
  await unlink(result.articlePath!);
  await unlink(result.verificationPath!);
  await unlink(input.fixturePath);
  const provider = {
    id: "unavailable-provider", model: "changed-model",
    async analyze(): Promise<never> { throw new Error("Historical restoration must never analyze again."); },
  };
  const restored = await new KousatsuPipeline(database, { provider }).resume(result.jobId);
  assert.equal(restored.status, "succeeded");
  assert.equal(await readFile(restored.articlePath!, "utf8"), markdown);
  assert.equal(await readFile(restored.verificationPath!, "utf8"), verification);
  assert.equal(database.getJob(result.jobId)!.attempts, 1);
  assert.equal(database.getCounts().articles, 1);
});

test("historical restoration refuses altered input, export manifests, and verification checkpoints", async (t) => {
  const { database, input } = await setup(t);
  for (const change of ["input", "manifest", "verification"] as const) {
    const result = await new KousatsuPipeline(database).run(input);
    await unlink(result.articlePath!);
    const metadata = await readFile(result.verificationPath!, "utf8");
    if (change === "input") {
      const raw = new DatabaseSync(database.filePath);
      try {
        raw.prepare("UPDATE jobs SET input_json=? WHERE id=?")
          .run(JSON.stringify({ ...input, outputDirectory: path.join(input.outputDirectory, "unexpected") }), result.jobId);
      } finally { raw.close(); }
    } else if (change === "manifest") {
      const manifest = database.getCheckpoint<Record<string, unknown>>(result.jobId, "export")!;
      database.saveCheckpoint(result.jobId, "export", { ...manifest, articlePath: path.join(input.outputDirectory, "unexpected.md") });
    } else {
      const report = database.getCheckpoint<Record<string, unknown>>(result.jobId, "verify")!;
      database.saveCheckpoint(result.jobId, "verify", { ...report, issues: [] });
    }
    await assert.rejects(new KousatsuPipeline(database).resume(result.jobId),
      change === "input" ? /CHECKPOINT_INPUT_MISMATCH/ : /CHECKPOINT_EXPORT_MISMATCH/);
    await assert.rejects(readFile(result.articlePath!), { code: "ENOENT" });
    assert.equal(await readFile(result.verificationPath!, "utf8"), metadata);
    assert.equal(database.getJob(result.jobId)!.attempts, 1);
  }
});

test("a new note retains evidence and all versioned source aliases after a merged source forks", async (t) => {
  const { database, input } = await setup(t);
  const sourceA = { id: "a", name: "Source A", feedUrl: "https://a.example.invalid/feed" };
  const sourceB = { id: "b", name: "Source B", feedUrl: "https://b.example.invalid/feed" };
  const urlA = "https://a.example.invalid/entry";
  const urlB = "https://b.example.invalid/copy";
  const feed = (url: string, summary = "A shared source claim.") =>
    `<rss version="2.0"><channel><title>Feed</title><item><guid>shared</guid><link>${url}</link><title>Shared research</title><description>${summary}</description></item></channel></rss>`;
  collectFeedXml(database, sourceA, feed(urlA));
  collectFeedXml(database, sourceB, feed(urlB));
  const original = database.listItemsForSource("a")[0];
  const [claim] = extractSourceClaims(database, [original]);
  assert.equal(database.listEvidence([claim.id])[0].locator, urlA);
  collectFeedXml(database, sourceA, feed(urlA, "A correction that diverges from the shared source claim."));
  await writeFile(input.fixturePath, feed(urlB));
  const result = await new KousatsuPipeline(database).run({ ...input, topic: "shared", source: sourceB });
  assert.equal(result.status, "succeeded");
  const article = await readFile(result.articlePath!, "utf8");
  assert.ok(article.includes(urlA));
  assert.ok(article.includes(urlB));
  assert.ok(article.includes(original.versionId!));
  assert.equal(JSON.parse(await readFile(result.verificationPath!, "utf8")).factCheckStatus, "unverified");
});

test("an existing different destination is never overwritten and same-day jobs get distinct names", async (t) => {
  const { database, input } = await setup(t);
  const jobId = database.createJob(input);
  await assert.rejects(new KousatsuPipeline(database, { failAfterStage: "export-markdown" }).resume(jobId), /Injected/);
  const manifest = database.getCheckpoint<{ verificationPath: string }>(jobId, "export")!;
  await writeFile(manifest.verificationPath, "private hand edited metadata");
  await assert.rejects(new KousatsuPipeline(database).resume(jobId), /ARTIFACT_CONFLICT/);
  assert.equal(await readFile(manifest.verificationPath, "utf8"), "private hand edited metadata");
  const a = await new KousatsuPipeline(database).run(input);
  const b = await new KousatsuPipeline(database).run(input);
  assert.notEqual(a.articlePath, b.articlePath);
  assert.ok(a.articlePath!.includes(a.jobId));
});

test("resume refuses changed fixture bytes and provider settings, retaining diagnostics", async (t) => {
  const { database, input } = await setup(t);
  const jobId = database.createJob(input);
  await assert.rejects(new KousatsuPipeline(database, { failAfterStage: "collect" }).resume(jobId), /Injected/);
  const original = await readFile(input.fixturePath, "utf8");
  await writeFile(input.fixturePath, original.replace("sample-001", "changed-entry"));
  await assert.rejects(new KousatsuPipeline(database).resume(jobId), /CHECKPOINT_INPUT_MISMATCH/);
  assert.match(database.getJob(jobId)!.lastError!, /CHECKPOINT_INPUT_MISMATCH/);
  assert.equal(database.getJob(jobId)!.attempts, 1);
  await writeFile(input.fixturePath, original);
  const changedProvider = { ...new DeterministicProvider(), id: "other-provider", model: "other-model", analyze: new DeterministicProvider().analyze };
  await assert.rejects(new KousatsuPipeline(database, { provider: changedProvider }).resume(jobId), /CHECKPOINT_INPUT_MISMATCH/);
  const settingsChanged = { id: "deterministic", model: "rules-v1", configurationFingerprint: "changed settings", analyze: new DeterministicProvider().analyze };
  await assert.rejects(new KousatsuPipeline(database, { provider: settingsChanged }).resume(jobId), /CHECKPOINT_INPUT_MISMATCH/);
  assert.equal((await new KousatsuPipeline(database).resume(jobId)).status, "succeeded");
});

test("a checkpoint write failure rolls back its analysis before retry", async (t) => {
  const { database, input } = await setup(t);
  const jobId = database.createJob(input);
  const save = database.saveCheckpoint.bind(database);
  database.saveCheckpoint = (id, stage, value) => {
    if (stage === "analyze") throw new Error("injected checkpoint write failure");
    return save(id, stage, value);
  };
  await assert.rejects(new KousatsuPipeline(database).resume(jobId), /checkpoint write failure/);
  const raw = new DatabaseSync(database.filePath, { readOnly: true });
  try { assert.equal(raw.prepare("SELECT count(*) AS count FROM analyses").get()?.count, 0); } finally { raw.close(); }
  assert.equal(database.getCheckpoint(jobId, "analyze"), null);
  database.saveCheckpoint = save;
  assert.equal((await new KousatsuPipeline(database).resume(jobId)).status, "succeeded");
});

test("a document revision while analysis is awaiting cannot commit a mixed-version result", async (t) => {
  const { database, connect, input } = await setup(t);
  const other = connect();
  const base = new DeterministicProvider();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const paused = new Promise<void>((resolve) => { release = resolve; });
  const jobId = database.createJob(input);
  const provider = {
    id: base.id, model: base.model, configurationFingerprint: base.configurationFingerprint,
    async analyze(context: Parameters<typeof base.analyze>[0]) {
      entered();
      await paused;
      return base.analyze(context);
    },
  };
  const running = new KousatsuPipeline(database, { provider }).resume(jobId);
  await started;
  try {
    const xml = await readFile(input.fixturePath, "utf8");
    collectFeedXml(other, input.source, xml.replace("AI検証の記録を保存する", "改訂後の記録"));
  } finally { release(); }
  await assert.rejects(running, /CHECKPOINT_VERSION_MISMATCH/);
  assert.equal(database.getCounts().articles, 0);
  assert.equal(database.getCheckpoint(jobId, "analyze"), null);
});

test("provider fingerprints distinguish endpoints and timeouts without sending an AI request", () => {
  const a = new OllamaProvider({ endpoint: "http://127.0.0.1:11434", model: "installed", timeoutMs: 100 });
  const b = new OllamaProvider({ endpoint: "http://127.0.0.1:11435", model: "installed", timeoutMs: 100 });
  const c = new OllamaProvider({ endpoint: "http://127.0.0.1:11434", model: "installed", timeoutMs: 200 });
  assert.notEqual(a.configurationFingerprint, b.configurationFingerprint);
  assert.notEqual(a.configurationFingerprint, c.configurationFingerprint);
});

test("resume refuses persisted job input changes and document revisions", async (t) => {
  const { database, input } = await setup(t);
  const jobId = database.createJob(input);
  await assert.rejects(new KousatsuPipeline(database, { failAfterStage: "collect" }).resume(jobId), /Injected/);
  const raw = new DatabaseSync(database.filePath);
  try {
    raw.prepare("UPDATE jobs SET input_json=? WHERE id=?").run(JSON.stringify({ ...input, topic: "changed topic" }), jobId);
  } finally { raw.close(); }
  await assert.rejects(new KousatsuPipeline(database).resume(jobId), /CHECKPOINT_INPUT_MISMATCH/);
  const restore = new DatabaseSync(database.filePath);
  try { restore.prepare("UPDATE jobs SET input_json=? WHERE id=?").run(JSON.stringify(input), jobId); } finally { restore.close(); }
  const xml = await readFile(input.fixturePath, "utf8");
  collectFeedXml(database, input.source, xml.replace("AI検証の記録を保存する", "改訂後の記録"));
  await assert.rejects(new KousatsuPipeline(database).resume(jobId), /CHECKPOINT_VERSION_MISMATCH/);
  assert.equal(database.getCounts().articles, 0);
});

test("another connection cannot run a leased job while heartbeat preserves ownership", async (t) => {
  // Exercise expiry and renewal with a controlled clock. A real 300 ms lease
  // makes this assertion depend on unrelated CPU/GPU load during the suite.
  t.mock.timers.enable({apis:['Date','setInterval'],now:Date.now()});
  const { database, input, connect } = await setup(t);
  const other = connect();
  const jobId = database.createJob(input);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const paused = new Promise<void>((resolve) => { release = resolve; });
  const worker = new KousatsuPipeline(database, {
    leaseMs: 300,
    afterStage: async (stage) => { if (stage === "analyze") { entered(); await paused; } },
  });
  const running = worker.resume(jobId);
  try {
    await started;
    for(let i=0;i<5;i++)t.mock.timers.tick(100); // Beyond the initial lease, renewing each interval.
    await assert.rejects(new KousatsuPipeline(other).resume(jobId), /already leased/);
    assert.equal(other.getJob(jobId)!.attempts, 1);
  } finally { release(); }
  assert.equal((await running).status, "succeeded");
});

test("legacy checkpoints without pinned identity stop safely rather than being silently continued", async (t) => {
  const { database, input } = await setup(t);
  const jobId = database.createJob(input);
  const attempt = database.startJobAttempt(jobId, "legacy", "legacy");
  database.saveCheckpoint(jobId, "collect", { itemIds: [] });
  database.finishJob(jobId, attempt, "retry_wait", null);
  await assert.rejects(new KousatsuPipeline(database).resume(jobId), /LEGACY_CHECKPOINT_UNPINNED/);
  assert.match(database.getJob(jobId)!.lastError!, /LEGACY_CHECKPOINT_UNPINNED/);
  assert.deepEqual(database.getCheckpoint(jobId, "collect"), { itemIds: [] });
});

test("a killed export worker is recovered after lease expiry without duplicating its partial note", { timeout: 15_000 }, async (t) => {
  const { database, input, directory, dbPath } = await setup(t);
  const jobId = database.createJob(input);
  const moduleUrl = (file: string) => pathToFileURL(path.resolve(file)).href;
  const childFile = path.join(directory, "interrupted-worker.ts");
  await writeFile(childFile, `
    import { KousatsuDatabase } from ${JSON.stringify(moduleUrl("src/lib/kousatsu/database.ts"))};
    import { KousatsuPipeline } from ${JSON.stringify(moduleUrl("src/lib/kousatsu/pipeline.ts"))};
    process.on('message', () => {});
    async function main() {
      const db = new KousatsuDatabase(${JSON.stringify(dbPath)});
      const pipeline = new KousatsuPipeline(db, { leaseMs: 30_000, afterStage: async stage => {
        if (stage === 'export-markdown') { process.send?.('partial-export'); await new Promise(() => {}); }
      }});
      await pipeline.resume(${JSON.stringify(jobId)});
    }
    main().catch(error => { console.error(error); process.exitCode = 1; process.disconnect?.(); });
  `, "utf8");
  const child = fork(childFile, [], { execArgv: ["--import", "tsx"], cwd: process.cwd(), silent: true });
  let childError = "";
  child.stderr?.on("data", (chunk) => { childError += String(chunk); });
  const ready = new Promise<void>((resolve, reject) => {
    child.once("message", (message) => message === "partial-export" ? resolve() : reject(new Error("unexpected worker message")));
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Worker exited early (${code}): ${childError}`)));
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  await ready;
  const manifest = database.getCheckpoint<{ articlePath: string; verificationPath: string }>(jobId, "export")!;
  const firstNote = await readFile(manifest.articlePath, "utf8");
  await assert.rejects(readFile(manifest.verificationPath), { code: "ENOENT" });
  const exited = once(child, "exit");
  child.kill();
  await exited;
  // Cold transpilation must not race a 200ms startup lease. After the committed
  // export boundary and actual process termination, advance only the parent's
  // Date clock past the persisted expiry. No lease row is edited to force success.
  await assert.rejects(new KousatsuPipeline(database).resume(jobId), /already leased/);
  const leaseReader = new DatabaseSync(dbPath, { readOnly: true });
  let expiresAt: string;
  try {
    expiresAt = (leaseReader.prepare("SELECT expires_at FROM job_leases WHERE job_id=?").get(jobId) as { expires_at: string }).expires_at;
  } finally { leaseReader.close(); }
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(expiresAt) + 1 });
  const resumed = await new KousatsuPipeline(database).resume(jobId);
  assert.equal(resumed.status, "succeeded");
  assert.equal(await readFile(manifest.articlePath, "utf8"), firstNote);
  assert.equal(JSON.parse(await readFile(resumed.verificationPath!, "utf8")).status, "passed");
  assert.equal(database.getCounts().articles, 1);
  assert.equal(database.getCounts().verifications, 1);
  assert.equal(database.getJob(jobId)!.attempts, 2);
  const raw = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const attempts = raw.prepare("SELECT status FROM job_attempts WHERE job_id=? ORDER BY attempt").all(jobId);
    assert.deepEqual(attempts.map((attempt) => attempt.status), ["failed", "succeeded"]);
  } finally { raw.close(); }
});
