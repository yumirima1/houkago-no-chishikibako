import type {
  AnalysisResult,
  ArticleDraft,
  ClaimRecord,
  ItemSourceRecord,
  RelationRecord,
  StoredItem,
} from "./types";
import { createQualityArticle } from './quality-article';

function oneLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdown(value: string) {
  return oneLine(value).replaceAll("[", "［").replaceAll("]", "］");
}

export function articleSlug(topic: string) {
  const ascii = topic
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return ascii || `kousatsu-${new Date().toISOString().slice(0, 10)}`;
}

export type GroundedArticleInput = {
  analysis: AnalysisResult;
  claims: ClaimRecord[];
  generatedAt?: string;
  items: StoredItem[];
  sources?: ItemSourceRecord[];
  relations: RelationRecord[];
  topic: string;
};

export function createGroundedArticle(input: GroundedArticleInput): ArticleDraft {
  if(input.analysis.quality)return createQualityArticle(input);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const sourceClaims = input.claims.filter(
    (claim) => claim.classification === "source_claim" && claim.itemId,
  );
  const confirmedFacts = input.claims.filter(
    (claim) => claim.classification === "confirmed_fact" && claim.itemId,
  );
  const unverifiedClaims = input.claims.filter(
    (claim) => claim.classification === "unverified",
  );
  const contradictedClaims = input.claims.filter(
    (claim) => claim.classification === "contradiction",
  );
  const renderedClaims = [
    ...confirmedFacts,
    ...sourceClaims,
    ...unverifiedClaims,
    ...contradictedClaims,
  ];
  const citedItems: StoredItem[] = [];
  const citationByItem = new Map<string, number>();

  for (const claim of renderedClaims) {
    const item = claim.itemId ? itemById.get(claim.itemId) : undefined;
    if (item && !citationByItem.has(item.id)) {
      citedItems.push(item);
      citationByItem.set(item.id, citedItems.length);
    }
  }

  const claimLines = (claims: ClaimRecord[]) =>
    claims.length
      ? claims.map((claim) => {
          const citation = claim.itemId ? citationByItem.get(claim.itemId) : undefined;
          return `- ${escapeMarkdown(claim.text)}${citation ? ` [^${citation}]` : ""}`;
        })
      : ["- 現時点で、この区分に該当する内容はありません。"];

  const relationLines = input.relations.length
    ? input.relations.slice(0, 10).map((relation) => {
        const left = itemById.get(relation.fromItemId);
        const right = itemById.get(relation.toItemId);
        return `- 「${escapeMarkdown(left?.title ?? relation.fromItemId)}」と「${escapeMarkdown(right?.title ?? relation.toItemId)}」には類似が見つかりました（${escapeMarkdown(relation.reason)}、score=${relation.score.toFixed(3)}）。これは因果関係の証明ではありません。`;
      })
    : ["- 保存済み記録との機械的な類似関係は、今回の範囲では見つかりませんでした。"];

  const hypothesisLines = input.analysis.hypotheses.length
    ? input.analysis.hypotheses.map(
        (hypothesis) =>
          `- 仮説: ${escapeMarkdown(hypothesis.text)}\n  - 評価理由: ${escapeMarkdown(hypothesis.rationale)}`,
      )
    : ["- 仮説を形成するための情報が不足しています。"];
  const references = citedItems.map((item, index) => {
    const date = item.publishedAt ? ` / ${item.publishedAt.slice(0, 10)}` : "";
    const aliases = input.sources?.filter((source) => source.itemId === item.id &&
      Boolean(item.versionId) && source.versionId === item.versionId) ?? [];
    const sourceLines = aliases.length ? aliases.map((source) =>
      `    - 出典 ${escapeMarkdown(source.sourceId)}: [${escapeMarkdown(item.title)}](${source.url})（取得: ${source.lastFetchedAt}${source.externalId ? ` / 識別子: ${escapeMarkdown(source.externalId)}` : ""}）`,
    ) : [];
    return [
      `[^${index + 1}]: [${escapeMarkdown(item.title)}](${item.url})${date}（取得: ${item.fetchedAt}）`,
      ...(item.versionId ? [`    - 保存版: ${item.versionId} / SHA-256: ${item.contentHash}`] : []),
      ...sourceLines,
    ].join("\n");
  });
  const title = `${oneLine(input.topic)}をめぐる記録と考察`;
  const markdown = [
    `# ${title}`,
    "",
    `> 生成日時: ${generatedAt}`,
    `> 生成方式: ${input.analysis.provider} / ${input.analysis.model}`,
    "> 状態: 下書き。verification.json は構造・参照整合性の検査結果です。独立した事実確認は未実施です。外部公開前に人間が確認してください。",
    "",
    "## 要点",
    "",
    escapeMarkdown(input.analysis.summary),
    "",
    "## 事実として分類された主張（独立確認前）",
    "",
    ...claimLines(confirmedFacts),
    "",
    "## 出典の主張（独立確認前）",
    "",
    ...claimLines(sourceClaims),
    "",
    "## 未確認の主張",
    "",
    ...claimLines(unverifiedClaims),
    "",
    "## 矛盾が記録された主張",
    "",
    ...claimLines(contradictedClaims),
    "",
    "## 過去の情報との関連",
    "",
    ...relationLines,
    "",
    "## 分析・考察",
    "",
    `- 推論: ${escapeMarkdown(input.analysis.summary)}`,
    "- 上記の推論は入力記録から構成した解釈であり、独立した証拠ではありません。",
    "",
    "## 仮説と別の解釈",
    "",
    ...hypothesisLines,
    "",
    ...(input.analysis.research ? [
      '## 自律的なテーマ選択と研究課題', '',
      `- 選択テーマ: ${escapeMarkdown(input.analysis.research.topic)}`,
      `- 選択理由: ${escapeMarkdown(input.analysis.research.reason)}`,
      `- 候補: ${input.analysis.research.candidates.map(escapeMarkdown).join('、')}`, '',
      '## 仮説の背景資料（論理的な支持は未確認）', '',
      ...input.analysis.research.evidence.map(entry => `- ${escapeMarkdown(entry.excerpt)} / claim=${entry.claimId} / 版=${entry.versionId} / [取得済み出典](${entry.url})`), '',
      '## 反証・矛盾の探索', '',
      ...(input.analysis.research.counterSearch.length ? input.analysis.research.counterSearch.map(entry =>
        `- [${escapeMarkdown(entry.title)}](${entry.url}) / 版=${entry.versionId} / ${escapeMarkdown(entry.excerpt)} / ${escapeMarkdown(entry.reason)}`)
        : ['- 保存済み資料のキーワード検索で追加の反証候補は見つかりませんでした。反証が存在しないという結論ではありません。']), '',
      '## 参照した過去の考察', '',
      ...(input.analysis.research.memories.length ? input.analysis.research.memories.map(memory =>
        `- 記憶 ${memory.id} / 過去ジョブ ${memory.jobId}: ${escapeMarkdown(memory.text).slice(0,600)}`) : ['- 関連する過去の記憶はまだありません。']), '',
      '## 次の調査課題', '', ...input.analysis.research.questions.map(question => `- ${escapeMarkdown(question)}`), '',
      '## 推論の実行記録', '',
      `- 要求: ${escapeMarkdown(input.analysis.research.model.requested)} / 使用: ${escapeMarkdown(input.analysis.research.model.used)} / ${input.analysis.research.model.elapsedMs} ms`,
      ...(input.analysis.research.model.error ? [`- 代替処理の理由: ${escapeMarkdown(input.analysis.research.model.error)}`] : []), '',
    ] : []),
    "## 不明点・限界",
    "",
    "- RSS/Atomに含まれるメタデータと要約だけを使用し、リンク先本文の自動取得はしていません。",
    "- 出典の主張は、別の独立した情報源で確認されるまで確認済み事実として扱いません。",
    "- confirmed_factは保存済みの分類です。この生成処理と構造検査だけでは真実と確認できません。矛盾の記録は、その真偽を解決したことを意味しません。",
    "- 文字列上の類似は、相関や因果関係を意味しません。",
    "",
    "## 参考情報",
    "",
    ...(references.length ? references : ["参考情報はありません。"]),
    "",
  ].join("\n");

  return {
    assertions: [
      ...renderedClaims.map((claim) => ({
        claimId: claim.id,
        classification: claim.classification,
        text: claim.text,
      })),
      {
        classification: "inference" as const,
        text: input.analysis.summary,
      },
      ...input.analysis.hypotheses.map((hypothesis) => ({
        classification: "hypothesis" as const,
        text: hypothesis.text,
      })),
    ],
    markdown,
    title,
    usedClaimIds: renderedClaims.map((claim) => claim.id),
  };
}
