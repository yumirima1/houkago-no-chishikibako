import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import test from "node:test";

import { KousatsuDatabase } from "../../src/lib/kousatsu/database";

const TIMESTAMP = "2026-01-01T00:00:00.000Z";
const legacySchema = readFileSync(path.join(process.cwd(), "tests/fixtures/kousatsu-v1.sql"), "utf8");
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const fileHash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

function snapshot(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const rows = Object.fromEntries(db.prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all().map(({ name }) => [String(name), db.prepare(`SELECT * FROM ${quote(String(name))}`).all()
      .map((row) => JSON.parse(JSON.stringify(row)) as Record<string, unknown>)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))]));
    return { schema: JSON.parse(JSON.stringify(schema)), rows };
  } finally { db.close(); }
}

function insert(db: DatabaseSync, table: string, value: Record<string, string | number | null>) {
  const entries = Object.entries(value);
  db.prepare(`INSERT INTO ${quote(table)}(${entries.map(([column]) => quote(column)).join(",")}) VALUES(${entries.map(() => "?").join(",")})`)
    .run(...entries.map(([, field]) => field));
}

async function legacyFixture(t: { after: (cleanup: () => Promise<void>) => void }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kousatsu-migration-regression-"));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const originalPath = path.join(directory, "legacy-original.sqlite");
  const db = new DatabaseSync(originalPath);
  try {
    db.exec(legacySchema);
    db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;");
    insert(db, "schema_migrations", { version: 1, applied_at: TIMESTAMP });
    for (const suffix of ["a", "b"]) {
      insert(db, "sources", { id: `source-${suffix}`, name: `Source ${suffix}`, feed_url: `https://example.invalid/feed-${suffix}.xml`, created_at: TIMESTAMP, updated_at: TIMESTAMP });
      insert(db, "items", { id: `item-${suffix}`, source_id: `source-${suffix}`, external_id: `guid-${suffix}`, url: `https://example.invalid/${suffix}`, canonical_url: `https://example.invalid/${suffix}`, title: `MigrationAlpha ${suffix}`, author: "Fixture", published_at: TIMESTAMP, fetched_at: TIMESTAMP, summary: `Summary ${suffix}`, content: `Current text ${suffix}`, content_hash: `stale-v1-${suffix}`, created_at: TIMESTAMP, updated_at: TIMESTAMP });
    }
    insert(db, "fetch_runs", { id: "fetch-1", source_id: "source-a", status: "succeeded", started_at: TIMESTAMP, completed_at: TIMESTAMP, http_status: 200, response_hash: "response-hash", item_count: 1, new_item_count: 1 });
    insert(db, "claims", { id: "claim-1", item_id: "item-a", text: "Legacy claim", classification: "source_claim", confidence: 0.7, reason: "Legacy quote", created_at: TIMESTAMP, updated_at: TIMESTAMP });
    insert(db, "evidence", { id: "evidence-1", claim_id: "claim-1", item_id: "item-a", excerpt: "Legacy quote", locator: "https://example.invalid/a", stance: "supports", created_at: TIMESTAMP });
    insert(db, "relations", { id: "relation-1", from_item_id: "item-a", to_item_id: "item-b", relation_type: "related", score: 0.6, reason: "Fixture relation", created_at: TIMESTAMP });
    insert(db, "jobs", { id: "job-1", type: "pipeline", status: "succeeded", current_stage: "export", input_json: "{}", output_json: "{}", attempts: 1, max_attempts: 3, retryable: 1, provider: "deterministic", model: "rules-v1", created_at: TIMESTAMP, updated_at: TIMESTAMP, started_at: TIMESTAMP, finished_at: TIMESTAMP });
    insert(db, "job_attempts", { id: "attempt-1", job_id: "job-1", attempt: 1, status: "succeeded", started_at: TIMESTAMP, completed_at: TIMESTAMP });
    insert(db, "checkpoints", { job_id: "job-1", stage: "export", status: "completed", data_json: "{}", created_at: TIMESTAMP, updated_at: TIMESTAMP });
    insert(db, "analyses", { id: "analysis-1", job_id: "job-1", topic: "Migration", summary: "Legacy analysis", provider: "deterministic", model: "rules-v1", created_at: TIMESTAMP });
    insert(db, "hypotheses", { id: "hypothesis-1", analysis_id: "analysis-1", text: "Legacy hypothesis", rationale: "Reason", status: "unverified", created_at: TIMESTAMP });
    insert(db, "articles", { id: "article-1", job_id: "job-1", title: "Legacy article", slug: "legacy", status: "verified_draft", markdown: "# Legacy article\n", output_path: null, provider: "deterministic", model: "rules-v1", created_at: TIMESTAMP, updated_at: TIMESTAMP });
    insert(db, "article_claims", { article_id: "article-1", claim_id: "claim-1", section: "source_claims" });
    insert(db, "verifications", { id: "verification-1", article_id: "article-1", status: "passed", issues_json: "[]", report_json: '{"status":"passed","issues":[]}', verifier: "legacy-structural", created_at: TIMESTAMP });
    db.exec("COMMIT;");
  } finally { db.close(); }
  return { directory, originalPath };
}

async function readOnlyCopy(source: string, target: string) {
  const db = new DatabaseSync(source, { readOnly: true });
  try { await backup(db, target); } finally { db.close(); }
}

