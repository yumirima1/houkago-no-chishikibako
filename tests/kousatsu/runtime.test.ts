import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";

import { DeterministicProvider, type AnalysisContext, type KousatsuAiProvider } from "../../src/lib/kousatsu/ai";
import { collectFeedXml } from "../../src/lib/kousatsu/ingest";
import { extractSourceClaims } from "../../src/lib/kousatsu/knowledge";
import { parseResearchSources } from "../../src/lib/kousatsu/runtime-config";
import { ResearchRuntime } from "../../src/lib/kousatsu/runtime-service";
import type { ResearchSource } from "../../src/lib/kousatsu/runtime-types";
import type { PipelineInput } from "../../src/lib/kousatsu/types";

const fixturePath = path.join(process.cwd(), "tests/fixtures/kousatsu-sample.rss.xml");
const source = { id: "runtime-fixture", name: "Runtime fixture", feedUrl: "https://example.invalid/runtime-feed.xml" };
const configuredSource: ResearchSource = { ...source, topic: "AI検証", enabled: true, intervalMinutes: 15 };

function fixtureInput(extra: Partial<PipelineInput> = {}): PipelineInput {
  return { fixturePath, source, topic: "AI検証", ...extra };
}

async function sandbox(t: TestContext, provider: KousatsuAiProvider = new DeterministicProvider()) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kousatsu-runtime-regression-"));
  const databasePath = path.join(directory, "runtime.sqlite");
  const outputDirectory = path.join(directory, "articles");
  const opened = new Set<ResearchRuntime>();
  t.after(async () => {
    for (const runtime of opened) runtime.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    directory, databasePath, outputDirectory,
    async open(sources: ResearchSource[] = []) {
      const runtime = await ResearchRuntime.open({ databasePath, outputDirectory, sources, provider });
      opened.add(runtime);
      return runtime;
    },
    close(runtime: ResearchRuntime) { runtime.close(); opened.delete(runtime); },
  };
}

function inspect<T>(file: string, operation: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return operation(db); } finally { db.close(); }
}

function mutate(file: string, sql: string) {
  const db = new DatabaseSync(file);
  try { db.exec(sql); } finally { db.close(); }
}

async function completed(runtime: ResearchRuntime) {
  const tick = await runtime.tick({ schedule: false });
  assert.equal(tick.status, "completed", JSON.stringify(tick));
  if (tick.status !== "completed") throw new Error("expected a completed fixture job");
  assert.equal(tick.result.status, "succeeded");
  return tick.result;
}

test("a durable queue survives restart and exposes actual Markdown, provenance and unverified memory", async (t) => {
  const fixture = await sandbox(t);
  let runtime = await fixture.open();
  const jobId = runtime.enqueueInput(fixtureInput());
  assert.equal(runtime.snapshot().jobs[0].status, "pending");
  fixture.close(runtime);
  runtime = await fixture.open();
  const result = await completed(runtime);
  assert.equal(result.jobId, jobId);
  assert.ok(result.articleId);
  assert.ok(result.articlePath);
  const note = await runtime.note(result.articleId!);
  assert.equal(note?.artifact, "matching");
  assert.equal(note?.markdown, await readFile(result.articlePath!, "utf8"));
  assert.equal(note?.verification?.scope, "structure-and-references");
  assert.equal(note?.verification?.factCheckStatus, "unverified");
  assert.equal(await runtime.note("unknown-note"), null);
  const snapshot = runtime.snapshot();
  assert.equal(snapshot.jobs[0].queue, "done");
  assert.equal(snapshot.memories.length, 2);
  assert.equal(snapshot.interests[0].observations, 1);
  assert.ok(snapshot.memories.every((memory) => memory.references.length > 0 &&
    memory.references.every((reference) => reference.versionId && reference.claimIds.length > 0)));
  assert.match(snapshot.memories.find((memory) => memory.kind === "interpretation")!.reason, /事実確認は未実施/);
  assert.deepEqual(await runtime.tick({ schedule: false }), { status: "idle" });
  assert.deepEqual(runtime.database.listJobs().map((job) => job.id), [jobId]);
});

