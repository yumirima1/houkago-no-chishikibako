import type { GroundedArticleInput } from './article';
import type { ArticleDraft } from './types';

const line=(value:string)=>value.replace(/\s+/g,' ').trim().replaceAll('[','［').replaceAll(']','］').replaceAll('<','〈').replaceAll('>','〉');
const names={metadata:'タイトル・URLのみ','feed-summary':'RSS要約','article-body':'取得した記事本文'};

/** The narrative describes saved evidence and its limits. Model prose is never
 * used as a source assertion or as a factual abstract. */
export function createQualityArticle(input:GroundedArticleInput):ArticleDraft {
  const q=input.analysis.quality!;
  const items=new Map(input.items.map(item=>[item.id,item]));
  const labels=new Map(q.observations.map((o,i)=>[o.claimId,`E${i+1}`]));
  const cite=(ids:string[])=>ids.map(id=>labels.get(id) ?? id).join('、');
  const refs=q.coverage.map(c=>{
    const item=items.get(c.itemId)!;
    return `- [${line(item.title)}](${item.url}) — ${names[c.kind]} / 本文取得: ${c.status}\n  - 取得: ${c.fetchedAt} / 公開: ${item.publishedAt ?? '不明'} / 版: ${c.versionId}${c.error ? `\n  - 取得できなかった理由: ${line(c.error)}` : ''}`;
  });
  const narrative:string[]=[];
  for(const observation of q.observations.filter(o=>o.kind!=='metadata').slice(0,4)) {
    const label=labels.get(observation.claimId)!;
    const future=observation.quote.match(/\b(will|aims? to|plans? to|planned|scheduled|expected|proposed|due in|would|could)\b/i) ?? observation.quote.match(/\bmay\b/);
    const measurements=[...observation.quote.matchAll(/(?:[$€£]\s*\d[\d,.]*(?:\s*(?:million|billion))?|\b\d[\d,.]*\s*(?:%|percent|million|billion|seconds?|minutes?|hours?|years?|months?|days?|tonnes?|people|cases))/gi)].map(m=>m[0]).slice(0,3);
    const quantity=measurements.length ? measurements : observation.quote.match(/\b(?:19|20)\d{2}\b/);
    if(future) narrative.push(`- ${label}には「${line(future[0])}」という予定・可能性の表現がある。この箇所を、実施済みの結果や効果の確認としては扱えない。実施後の観測と照合する必要がある。`);
    else if(quantity)narrative.push(`- ${label}の${[...quantity].map(v=>`「${line(v)}」`).join('、')}は出典が報告した値・時点である。比較対象の条件や観測方法を独立資料で確認できていないため、この値だけで増減の原因や効果は判断できない。`);
  }
  const regional=q.observations.map(o=>({label:labels.get(o.claimId),region:o.quote.match(/\bIn (?:the Americas|Europe|Africa|Asia)\b/)?.[0]})).filter(o=>o.region);
  if(new Set(regional.map(r=>r.region)).size>1)narrative.push(`- ${regional.map(r=>`${r.label}は「${r.region}」`).join('、')}と対象地域が異なる。比較期間・対象となる便・算定方法を揃える資料がないため、これらの削減量の差から施策の優劣を判断することはできない。`);
  if(!narrative.length)narrative.push(q.coverage.some(c=>c.kind==='article-body') ?
    '- 以下の引用で出典の記述は確認できる。ただし、効果を測った観測値と比較条件が対応する証拠は揃っていないため、効果や原因の結論を保留する。' :
    '- 取得できた範囲では出来事の詳しい内容を確認できない。タイトルから計画の詳細、対応の有効性、原因を補うことはできない。まず本文または一次資料が必要である。');
  const view=q.reflection;
  const counter=input.claims.filter(c=>view?.counterClaimIds?.includes(c.id));
  const sections=[`# ${line(q.question)}`,'',`作成: ${input.generatedAt ?? new Date().toISOString()} / 取得範囲: ${q.status==='grounded' ? '本文と引用を保存済み' : q.status==='limited' ? '一部の資料に基づく暫定見解' : '調査方針への見解'}`,
    '独立した事実確認: 未実施。引用は出典の主張であり、確認済み事実ではない。','',
    '## 対象と取得範囲','',...refs,'',
    ...(q.observations.length ? ['## 出典が述べていること','',...q.observations.map(o=>
      `**${labels.get(o.claimId)} — ${names[o.kind]}の原文（出典で確認・独立検証は未実施）**\n\n> ${line(o.quote)}\n\n[原記事](${o.url}) / claim: ${o.claimId} / 版: ${o.versionId}`),''] : []),
    '## 分析・考察','',
    ...(view ? [
      `**重要な問題** — ${line(view.issue)}`,'',
      `**私の見解（推論）** — ${line(view.position)}`,'',
      `**理由** — ${line(view.reasoning)}${view.premiseClaimIds.length ? `（前提: ${cite(view.premiseClaimIds)}）`:''}`,'',
      `**別の説明** — ${line(view.alternative)}`,'',
      ...counter.map(c=>`記録された反対材料: ${line(c.text)} / claim ${c.id}（真偽は独立確認前）`),'',
      `**見解を変える条件** — ${line(view.revisionCondition)}`,'',
      ...(view.assumptions.length ? [`分析上の仮定: ${view.assumptions.map(line).join(' / ')}`,''] : []),
      `暫定的な確信度: ${view.confidence.toFixed(2)} / ${view.origin==='model'?'モデルの提案を検査・整形':view.origin==='mixed'?'モデルの提案を資料に合わせて補修':'取得資料に合わせた分析規則'} / ${view.scope==='headline'?'題名の問いについての見解。本文の内容は補っていない。':view.scope==='no-source'?'外部事実を前提にしない調査方針。':'出典の主張から導いた解釈であり、確認済み事実ではない。'}`,'',
    ] : narrative),
    ...(q.conclusions.length ? ['### 未検証の解釈','',...q.conclusions.map(c=>
      `- ${line(c.text)}\n  - 前提: ${cite(c.premiseClaimIds)}\n  - 推論: ${line(c.reasoning)}\n  - 代替説明: ${line(c.alternative)}\n  - 原文との対応検査のみ実施。推論の妥当性は未確認。`),''] : []),
    ...(q.hypotheses.length ? ['## 検証を待つ仮説','',...q.hypotheses.map(h=>
      `- ${line(h.text)}\n  - 前提: ${cite(h.premiseClaimIds)} / 状態: 未確認 / 確信度: ${h.confidence}\n  - 成立時の観測: ${line(h.prediction)}\n  - 反証条件: ${line(h.falsification)}\n  - 代替説明: ${line(h.alternative)}\n  - 必要な資料: ${line(h.requiredEvidence)}`),''] : []),
    ...(q.comparisons.length ? ['## 資料間の比較','',...q.comparisons.map(c=>
      `- 「${line(items.get(c.leftItemId)!.title)}」と「${line(items.get(c.rightItemId)!.title)}」: ${line(c.reason)}`),''] : []),
    ...(q.priorMemory.some(m=>m.decision==='related') ? ['## 過去の記憶の再評価','',...q.priorMemory.filter(m=>m.decision==='related').map(m=>`- 記憶 ${m.id}: ${line(m.reason)}`),
      ...(q.viewReviews??[]).map(r=>`- 見解 ${r.memoryId}: ${r.action==='withdraw'?'採用を撤回':r.action==='revise'?'修正':'維持'} / 確信度 ${r.previousConfidence} → ${r.confidence} / ${line(r.reason)}${r.counterClaimIds.length ? ` / 反対材料 ${cite(r.counterClaimIds)}`:''}`),
      ...(q.hypothesisReviews ?? []).map(r=>`- 仮説の記憶 ${r.memoryId}: ${r.status} / 確信度 ${r.confidence} / ${line(r.reason)} / 根拠 ${cite(r.claimIds)}`),''] : []),
    ...(q.followUp.length ? ['## 追加資料の取得','',...q.followUp.map(f=>`- ${line(f.url)} — ${f.status} / ${line(f.reason)}`),''] : []),
    '## 不明点・限界','',...q.unresolved.map(value=>`- ${line(value)}`),
    ...(!view&&!q.hypotheses.length ? ['- 具体的な支持・反証条件を備えた仮説はまだ成立していないため、仮説の生成を保留した。'] : []),'',
    '## 次に確認すること','',
    ...q.coverage.filter(c=>c.kind!=='article-body').map(c=>`- 「${line(items.get(c.itemId)!.title)}」の本文を、許可された取得方法で確認する。取得拒否の場合は迂回しない。`),
    ...q.observations.filter(o=>o.kind!=='metadata').slice(0,2).map(o=>`- ${labels.get(o.claimId)}の記述について、発表主体の説明に加えて観測方法・実施後の記録を探す。同じ発表の転載は独立した確認に数えない。`),'',
    '## 実行記録','',
    ...(input.analysis.research ? [`- 問いの選択: ${line(input.analysis.research.reason)}`,
      `- 要求: ${line(input.analysis.research.model.requested)} / 使用: ${line(input.analysis.research.model.used)} / ${input.analysis.research.model.elapsedMs} ms`,
      ...(input.analysis.research.model.error ? [`- モデル処理の記録: ${line(input.analysis.research.model.error)}`] : [])] : []),
    ...q.modelIssues.map(issue=>`- 採用しなかったモデル出力: ${line(issue)}`),
    ...(q.priorMemory.some(m=>m.decision==='excluded') ? [`- 根拠が未監査の過去の生成文は、証拠として再利用しなかった。`] : []),'',
  ];
  return {quality:q,title:q.question,markdown:sections.join('\n'),usedClaimIds:q.observations.map(o=>o.claimId),assertions:[...q.observations.map(o=>({
    claimId:o.claimId,classification:input.claims.find(c=>c.id===o.claimId)!.classification,text:o.quote})),...counter.map(c=>({claimId:c.id,classification:c.classification,text:c.text})),...(view?[{classification:'inference' as const,text:view.position}]:[])]};
}
