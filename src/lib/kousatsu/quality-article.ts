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
  const documentLabels=new Map(input.items.map((item,i)=>[item.id,`資料${i+1}`]));
  const cite=(ids:string[])=>ids.map(id=>labels.get(id) ?? id).join('、');
  const prose=(value:string)=>line(value).replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi,id=>labels.get(id)??documentLabels.get(id)??id);
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
  const review=q.evidenceReview;
  const reliability={strong:'裏付けが強い',some:'一定の裏付けがある',unverified:'未確認・判断保留',disputed:'重大な疑義あり'};
  const purposes={'factual-evidence':'事実の裏付け','attributed-claim':'発信者の主張を理解するため','discourse-analysis':'社会的な言説の分析。主張の真偽の根拠にはしない','investigation-only':'真偽を調べる対象。結論の証拠にしない',excluded:'根拠としての使用を除外。調査記録は保持'};
  const counter=input.claims.filter(c=>view?.counterClaimIds?.includes(c.id));
  const sections=[`# ${line(q.question)}`,'',`作成: ${input.generatedAt ?? new Date().toISOString()} / 取得範囲: ${q.status==='grounded' ? '本文と引用を保存済み' : q.status==='limited' ? '一部の資料に基づく暫定見解' : '調査方針への見解'}`,
    '独立した事実確認: 未実施。引用は出典の主張であり、確認済み事実ではない。','',
    '## 対象と取得範囲','',...(review?[`調査理由: ${line(input.analysis.research?.reason??'今回の資料で確認できる内容と判断の限界を調べる。')}`,'']:[]),...refs,'',
    ...(review?['## 主記事と追加資料の日本語要約','',...review.summaries.flatMap(s=>[
      `### ${documentLabels.get(s.itemId)} — ${line(items.get(s.itemId)?.title??s.itemId)}`,'',
      ...s.facts.map(f=>`- ${line(f.text)}（${cite([f.claimId])}）`),
      `- ${s.limitationOrigin==='pipeline'?'処理の範囲':'今回読んだ範囲で未確認の点'}: ${line(s.limitation)}`,
      `- モデルが読んだ本文: ${s.inputBodyCharacters??'旧形式'}字${s.bodyTruncated?'。本文の一部は入力上限で省略。':'。保存本文を入力。'}`,'',
    ]),...(review.summaryIssues.length?['日本語整理に未完了の検査がある。以下の実行記録を参照。','']:[]),
      ...(review.summaryWarnings?.length?['引用との対応を確認できなかった要約文は除外し、検査済みの要約文だけを掲載している。除外記録は保存している。','']:[]),
      '要約はモデルによる解釈であり、原文の主張と分けて保持する。翻訳の意味的一致と日本語の自然さは人による確認が必要。','',
      '## 追加資料の比較と信頼性','',
      `資料${review.documentCount}件 / 発信主体・同文集約${review.originGroups}群 / 独立検証済み${review.independentlyVerifiedSources}件。異なる発信元の数は独立した証拠の数ではない。`,
      ...review.sources.map(s=>`- [${line(items.get(s.itemId)?.title??s.itemId)}](${items.get(s.itemId)?.url}) — ${line(s.publisher)} / ${s.kind} / 言語 ${s.language} / 地域 ${s.region}\n  - 独立性: ${line(s.reason)}${q.coverage.find(c=>c.itemId===s.itemId)?.sourceProfile?.interests?` / 立場: ${line(q.coverage.find(c=>c.itemId===s.itemId)!.sourceProfile!.interests!)}`:''}`),
      ...review.claims.map(c=>`- ${cite([c.claimId])}: ${reliability[c.classification]} / 用途: ${purposes[c.use]}\n  - ${line(c.reason)} / 未確認: ${c.unknowns.join('、')}`),'',
      ...review.comparisons.flatMap(c=>[`- 「${line(items.get(c.leftItemId)?.title??c.leftItemId)}」と「${line(items.get(c.rightItemId)?.title??c.rightItemId)}」`,
        `  - 一致点（モデルによる比較）: ${prose(c.agreement)}（${cite(c.agreementClaimIds??c.claimIds)}）`,
        `  - 相違点・比較条件: ${prose(c.difference)}（${cite(c.differenceClaimIds??c.claimIds)}）`]),'',
      ...(q.discovery?.length?['調査履歴:',...q.discovery.map(d=>`- ${d.purpose==='counterevidence'?'反対材料':'関連資料'}: ${line(d.query)} / ${d.status==='found'?`${d.itemIds.length}件の候補`:'該当資料なし。反証がないとは判断しない。'}`),'']:[]),
    ]:[]),
    ...(q.observations.length ? ['## 出典が述べていること','',...q.observations.map(o=>
      `**${labels.get(o.claimId)} — ${names[o.kind]}の原文（出典で確認・独立検証は未実施）**\n\n> ${line(o.quote)}\n\n[原記事](${o.url}) / claim: ${o.claimId} / 版: ${o.versionId}`),''] : []),
    '## 分析・考察','',
    ...(view ? [
      `**重要な問題** — ${prose(view.issue)}`,'',
      `**私の見解（推論）** — ${prose(view.position)}`,'',
      `**理由** — ${prose(view.reasoning)}${view.premiseClaimIds.length ? `（前提: ${cite(view.premiseClaimIds)}）`:''}`,'',
      `**別の説明** — ${prose(view.alternative)}`,'',
      ...(review&&!counter.length?['この別の説明を支持する反対証拠は今回取得できていない。比較のための未確認の仮説として扱う。','']:[]),
      ...counter.map(c=>`記録された反対材料: ${line(c.text)} / claim ${c.id}（真偽は独立確認前）`),'',
      `**見解を変える条件** — ${prose(view.revisionCondition)}`,'',
      ...(view.assumptions.length ? [`分析上の仮定: ${view.assumptions.map(line).join(' / ')}`,''] : []),
      `暫定的な確信度: ${review?(view.confidence>=.6?'比較的高い':view.confidence>=.4?'中程度':view.confidence>0?'低い':'評価できず'):view.confidence.toFixed(2)} / ${view.origin==='model'?'モデルの提案を検査・整形':view.origin==='mixed'?'モデルの提案を資料に合わせて補修':review?'モデル生成未完了。内容の代替生成なし':'取得資料に合わせた分析規則'} / ${view.scope==='headline'?'題名の問いについての見解。本文の内容は補っていない。':view.scope==='no-source'?'外部事実を前提にしない調査方針。':'出典の主張から導いた解釈であり、確認済み事実ではない。'}`,'',
      ...(review?[line(review.confidenceBasis),'']:[]),
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
    ...(review&&!q.priorMemory.some(m=>m.decision==='related')?['## 過去の知識との関連','','根拠文書との対応を確認できる過去の見解は得られなかった。無関係な記憶は結び付けていない。','']:[]),
    ...(q.followUp.length ? ['## 追加資料の取得','',...q.followUp.map(f=>`- ${line(f.url)} — ${f.status} / ${line(f.reason)}`),''] : []),
    ...(q.sourceVerification?['## 主張ごとの出典照合','',`保存済み資料の範囲。独立した事実確認: 未完了。出典のない主張: ${q.sourceVerification.unboundClaimIds.length}件。`,...q.sourceVerification.claims.map(c=>`- claim ${c.claimId}: ${c.result} / [原資料](${c.url}) / 版 ${c.versionId}\n${c.comparisons.map(p=>`  - [追加資料](${p.url}) / 版 ${p.versionId} / ${p.kind}: ${line(p.reason)}`).join('\n')}`),'']:[]),
    '## 不明点・限界','',...q.unresolved.map(value=>`- ${line(value)}`),
    ...(!view&&!q.hypotheses.length ? ['- 具体的な支持・反証条件を備えた仮説はまだ成立していないため、仮説の生成を保留した。'] : []),'',
    '## 次に確認すること','',
    ...(review?input.analysis.research?.questions.map(question=>`- ${line(question)}`)??[]:[]),
    ...q.coverage.filter(c=>c.kind!=='article-body').map(c=>`- 「${line(items.get(c.itemId)!.title)}」の本文を、許可された取得方法で確認する。取得拒否の場合は迂回しない。`),
    ...q.observations.filter(o=>o.kind!=='metadata').slice(0,2).map(o=>`- ${labels.get(o.claimId)}の記述について、発表主体の説明に加えて観測方法・実施後の記録を探す。同じ発表の転載は独立した確認に数えない。`),'',
    '## 実行記録','',
    ...(input.analysis.research ? [`- 問いの選択: ${line(input.analysis.research.reason)}`,
      `- 要求: ${line(input.analysis.research.model.requested)} / 使用: ${line(input.analysis.research.model.used)} / ${input.analysis.research.model.elapsedMs} ms`,
      `- モデル結果: ${input.analysis.research.model.status??'旧形式のため個別判定なし'} / 生成方式: ${input.analysis.research.model.method??view?.origin??'不明'}`,
      ...(review&&input.analysis.research.model.timings?[`- 段階別時間: ${JSON.stringify(input.analysis.research.model.timings)}`]:[]),
      ...(review?input.analysis.research.model.calls?.map(c=>`- ${c.phase}: ${line(c.model)} / 入力${c.inputCharacters}字 / 入力トークン${c.promptTokens??'取得不可'} / 出力${c.outputTokens??'取得不可'}トークン / 試行${c.attempts}回 / ${c.elapsedMs} ms / プロンプト版${c.promptVersion} / ${c.status}`)??[]:[]),
      ...(input.analysis.research.model.error ? [`- モデル処理の記録: ${line(input.analysis.research.model.error)}`] : [])] : []),
    ...q.modelIssues.map(issue=>`- 採用しなかったモデル出力: ${line(issue)}`),
    ...(q.priorMemory.some(m=>m.decision==='excluded') ? [`- 根拠が未監査の過去の生成文は、証拠として再利用しなかった。`] : []),'',
  ];
  return {quality:q,title:q.question,markdown:sections.join('\n'),usedClaimIds:q.observations.map(o=>o.claimId),assertions:[...q.observations.map(o=>({
    claimId:o.claimId,classification:input.claims.find(c=>c.id===o.claimId)!.classification,text:o.quote})),...counter.map(c=>({claimId:c.id,classification:c.classification,text:c.text})),...(view?[{classification:'inference' as const,text:view.position}]:[])]};
}