test("a failure after memory writes rolls back events and restart repairs the completed job once", async (t) => {
  const fixture = await sandbox(t);
  let runtime = await fixture.open();
  const jobId = runtime.enqueueInput(fixtureInput());
  mutate(fixture.databasePath, `CREATE TRIGGER fail_memory_commit BEFORE INSERT ON research_ingested_jobs
    BEGIN SELECT RAISE(ABORT,'MEMORY_WRITE_INTERRUPTED'); END;`);
  const failed = await runtime.tick({ schedule: false });
  assert.equal(failed.status, "blocked");
  assert.equal(runtime.database.getJob(jobId)?.status, "succeeded");
  assert.equal(runtime.snapshot().memories.length, 0, "all partial memory event inserts are rolled back");
  assert.equal(runtime.snapshot().notes.length, 1, "canonical completed article is retained");
  fixture.close(runtime);
  mutate(fixture.databasePath, "DROP TRIGGER fail_memory_commit;");
  runtime = await fixture.open();
  runtime.store.retry(jobId);
  await completed(runtime);
  const stable = runtime.snapshot().memories;
  assert.equal(stable.length, 2);
  assert.equal(runtime.database.getJob(jobId)?.attempts, 1, "memory recovery does not rerun completed analysis");
  runtime.store.retry(jobId);
  await completed(runtime);
  assert.deepEqual(runtime.snapshot().memories, stable, "repeated completion preserves event IDs, timestamps and contents");
  assert.equal(inspect(fixture.databasePath, (db) => db.prepare("SELECT count(*) AS count FROM research_ingested_jobs").get()?.count), 1);
});

test("two runtime workers exclude concurrent execution and release their lease after completion", async (t) => {
  let notifyStarted!: () => void;
  let releaseAnalysis!: () => void;
  const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
  const proceed = new Promise<void>((resolve) => { releaseAnalysis = resolve; });
  let analyses = 0;
  const deterministic = new DeterministicProvider();
  const provider: KousatsuAiProvider = {
    id: "controlled", model: "fixture", configurationFingerprint: "controlled-v1",
    async analyze(context) {
      analyses += 1;
      notifyStarted();
      await proceed;
      return deterministic.analyze(context);
    },
  };
  const fixture = await sandbox(t, provider);
  const first = await fixture.open();
  const second = await fixture.open();
  first.enqueueInput(fixtureInput());
  const running = completed(first);
  try {
    await started;
    assert.deepEqual(await second.tick({ schedule: false }), { status: "busy" });
    assert.equal(second.snapshot().worker.active, true);
    assert.equal(second.snapshot().memories.length, 0);
  } finally { releaseAnalysis(); }
  await running;
  assert.equal(analyses, 1);
  assert.equal(second.snapshot().worker.active, false);
  assert.deepEqual(await second.tick({ schedule: false }), { status: "idle" });
  assert.equal(second.snapshot().notes.length, 1);
});

test("expired worker ownership cannot write queue decisions or release the replacement owner's lease", async (t) => {
  const fixture = await sandbox(t);
  const first = await fixture.open();
  const second = await fixture.open();
  const jobId = first.enqueueInput(fixtureInput());
  const now = Date.now();
  const oldToken = first.store.acquireWorker(now, 500)!;
  assert.ok(oldToken);
  assert.equal(second.store.acquireWorker(now + 100, 10_000), null);
  const replacement = second.store.acquireWorker(now + 501, 10_000)!;
  assert.ok(replacement);
  assert.throws(() => first.store.renewWorker(oldToken, now + 502), /RUNTIME_LEASE_LOST/);
  assert.throws(() => first.store.defer(jobId, "stale write", true, oldToken, now + 502), /RUNTIME_LEASE_LOST/);
  first.store.releaseWorker(oldToken);
  assert.equal(second.store.acquireWorker(now + 502), null, "stale release cannot clear the replacement token");
  assert.equal(first.snapshot().jobs[0].queue, "ready");
  second.store.releaseWorker(replacement);
  await completed(first);
});

