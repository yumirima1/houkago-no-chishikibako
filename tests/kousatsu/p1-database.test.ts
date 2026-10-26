import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { KousatsuDatabase } from "../../src/lib/kousatsu/database";
import { collectFeedXml } from "../../src/lib/kousatsu/ingest";
import { extractSourceClaims } from "../../src/lib/kousatsu/knowledge";

const source = (id: string) => ({ id, name: id, feedUrl: `https://example.invalid/${id}.xml` });
const feed = (url: string, summary = "original summary", externalId = "entry-1") =>
  `<rss version="2.0"><channel><title>Feed</title><item><guid>${externalId}</guid><link>${url}</link><title>Versioned article</title><description>${summary}</description></item></channel></rss>`;

async function temporaryDatabase(t: { after: (cleanup: () => Promise<void>) => void }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kousatsu-p1-db-"));
  const database = new KousatsuDatabase(path.join(directory, "test.sqlite"));
  t.after(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });
  return { database, directory };
}

test("same-content collection preserves both source URLs and is association-idempotent", async (t) => {
  const { database } = await temporaryDatabase(t);
  const urlA = "https://a.example.invalid/article?utm_source=feed";
  const urlB = "https://b.example.invalid/syndicated";
  const a = collectFeedXml(database, source("a"), feed(urlA, undefined, "a-entry"));
  const b = collectFeedXml(database, source("b"), feed(urlB, undefined, "b-entry"));
  collectFeedXml(database, source("b"), feed(urlB, undefined, "b-entry"));
  assert.deepEqual(a.itemIds, b.itemIds);
  assert.equal(database.getCounts().items, 1);
  const [itemA] = database.listItemsForSource("a");
  const [itemB] = database.listItemsForSource("b");
  assert.equal(itemA.url, urlA);
  assert.equal(itemB.url, urlB);
  assert.equal(itemA.externalId, "a-entry");
  assert.equal(itemB.externalId, "b-entry");
  assert.equal(itemA.versionId, itemB.versionId);
  assert.equal(database.listItemSources(itemA.id).length, 2);
  assert.equal(database.listItemSources(itemA.id, { includeHistorical: true }).length, 2);
  assert.equal(database.listItemVersions(itemA.id).length, 1);
});

test("updated articles retain immutable old snapshots and exclude old claims from current retrieval", async (t) => {
  const { database } = await temporaryDatabase(t);
  const url = "https://example.invalid/article";
  collectFeedXml(database, source("a"), feed(url));
  const [oldItem] = database.listItemsForSource("a");
  const [oldClaim] = extractSourceClaims(database, [oldItem]);
  const [oldEvidence] = database.listEvidence([oldClaim.id]);
  collectFeedXml(database, source("a"), feed(url, "updated summary"));
  const [newItem] = database.listItemsForSource("a");
  assert.equal(newItem.id, oldItem.id);
  assert.notEqual(newItem.versionId, oldItem.versionId);
  assert.notEqual(newItem.contentHash, oldItem.contentHash);
  assert.deepEqual(database.listClaims([newItem.id]), []);
  const [newClaim] = extractSourceClaims(database, [newItem]);
  assert.notEqual(newClaim.id, oldClaim.id);
  assert.equal(newClaim.versionId, newItem.versionId);
  assert.deepEqual(database.listClaims([newItem.id]).map((claim) => claim.id), [newClaim.id]);
  assert.equal(database.listClaims([newItem.id], { includeHistorical: true }).length, 2);
  assert.equal(database.getItemVersion(oldItem.versionId!)?.summary, "original summary");
  assert.equal(database.getItemVersion(oldItem.versionId!)?.contentHash, oldItem.contentHash);
  assert.equal(database.listEvidence([oldClaim.id])[0].excerpt, oldEvidence.excerpt);
  assert.equal(database.listEvidence([oldClaim.id])[0].versionId, oldItem.versionId);
  assert.equal(database.listItemSources(newItem.id, { includeHistorical: true }).length, 2);
  collectFeedXml(database, source("a"), feed(url, "updated summary"));
  assert.equal(database.listItemVersions(newItem.id).length, 2);
});

