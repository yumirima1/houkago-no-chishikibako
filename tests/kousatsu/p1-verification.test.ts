import assert from "node:assert/strict";
import test from "node:test";

import { createGroundedArticle } from "../../src/lib/kousatsu/article";
import type {
  ArticleDraft,
  ClaimRecord,
  EvidenceRecord,
  ItemSourceRecord,
  StoredItem,
} from "../../src/lib/kousatsu/types";
import { verifyArticle } from "../../src/lib/kousatsu/verify";

function fixture(classification: ClaimRecord["classification"] = "source_claim") {
  const item: StoredItem = {
    canonicalUrl: "https://example.invalid/entry",
    contentHash: "content-hash",
    fetchedAt: new Date(0).toISOString(),
    id: "item-1",
    sourceId: "source-1",
    summary: "A source reports the launch of a study.",
    title: "Study launch",
    url: "https://example.invalid/entry",
  };
  const claim: ClaimRecord = {
    classification,
    confidence: 0.5,
    createdAt: new Date(0).toISOString(),
    id: "claim-1",
    itemId: item.id,
    reason: "Source summary only; no independent fact check.",
    text: item.summary!,
  };
  const evidence: EvidenceRecord = {
    claimId: claim.id,
    excerpt: item.summary!,
    id: "evidence-1",
    itemId: item.id,
    locator: item.url,
    stance: "supports",
  };
  const article: ArticleDraft = {
    assertions: [{ claimId: claim.id, classification, text: claim.text }],
    markdown: `${claim.text}\n\n## 分析・考察\n\n## 不明点・限界\n\n[Source](${item.url})\n`,
    title: "Test draft",
    usedClaimIds: [claim.id],
  };
  return { article, claims: [claim], evidence: [evidence], items: [item] };
}

test("verification rejects assertion classification and text that differ from the saved claim", () => {
  for (const change of [
    { classification: "confirmed_fact" as const },
    { text: "A different unsupported statement." },
  ]) {
    const input = fixture();
    Object.assign(input.article.assertions[0], change);
    const report = verifyArticle(input);
    assert.equal(report.status, "failed");
    assert.ok(
      report.issues.some((issue) =>
        issue.code === ("text" in change ? "CLAIM_TEXT_MISMATCH" : "CLAIM_CLASSIFICATION_MISMATCH") &&
        issue.severity === "error",
      ),
    );
  }
});

test("a structural pass explicitly leaves source claims and confirmed_fact labels unverified", () => {
  for (const classification of ["source_claim", "confirmed_fact"] as const) {
    const report = verifyArticle(fixture(classification));
    assert.equal(report.status, "passed");
    assert.equal(report.scope, "structure-and-references");
    assert.equal(report.factCheckStatus, "unverified");
    assert.ok(report.issues.some((issue) => issue.code.endsWith("NOT_INDEPENDENTLY_VERIFIED")));
  }
});

test("matching assertion metadata cannot conceal replacement of the Markdown claim body", () => {
  const input = fixture();
  input.article.markdown = input.article.markdown.replace(input.claims[0].text, "A substituted claim.");
  const report = verifyArticle(input);
  assert.equal(report.status, "failed");
  assert.ok(report.issues.some((issue) => issue.code === "ASSERTION_TEXT_NOT_IN_MARKDOWN"));
});

test("article whitespace and escaped Markdown brackets preserve claim identity", () => {
  const input = fixture();
  input.claims[0].text = "The source [reports]\na study.";
  input.items[0].summary = input.claims[0].text;
  input.evidence[0].excerpt = input.claims[0].text;
  const article = createGroundedArticle({
    analysis: { hypotheses: [], model: "test", provider: "test", summary: "Interpretation only." },
    claims: input.claims,
    generatedAt: new Date(0).toISOString(),
    items: input.items,
    relations: [],
    topic: "Test",
  });
  assert.equal(verifyArticle({ ...input, article }).status, "passed");
});

test("contradicting evidence is reported even alongside supporting evidence", () => {
  const input = fixture();
  input.evidence.push({ ...input.evidence[0], id: "counter-evidence", stance: "contradicts" });
  const report = verifyArticle(input);
  assert.equal(report.status, "failed");
  assert.equal(report.factCheckStatus, "contradicted");
  assert.ok(report.issues.some((issue) => issue.code === "CONTRADICTED_CLAIM"));
});