test("publication failure retains the DB draft and retry publishes it without duplicate analysis or memory", async (t) => {
  let analyses = 0;
  const deterministic = new DeterministicProvider();
  const provider: KousatsuAiProvider = {
    id: "counted", model: "fixture", configurationFingerprint: "counted-v1",
    analyze(context) { analyses += 1; return deterministic.analyze(context); },
  };
  const fixture = await sandbox(t, provider);
  const runtime = await fixture.open();
  await writeFile(fixture.outputDirectory, "Existing file blocking directory creation", { flag: "wx" });
  const jobId = runtime.enqueueInput(fixtureInput());
  const failed = await runtime.tick({ schedule: false });
  assert.equal(failed.status, "retry_wait");
  assert.equal(runtime.snapshot().notes.length, 1);
  assert.equal(runtime.snapshot().notes[0].published, false);
  assert.equal(runtime.snapshot().memories.length, 0);
  assert.equal(await readFile(fixture.outputDirectory, "utf8"), "Existing file blocking directory creation");
  const articleId = runtime.snapshot().notes[0].id;
  // Only remove the fixture file created above, inside this test's new directory.
  await unlink(fixture.outputDirectory);
  runtime.store.retry(jobId);
  const recovered = await completed(runtime);
  assert.equal(recovered.articleId, articleId);
  assert.equal(analyses, 1);
  assert.equal(runtime.snapshot().notes.length, 1);
  assert.equal(runtime.snapshot().memories.length, 2);
  assert.equal((await runtime.note(articleId))?.artifact, "matching");
});

test("a handwritten Markdown conflict remains untouched and is reported separately from the canonical note", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await fixture.open();
  const jobId = runtime.enqueueInput(fixtureInput());
  const result = await completed(runtime);
  const canonical = (await runtime.note(result.articleId!))!.markdown;
  const memories = runtime.snapshot().memories;
  const custom = `${canonical}\nUser's handwritten addition\n`;
  await writeFile(result.articlePath!, custom);
  assert.equal((await runtime.note(result.articleId!))?.artifact, "conflict");
  runtime.store.retry(jobId);
  const retry = await runtime.tick({ schedule: false });
  assert.equal(retry.status, "blocked");
  assert.ok("error" in retry && /ARTIFACT_CONFLICT/.test(retry.error));
  assert.equal(await readFile(result.articlePath!, "utf8"), custom);
  assert.equal((await runtime.note(result.articleId!))?.markdown, canonical);
  assert.deepEqual(runtime.snapshot().memories, memories);
  assert.equal(runtime.database.getJob(jobId)?.status, "succeeded");
});

test("multiple notes from the same day and topic have distinct files and preserve their previous memory", async (t) => {
  const contexts: AnalysisContext[] = [];
  const deterministic = new DeterministicProvider();
  const provider: KousatsuAiProvider = {
    id: "observed", model: "fixture", configurationFingerprint: "observed-v1",
    async analyze(context) { contexts.push(structuredClone(context)); return deterministic.analyze(context); },
  };
  const fixture = await sandbox(t, provider);
  const runtime = await fixture.open();
  runtime.enqueueInput(fixtureInput());
  const first = await completed(runtime);
  const previousMarkdown = await readFile(first.articlePath!, "utf8");
  const firstMemories = runtime.snapshot().memories;
  runtime.enqueueInput(fixtureInput());
  const second = await completed(runtime);
  assert.notEqual(second.articleId, first.articleId);
  assert.notEqual(second.articlePath, first.articlePath);
  assert.equal(await readFile(first.articlePath!, "utf8"), previousMarkdown);
  assert.equal(contexts[0].memories?.length, 0);
  assert.deepEqual(contexts[1].memories, firstMemories);
  assert.match((await runtime.note(second.articleId!))!.markdown, /過去の解釈・仮説/);
  assert.equal(runtime.snapshot().memories.length, 4);
  assert.ok(firstMemories.every((old) => runtime.snapshot().memories.some((current) => current.id === old.id && current.text === old.text)));
  assert.equal(runtime.snapshot().interests[0].observations, 2);
  assert.equal((await readdir(fixture.outputDirectory)).filter((name) => name.endsWith(".md")).length, 2);
});