for (const sharedUrl of [false, true]) {
  test(`a diverging merged source forks without changing its peer (shared URL: ${sharedUrl})`, async (t) => {
    const { database } = await temporaryDatabase(t);
    const urlA = "https://example.invalid/article";
    const urlB = sharedUrl ? urlA : "https://other.example.invalid/copy";
    collectFeedXml(database, source("a"), feed(urlA));
    collectFeedXml(database, source("b"), feed(urlB));
    const [original] = database.listItemsForSource("a");
    const [oldClaim] = extractSourceClaims(database, [original]);
    collectFeedXml(database, source("b"), feed(urlB, "source B correction"));
    const [a] = database.listItemsForSource("a");
    const [b] = database.listItemsForSource("b");
    assert.equal(a.versionId, original.versionId);
    assert.equal(a.summary, "original summary");
    assert.notEqual(b.id, a.id);
    assert.equal(b.summary, "source B correction");
    assert.deepEqual(database.listClaims([a.id]).map((claim) => claim.id), [oldClaim.id]);
    assert.deepEqual(database.listClaims([b.id]), []);
    assert.equal(database.listItemSources(a.id).length, 1);
    assert.equal(database.listItemSources(a.id, { includeHistorical: true }).length, 2);
    collectFeedXml(database, source("b"), feed(urlB, "source B correction"));
    assert.equal(database.getCounts().items, 2);
  });
}

test("metadata-only hashes describe the retained content rather than discarded body", async (t) => {
  const { database } = await temporaryDatabase(t);
  collectFeedXml(database, { ...source("a"), contentPolicy: "metadata-only" }, feed("https://example.invalid/one"));
  const [item] = database.listItemsForSource("a");
  assert.equal(item.contentHash, createHash("sha256").update([item.title, "", ""].join("\n")).digest("hex"));
  assert.equal(item.summary, undefined);
});

test("a revision merged into an existing document no longer exposes its orphaned old version as current", async (t) => {
  const { database } = await temporaryDatabase(t);
  collectFeedXml(database, source("a"), feed("https://example.invalid/a", "obsolete unique text"));
  const [old] = database.listItemsForSource("a");
  const [oldClaim] = extractSourceClaims(database, [old]);
  collectFeedXml(database, source("b"), feed("https://example.invalid/b", "replacement text"));
  const [replacement] = database.listItemsForSource("b");
  collectFeedXml(database, source("a"), feed("https://example.invalid/a", "replacement text"));
  assert.equal(database.listItemsForSource("a")[0].id, replacement.id);
  assert.equal(database.getItem(old.id), null);
  assert.equal(database.search("obsolete").length, 0);
  assert.equal(database.listClaims([old.id]).length, 0);
  assert.equal(database.listClaims([old.id], { includeHistorical: true })[0].id, oldClaim.id);
  assert.equal(database.getItemVersion(old.versionId!)?.summary, "obsolete unique text");
  assert.equal(database.listItemSources(old.id, { includeHistorical: true }).length, 1);
});

test("a source ID cannot silently change its feed and reinterpret past retrievals", async (t) => {
  const { database } = await temporaryDatabase(t);
  collectFeedXml(database, source("a"), feed("https://example.invalid/a"));
  assert.throws(() => collectFeedXml(database, {
    ...source("a"), feedUrl: "https://example.invalid/different-feed.xml",
  }, feed("https://example.invalid/b")), /SOURCE_IDENTITY_MISMATCH/);
  assert.equal(database.listItemsForSource("a").length, 1);
  assert.equal(database.getCounts().fetch_runs, 1);
});

