import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { link, unlink } from "node:fs/promises";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import type {
  ClaimClassification,
  ClaimRecord,
  EvidenceRecord,
  JobRecord,
  JobStatus,
  ItemSourceRecord,
  PipelineInput,
  PipelineResult,
  RelationRecord,
  SearchResult,
  SourceInput,
  StoredItem,
  VerificationReport,
} from "./types";

const DEFAULT_DATABASE_PATH = path.join(
  process.cwd(),
  "data",
  "kousatsu",
  "kousatsu.sqlite",
);

function now() {
  return new Date().toISOString();
}

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown): T {
  if (typeof value !== "string") {
    throw new Error("Expected a JSON string from SQLite.");
  }

  return JSON.parse(value) as T;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

type MigrationIdentity = {
  table: string;
  count: number;
  keyColumns: string[];
  keys: string[];
};

export class KousatsuDatabase {
  readonly filePath: string;
  private readonly db: DatabaseSync;
  private transactionDepth = 0;

  constructor(filePath = process.env.KOUSATSU_DB_PATH || DEFAULT_DATABASE_PATH) {
    // User data is opened at runtime and must never be captured in a server bundle.
    this.filePath = path.resolve(/* turbopackIgnore: true */ filePath);
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    try {
      this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
      // Inspect the original database before changing its journal or schema. In
      // particular, a migration must never silently discard already-orphaned rows.
      this.assertForeignKeyIntegrity("Existing database");
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.migrate();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  private assertForeignKeyIntegrity(context: string) {
    const violations = this.db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length > 0) {
      throw new Error(`MIGRATION_FOREIGN_KEY_VIOLATION: ${context} has ${violations.length} invalid reference(s); no migration was committed.`);
    }
  }

  private captureMigrationIdentities(): MigrationIdentity[] {
    const tables = this.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return tables.map((row) => {
      const table = asString(row.name);
      const keyColumns = this.db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all()
        .filter((column) => asNumber(column.pk) > 0)
        .sort((left, right) => asNumber(left.pk) - asNumber(right.pk))
        .map((column) => asString(column.name));
      return { table, keyColumns, ...this.readMigrationIdentity(table, keyColumns) };
    });
  }

  private readMigrationIdentity(table: string, keyColumns: string[]) {
    const count = asNumber(this.db.prepare(`SELECT count(*) AS count FROM ${quoteIdentifier(table)}`).get()?.count);
    const keys = keyColumns.length === 0 ? [] : this.db.prepare(
      `SELECT ${keyColumns.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(table)}`,
    ).all().map((row) => JSON.stringify(keyColumns.map((column) => row[column])));
    return { count, keys };
  }

  private assertMigrationIdentities(before: MigrationIdentity[]) {
    for (const original of before) {
      const current = this.readMigrationIdentity(original.table, original.keyColumns);
      const keys = new Set(current.keys);
      // Version 2 is the only intentional addition to any pre-existing table.
      const expectedAddedRows = original.table === "schema_migrations" ? 1 : 0;
      if (current.count !== original.count + expectedAddedRows || original.keys.some((key) => !keys.has(key))) {
        throw new Error(`MIGRATION_RECORD_LOSS: row count or primary keys changed in ${original.table}; migration was rolled back.`);
      }
    }
  }

  private assertMigrationCopy(original: "items" | "claims" | "evidence", replacement: string) {
    const before = this.readMigrationIdentity(original, ["id"]);
    const after = this.readMigrationIdentity(replacement, ["id"]);
    const copied = new Set(after.keys);
    if (before.count !== after.count || before.keys.some((key) => !copied.has(key))) {
      throw new Error(`MIGRATION_RECORD_LOSS: incomplete copy of ${original}; migration was rolled back.`);
    }
  }

  close() {
    this.db.close();
  }

  async backupTo(filePath: string) {
    const absolutePath = path.resolve(/* turbopackIgnore: true */ filePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    const temporary=absolutePath+`.${randomUUID()}.tmp`;
    try {
      await backup(this.db, temporary);
      await link(temporary,absolutePath);
    } finally {
      await unlink(temporary).catch(error => {if ((error as NodeJS.ErrnoException).code!=='ENOENT') throw error;});
    }
    return absolutePath;
  }

  transaction<T>(operation: () => T): T {
    const depth = this.transactionDepth;
    const savepoint = `nested_${depth}`;
    this.db.exec(depth === 0 ? "BEGIN IMMEDIATE;" : `SAVEPOINT ${savepoint};`);
    this.transactionDepth += 1;

    try {
      const result = operation();
      this.db.exec(depth === 0 ? "COMMIT;" : `RELEASE ${savepoint};`);
      return result;
    } catch (error) {
      this.db.exec(depth === 0 ? "ROLLBACK;" : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint};`);
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        feed_url TEXT NOT NULL UNIQUE,
        content_policy TEXT NOT NULL DEFAULT 'metadata-and-feed-summary',
        enabled INTEGER NOT NULL DEFAULT 1,
        etag TEXT,
        last_modified TEXT,
        last_fetched_at TEXT,
        last_success_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fetch_runs (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        http_status INTEGER,
        response_hash TEXT,
        item_count INTEGER NOT NULL DEFAULT 0,
        new_item_count INTEGER NOT NULL DEFAULT 0,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
        external_id TEXT,
        url TEXT NOT NULL,
        canonical_url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        author TEXT,
        published_at TEXT,
        fetched_at TEXT NOT NULL,
        summary TEXT,
        content TEXT,
        content_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_items_source_published
        ON items(source_id, published_at DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS item_search USING fts5(
        item_id UNINDEXED,
        title,
        summary,
        content,
        tokenize = 'unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS items_after_insert
      AFTER INSERT ON items BEGIN
        INSERT INTO item_search(item_id, title, summary, content)
        VALUES (new.id, new.title, coalesce(new.summary, ''), coalesce(new.content, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS items_after_update
      AFTER UPDATE ON items BEGIN
        DELETE FROM item_search WHERE item_id = old.id;
        INSERT INTO item_search(item_id, title, summary, content)
        VALUES (new.id, new.title, coalesce(new.summary, ''), coalesce(new.content, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS items_after_delete
      AFTER DELETE ON items BEGIN
        DELETE FROM item_search WHERE item_id = old.id;
      END;

      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
        text TEXT NOT NULL,
        classification TEXT NOT NULL CHECK(classification IN (
          'confirmed_fact', 'source_claim', 'inference', 'opinion',
          'hypothesis', 'unverified', 'contradiction'
        )),
        confidence REAL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(item_id, text)
      );

      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        excerpt TEXT NOT NULL,
        locator TEXT NOT NULL,
        stance TEXT NOT NULL CHECK(stance IN ('supports', 'contradicts')),
        created_at TEXT NOT NULL,
        UNIQUE(claim_id, item_id, locator, stance)
      );

      CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        from_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        to_item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL,
        score REAL NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(from_item_id, to_item_id, relation_type),
        CHECK(from_item_id < to_item_id)
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        current_stage TEXT,
        input_json TEXT NOT NULL,
        output_json TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL,
        last_error TEXT,
        retryable INTEGER NOT NULL DEFAULT 1,
        provider TEXT,
        model TEXT,
        estimated_cost REAL NOT NULL DEFAULT 0,
        actual_cost REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status_updated
        ON jobs(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS job_attempts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error TEXT,
        UNIQUE(job_id, attempt)
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        stage TEXT NOT NULL,
        status TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(job_id, stage)
      );

      CREATE TABLE IF NOT EXISTS analyses (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        topic TEXT NOT NULL,
        summary TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hypotheses (
        id TEXT PRIMARY KEY,
        analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        rationale TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unverified',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        status TEXT NOT NULL,
        markdown TEXT NOT NULL,
        output_path TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS article_claims (
        article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE RESTRICT,
        section TEXT NOT NULL,
        PRIMARY KEY(article_id, claim_id, section)
      );

      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        issues_json TEXT NOT NULL,
        report_json TEXT NOT NULL,
        verifier TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const migration = this.db
      .prepare("SELECT version FROM schema_migrations WHERE version = 1")
      .get();

    if (!migration) {
      this.db
        .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)")
        .run(now());
    }
    this.migrateVersions();
  }

  /** Rebuild constrained v1 tables transactionally, retaining every original ID. */
  private migrateVersions() {
    if (this.db.prepare("SELECT version FROM schema_migrations WHERE version = 2").get()) return;
    // SQLite requires this PRAGMA outside the transaction when replacing FK targets.
    this.db.exec("PRAGMA foreign_keys = OFF;");
    try {
      this.transaction(() => {
        // Repeat under the write lock so another connection cannot introduce an
        // invalid reference between the constructor's inspection and the rebuild.
        this.assertForeignKeyIntegrity("Pre-migration database");
        const originalIdentities = this.captureMigrationIdentities();
        this.db.exec(`
          CREATE TABLE item_versions (
            id TEXT PRIMARY KEY,
            item_id TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
            source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
            external_id TEXT, url TEXT NOT NULL, canonical_url TEXT NOT NULL,
            title TEXT NOT NULL, author TEXT, published_at TEXT, fetched_at TEXT NOT NULL,
            summary TEXT, content TEXT, content_hash TEXT NOT NULL,
            legacy_content_hash TEXT, provenance TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(item_id, content_hash)
          );
          CREATE TABLE items_v2 (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
            external_id TEXT, url TEXT NOT NULL, canonical_url TEXT NOT NULL,
            title TEXT NOT NULL, author TEXT, published_at TEXT, fetched_at TEXT NOT NULL,
            summary TEXT, content TEXT, content_hash TEXT NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            current_version_id TEXT NOT NULL REFERENCES item_versions(id) ON DELETE RESTRICT
          );
          CREATE TABLE claims_v2 (
            id TEXT PRIMARY KEY,
            item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
            version_id TEXT REFERENCES item_versions(id) ON DELETE RESTRICT,
            text TEXT NOT NULL,
            classification TEXT NOT NULL CHECK(classification IN (
              'confirmed_fact', 'source_claim', 'inference', 'opinion',
              'hypothesis', 'unverified', 'contradiction'
            )), confidence REAL, reason TEXT NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            UNIQUE(version_id, text)
          );
          CREATE TABLE evidence_v2 (
            id TEXT PRIMARY KEY,
            claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
            item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            version_id TEXT REFERENCES item_versions(id) ON DELETE RESTRICT,
            excerpt TEXT NOT NULL, locator TEXT NOT NULL,
            stance TEXT NOT NULL CHECK(stance IN ('supports', 'contradicts')),
            created_at TEXT NOT NULL,
            UNIQUE(claim_id, item_id, version_id, locator, stance)
          );
        `);
        const legacyItems = this.db.prepare("SELECT * FROM items").all() as Array<Record<string, unknown>>;
        for (const row of legacyItems) {
          const versionId = randomUUID();
          const hash = this.snapshotHash(this.toStoredItem(row));
          this.db.prepare(`
            INSERT INTO item_versions(
              id,item_id,source_id,external_id,url,canonical_url,title,author,published_at,
              fetched_at,summary,content,content_hash,legacy_content_hash,provenance,created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'legacy-unknown',?)
          `).run(versionId, asString(row.id), asString(row.source_id), row.external_id as string | null,
            asString(row.url), asString(row.canonical_url), asString(row.title), row.author as string | null,
            row.published_at as string | null, asString(row.fetched_at), row.summary as string | null,
            row.content as string | null, hash, asString(row.content_hash), asString(row.created_at));
          this.db.prepare(`
            INSERT INTO items_v2 SELECT id,source_id,external_id,url,canonical_url,title,author,
              published_at,fetched_at,summary,content,?,created_at,updated_at,? FROM items WHERE id = ?
          `).run(hash, versionId, asString(row.id));
        }
        this.db.exec(`
          INSERT INTO claims_v2 SELECT c.id,c.item_id,NULL,c.text,c.classification,
            c.confidence,c.reason,c.created_at,c.updated_at FROM claims c;
          INSERT INTO evidence_v2 SELECT e.id,e.claim_id,e.item_id,NULL,
            e.excerpt,e.locator,e.stance,e.created_at FROM evidence e;
        `);
        for (const table of ["items", "claims", "evidence"] as const) {
          this.assertMigrationCopy(table, `${table}_v2`);
        }
        this.db.exec(`
          DROP TABLE evidence;
          DROP TABLE claims;
          DROP TABLE items;
          ALTER TABLE items_v2 RENAME TO items;
          ALTER TABLE claims_v2 RENAME TO claims;
          ALTER TABLE evidence_v2 RENAME TO evidence;
          CREATE INDEX idx_items_source_published ON items(source_id,published_at DESC);
          CREATE INDEX idx_items_current_hash ON items(content_hash);
          CREATE INDEX idx_claims_version ON claims(version_id);
          CREATE TABLE item_sources (
            source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
            canonical_url TEXT NOT NULL,
            item_id TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
            version_id TEXT NOT NULL REFERENCES item_versions(id) ON DELETE RESTRICT,
            url TEXT NOT NULL,external_id TEXT,first_fetched_at TEXT NOT NULL,last_fetched_at TEXT NOT NULL,
            PRIMARY KEY(source_id,canonical_url)
          );
          CREATE TABLE item_source_versions (
            source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
            canonical_url TEXT NOT NULL,
            item_id TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
            version_id TEXT NOT NULL REFERENCES item_versions(id) ON DELETE RESTRICT,
            url TEXT NOT NULL,external_id TEXT,first_fetched_at TEXT NOT NULL,last_fetched_at TEXT NOT NULL,
            PRIMARY KEY(source_id,canonical_url,version_id)
          );
          INSERT INTO item_sources SELECT source_id,canonical_url,id,current_version_id,url,external_id,
            fetched_at,fetched_at FROM items;
          INSERT INTO item_source_versions SELECT * FROM item_sources;
          CREATE TABLE job_leases (
            job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
            token TEXT NOT NULL,owner_id TEXT NOT NULL,expires_at TEXT NOT NULL
          );
          CREATE TRIGGER items_after_insert AFTER INSERT ON items BEGIN
            INSERT INTO item_search(item_id,title,summary,content)
            VALUES(new.id,new.title,coalesce(new.summary,''),coalesce(new.content,''));
          END;
          CREATE TRIGGER items_after_update AFTER UPDATE ON items BEGIN
            DELETE FROM item_search WHERE item_id=old.id;
            INSERT INTO item_search(item_id,title,summary,content)
            VALUES(new.id,new.title,coalesce(new.summary,''),coalesce(new.content,''));
          END;
          CREATE TRIGGER items_after_delete AFTER DELETE ON items BEGIN
            DELETE FROM item_search WHERE item_id=old.id;
          END;
        `);
        this.assertForeignKeyIntegrity("Migrated database");
        this.db.prepare("INSERT INTO schema_migrations(version,applied_at) VALUES(2,?)").run(now());
        this.assertMigrationIdentities(originalIdentities);
      });
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  private snapshotHash(item: Pick<StoredItem, "title" | "summary" | "content">) {
    return createHash("sha256").update([item.title, item.summary ?? "", item.content ?? ""].join("\n")).digest("hex");
  }

  upsertSource(source: SourceInput) {
    return this.transaction(() => {
    const existing = this.db.prepare("SELECT feed_url FROM sources WHERE id=?").get(source.id) as { feed_url: string } | undefined;
    if (existing && existing.feed_url !== source.feedUrl) {
      throw new Error(`SOURCE_IDENTITY_MISMATCH: source ${source.id} already identifies a different feed; use a new source ID.`);
    }
    const timestamp = now();
    this.db
      .prepare(`
        INSERT INTO sources(id, name, feed_url, content_policy, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          feed_url = excluded.feed_url,
          content_policy = excluded.content_policy,
          updated_at = excluded.updated_at
      `)
      .run(
        source.id,
        source.name,
        source.feedUrl,
        source.contentPolicy ?? "metadata-and-feed-summary",
        timestamp,
        timestamp,
      );
    });
  }

  beginFetch(sourceId: string) {
    const id = randomUUID();
    this.db
      .prepare(`
        INSERT INTO fetch_runs(id, source_id, status, started_at)
        VALUES (?, ?, 'running', ?)
      `)
      .run(id, sourceId, now());
    return id;
  }

  finishFetch(
    id: string,
    result: {
      error?: string;
      httpStatus?: number;
      itemCount?: number;
      newItemCount?: number;
      responseHash?: string;
      status: "succeeded" | "failed";
    },
  ) {
    const timestamp = now();
    this.transaction(() => {
      this.db
        .prepare(`
          UPDATE fetch_runs SET
            status = ?, completed_at = ?, http_status = ?, response_hash = ?,
            item_count = ?, new_item_count = ?, error = ?
          WHERE id = ?
        `)
        .run(
          result.status,
          timestamp,
          result.httpStatus ?? null,
          result.responseHash ?? null,
          result.itemCount ?? 0,
          result.newItemCount ?? 0,
          result.error ?? null,
          id,
        );
      this.db
        .prepare(`
          UPDATE sources SET
            last_fetched_at = ?,
            last_success_at = CASE WHEN ? = 'succeeded' THEN ? ELSE last_success_at END,
            last_error = ?,
            updated_at = ?
          WHERE id = (SELECT source_id FROM fetch_runs WHERE id = ?)
        `)
        .run(
          timestamp,
          result.status,
          timestamp,
          result.error ?? null,
          timestamp,
          id,
        );
    });
  }

  upsertItem(item: StoredItem) {
    return this.transaction(() => {
      const timestamp = now();
      // Hash exactly the retained snapshot (metadata-only policy must not hash discarded text).
      const hash = this.snapshotHash(item);
      const association = this.db.prepare(`
        SELECT s.*,i.content_hash FROM item_sources s JOIN items i ON i.id=s.item_id
        WHERE s.source_id=? AND s.canonical_url=?
      `).get(item.sourceId, item.canonicalUrl) as Record<string, unknown> | undefined;
      const sameContent = this.db.prepare("SELECT id,current_version_id FROM items WHERE content_hash=? ORDER BY created_at,id LIMIT 1")
        .get(hash) as { id: string; current_version_id: string } | undefined;
      let id = sameContent?.id;
      let versionId = sameContent?.current_version_id;
      let inserted = false;

      if (!id) {
        const shared = association ? this.db.prepare(`
          SELECT count(*) AS count FROM item_sources WHERE item_id=?
            AND NOT(source_id=? AND canonical_url=?)
        `).get(asString(association.item_id), item.sourceId, item.canonicalUrl) as { count: number } : undefined;
        id = association && Number(shared?.count) === 0 ? asString(association.item_id) : item.id;
        inserted = !association || Number(shared?.count) > 0;
        const priorVersion = this.db.prepare("SELECT id FROM item_versions WHERE item_id=? AND content_hash=?")
          .get(id, hash) as { id: string } | undefined;
        versionId = priorVersion?.id ?? randomUUID();
        if (!priorVersion) {
          // The item/version FK cycle is deferred within this single transaction.
          this.db.exec("PRAGMA defer_foreign_keys = ON;");
          this.db.prepare(`
            INSERT INTO item_versions(id,item_id,source_id,external_id,url,canonical_url,title,
              author,published_at,fetched_at,summary,content,content_hash,provenance,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'observed',?)
          `).run(versionId,id,item.sourceId,item.externalId ?? null,item.url,item.canonicalUrl,item.title,
            item.author ?? null,item.publishedAt ?? null,item.fetchedAt,item.summary ?? null,item.content ?? null,hash,timestamp);
        }
        this.db.prepare(`
          INSERT INTO items(id,source_id,external_id,url,canonical_url,title,author,published_at,
            fetched_at,summary,content,content_hash,created_at,updated_at,current_version_id)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,external_id=excluded.external_id,
            url=excluded.url,canonical_url=excluded.canonical_url,title=excluded.title,author=excluded.author,
            published_at=excluded.published_at,fetched_at=excluded.fetched_at,summary=excluded.summary,
            content=excluded.content,content_hash=excluded.content_hash,updated_at=excluded.updated_at,
            current_version_id=excluded.current_version_id
        `).run(id,item.sourceId,item.externalId ?? null,item.url,item.canonicalUrl,item.title,item.author ?? null,
          item.publishedAt ?? null,item.fetchedAt,item.summary ?? null,item.content ?? null,hash,timestamp,timestamp,versionId);
      }
      if (!id || !versionId) throw new Error("Missing document version after ingestion.");
      this.db.prepare(`
        INSERT INTO item_sources(source_id,canonical_url,item_id,version_id,url,external_id,first_fetched_at,last_fetched_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source_id,canonical_url) DO UPDATE SET
          item_id=excluded.item_id,version_id=excluded.version_id,url=excluded.url,
          external_id=excluded.external_id,last_fetched_at=excluded.last_fetched_at
      `).run(item.sourceId,item.canonicalUrl,id,versionId,item.url,item.externalId ?? null,item.fetchedAt,item.fetchedAt);
      this.db.prepare(`
        INSERT INTO item_source_versions(source_id,canonical_url,item_id,version_id,url,external_id,first_fetched_at,last_fetched_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(source_id,canonical_url,version_id) DO UPDATE SET
          last_fetched_at=excluded.last_fetched_at
      `).run(item.sourceId,item.canonicalUrl,id,versionId,item.url,item.externalId ?? null,item.fetchedAt,item.fetchedAt);
      return { id, inserted, versionId };
    });
  }

  listItemsForSource(sourceId: string): StoredItem[] {
    const rows = this.db
      .prepare(`SELECT v.*,v.item_id AS id,v.id AS current_version_id,
        s.source_id,s.url,s.canonical_url,s.external_id,s.last_fetched_at AS fetched_at
        FROM item_sources s JOIN item_versions v ON v.id=s.version_id
        WHERE s.source_id=? ORDER BY v.published_at DESC,v.created_at DESC`)
      .all(sourceId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.toStoredItem(row));
  }

  getItem(id: string): StoredItem | null {
    const row = this.db.prepare(`SELECT i.*,s.source_id,s.url,s.canonical_url,s.external_id,
        s.last_fetched_at AS fetched_at FROM items i JOIN item_sources s
        ON s.item_id=i.id AND s.version_id=i.current_version_id WHERE i.id = ?
        ORDER BY (s.source_id=i.source_id AND s.canonical_url=i.canonical_url) DESC,
          s.source_id,s.canonical_url LIMIT 1`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.toStoredItem(row) : null;
  }
  getItemByCanonicalUrl(url:string):StoredItem|null{
    const row=this.db.prepare('SELECT id FROM items WHERE canonical_url=? LIMIT 1').get(url);return row?this.getItem(String(row.id)):null;
  }
  documentCoverage(versionId:string){
    if(!this.db.prepare("SELECT name FROM sqlite_master WHERE name='research_content_provenance'").get())return null;
    const row=this.db.prepare('SELECT coverage_json FROM research_content_provenance WHERE version_id=?').get(versionId);
    return row?JSON.parse(String(row.coverage_json)) as import('./quality-types').DocumentCoverage:null;
  }

  getItemVersion(versionId: string): StoredItem | null {
    const row = this.db.prepare("SELECT *,item_id AS id,id AS current_version_id FROM item_versions WHERE id=?")
      .get(versionId) as Record<string, unknown> | undefined;
    return row ? this.toStoredItem(row) : null;
  }

  listItemVersions(itemId: string): StoredItem[] {
    return (this.db.prepare("SELECT *,item_id AS id,id AS current_version_id FROM item_versions WHERE item_id=? ORDER BY created_at,rowid")
      .all(itemId) as Array<Record<string, unknown>>).map((row) => this.toStoredItem(row));
  }

  listItemSources(itemId: string, options: { includeHistorical?: boolean } = {}): ItemSourceRecord[] {
    const table = options.includeHistorical ? "item_source_versions" : "item_sources";
    return (this.db.prepare(`SELECT * FROM ${table} WHERE item_id=? ORDER BY source_id,canonical_url`)
      .all(itemId) as Array<Record<string, unknown>>).map((row) => ({
        canonicalUrl: asString(row.canonical_url), externalId: optionalString(row.external_id),
        firstFetchedAt: asString(row.first_fetched_at),itemId: asString(row.item_id),
        lastFetchedAt: asString(row.last_fetched_at),sourceId: asString(row.source_id),
        url: asString(row.url),versionId: asString(row.version_id),
      }));
  }

  search(query: string, limit = 20): SearchResult[] {
    const tokens = query
      .normalize("NFKC")
      .split(/[\s、。・/]+/u)
      .map((token) => token.replaceAll('"', "").trim())
      .filter((token) => token.length > 0)
      .slice(0, 8);

    if (tokens.length === 0) return [];

    const expression = tokens.map((token) => `"${token}"`).join(" OR ");
    const rows = this.db
      .prepare(`
        SELECT items.*, sources.name AS source_name, bm25(item_search) AS rank
        FROM item_search
        JOIN items ON items.id = item_search.item_id
        JOIN sources ON sources.id = items.source_id
        WHERE item_search MATCH ? AND EXISTS(
          SELECT 1 FROM item_sources s WHERE s.item_id=items.id AND s.version_id=items.current_version_id)
        ORDER BY rank
        LIMIT ?
      `)
      .all(expression, Math.min(100, Math.max(1, limit))) as Array<
      Record<string, unknown>
    >;

    if (rows.length === 0) {
      const conditions = tokens
        .flatMap(() => [
          "items.title LIKE ? ESCAPE '\\'",
          "items.summary LIKE ? ESCAPE '\\'",
          "items.content LIKE ? ESCAPE '\\'",
        ])
        .join(" OR ");
      const parameters = tokens.flatMap((token) => {
        const escaped = token.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
        const pattern = `%${escaped}%`;
        return [pattern, pattern, pattern];
      });
      const fallbackRows = this.db
        .prepare(`
          SELECT items.*, sources.name AS source_name, 0 AS rank
          FROM items
          JOIN sources ON sources.id = items.source_id
          WHERE (${conditions}) AND EXISTS(
            SELECT 1 FROM item_sources s WHERE s.item_id=items.id AND s.version_id=items.current_version_id)
          ORDER BY coalesce(items.published_at, items.created_at) DESC
          LIMIT ?
        `)
        .all(...parameters, Math.min(100, Math.max(1, limit))) as Array<
        Record<string, unknown>
      >;
      return fallbackRows.map((row) => ({
        ...this.getItem(asString(row.id))!,
        rank: 0,
        sourceName: this.sourceName(this.getItem(asString(row.id))!.sourceId),
      }));
    }

    return rows.map((row) => ({
      ...this.getItem(asString(row.id))!,
      rank: asNumber(row.rank),
      sourceName: this.sourceName(this.getItem(asString(row.id))!.sourceId),
    }));
  }

  private sourceName(sourceId: string) {
    const row = this.db.prepare("SELECT name FROM sources WHERE id=?").get(sourceId) as { name: string };
    return row.name;
  }

  upsertClaim(input: {
    classification: ClaimClassification;
    confidence?: number;
    itemId: string;
    reason: string;
    text: string;
    versionId?: string;
  }) {
    const versionId = this.resolveVersion(input.itemId, input.versionId);
    const existing = this.db
      .prepare("SELECT id FROM claims WHERE version_id = ? AND text = ?")
      .get(versionId, input.text) as { id?: string } | undefined;
    const id = existing?.id ?? randomUUID();
    const timestamp = now();

    this.db
      .prepare(`
        INSERT INTO claims(
          id, item_id, version_id, text, classification, confidence, reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(version_id, text) DO UPDATE SET
          classification = excluded.classification,
          confidence = excluded.confidence,
          reason = excluded.reason,
          updated_at = excluded.updated_at
      `)
      .run(
        id,
        input.itemId,
        versionId,
        input.text,
        input.classification,
        input.confidence ?? null,
        input.reason,
        timestamp,
        timestamp,
      );
    return id;
  }

  upsertEvidence(input: Omit<EvidenceRecord, "id">) {
    const versionId = this.resolveVersion(input.itemId, input.versionId);
    const existing = this.db
      .prepare(`
        SELECT id FROM evidence
        WHERE claim_id = ? AND item_id = ? AND version_id = ? AND locator = ? AND stance = ?
      `)
      .get(input.claimId, input.itemId, versionId, input.locator, input.stance) as
      | { id?: string }
      | undefined;
    const id = existing?.id ?? randomUUID();
    this.db
      .prepare(`
        INSERT INTO evidence(
          id, claim_id, item_id, version_id, excerpt, locator, stance, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(claim_id, item_id, version_id, locator, stance) DO UPDATE SET
          excerpt = excluded.excerpt
      `)
      .run(
        id,
        input.claimId,
        input.itemId,
        versionId,
        input.excerpt,
        input.locator,
        input.stance,
        now(),
      );
    return id;
  }

  private resolveVersion(itemId: string, requested?: string) {
    const version = requested ? this.getItemVersion(requested) : this.getItem(itemId);
    if (!version?.versionId || version.id !== itemId) throw new Error(`Document version not found for item ${itemId}.`);
    return version.versionId;
  }

  listClaims(itemIds: string[], options: { includeHistorical?: boolean } = {}): ClaimRecord[] {
    if (itemIds.length === 0) return [];
    const placeholders = itemIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT c.* FROM claims c JOIN items i ON i.id=c.item_id
        WHERE c.item_id IN (${placeholders}) ${options.includeHistorical ? "" : `AND c.version_id=i.current_version_id AND EXISTS(
          SELECT 1 FROM item_sources s WHERE s.item_id=i.id AND s.version_id=i.current_version_id)`}
        ORDER BY c.created_at,c.rowid`)
      .all(...itemIds) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      classification: asString(row.classification) as ClaimClassification,
      confidence: row.confidence === null ? null : asNumber(row.confidence),
      createdAt: asString(row.created_at),
      id: asString(row.id),
      itemId: row.item_id === null ? null : asString(row.item_id),
      reason: asString(row.reason),
      text: asString(row.text),
      versionId: optionalString(row.version_id),
    }));
  }

  listEvidence(claimIds: string[]): EvidenceRecord[] {
    if (claimIds.length === 0) return [];
    const placeholders = claimIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`SELECT * FROM evidence WHERE claim_id IN (${placeholders})`)
      .all(...claimIds) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      claimId: asString(row.claim_id),
      excerpt: asString(row.excerpt),
      id: asString(row.id),
      itemId: asString(row.item_id),
      locator: asString(row.locator),
      stance: asString(row.stance) as EvidenceRecord["stance"],
      versionId: optionalString(row.version_id),
    }));
  }

  upsertRelation(input: Omit<RelationRecord, "id">) {
    const [fromItemId, toItemId] = [input.fromItemId, input.toItemId].sort();
    if (fromItemId === toItemId) throw new Error("A relation needs two items.");
    const existing = this.db
      .prepare(`
        SELECT id FROM relations
        WHERE from_item_id = ? AND to_item_id = ? AND relation_type = ?
      `)
      .get(fromItemId, toItemId, input.relationType) as { id?: string } | undefined;
    const id = existing?.id ?? randomUUID();
    this.db
      .prepare(`
        INSERT INTO relations(
          id, from_item_id, to_item_id, relation_type, score, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(from_item_id, to_item_id, relation_type) DO UPDATE SET
          score = excluded.score,
          reason = excluded.reason
      `)
      .run(
        id,
        fromItemId,
        toItemId,
        input.relationType,
        input.score,
        input.reason,
        now(),
      );
    return id;
  }

  listRelations(itemIds: string[]): RelationRecord[] {
    if (itemIds.length === 0) return [];
    const placeholders = itemIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`
        SELECT * FROM relations
        WHERE from_item_id IN (${placeholders}) OR to_item_id IN (${placeholders})
        ORDER BY score DESC
      `)
      .all(...itemIds, ...itemIds) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      fromItemId: asString(row.from_item_id),
      id: asString(row.id),
      reason: asString(row.reason),
      relationType: asString(row.relation_type) as RelationRecord["relationType"],
      score: asNumber(row.score),
      toItemId: asString(row.to_item_id),
    }));
  }

  createJob(input: PipelineInput) {
    const id = randomUUID();
    const timestamp = now();
    this.db
      .prepare(`
        INSERT INTO jobs(
          id, type, status, input_json, max_attempts, created_at, updated_at
        ) VALUES (?, 'research_pipeline', 'pending', ?, ?, ?, ?)
      `)
      .run(id, json(input), input.maxAttempts ?? 3, timestamp, timestamp);
    return id;
  }

  getJob(id: string): JobRecord | null {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      attempts: asNumber(row.attempts),
      startedAt:row.started_at===null?null:asString(row.started_at),finishedAt:row.finished_at===null?null:asString(row.finished_at),
      currentStage: row.current_stage === null ? null : asString(row.current_stage),
      id: asString(row.id),
      input: parseJson<PipelineInput>(row.input_json),
      lastError: row.last_error === null ? null : asString(row.last_error),
      maxAttempts: asNumber(row.max_attempts),
      output:
        row.output_json === null
          ? null
          : parseJson<Partial<PipelineResult>>(row.output_json),
      status: asString(row.status) as JobStatus,
      type: asString(row.type),
    };
  }

  listJobs(limit = 20): JobRecord[] {
    const rows = this.db
      .prepare("SELECT id FROM jobs ORDER BY updated_at DESC LIMIT ?")
      .all(Math.min(100, Math.max(1, limit))) as Array<{ id: string }>;
    return rows
      .map((row) => this.getJob(row.id))
      .filter((job): job is JobRecord => Boolean(job));
  }

  acquireJobLease(jobId: string, options: { ownerId?: string; leaseMs?: number; nowMs?: number } = {}) {
    const nowMs = options.nowMs ?? Date.now();
    const leaseMs = options.leaseMs ?? 30_000;
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new Error("Lease duration must be positive.");
    return this.transaction(() => {
      const job = this.getJob(jobId);
      if (!job) throw new Error(`Job not found: ${jobId}`);
      const prior = this.db.prepare("SELECT * FROM job_leases WHERE job_id=?").get(jobId) as Record<string, unknown> | undefined;
      const timestamp = new Date(nowMs).toISOString();
      if (prior && asString(prior.expires_at) > timestamp) throw new Error(`Job ${jobId} is already leased.`);
      if (prior || job.status === "running") this.recoverInterruptedJob(jobId, timestamp);
      const lease = { jobId, token: randomUUID(), ownerId: options.ownerId ?? `${process.pid}:${randomUUID()}`, expiresAt: new Date(nowMs + leaseMs).toISOString() };
      this.db.prepare(`INSERT INTO job_leases(job_id,token,owner_id,expires_at) VALUES(?,?,?,?)
        ON CONFLICT(job_id) DO UPDATE SET token=excluded.token,owner_id=excluded.owner_id,expires_at=excluded.expires_at`)
        .run(jobId,lease.token,lease.ownerId,lease.expiresAt);
      return lease;
    });
  }

  assertJobLease(jobId: string, token: string, nowMs = Date.now()) {
    const lease = this.db.prepare("SELECT expires_at FROM job_leases WHERE job_id=? AND token=?")
      .get(jobId,token) as { expires_at: string } | undefined;
    if (!lease || lease.expires_at <= new Date(nowMs).toISOString()) throw new Error(`Job ${jobId} lease expired or ownership was lost.`);
  }

  renewJobLease(jobId: string, token: string, leaseMs = 30_000, nowMs = Date.now()) {
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new Error("Lease duration must be positive.");
    this.transaction(() => {
      this.assertJobLease(jobId,token,nowMs);
      this.db.prepare("UPDATE job_leases SET expires_at=? WHERE job_id=? AND token=?")
        .run(new Date(nowMs + leaseMs).toISOString(),jobId,token);
    });
  }

  releaseJobLease(jobId: string, token: string) {
    this.db.prepare("DELETE FROM job_leases WHERE job_id=? AND token=?").run(jobId,token);
  }

  withJobLease<T>(jobId: string, token: string, operation: () => T): T {
    return this.transaction(() => {
      this.assertJobLease(jobId,token);
      const result = operation();
      this.assertJobLease(jobId,token);
      return result;
    });
  }

  private recoverInterruptedJob(jobId: string, timestamp: string) {
    const message = "Interrupted while running; expired lease recovered.";
    this.db.prepare(`UPDATE job_attempts SET status='failed',completed_at=?,error=?
      WHERE job_id=? AND status='running'`).run(timestamp,message,jobId);
    this.db.prepare(`UPDATE jobs SET status=CASE WHEN attempts<max_attempts THEN 'retry_wait' ELSE 'failed' END,
      last_error=?,updated_at=? WHERE id=? AND status='running'`).run(message,timestamp,jobId);
  }

  recordJobDiagnostic(jobId: string, message: string) {
    this.db.prepare("UPDATE jobs SET last_error=? WHERE id=?").run(message,jobId);
  }

  startJobAttempt(jobId: string, provider: string, model: string) {
    const job = this.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    if (job.attempts >= job.maxAttempts) {
      throw new Error(`Job ${jobId} reached its attempt limit (${job.maxAttempts}).`);
    }
    const attempt = job.attempts + 1;
    const timestamp = now();
    this.transaction(() => {
      this.db
        .prepare(`
          UPDATE jobs SET
            status = 'running', attempts = ?, started_at = coalesce(started_at, ?),
            updated_at = ?, last_error = NULL, provider = ?, model = ?
          WHERE id = ?
        `)
        .run(attempt, timestamp, timestamp, provider, model, jobId);
      this.db
        .prepare(`
          INSERT INTO job_attempts(id, job_id, attempt, status, started_at)
          VALUES (?, ?, ?, 'running', ?)
        `)
        .run(randomUUID(), jobId, attempt, timestamp);
    });
    return attempt;
  }

  setJobStage(jobId: string, stage: string) {
    this.db
      .prepare("UPDATE jobs SET current_stage = ?, updated_at = ? WHERE id = ?")
      .run(stage, now(), jobId);
  }

  saveCheckpoint(jobId: string, stage: string, data: unknown) {
    const timestamp = now();
    this.db
      .prepare(`
        INSERT INTO checkpoints(job_id, stage, status, data_json, created_at, updated_at)
        VALUES (?, ?, 'succeeded', ?, ?, ?)
        ON CONFLICT(job_id, stage) DO UPDATE SET
          status = 'succeeded', data_json = excluded.data_json, updated_at = excluded.updated_at
      `)
      .run(jobId, stage, json(data), timestamp, timestamp);
  }

  getCheckpoint<T>(jobId: string, stage: string): T | null {
    const row = this.db
      .prepare("SELECT data_json FROM checkpoints WHERE job_id = ? AND stage = ? AND status = 'succeeded'")
      .get(jobId, stage) as { data_json?: string } | undefined;
    return row?.data_json ? parseJson<T>(row.data_json) : null;
  }

  finishJob(
    jobId: string,
    attempt: number,
    status: Extract<JobStatus, "succeeded" | "failed" | "needs_review" | "retry_wait">,
    output: Partial<PipelineResult> | null,
    error?: string,
  ) {
    const timestamp = now();
    this.transaction(() => {
      this.db
        .prepare(`
          UPDATE jobs SET
            status = ?, output_json = ?, last_error = ?, updated_at = ?,
            finished_at = CASE WHEN ? IN ('succeeded', 'needs_review', 'failed') THEN ? ELSE NULL END
          WHERE id = ?
        `)
        .run(status, output ? json(output) : null, error ?? null, timestamp, status, timestamp, jobId);
      this.db
        .prepare(`
          UPDATE job_attempts SET status = ?, completed_at = ?, error = ?
          WHERE job_id = ? AND attempt = ?
        `)
        .run(status, timestamp, error ?? null, jobId, attempt);
    });
  }

  markStaleJobsForRetry(olderThanIso: string) {
    return this.transaction(() => {
      const timestamp = now();
      const jobs = this.db.prepare(`SELECT j.id FROM jobs j LEFT JOIN job_leases l ON l.job_id=j.id
        WHERE j.status='running' AND j.updated_at<? AND (l.job_id IS NULL OR l.expires_at<=?)`)
        .all(olderThanIso,timestamp) as Array<{id: string}>;
      for (const job of jobs) {
        this.recoverInterruptedJob(job.id,timestamp);
        this.db.prepare("DELETE FROM job_leases WHERE job_id=? AND expires_at<=?").run(job.id,timestamp);
      }
      return jobs.length;
    });
  }

  saveAnalysis(input: {
    hypotheses: Array<{ rationale: string; text: string }>;
    jobId: string;
    model: string;
    provider: string;
    summary: string;
    topic: string;
  }) {
    const analysisId = randomUUID();
    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO analyses(id, job_id, topic, summary, provider, model, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          analysisId,
          input.jobId,
          input.topic,
          input.summary,
          input.provider,
          input.model,
          now(),
        );
      for (const hypothesis of input.hypotheses) {
        this.db
          .prepare(`
            INSERT INTO hypotheses(id, analysis_id, text, rationale, status, created_at)
            VALUES (?, ?, ?, ?, 'unverified', ?)
          `)
          .run(randomUUID(), analysisId, hypothesis.text, hypothesis.rationale, now());
      }
    });
    return analysisId;
  }

  saveArticle(input: {
    claimIds: string[];
    jobId: string;
    markdown: string;
    model: string;
    provider: string;
    slug: string;
    title: string;
  }) {
    const id = randomUUID();
    const timestamp = now();
    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO articles(
            id, job_id, title, slug, status, markdown, provider, model, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
        `)
        .run(
          id,
          input.jobId,
          input.title,
          input.slug,
          input.markdown,
          input.provider,
          input.model,
          timestamp,
          timestamp,
        );
      for (const claimId of [...new Set(input.claimIds)]) {
        this.db
          .prepare(`
            INSERT INTO article_claims(article_id, claim_id, section)
            VALUES (?, ?, 'source claims')
          `)
          .run(id, claimId);
      }
    });
    return id;
  }

  setArticleOutputPath(articleId: string, outputPath: string) {
    this.db
      .prepare("UPDATE articles SET output_path = ?, updated_at = ? WHERE id = ?")
      .run(outputPath, now(), articleId);
  }

  getArticle(articleId: string): {id: string; jobId: string; markdown: string; status: string; outputPath: string | null} | null {
    const row = this.db.prepare("SELECT * FROM articles WHERE id=?").get(articleId) as Record<string, unknown> | undefined;
    return row ? {id: asString(row.id),jobId: asString(row.job_id),markdown: asString(row.markdown),
      status: asString(row.status),outputPath: row.output_path === null ? null : asString(row.output_path)} : null;
  }

  getArticleVerification(articleId: string): VerificationReport | null {
    const row = this.db.prepare(
      "SELECT report_json FROM verifications WHERE article_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
    ).get(articleId);
    return row ? parseJson<VerificationReport>(row.report_json) : null;
  }

  saveVerification(articleId: string, report: VerificationReport) {
    this.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO verifications(
            id, article_id, status, issues_json, report_json, verifier, created_at
          ) VALUES (?, ?, ?, ?, ?, 'deterministic-v1', ?)
        `)
        .run(
          randomUUID(),
          articleId,
          report.status,
          json(report.issues),
          json(report),
          report.checkedAt,
        );
      this.db
        .prepare("UPDATE articles SET status = ?, updated_at = ? WHERE id = ?")
        .run(report.status === "passed" ? "structurally_checked_draft" : "needs_review", now(), articleId);
    });
  }

  saveDocumentCoverage(versionId:string,documentId:string|null,coverage:unknown) {
    this.db.prepare('INSERT OR IGNORE INTO research_content_provenance VALUES(?,?,?)').run(versionId,documentId,JSON.stringify(coverage));
  }

  getCounts() {
    const tables = [
      "sources",
      "fetch_runs",
      "items",
      "claims",
      "evidence",
      "relations",
      "jobs",
      "articles",
      "verifications",
    ] as const;
    return Object.fromEntries(
      tables.map((table) => {
        const row = this.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as {
          count: number;
        };
        return [table, Number(row.count)];
      }),
    );
  }

  private toStoredItem(row: Record<string, unknown>): StoredItem {
    return {
      author: optionalString(row.author),
      canonicalUrl: asString(row.canonical_url),
      content: optionalString(row.content),
      contentHash: asString(row.content_hash),
      externalId: optionalString(row.external_id),
      fetchedAt: asString(row.fetched_at),
      id: asString(row.id),
      publishedAt: optionalString(row.published_at),
      sourceId: asString(row.source_id),
      summary: optionalString(row.summary),
      title: asString(row.title),
      url: asString(row.url),
      versionId: optionalString(row.current_version_id),
      legacyContentHash: optionalString(row.legacy_content_hash),
      provenance: optionalString(row.provenance) as StoredItem["provenance"],
    };
  }
}