test("completed historical notes can be restored after their source advances without duplicating memory", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await fixture.open();
  const jobId = runtime.enqueueInput(fixtureInput());
  const first = await completed(runtime);
  const canonical = await readFile(first.articlePath!, "utf8");
  const memories = runtime.snapshot().memories;
  const oldVersion = runtime.database.listItemsForSource(source.id).find((item) => item.canonicalUrl.includes("ai-verification-records"))!.versionId;
  collectFeedXml(runtime.database, source, `<rss version="2.0"><channel><title>Updated</title><item>
    <guid>sample-001</guid><link>https://example.invalid/articles/ai-verification-records</link>
    <title>AI検証の記録を保存する</title><description>改訂された別の本文</description></item></channel></rss>`);
  assert.notEqual(runtime.database.listItemsForSource(source.id).find((item) => item.canonicalUrl.includes("ai-verification-records"))!.versionId, oldVersion);
  await unlink(first.articlePath!);
  assert.equal((await runtime.note(first.articleId!))?.artifact, "missing");
  runtime.store.retry(jobId);
  await completed(runtime);
  assert.equal(await readFile(first.articlePath!, "utf8"), canonical);
  assert.deepEqual(runtime.snapshot().memories, memories);
  assert.equal(runtime.database.getJob(jobId)?.attempts, 1);
});

test("older relevant memory remains retrievable after more than 200 unrelated recent events", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await fixture.open();
  runtime.enqueueInput(fixtureInput());
  await completed(runtime);
  const originalMemories = runtime.store.retrieveMemories("AI検証");
  assert.equal(originalMemories.length, 2);
  const seed = new DatabaseSync(fixture.databasePath);
  try {
    seed.exec("BEGIN IMMEDIATE;");
    const insertNoise = seed.prepare(`INSERT INTO research_memory_events(
      id,job_id,article_id,topic,kind,text,reason,references_json,verification_status,fact_check_status,created_at)
      SELECT ?,job_id,article_id,'Unrelated astronomy','interpretation','Different subject without matching terms',
        reason,references_json,verification_status,fact_check_status,?
      FROM research_memory_events WHERE id=?`);
    for (let index = 0; index < 220; index += 1) {
      insertNoise.run(`synthetic-unrelated-${index}`, new Date(Date.now() + (index + 1) * 1_000).toISOString(), originalMemories[0].id);
    }
    seed.exec("COMMIT;");
  } finally { seed.close(); }
  assert.equal(runtime.snapshot().memories.some((memory) => memory.id === originalMemories[0].id), false,
    "the original event is genuinely outside the recent display window");
  assert.deepEqual(runtime.store.retrieveMemories("AI検証"), originalMemories,
    "search consults the full stored history before limiting results");
});

test("a structurally failed note remains visible in history but is excluded from the next analysis memory", async (t) => {
  const contexts: AnalysisContext[] = [];
  const deterministic = new DeterministicProvider();
  const provider: KousatsuAiProvider = {
    id: "failed-structure", model: "fixture", configurationFingerprint: "failed-structure-v1",
    async analyze(context) {
      contexts.push(structuredClone(context));
      return deterministic.analyze(context);
    },
  };
  const fixture = await sandbox(t, provider);
  const runtime = await fixture.open();
  collectFeedXml(runtime.database, source, await readFile(fixturePath, "utf8"));
  const [item] = runtime.database.listItemsForSource(source.id).filter((record) => record.title.includes("AI検証"));
  const [claim] = extractSourceClaims(runtime.database, [item]);
  // Simulate an imported extra evidence association with an untracked locator.
  // The runtime must retain it for review without reusing its failed analysis.
  runtime.database.upsertEvidence({ claimId: claim.id, itemId: item.id, versionId: item.versionId,
    excerpt: item.title, locator: "https://unknown.example.invalid/untracked", stance: "supports" });
  runtime.enqueueInput(fixtureInput());
  const failed = await runtime.tick({ schedule: false });
  assert.equal(failed.status, "completed");
  assert.ok("result" in failed && failed.result.status === "needs_review");
  assert.equal(runtime.snapshot().notes[0].status, "needs_review");
  assert.equal(runtime.snapshot().memories.length, 2);
  assert.ok(runtime.snapshot().memories.every((memory) => memory.verificationStatus === "failed"));
  assert.deepEqual(runtime.store.retrieveMemories("AI検証"), []);
  runtime.enqueueInput(fixtureInput());
  const second = await runtime.tick({ schedule: false });
  assert.equal(second.status, "completed");
  assert.ok("result" in second && second.result.status === "needs_review");
  assert.deepEqual(contexts[1].memories, [], "failed prior interpretation is not presented as a usable memory");
  assert.equal(runtime.snapshot().memories.length, 4, "the failed historical events were preserved");
});

