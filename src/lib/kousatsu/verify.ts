import type {
  ArticleDraft,
  ClaimRecord,
  EvidenceRecord,
  ItemSourceRecord,
  StoredItem,
  VerificationIssue,
  VerificationReport,
} from "./types";

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

// This checks saved structure and references only. A matching excerpt or a
// confirmed_fact label is not independent corroboration or proof of truth.
export function verifyArticle(input: {
  article: ArticleDraft;
  claims: ClaimRecord[];
  evidence: EvidenceRecord[];
  items: StoredItem[];
  /** Source aliases belonging to the selected immutable document versions. */
  sources?: ItemSourceRecord[];
  additionalSources?: StoredItem[];
}): VerificationReport {
  const issues: VerificationIssue[] = [];
  const quality=input.article.quality;
  if(quality) {
    const valid=new Set(quality.observations.map(o=>o.claimId));
    for(const observation of quality.observations) {
      const claim=input.claims.find(c=>c.id===observation.claimId);
      const item=input.items.find(i=>i.id===observation.itemId);
      if(!claim || claim.text!==observation.quote || claim.versionId!==observation.versionId || item?.versionId!==observation.versionId ||
        ![item.title,item.summary ?? '',item.content ?? ''].some(body=>normalizedText(body).includes(normalizedText(observation.quote))))
        issues.push({code:'UNGROUNDED_OBSERVATION',severity:'error',message:`原文と対応しない記述: ${observation.claimId}`});
    }
    for(const inference of [...quality.conclusions,...quality.hypotheses]) {
      if(!inference.premiseClaimIds.length || inference.premiseClaimIds.some(id=>!valid.has(id)) || !quality.coverage.some(c=>c.kind==='article-body'))
        issues.push({code:'UNGROUNDED_INFERENCE',severity:'error',message:'原文を前提にできない解釈・仮説が含まれています。'});
    }
    const view=quality.reflection;
    if(view) {
      if([view.issue,view.position,view.reasoning,view.alternative,view.revisionCondition].some(value=>typeof value!=='string'||!value.trim()))
        issues.push({code:'REFLECTION_INCOMPLETE',severity:'error',message:'見解・理由・別の説明・修正条件のいずれかが欠落しています。'});
      if(view.premiseClaimIds.some(id=>!valid.has(id)) || (!view.premiseClaimIds.length&&view.scope!=='no-source'))
        issues.push({code:'REFLECTION_UNKNOWN_PREMISE',severity:'error',message:'見解の前提を保存済み引用へ追跡できません。'});
      if(input.article.assertions.some(a=>a.text===view.position&&['source_claim','confirmed_fact'].includes(a.classification)))
        issues.push({code:'INFERENCE_MISCLASSIFIED_AS_FACT',severity:'error',message:'暫定的な見解が事実・出典の記述として表示されています。'});
      for(const id of view.premiseClaimIds)if(input.claims.some(c=>c.id===id&&c.classification==='contradiction'))
        issues.push({code:'REFLECTION_COUNTEREVIDENCE',severity:'warning',message:`見解の前提に反対材料があります。修正条件と併せて再評価してください: ${id}`});
    }
  }
  const claimById = new Map(input.claims.map((claim) => [claim.id, claim]));
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const urlsByItem = new Map(input.items.map((item) => [item.id, new Set([
    item.url,
    ...input.sources?.filter((source) => source.itemId === item.id &&
      Boolean(item.versionId) && source.versionId === item.versionId)
      .flatMap((source) => [source.url, source.canonicalUrl]) ?? [],
  ])]));
  const evidenceByClaim = new Map<string, EvidenceRecord[]>();
  let hasContradiction = false;
  const markdownUrls = [
    ...input.article.markdown.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g),
  ].map((match) => match[1]);
  const linkedUrls = new Set(markdownUrls);

  for (const evidence of input.evidence) {
    evidenceByClaim.set(evidence.claimId, [
      ...(evidenceByClaim.get(evidence.claimId) ?? []),
      evidence,
    ]);
  }

  for (const assertion of input.article.assertions) {
    const requiresEvidence =
      assertion.classification === "confirmed_fact" ||
      assertion.classification === "source_claim";
    if (requiresEvidence && !assertion.claimId) {
      issues.push({
        code: "MISSING_CLAIM_ID",
        message: `根拠が必要な主張にclaimIdがありません: ${assertion.text.slice(0, 80)}`,
        severity: "error",
      });
      continue;
    }
    if (assertion.classification === "unverified") {
      issues.push({
        code: "UNVERIFIED_CLAIM",
        message: `未確認の主張です: ${assertion.text.slice(0, 80)}`,
        severity: "warning",
      });
    }
    if (assertion.classification === "contradiction") {
      hasContradiction = true;
      issues.push({
        code: "CONTRADICTED_CLAIM",
        message: `矛盾が記録された主張です。真偽の独立判定は未実施です: ${assertion.text.slice(0, 80)}`,
        severity: "error",
      });
    }
    if (!assertion.claimId) continue;
    const claim = claimById.get(assertion.claimId);
    if (!claim) {
      issues.push({
        code: "UNKNOWN_CLAIM",
        message: `記事が存在しない主張を参照しています: ${assertion.claimId}`,
        severity: "error",
      });
      continue;
    }
    if (assertion.classification !== claim.classification) {
      issues.push({
        code: "CLAIM_CLASSIFICATION_MISMATCH",
        message: `記事と保存済み主張の分類が一致しません: ${claim.id} (${assertion.classification} / ${claim.classification})`,
        severity: "error",
      });
    }
    if (assertion.text !== claim.text) {
      issues.push({
        code: "CLAIM_TEXT_MISMATCH",
        message: `記事と保存済み主張の本文が一致しません: ${claim.id}`,
        severity: "error",
      });
    }
    const renderedText = normalizedText(assertion.text)
      .replaceAll("[", "［")
      .replaceAll("]", "］");
    if (!renderedText || !normalizedText(input.article.markdown).includes(renderedText)) {
      issues.push({
        code: "ASSERTION_TEXT_NOT_IN_MARKDOWN",
        message: `記事本文に参照対象の主張がありません: ${claim.id}`,
        severity: "error",
      });
    }
    if (claim.classification === "contradiction" && assertion.classification !== "contradiction") {
      hasContradiction = true;
      issues.push({
        code: "CONTRADICTED_CLAIM",
        message: `保存済み主張に矛盾が記録されています。真偽の独立判定は未実施です: ${claim.id}`,
        severity: "error",
      });
    }
    if (claim.itemId) {
      const item = itemById.get(claim.itemId);
      if (!item) {
        issues.push({
          code: "UNKNOWN_CLAIM_ITEM",
          message: `主張に対応する保存文書がありません: ${claim.id}`,
          severity: "error",
        });
      } else if (item.versionId && claim.versionId !== item.versionId) {
        issues.push({
          code: "STALE_CLAIM_VERSION",
          message: `主張の版が対象文書の版と一致しません: ${claim.id}`,
          severity: "error",
        });
      }
    }
    const linkedEvidence = evidenceByClaim.get(claim.id) ?? [];
    const supports = linkedEvidence.filter(
      (evidence) => evidence.stance === "supports",
    );
    if (requiresEvidence && supports.length === 0) {
      issues.push({
        code: "MISSING_EVIDENCE",
        message: `主張に対応する証拠がありません: ${claim.text.slice(0, 80)}`,
        severity: "error",
      });
    }
    if (linkedEvidence.some((evidence) => evidence.stance === "contradicts")) {
      hasContradiction = true;
      issues.push({
        code: "CONTRADICTED_CLAIM",
        message: `主張に反対する証拠が記録されています。真偽の独立判定は未実施です: ${claim.id}`,
        severity: "error",
      });
    }
    for (const evidence of linkedEvidence) {
      const item = itemById.get(evidence.itemId);
      const sourceUrls = urlsByItem.get(evidence.itemId) ?? new Set<string>();
      if (!sourceUrls.has(evidence.locator)) {
        issues.push({
          code: "UNTRACKED_EVIDENCE_LOCATOR",
          message: `証拠の参照先が対象文書の保存済み出典・版に対応しません: ${evidence.id}`,
          severity: "error",
        });
      }
      if (!item || ![...sourceUrls].some((url) => linkedUrls.has(url))) {
        issues.push({
          code: "MISSING_SOURCE_LINK",
          message: `主張の出典URLが記事にありません: ${claim.text.slice(0, 80)}`,
          severity: "error",
        });
      }
      if (!evidence.excerpt.trim()) {
        issues.push({
          code: "EMPTY_EVIDENCE",
          message: `証拠箇所が空です: ${claim.text.slice(0, 80)}`,
          severity: "error",
        });
      } else if (item && ![item.title, item.summary ?? "", item.content ?? ""].some(
        (body) => normalizedText(body).includes(normalizedText(evidence.excerpt)),
      )) {
        issues.push({
          code: "EVIDENCE_EXCERPT_MISMATCH",
          message: `証拠の引用箇所が保存文書にありません: ${evidence.id}`,
          severity: "error",
        });
      }
      if (item?.versionId && evidence.versionId !== item.versionId) {
        issues.push({
          code: "STALE_EVIDENCE_VERSION",
          message: `証拠の版が対象文書の版と一致しません: ${evidence.id}`,
          severity: "error",
        });
      }
    }
    if (claim.classification === "source_claim") {
      issues.push({
        code: "SOURCE_CLAIM_NOT_INDEPENDENTLY_VERIFIED",
        message: `独立確認前の出典主張です: ${claim.text.slice(0, 80)}`,
        severity: "warning",
      });
    } else if (claim.classification === "confirmed_fact") {
      issues.push({
        code: "CONFIRMED_LABEL_NOT_INDEPENDENTLY_VERIFIED",
        message: `confirmed_factは保存済みの分類であり、この検査は独立した事実確認を行っていません: ${claim.id}`,
        severity: "warning",
      });
    }
  }

  if (!input.article.markdown.includes("## 分析・考察")) {
    issues.push({
      code: "MISSING_ANALYSIS_SECTION",
      message: "事実と推論を分離する分析・考察セクションがありません。",
      severity: "error",
    });
  }
  if (!input.article.markdown.includes("## 不明点・限界")) {
    issues.push({
      code: "MISSING_LIMITATIONS_SECTION",
      message: "不明点・限界セクションがありません。",
      severity: "error",
    });
  }

  const knownUrls = new Set([...urlsByItem.values()].flatMap((urls) => [...urls]));
  for (const item of input.additionalSources ?? []) knownUrls.add(item.url);
  for (const url of markdownUrls) {
    try {
      new URL(url);
    } catch {
      issues.push({
        code: "INVALID_URL",
        message: `無効なURLです: ${url}`,
        severity: "error",
      });
      continue;
    }
    if (!knownUrls.has(url)) {
      issues.push({
        code: "UNTRACKED_SOURCE_URL",
        message: `保存済み情報に対応しないURLです: ${url}`,
        severity: "error",
      });
    }
  }

  return {
    ...(quality ? {grounding:{status:quality.status,quoteChecks:quality.observations.length,independentVerification:'not-performed' as const,semanticReview:'pending' as const}} : {}),
    checkedAt: new Date().toISOString(),
    factCheckStatus: hasContradiction ? "contradicted" : "unverified",
    issues,
    scope: "structure-and-references",
    status: issues.some((issue) => issue.severity === "error")
      ? "failed"
      : "passed",
  };
}