test("full v1 migration retains every existing table's rows, identifiers, references and searchable data", async (t) => {
  const { directory, originalPath } = await legacyFixture(t);
  const originalHash = fileHash(originalPath);
  const before = snapshot(originalPath);
  const target = path.join(directory, "migration-copy.sqlite");
  await readOnlyCopy(originalPath, target);
  const migrated = new KousatsuDatabase(target);
  try {
    assert.deepEqual(migrated.search("MigrationAlpha").map((item) => item.id).sort(), ["item-a", "item-b"]);
    assert.deepEqual(migrated.listClaims(["item-a"]), []);
    assert.equal(migrated.listClaims(["item-a"], { includeHistorical: true })[0].id, "claim-1");
    assert.equal(migrated.listEvidence(["claim-1"])[0].id, "evidence-1");
    assert.equal(migrated.getArticleVerification("article-1")?.status, "passed");
    assert.equal(migrated.getArticleVerification("missing"), null);
    for (const suffix of ["a", "b"]) {
      const [version] = migrated.listItemVersions(`item-${suffix}`);
      assert.equal(version.legacyContentHash, `stale-v1-${suffix}`);
      assert.equal(version.provenance, "legacy-unknown");
      assert.equal(migrated.listItemSources(`item-${suffix}`)[0].versionId, version.versionId);
    }
  } finally { migrated.close(); }
  const after = snapshot(target);
  for (const [table, rows] of Object.entries(before.rows)) {
    if (table === "schema_migrations") {
      assert.equal(after.rows[table].length, rows.length + 1);
      assert.deepEqual(after.rows[table].filter((row) => row.version !== 2), rows);
    } else {
      const columns = Object.keys(rows[0] ?? {}).filter((column) => table !== "items" || column !== "content_hash");
      const project = (records: typeof rows) => records.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])))
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      assert.equal(after.rows[table].length, rows.length, `${table} retains row count`);
      assert.deepEqual(project(after.rows[table]), project(rows), `${table} retains original columns and identifiers`);
    }
  }
  const reopened = new KousatsuDatabase(target);
  reopened.close();
  assert.deepEqual(snapshot(target), after, "migration is idempotent on reopen");
  assert.equal(fileHash(originalPath), originalHash, "read-only backup source remains byte-for-byte unchanged");
});

for (const [name, corruption] of [
  ["evidence item", "UPDATE evidence SET item_id='missing-item'"],
  ["evidence claim", "UPDATE evidence SET claim_id='missing-claim'"],
  ["claim item", "UPDATE claims SET item_id='missing-item'"],
  ["article claim", "UPDATE article_claims SET claim_id='missing-claim'"],
  ["article owner", "UPDATE article_claims SET article_id='missing-article'"],
]) {
  test(`invalid v1 ${name} reference is rejected before changing any schema, rows or journal mode`, async (t) => {
    const { directory, originalPath } = await legacyFixture(t);
    const seed = new DatabaseSync(originalPath);
    try { seed.exec(`PRAGMA foreign_keys=OFF; ${corruption};`); } finally { seed.close(); }
    const before = snapshot(originalPath);
    const originalHash = fileHash(originalPath);
    const target = path.join(directory, "invalid-copy.sqlite");
    await readOnlyCopy(originalPath, target);
    const targetHash = fileHash(target);
    assert.throws(() => new KousatsuDatabase(target), /MIGRATION_FOREIGN_KEY_VIOLATION/);
    assert.deepEqual(snapshot(target), before, "invalid input retains every original table and row");
    assert.equal(fileHash(target), targetHash, "invalid target is rejected without modifying its SQLite bytes");
    assert.equal(fileHash(originalPath), originalHash, "invalid backup source is never modified");
    const inspect = new DatabaseSync(target, { readOnly: true });
    try {
      assert.equal(inspect.prepare("PRAGMA journal_mode").get()?.journal_mode, "delete");
      assert.equal(inspect.prepare("SELECT count(*) AS count FROM evidence").get()?.count, 1);
      assert.deepEqual(inspect.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version), [1]);
    } finally { inspect.close(); }
  });
}

for (const [name, mutation] of [
  ["removed row", "DELETE FROM relations WHERE id='relation-1'"],
  ["replaced identifier", "UPDATE relations SET id='replacement-relation' WHERE id='relation-1'"],
]) {
  test(`v1 migration rolls back if a legacy trigger causes a ${name}`, async (t) => {
    const { directory, originalPath } = await legacyFixture(t);
    const seed = new DatabaseSync(originalPath);
    try {
      seed.exec(`CREATE TRIGGER legacy_migration_side_effect AFTER INSERT ON schema_migrations
        WHEN new.version=2 BEGIN ${mutation}; END;`);
    } finally { seed.close(); }
    const originalHash = fileHash(originalPath);
    const before = snapshot(originalPath);
    const target = path.join(directory, "rollback-copy.sqlite");
    await readOnlyCopy(originalPath, target);
    assert.throws(() => new KousatsuDatabase(target), /MIGRATION_RECORD_LOSS/);
    assert.deepEqual(snapshot(target), before, "failed rebuild restores original schema, trigger and every data row");
    assert.equal(fileHash(originalPath), originalHash, "backup source is unchanged after target rollback");
  });
}