test("contradicted historical memory is preserved and excluded from the default retrieval context", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await fixture.open();
  runtime.enqueueInput(fixtureInput());
  await completed(runtime);
  const existing = runtime.snapshot().memories;
  mutate(fixture.databasePath, "UPDATE research_memory_events SET fact_check_status='contradicted';");
  assert.equal(runtime.snapshot().memories.length, existing.length);
  assert.ok(runtime.snapshot().memories.every((memory) => memory.factCheckStatus === "contradicted"));
  assert.deepEqual(runtime.store.retrieveMemories("AI検証"), []);
});

test("retry uses the enqueued historical context even if new memories arrive after an analysis failure", async (t) => {
  const contexts: AnalysisContext[] = [];
  const deterministic = new DeterministicProvider();
  const provider: KousatsuAiProvider = {
    id: "memory-pin", model: "fixture", configurationFingerprint: "memory-pin-v1",
    async analyze(context) {
      contexts.push(structuredClone(context));
      if (contexts.length === 2) throw new Error("Temporary local model interruption");
      return deterministic.analyze(context);
    },
  };
  const fixture = await sandbox(t, provider);
  const runtime = await fixture.open();
  runtime.enqueueInput(fixtureInput());
  await completed(runtime);
  const pinned = runtime.store.retrieveMemories("AI検証");
  const jobId = runtime.enqueueInput(fixtureInput());
  const failure = await runtime.tick({ schedule: false });
  assert.equal(failure.status, "retry_wait");
  assert.equal(runtime.database.getJob(jobId)?.attempts, 1);
  const seed = new DatabaseSync(fixture.databasePath);
  try {
    seed.prepare(`INSERT INTO research_memory_events(
      id,job_id,article_id,topic,kind,text,reason,references_json,verification_status,fact_check_status,created_at)
      SELECT 'synthetic-late-observation',job_id,article_id,topic,kind,'Later interpretation',reason,
        references_json,verification_status,fact_check_status,? FROM research_memory_events WHERE id=?`)
      .run(new Date(Date.now() + 1_000).toISOString(), pinned[0].id);
  } finally { seed.close(); }
  assert.equal(runtime.store.retrieveMemories("AI検証").length, 3);
  runtime.store.retry(jobId);
  await completed(runtime);
  assert.deepEqual(contexts[1].memories, pinned);
  assert.deepEqual(contexts[2].memories, pinned, "retry never silently swaps the job's historical inputs");
  assert.equal(runtime.database.getJob(jobId)?.attempts, 2);
});

test("changing provider settings between retries blocks the queued job before another analysis attempt", async (t) => {
  let fingerprint = "configuration-v1";
  let calls = 0;
  const provider: KousatsuAiProvider = {
    id: "changing-provider", model: "fixture",
    get configurationFingerprint() { return fingerprint; },
    async analyze() { calls += 1; throw new Error("Temporary local model interruption"); },
  };
  const fixture = await sandbox(t, provider);
  const runtime = await fixture.open();
  const jobId = runtime.enqueueInput(fixtureInput());
  assert.equal((await runtime.tick({ schedule: false })).status, "retry_wait");
  fingerprint = "configuration-v2";
  runtime.store.retry(jobId);
  const changed = await runtime.tick({ schedule: false });
  assert.equal(changed.status, "blocked");
  assert.ok("error" in changed && /CHECKPOINT_INPUT_MISMATCH/.test(changed.error));
  assert.equal(calls, 1);
  assert.equal(runtime.database.getJob(jobId)?.attempts, 1);
  assert.equal(runtime.snapshot().notes.length, 0);
  assert.equal(runtime.snapshot().memories.length, 0);
});

test("schedules enqueue only at their due time and keep blocked or unfinished work visible", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await fixture.open([configuredSource]);
  const now = Date.now();
  const token = runtime.store.acquireWorker(now, 3_000_000)!;
  const schedule = (at: number) => runtime.store.schedule([configuredSource], fixture.outputDirectory, token, at);
  const [first] = schedule(now);
  assert.ok(first);
  assert.deepEqual(schedule(now), []);
  assert.deepEqual(schedule(now + 15 * 60_000), [], "pending job prevents additional collection");
  runtime.store.defer(first, "SOURCE_IDENTITY_MISMATCH", true, token, now);
  assert.deepEqual(schedule(now + 15 * 60_000), [], "blocked job prevents an endless failure queue");
  assert.equal(runtime.snapshot().jobs[0].queue, "blocked");
  assert.deepEqual(runtime.database.getJob(first)?.input.source.id, configuredSource.id);
  assert.equal(runtime.database.getJob(first)?.input.fixturePath, undefined, "scheduler does not silently substitute fixture input");
  runtime.store.releaseWorker(token);
});