test("unverified and contradiction classifications remain explicit rather than promoted", () => {
  for (const classification of ["unverified", "contradiction"] as const) {
    const input = fixture(classification);
    const report = verifyArticle(input);
    assert.equal(report.factCheckStatus, classification === "contradiction" ? "contradicted" : "unverified");
    assert.ok(report.issues.some((issue) => issue.code === (classification === "contradiction" ? "CONTRADICTED_CLAIM" : "UNVERIFIED_CLAIM")));
    const article = createGroundedArticle({
      analysis: { hypotheses: [], model: "test", provider: "test", summary: "Interpretation only." },
      claims: input.claims,
      generatedAt: new Date(0).toISOString(),
      items: input.items,
      relations: [],
      topic: "Test",
    });
    assert.ok(article.assertions.some((assertion) => assertion.classification === classification));
    assert.ok(article.markdown.includes(input.claims[0].text));
  }
});

test("evidence excerpts must occur in the saved document rather than invented text", () => {
  const input = fixture();
  input.evidence[0].excerpt = "An invented quotation absent from the document.";
  const report = verifyArticle(input);
  assert.equal(report.status, "failed");
  assert.ok(report.issues.some((issue) => issue.code === "EVIDENCE_EXCERPT_MISMATCH"));
});

test("historical or unversioned claims and evidence cannot pass as the selected document version", () => {
  for (const versionId of ["old-version", undefined]) {
    const input = fixture();
    input.items[0].versionId = "current-version";
    input.claims[0].versionId = versionId;
    input.evidence[0].versionId = versionId;
    const report = verifyArticle(input);
    assert.equal(report.status, "failed");
    assert.ok(report.issues.some((issue) => issue.code === "STALE_CLAIM_VERSION"));
    assert.ok(report.issues.some((issue) => issue.code === "STALE_EVIDENCE_VERSION"));
  }
  const current = fixture();
  current.items[0].versionId = "current-version";
  current.claims[0].versionId = "current-version";
  current.evidence[0].versionId = "current-version";
  assert.equal(verifyArticle(current).status, "passed");
});

test("a contradictory saved classification cannot be concealed by an assertion label", () => {
  const input = fixture("contradiction");
  input.article.assertions[0].classification = "source_claim";
  const report = verifyArticle(input);
  assert.equal(report.status, "failed");
  assert.equal(report.factCheckStatus, "contradicted");
  assert.ok(report.issues.some((issue) => issue.code === "CLAIM_CLASSIFICATION_MISMATCH"));
});

test("generated Markdown does not present a confirmed_fact label as independent fact verification", () => {
  const input = fixture("confirmed_fact");
  const article = createGroundedArticle({
    analysis: { hypotheses: [], model: "test", provider: "test", summary: "Interpretation only." },
    claims: input.claims,
    generatedAt: new Date(0).toISOString(),
    items: input.items,
    relations: [],
    topic: "Test",
  });
  assert.doesNotMatch(article.markdown, /## 確認された事実/);
  assert.match(article.markdown, /構造・参照整合性/);
  assert.match(article.markdown, /独立した事実確認は未実施/);
});

test("an invented evidence locator fails even when its excerpt and the article source link match", () => {
  const input = fixture();
  input.evidence[0].locator = "https://untracked.invalid/invented-source";
  const report = verifyArticle(input);
  assert.equal(report.status, "failed");
  assert.equal(report.factCheckStatus, "unverified");
  assert.ok(report.issues.some((issue) => issue.code === "UNTRACKED_EVIDENCE_LOCATOR"));
});

test("a historical source alias is accepted only for the evidence's immutable document version", () => {
  const input = fixture();
  const item = input.items[0];
  item.versionId = "retained-version";
  input.claims[0].versionId = item.versionId;
  input.evidence[0].versionId = item.versionId;
  const alias = "https://other-source.invalid/original-entry";
  input.evidence[0].locator = alias;
  input.article.markdown = input.article.markdown.replace(item.url, alias);
  const source: ItemSourceRecord = {
    canonicalUrl: alias, firstFetchedAt: item.fetchedAt, itemId: item.id,
    lastFetchedAt: item.fetchedAt, sourceId: "other-source", url: alias,
    versionId: item.versionId,
  };
  assert.equal(verifyArticle({ ...input, sources: [source] }).status, "passed");
  const wrongVersion = verifyArticle({ ...input, sources: [{ ...source, versionId: "revised-version" }] });
  assert.equal(wrongVersion.status, "failed");
  assert.ok(wrongVersion.issues.some((issue) => issue.code === "UNTRACKED_EVIDENCE_LOCATOR"));
  assert.ok(wrongVersion.issues.some((issue) => issue.code === "UNTRACKED_SOURCE_URL"));
});