test("current document lookup uses a remaining origin after the first origin diverges", async (t) => {
  const { database } = await temporaryDatabase(t);
  collectFeedXml(database, source("a"), feed("https://example.invalid/a", "shared body"));
  collectFeedXml(database, source("b"), feed("https://example.invalid/b", "shared body"));
  const [shared] = database.listItemsForSource("b");
  collectFeedXml(database, source("a"), feed("https://example.invalid/a", "new body"));
  assert.equal(database.getItem(shared.id)?.sourceId, "b");
  assert.equal(database.getItem(shared.id)?.url, "https://example.invalid/b");
  assert.equal(database.search("shared")[0].sourceName, "b");
});

test("nested stage transactions roll back record writes together with checkpoint failure", async (t) => {
  const { database } = await temporaryDatabase(t);
  const jobId = database.createJob({ source: source("a"), topic: "atomic stages" });
  assert.throws(() => database.transaction(() => {
    database.saveAnalysis({ jobId, summary: "analysis", topic: "topic", hypotheses: [], provider: "test", model: "test" });
    database.saveCheckpoint(jobId, "analyze", { id: "rolled back" });
    throw new Error("injected stage interruption");
  }), /injected/);
  const raw = new DatabaseSync(database.filePath, { readOnly: true });
  try { assert.equal(raw.prepare("SELECT count(*) AS count FROM analyses").get()?.count, 0); } finally { raw.close(); }
  assert.equal(database.getCheckpoint(jobId, "analyze"), null);
});

test("job leases exclude a second connection, expire safely, and fence stale owners", async (t) => {
  const { database } = await temporaryDatabase(t);
  const other = new KousatsuDatabase(database.filePath);
  try {
  const jobId = database.createJob({ source: source("a"), topic: "leases" });
  const lease = database.acquireJobLease(jobId, { leaseMs: 500, ownerId: "first" });
  assert.throws(() => other.acquireJobLease(jobId), /already leased/);
  database.withJobLease(jobId, lease.token, () => database.startJobAttempt(jobId, "test", "test"));
  const future = Date.now() + 1_000;
  const replacement = other.acquireJobLease(jobId, { nowMs: future, leaseMs: 10_000, ownerId: "replacement" });
  assert.equal(database.getJob(jobId)?.status, "retry_wait");
  assert.throws(() => database.assertJobLease(jobId, lease.token), /ownership/);
  assert.throws(() => database.renewJobLease(jobId, lease.token), /ownership/);
  assert.throws(() => database.withJobLease(jobId, lease.token, () => database.saveCheckpoint(jobId, "unsafe", {})), /ownership/);
  assert.equal(database.getCheckpoint(jobId, "unsafe"), null);
  database.releaseJobLease(jobId, lease.token);
  other.assertJobLease(jobId, replacement.token, future);
  other.renewJobLease(jobId, replacement.token, 20_000, future);
  const raw = new DatabaseSync(database.filePath, { readOnly: true });
  try {
    const attempt = raw.prepare("SELECT status,completed_at,error FROM job_attempts WHERE job_id=?").get(jobId);
    assert.equal(attempt?.status, "failed");
    assert.ok(attempt?.completed_at);
    assert.match(String(attempt?.error), /expired lease/);
  } finally { raw.close(); }
  other.releaseJobLease(jobId, replacement.token);
  const third = database.acquireJobLease(jobId);
  database.releaseJobLease(jobId, third.token);
  } finally { other.close(); }
});

test("manual stale recovery closes interrupted attempts and respects an active lease", async (t) => {
  const { database } = await temporaryDatabase(t);
  const jobId = database.createJob({ source: source("a"), topic: "recovery" });
  database.startJobAttempt(jobId, "test", "test");
  const lease = database.acquireJobLease(jobId);
  database.startJobAttempt(jobId, "test", "test");
  assert.equal(database.markStaleJobsForRetry("9999-12-31T00:00:00Z"), 0);
  database.releaseJobLease(jobId, lease.token);
  assert.equal(database.markStaleJobsForRetry("9999-12-31T00:00:00Z"), 1);
  assert.equal(database.getJob(jobId)?.status, "retry_wait");
});