test("a completed source's schedule advances once and does not enqueue before the persisted due time", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await fixture.open([configuredSource]);
  const now = Date.now();
  const token = runtime.store.acquireWorker(now, 3_000_000)!;
  const [jobId] = runtime.store.schedule([configuredSource], fixture.outputDirectory, token, now);
  // This scheduling test does not fetch the network: emulate an already handled
  // queue row, then verify only the scheduler's durable timing and uniqueness.
  mutate(fixture.databasePath, `UPDATE research_queue SET decision='done' WHERE job_id='${jobId}';`);
  assert.deepEqual(runtime.store.schedule([configuredSource], fixture.outputDirectory, token, now + 15 * 60_000 - 1), []);
  const [second] = runtime.store.schedule([configuredSource], fixture.outputDirectory, token, now + 15 * 60_000);
  assert.ok(second);
  assert.notEqual(second, jobId);
  assert.deepEqual(runtime.store.schedule([configuredSource], fixture.outputDirectory, token, now + 15 * 60_000), []);
  assert.equal(runtime.database.listJobs().length, 2);
  runtime.store.releaseWorker(token);
});

test("disabled and unknown sources cannot be submitted through the normal runtime entry point", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await fixture.open([{ ...configuredSource, enabled: false }]);
  assert.throws(() => runtime.enqueue(configuredSource.id), /SOURCE_NOT_ENABLED/);
  assert.throws(() => runtime.enqueue("missing"), /SOURCE_NOT_ENABLED/);
  assert.equal(runtime.snapshot().jobs.length, 0);
  const enabled = await fixture.open([configuredSource]);
  assert.throws(() => enabled.enqueue(configuredSource.id, " "), /TOPIC_INVALID/);
  assert.throws(() => enabled.enqueue(configuredSource.id, "x".repeat(201)), /TOPIC_INVALID/);
  assert.equal(enabled.snapshot().jobs.length, 0);
});

for (const [change, configuration] of [
  ["disabled", [{ ...configuredSource, enabled: false }]],
  ["removed", []],
  ["different URL", [{ ...configuredSource, feedUrl: "https://example.invalid/changed-feed.xml" }]],
  ["different interval", [{ ...configuredSource, intervalMinutes: 30 }]],
] as Array<[string, ResearchSource[]]>) {
  test(`a ${change} source blocks its queued job before fetching or starting an attempt`, async (t) => {
    const fixture = await sandbox(t);
    let runtime = await fixture.open([configuredSource]);
    const jobId = runtime.enqueue(configuredSource.id);
    const originalInput = runtime.database.getJob(jobId)!.input;
    fixture.close(runtime);
    runtime = await fixture.open(configuration);
    const result = await runtime.tick({ schedule: false });
    assert.equal(result.status, "blocked");
    assert.ok("error" in result && /CHECKPOINT_SOURCE_CONFIG_MISMATCH/.test(result.error));
    const job = runtime.database.getJob(jobId)!;
    assert.equal(job.attempts, 0);
    assert.equal(job.status, "pending");
    assert.deepEqual(job.input, originalInput);
    assert.equal(runtime.database.getCounts().fetch_runs, 0);
    assert.equal(runtime.snapshot().jobs[0].queue, "blocked");
  });
}

test("cancelling pending work retains completed notes, memory, source records and the cancelled job itself", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await fixture.open();
  runtime.enqueueInput(fixtureInput());
  const completedNote = await completed(runtime);
  const before = runtime.snapshot();
  const markdown = await readFile(completedNote.articlePath!, "utf8");
  const counts = runtime.database.getCounts();
  const pendingId = runtime.enqueueInput(fixtureInput());
  runtime.store.cancel(pendingId);
  assert.equal(runtime.database.getJob(pendingId)?.status, "cancelled");
  assert.equal(runtime.database.getJob(pendingId)?.attempts, 0);
  assert.equal(runtime.snapshot().jobs.find((job) => job.id === pendingId)?.queue, "done");
  assert.deepEqual(runtime.snapshot().notes, before.notes);
  assert.deepEqual(runtime.snapshot().memories, before.memories);
  assert.equal(await readFile(completedNote.articlePath!, "utf8"), markdown);
  assert.deepEqual(runtime.database.getCounts(), { ...counts, jobs: counts.jobs + 1 });
  assert.deepEqual(await runtime.tick({ schedule: false }), { status: "idle" });
  assert.throws(() => runtime.store.retry(pendingId), /JOB_NOT_RETRYABLE/);
});

