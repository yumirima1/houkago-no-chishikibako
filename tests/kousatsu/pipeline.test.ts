import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DeterministicProvider } from "../../src/lib/kousatsu/ai";
import { KousatsuDatabase } from "../../src/lib/kousatsu/database";
import { KousatsuPipeline } from "../../src/lib/kousatsu/pipeline";
import { verifyArticle } from "../../src/lib/kousatsu/verify";

const fixturePath = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "kousatsu-sample.rss.xml",
);

function input(outputDirectory: string) {
  return {
    fixturePath,
    maxAttempts: 3,
    outputDirectory,
    source: {
      feedUrl: "https://example.invalid/feed.xml",
      id: "fixture",
      name: "Fixture",
    },
    topic: "AI検証",
  };
}

test("the complete pipeline exports a verified Markdown draft", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kousatsu-pipeline-"));
  const database = new KousatsuDatabase(path.join(directory, "pipeline.sqlite"));
  t.after(async () => {
    database.close();
    await rm(directory, { force: true, recursive: true });
  });
  const pipeline = new KousatsuPipeline(database, {
    provider: new DeterministicProvider(),
  });

  const first = await pipeline.run(input(path.join(directory, "articles")));
  assert.equal(first.status, "succeeded");
  assert.equal(first.collectedCount, 3);
  assert.equal(first.newItemCount, 3);
  assert.ok(first.articlePath);
  assert.ok(first.verificationPath);
  const markdown = await readFile(first.articlePath!, "utf8");
  const verification = JSON.parse(
    await readFile(first.verificationPath!, "utf8"),
  ) as { status: string };
  assert.match(markdown, /## 出典の主張（独立確認前）/);
  assert.match(markdown, /## 分析・考察/);
  assert.match(markdown, /https:\/\/example\.invalid\/articles\//);
  assert.doesNotMatch(markdown, /静かな読書時間/);
  assert.equal(verification.status, "passed");

  const second = await pipeline.run(input(path.join(directory, "articles")));
  assert.equal(second.status, "succeeded");
  assert.equal(second.newItemCount, 0);
  assert.equal(database.getCounts().items, 3);
});

test("a failed job resumes from its durable checkpoint", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kousatsu-resume-"));
  const database = new KousatsuDatabase(path.join(directory, "resume.sqlite"));
  t.after(async () => {
    database.close();
    await rm(directory, { force: true, recursive: true });
  });
  const explicitInput = input(path.join(directory, "resumed-articles"));
  const jobId = database.createJob(explicitInput);
  const failExplicit = new KousatsuPipeline(database, {
    failAfterStage: "collect",
    provider: new DeterministicProvider(),
  });
  await assert.rejects(() => failExplicit.resume(jobId), /Injected failure/);
  assert.equal(database.getJob(jobId)?.status, "retry_wait");

  const resumed = await new KousatsuPipeline(database, {
    provider: new DeterministicProvider(),
  }).resume(jobId);
  assert.equal(resumed.status, "succeeded");
  assert.equal(database.getJob(jobId)?.attempts, 2);
});

test("verification fails when a sourced claim has no evidence", () => {
  const report = verifyArticle({
    article: {
      assertions: [
        { claimId: "claim-1", classification: "source_claim", text: "主張" },
      ],
      markdown: "## 分析・考察\n\n## 不明点・限界\n",
      title: "test",
      usedClaimIds: ["claim-1"],
    },
    claims: [
      {
        classification: "source_claim",
        confidence: 0.5,
        createdAt: new Date(0).toISOString(),
        id: "claim-1",
        itemId: "item-1",
        reason: "test",
        text: "主張",
      },
    ],
    evidence: [],
    items: [],
  });
  assert.equal(report.status, "failed");
  assert.ok(report.issues.some((issue) => issue.code === "MISSING_EVIDENCE"));
});