test("v1 migration preserves records and unknown legacy claims without falsely making them current", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kousatsu-p1-v1-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "v1.sqlite");
  const legacy = new DatabaseSync(filePath);
  legacy.exec(`
    CREATE TABLE sources(id TEXT PRIMARY KEY,name TEXT NOT NULL,feed_url TEXT NOT NULL UNIQUE,
      content_policy TEXT NOT NULL DEFAULT 'metadata-and-feed-summary',enabled INTEGER NOT NULL DEFAULT 1,
      etag TEXT,last_modified TEXT,last_fetched_at TEXT,last_success_at TEXT,last_error TEXT,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE items(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),external_id TEXT,
      url TEXT NOT NULL,canonical_url TEXT NOT NULL UNIQUE,title TEXT NOT NULL,author TEXT,published_at TEXT,
      fetched_at TEXT NOT NULL,summary TEXT,content TEXT,content_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE claims(id TEXT PRIMARY KEY,item_id TEXT REFERENCES items(id),text TEXT NOT NULL,
      classification TEXT NOT NULL,confidence REAL,reason TEXT NOT NULL,created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,UNIQUE(item_id,text));
    CREATE TABLE evidence(id TEXT PRIMARY KEY,claim_id TEXT NOT NULL REFERENCES claims(id),
      item_id TEXT NOT NULL REFERENCES items(id),excerpt TEXT NOT NULL,locator TEXT NOT NULL,
      stance TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(claim_id,item_id,locator,stance));
    CREATE TABLE legacy_claim_refs(claim_id TEXT REFERENCES claims(id));
    INSERT INTO sources(id,name,feed_url,created_at,updated_at) VALUES('legacy','Legacy','https://example.invalid/feed','2026-01-01','2026-01-01');
    INSERT INTO items VALUES('item','legacy','guid','https://example.invalid/article','https://example.invalid/article',
      'Versioned article',NULL,NULL,'2026-01-02','new body','new body','stale-old-hash','2026-01-01','2026-01-02');
    INSERT INTO claims VALUES('old-claim','item','old body','source_claim',0.5,'legacy evidence','2026-01-01','2026-01-01');
    INSERT INTO evidence VALUES('old-evidence','old-claim','item','old body','https://example.invalid/article','supports','2026-01-01');
    INSERT INTO legacy_claim_refs VALUES('old-claim');
  `);
  legacy.close();
  const database = new KousatsuDatabase(filePath);
  try {
    assert.equal(database.getCounts().items, 1);
    assert.equal(database.getCounts().claims, 1);
    const [version] = database.listItemVersions("item");
    assert.equal(version.legacyContentHash, "stale-old-hash");
    assert.equal(version.provenance, "legacy-unknown");
    assert.notEqual(version.contentHash, version.legacyContentHash);
    assert.deepEqual(database.listClaims(["item"]), []);
    const [claim] = database.listClaims(["item"], { includeHistorical: true });
    assert.equal(claim.id, "old-claim");
    assert.equal(claim.text, "old body");
    assert.equal(claim.versionId, undefined);
    assert.equal(database.listEvidence([claim.id])[0].id, "old-evidence");
    assert.equal(database.listEvidence([claim.id])[0].versionId, undefined);
    assert.equal(extractSourceClaims(database, [database.getItem("item")!]).length, 1);
  } finally { database.close(); }
  const reopened = new KousatsuDatabase(filePath);
  try { assert.equal(reopened.listItemVersions("item").length, 1); } finally { reopened.close(); }
  const raw = new DatabaseSync(filePath, { readOnly: true });
  try {
    assert.deepEqual(raw.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(raw.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
    assert.equal(raw.prepare("SELECT claim_id FROM legacy_claim_refs").get()?.claim_id, "old-claim");
  } finally { raw.close(); }
});