test("cancellation rejects a job with an active pipeline lease or running attempt", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await fixture.open();
  const jobId = runtime.enqueueInput(fixtureInput());
  const lease = runtime.database.acquireJobLease(jobId);
  assert.throws(() => runtime.store.cancel(jobId), /JOB_NOT_CANCELLABLE/);
  assert.equal(runtime.database.getJob(jobId)?.status, "pending");
  runtime.database.releaseJobLease(jobId, lease.token);
  runtime.database.startJobAttempt(jobId, "test", "fixture");
  assert.throws(() => runtime.store.cancel(jobId), /JOB_NOT_CANCELLABLE/);
  assert.equal(runtime.database.getJob(jobId)?.status, "running");
  assert.equal(runtime.snapshot().jobs[0].queue, "ready");
});

test("cancelling blocked collection lets the scheduler enqueue a new due job while preserving the old diagnostic", async (t) => {
  const fixture = await sandbox(t);
  const runtime = await fixture.open([configuredSource]);
  const now = Date.now();
  const token = runtime.store.acquireWorker(now, 3_000_000)!;
  const [oldJob] = runtime.store.schedule([configuredSource], fixture.outputDirectory, token, now);
  runtime.store.defer(oldJob, "Original blocked-source diagnostic", true, token, now);
  const due = now + 15 * 60_000;
  assert.deepEqual(runtime.store.schedule([configuredSource], fixture.outputDirectory, token, due), []);
  runtime.store.cancel(oldJob);
  const [newJob] = runtime.store.schedule([configuredSource], fixture.outputDirectory, token, due);
  assert.ok(newJob);
  assert.notEqual(newJob, oldJob);
  assert.equal(runtime.database.getJob(oldJob)?.status, "cancelled");
  assert.equal(runtime.snapshot().jobs.find((job) => job.id === oldJob)?.error, "Original blocked-source diagnostic");
  assert.equal(runtime.database.listJobs().length, 2);
  assert.equal(runtime.database.getJob(newJob)?.attempts, 0);
  runtime.store.releaseWorker(token);
});

test("disabled source configuration still permits restoring an immutable completed export", async (t) => {
  const fixture = await sandbox(t);
  let runtime = await fixture.open([configuredSource]);
  const jobId = runtime.store.enqueue(fixtureInput({ outputDirectory: fixture.outputDirectory }), Date.now(), configuredSource);
  const result = await completed(runtime);
  const original = await readFile(result.articlePath!, "utf8");
  const memories = runtime.snapshot().memories;
  await unlink(result.articlePath!);
  fixture.close(runtime);
  runtime = await fixture.open([{ ...configuredSource, enabled: false }]);
  runtime.store.retry(jobId);
  await completed(runtime);
  assert.equal(await readFile(result.articlePath!, "utf8"), original);
  assert.deepEqual(runtime.snapshot().memories, memories);
  assert.equal(runtime.database.getJob(jobId)?.attempts, 1);
});

test("source configuration defaults to disabled metadata collection and rejects ambiguous or unsafe entries", () => {
  const minimal = { id: "source", name: "Source", feedUrl: "https://example.invalid/feed", topic: "AI" };
  const [parsed] = parseResearchSources({ sources: [minimal] });
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.contentPolicy, "metadata-only");
  assert.equal(parsed.intervalMinutes, 60);
  for (const entries of [
    [minimal, minimal],
    [{ ...minimal, feedUrl: "javascript:alert(1)" }],
    [{ ...minimal, feedUrl: "https://user:password@example.invalid/feed" }],
    [{ ...minimal, intervalMinutes: 1 }],
    [{ ...minimal, enabled: "true" }],
    [{ ...minimal, contentPolicy: "full-site-scrape" }],
  ]) assert.throws(() => parseResearchSources({ sources: entries }), /SOURCE_CONFIG_INVALID/);
});
