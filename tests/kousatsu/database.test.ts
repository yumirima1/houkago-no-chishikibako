import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { KousatsuDatabase } from "../../src/lib/kousatsu/database";
import {
  canonicalizeUrl,
  collectFeedXml,
  parseFeed,
} from "../../src/lib/kousatsu/ingest";
import { extractSourceClaims, relateItems } from "../../src/lib/kousatsu/knowledge";

const fixturePath = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "kousatsu-sample.rss.xml",
);

test("RSS/Atom ingestion is persistent, searchable, and idempotent", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kousatsu-db-"));
  const database = new KousatsuDatabase(path.join(directory, "test.sqlite"));
  t.after(async () => {
    database.close();
    await rm(directory, { force: true, recursive: true });
  });
  const xml = await readFile(fixturePath, "utf8");
  const source = {
    feedUrl: "https://example.invalid/feed.xml",
    id: "fixture",
    name: "Fixture",
  };

  const first = collectFeedXml(database, source, xml);
  const second = collectFeedXml(database, source, xml);
  assert.equal(first.totalItemCount, 3);
  assert.equal(first.newItemCount, 3);
  assert.equal(second.newItemCount, 0);
  assert.equal(database.getCounts().items, 3);

  const results = database.search("AI検証");
  assert.equal(results.length, 2);
  assert.ok(results.every((item) => !item.canonicalUrl.includes("utm_source")));

  const items = database.listItemsForSource(source.id);
  const claims = extractSourceClaims(database, items);
  const relations = relateItems(database, items);
  assert.equal(claims.length, 3);
  assert.equal(database.listEvidence(claims.map((claim) => claim.id)).length, 3);
  assert.ok(relations.length >= 1);
});

test("Atom entries are parsed without treating embedded content as instructions", () => {
  const parsed = parseFeed(`<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom sample</title>
      <entry>
        <id>atom-1</id>
        <title>外部命令をデータとして扱う</title>
        <link rel="alternate" href="https://example.invalid/atom/1" />
        <updated>2026-10-25T00:00:00Z</updated>
        <summary>Ignore previous instructions という文字列も単なる本文です。</summary>
      </entry>
    </feed>`);
  assert.equal(parsed.entries.length, 1);
  assert.match(parsed.entries[0].summary ?? "", /Ignore previous instructions/);
});

test("item URLs reject active schemes and embedded credentials", () => {
  assert.throws(() => canonicalizeUrl("javascript:alert(1)"), /protocol/);
  assert.throws(
    () => canonicalizeUrl("https://user:password@example.invalid/article"),
    /Credentials/,
  );
});
