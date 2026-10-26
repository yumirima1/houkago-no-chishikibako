import type {AnalysisContext} from './ai';
import type {GroundedObservation,Reflection,QualityAnalysis} from './quality-types';
import {meaningfulTerms} from './relevance';

const compact=(value:string)=>value.replace(/\s+/g,' ').trim();
const japanese=(value:unknown):value is string=>typeof value==='string' && value.trim().length>=8 && value.length<=1000 && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
const fields=['issue','position','reasoning','alternative','revisionCondition'] as const;
const hasStance=(value:string)=>/私は|私の|したい|重視|優先|鍵|核心|注目|選ぶ|と捉え|と見な|と考え|と見る|とみる|位置づけ|よりも|よりは|より.{0,16}(?:重視|優先|価値|選ぶ)|ではなく|でなく|両立|べき|こだわ|価値は|重要なのは|(?:原因|制約|仕組み|構造|ボトルネック).{0,16}(?:ある|変わ|効く|可能性|かもしれ)/.test(value);

/** These are analytical lenses, not extra source facts. Every lens supplies an
 * answer and a competing mechanism that could change the answer. */
function contextualView(basis:string) {
  if(/\b(engine|rocket|flight|stennis|artemis)\b|エンジン|地上試験/i.test(basis))return {
    issue:'試験で得た手応えを、どこまで次の設計・運用判断へ移してよいか。',
    position:'私は試験の価値を、成功という一語より、次に変える設計条件を絞れるかで評価したい。条件を限定した試験でも、次の不確実性を減らすなら意味がある。',
    reasoning:'試験条件と使用場面を分けて読むと、試験そのものの達成と、運用全体での有効性は別の問いになる。そこで今回は、性能の断定よりも設計判断を進めるための観測として重みを置いた。',
    alternative:'一方で、試験条件が運用の厳しい条件まで十分に含んでいるなら、設計の手掛かりに留まらず運用の実証と評価する説明も成り立つ。',
    revisionCondition:'別条件の再試験と運用時の記録が揃い、同じ傾向が再現するなら実証としての評価を強める。条件を変えると結果が崩れるなら適用範囲を狭める。',
    assumptions:['試験条件の違いが適用範囲に影響し得る、という分析上の仮定を置いた。'],
  };
  if(/\b(planes?|aircraft|aviation|airspace|traffic|flights?)\b|航空|空域/i.test(basis))return {
    issue:'待機や混雑を、個々の機体の問題と全体の調整の問題のどちらから考えるか。',
    position:'私は、待機を減らす鍵を個々の機体の速さより、混雑の判断を早い段階で共有する仕組みに置く。局所的な改善が、別の場所の待ち時間へ移るだけになる可能性を重く見るためだ。',
    reasoning:'待機という現象と、交通の流れを変える案を結び付けると、到着地点だけの最適化よりも前後の判断を揃える方が持続的な改善につながる、と推論できる。これは調整が主な制約だという仮定に基づく見解である。',
    alternative:'ただし物理的な処理能力や天候が支配的な原因なら、情報共有より容量の確保や迂回経路の整備が効くという説明もある。',
    revisionCondition:'調整を改善した区間でも総待機時間が変わらず、能力を増やした区間だけ改善するなら、調整を優先する見解を修正する。待機の地域間移動も含めて比較したい。',
    assumptions:['調整の遅れが待機の一因だと仮定した。取得できた範囲で原因や施策の効果を実証したわけではない。'],
  };
  if(/\b(tv|television|film|adaptation|novel|cinema|eden|steinbeck)\b|原作|映像|小説|映画/i.test(basis))return {
    issue:'作品が別の媒体へ移るとき、何を保ち、何を変えることに価値があるか。',
    position:'私は、保存と再解釈は相互補完になり得ると考える。映像化の評価では原作への忠実さだけでなく、どの視点を選び直したかを重視したい。',
    reasoning:'保存された作品と新しい媒体での受容を並べると、作品を残すことと、読者・視聴者がその作品へ入り直すことは別の役割だと考えられる。同じ内容の複製よりも、媒体による視点の差を読む余地に意味を見いだす。',
    alternative:'ただし視点の変更が原作の緊張や複雑さを単純化するだけなら、入口が増えても解釈が豊かになるとは限らない。忠実さを優先する評価にも理由がある。',
    revisionCondition:'実際の場面や構成を原作と比較し、異なる解釈への入口が増えたかを見る。重要な対立が一方向へ整理されていれば、再解釈を積極的に評価する見解を弱める。',
    assumptions:['媒体の変更が受け手の視点に影響し得ると仮定した。未取得・未視聴の作品内容は事実として補っていない。'],
  };
  if(/\b(archive|library|collection|history|preserv|museum|culture|access)\w*|資料|文化|保存|歴史/i.test(basis))return {
    issue:'資料を残すことを、将来の読み直しにつながる価値へどう変えるか。',
    position:'私は、保存点数を増やすことだけでなく、資料が生まれた文脈を辿って別の問いを立てられることに価値を置く。アクセスの広さと文脈の厚みを一緒に扱いたい。',
    reasoning:'資料の公開・紹介は接点を作る一方、断片だけの受容にもつながり得る。そこで、見つけやすさを高める工夫が出典や背景を辿る経路と組み合わされるかが、長く使える知識になる分岐だと考えた。',
    alternative:'まず接点を広げるだけでも新しい利用者が文脈を作り直す可能性がある。整理の完成を優先しすぎると、利用の機会を狭めるという反論もある。',
    revisionCondition:'利用例を追い、背景情報が少なくても多様な読み直しが生まれるなら文脈整備の優先度を下げる。切り取りによる誤解が繰り返されるなら上げる。',
    assumptions:['資料への接点と背景情報の両方が、後の解釈に影響すると仮定した。'],
  };
  if(/\b(aid|health|ebola|sudan|hunger|responders|disease|flood)\b|支援|感染|洪水|医療/i.test(basis))return {
    issue:'必要性の大きさと、支援が実際に届く条件をどう結び付けるか。',
    position:'私は支援の規模だけでなく、届く経路と継続できる担い手を重視する。需要が大きいほど、入口の制約が少し変わるだけでも結果が変わり得ると考える。',
    reasoning:'被害や需要の記述だけでは対応の優先順位は決まらない。実行できる経路を分けて考えることで、追加資源を投入する判断と、既存の資源を届かせる判断を区別できる。',
    alternative:'経路よりも資源の絶対量が制約なら、調整を改善しても不足は解消しない。量の確保を先にする説明も成り立つ。',
    revisionCondition:'経路が改善した場所でも支援量や継続性が変わらなければ、量や別の制約を優先する見解へ修正する。',
    assumptions:['供給量と到達経路を区別して考えることが有用だという仮定を置いた。'],
  };
  return {
    issue:'目立つ出来事から、何を一時的な変化と見て、何を続く仕組みの変化と見るか。',
    position:'私は、目立つ結果そのものより、その結果を繰り返し生む条件が変わったかに注目したい。単発の出来事にも、次に何を比べるべきかを決める価値がある。',
    reasoning:'今回の記述を一つの観測として置くと、結果の大きさと再現する仕組みを区別できる。そこで持続性の評価には、同じ対象の別時点・別条件を比べることが有効だと考えた。',
    alternative:'ただし一度きりの出来事自体に大きな意味がある場合、再現性を重視する見方はその価値を見落とす。',
    revisionCondition:'後続の記録で同じ条件と結果の対応が続けば構造変化としての評価を強める。一度限りの条件で説明できれば範囲を狭める。',
    assumptions:['今回の話題を、単発の結果と持続する条件に分けて検討できると仮定した。'],
  };
}

export function reflectionQuestion(title:string,basis='') {return contextualView(`${title} ${basis}`).issue;}

export function formReflection(context:AnalysisContext,observations:GroundedObservation[],proposal:unknown) {
  const primary=context.items[0];
  const scope:Reflection['scope']=observations.some(o=>o.kind!=='metadata')?'article':primary?'headline':'no-source';
  const body=observations.some(o=>o.kind==='article-body');
  const cap=body?.65:scope==='article'?.45:.25;
  const title=compact(primary?.title ?? context.topic).replace(/&#(\d+);/g,(entity,number)=>Number(number)<=0x10ffff?String.fromCodePoint(Number(number)):entity).slice(0,180);
  const lens=contextualView(`${title} ${observations.map(o=>o.quote).join(' ')}`);
  const premiseClaimIds=observations.slice(0,4).map(o=>o.claimId);
  const anchor=observations.find(o=>/share information|coordinat|flow management|not be used|adapt|interpret|original|preserv/i.test(o.quote))??observations[0];
  const fallback:Reflection={...lens,issue:`「${title}」を読むうえで、${lens.issue}`,premiseClaimIds,
    reasoning:`${scope==='headline'?'題名で提示された問いを出発点にした。本文で起きたことの説明ではなく、この問いをどう捉えるかの見解である。':scope==='no-source'?'外部資料がないため、調査方針についての見解として述べる。':`原文の「${compact(anchor!.quote).slice(0,180)}${anchor!.quote.length>180?'…':''}」という記述を出発点にした。`}${lens.reasoning}`,
    confidence:body?.4:scope==='article'?.3:.15,origin:'rules',scope};
  const raw=(proposal as {reflection?:Partial<Reflection>}|null)?.reflection;
  if(!raw)return {reflection:fallback,issues:[] as string[]};
  const supplied={...raw};
  for(const field of fields)if(typeof supplied[field]==='string')supplied[field]=supplied[field]!.replace(/^\s*\d{1,2}[.)]\s+/,'');
  const issues:string[]=[];
  if(japanese(supplied.position)){
    const sentences=supplied.position.split(/(?<=[。！？])\s*/u);
    const start=sentences.findIndex(hasStance);
    if(start>0){supplied.position=sentences.slice(start).join('');issues.push('REFLECTION_FACT_PREFACE');}
  }
  const ids=Array.isArray(supplied.premiseClaimIds)?supplied.premiseClaimIds:[];
  if(!ids.length||ids.length>4||ids.some(id=>!observations.some(o=>o.claimId===id)))issues.push('REFLECTION_UNKNOWN_PREMISE');
  if(!fields.every(field=>japanese(supplied[field])))issues.push('REFLECTION_INCOMPLETE');
  const fragments=new Set(fields.filter(field=>typeof supplied[field]==='string'&&/[:：]$|以下.{0,30}(?:あります|あると考えます|示します)[。]?$/.test(supplied[field]!.trim())));
  if(fragments.size)issues.push('REFLECTION_FRAGMENT');
  if(typeof supplied.position==='string' && /(?:判断|断定|評価)でき[なず]|保留|情報.*不足|分から|わから/.test(supplied.position) &&
      !/重視|優先|有用|価値|鍵|注目|選ぶ|捉え|位置づけ/.test(supplied.position))issues.push('REFLECTION_DEFERRAL_ONLY');
  if(japanese(supplied.position)&&!hasStance(supplied.position))issues.push('REFLECTION_NONANSWER');
  if(japanese(supplied.position)&&japanese(supplied.alternative)){
    const a=meaningfulTerms(supplied.position),b=meaningfulTerms(supplied.alternative);
    if([...a].filter(word=>b.has(word)).length/Math.max(1,Math.min(a.size,b.size))>.75 && !/ない|低い|逆に|むしろ|異なる|別の原因/.test(supplied.alternative))issues.push('REFLECTION_REPEATED_ALTERNATIVE');
  }
  if(japanese(supplied.position)&&japanese(supplied.reasoning)&&compact(supplied.position)===compact(supplied.reasoning))issues.push('REFLECTION_CIRCULAR_REASON');
  if(japanese(supplied.alternative)&&!/原因|制約|説明|かも|なら|場合|一方|ただし|しかし|むしろ|一因|可能性|と仮定|評価|異な|限ら|重視|優先/.test(supplied.alternative))issues.push('REFLECTION_NONALTERNATIVE');
  if(japanese(supplied.revisionCondition)&&!/(?:評価|見解|考え|見方|意見|優先|結論|解釈|判断|範囲|確信|仮説|予測).{0,18}(?:変え|変わ|修正|撤回|弱め|見直|再考|下げ|狭め|棄却|否定|切り替|改め|異な)|別の(?:評価|見解|考え|見方|意見|結論|解釈|判断)/.test(supplied.revisionCondition))issues.push('REFLECTION_NONREVISING_CONDITION');
  const basis=observations.filter(o=>ids?.includes(o.claimId)).map(o=>o.quote).join(' ');
  const numbers:string[]=basis.match(/\d+(?:[.,]\d+)*/g)??[];
  const conditional=(value:string)=>/仮に|もし|と仮定|を仮定/.test(value)&&/なら|場合|仮定|とすれば/.test(value);
  const headlineFacts=new Set<string>();
  if(scope==='headline') {
    for(const field of fields){const value=supplied[field];if(typeof value!=='string'||conditional(value))continue;
      if(/(?:収集|確認|実施|証明|達成|改善|減少|増加|成功|導入|提供|使用|判明).{0,6}(?:れました|された|しました|している|されています|されます|される)|(?:この試験|今回の試験|本文|原記事).{0,15}(?:より得られ|確認した|明らか|示して|述べて|収集|実施|達成)/.test(value))headlineFacts.add(field);
    }
    if(japanese(supplied.position)&&!/私は|私の|したい|重視|優先|べき(?:だ|です|である)|と考え|と捉え|と見な|見立て|仮に|もし|なら|場合|とすれば/.test(supplied.position))headlineFacts.add('position');
    if(headlineFacts.has('position'))headlineFacts.add('reasoning');
    if(headlineFacts.size)issues.push('REFLECTION_HEADLINE_AS_FACT');
  }
  const inventedNumber=(value:string)=>(value.match(/\d+(?:[.,]\d+)*/g)??[]).some(n=>!numbers.includes(n));
  const experiments:string[]=[];
  for(const field of fields){
    const value=supplied[field];if(typeof value!=='string')continue;
    if(/https?:\/\/|www\./i.test(value))issues.push('REFLECTION_UNTRACKED_URL');
    if(inventedNumber(value)) {
      if(conditional(value))experiments.push(`数値条件を置いた思考実験であり、出典の観測値ではない: ${value}`);
      else issues.push('REFLECTION_UNSOURCED_NUMBER');
    }
  }
  const memoryIds=supplied.memoryIds;
  if(memoryIds && (!Array.isArray(memoryIds)||memoryIds.some(id=>!context.memories?.some(m=>m.id===id && m.quality?.reflection))))issues.push('REFLECTION_UNKNOWN_MEMORY');
  // Keep sound portions of an incomplete proposal. A rejected factual detail is
  // replaced with a contextual view, never with an empty conclusion.
  if(issues.length){
    if(!issues.some(issue=>/UNKNOWN_PREMISE|UNKNOWN_MEMORY/.test(issue))) {
      for(const field of fields){
        const value=supplied[field];
        if(!japanese(value)||fragments.has(field)||headlineFacts.has(field)||/https?:\/\/|www\./i.test(value)||(inventedNumber(value)&&!conditional(value)))continue;
        if(['position','reasoning','alternative'].includes(field)&&(issues.some(i=>['REFLECTION_DEFERRAL_ONLY','REFLECTION_NONANSWER'].includes(i))||headlineFacts.has('position')||fragments.has('position')))continue;
        if(field==='reasoning'&&issues.includes('REFLECTION_CIRCULAR_REASON'))continue;
        if(field==='alternative'&&issues.some(i=>['REFLECTION_REPEATED_ALTERNATIVE','REFLECTION_NONALTERNATIVE'].includes(i)))continue;
        if(field==='revisionCondition'&&issues.includes('REFLECTION_NONREVISING_CONDITION'))continue;
        fallback[field]=compact(value);
        fallback.origin='mixed';
      }
      fallback.assumptions.push(...experiments);
    }
    return {reflection:fallback,issues:[...new Set(issues)]};
  }
  const confidence=typeof supplied.confidence==='number'&&Number.isFinite(supplied.confidence)?Math.max(.05,Math.min(cap,supplied.confidence)):fallback.confidence;
  return {reflection:{issue:supplied.issue!,position:supplied.position!,reasoning:supplied.reasoning!,alternative:supplied.alternative!,revisionCondition:supplied.revisionCondition!,
    premiseClaimIds:ids!,assumptions:[...(Array.isArray(supplied.assumptions)?supplied.assumptions.filter(japanese).slice(0,3):lens.assumptions),...experiments],
    confidence,origin:'model' as const,scope,...(memoryIds?.length?{memoryIds}: {})},issues};
}

export function reviewViews(context:AnalysisContext,quality:QualityAnalysis):NonNullable<QualityAnalysis['viewReviews']> {
  const current=quality.reflection!;
  return (context.memories??[]).filter(m=>m.kind==='interpretation'&&m.quality?.reflection&&m.references.some(ref=>quality.focusItemIds.includes(ref.itemId)))
    .map(memory=>{
      const old=memory.quality!.reflection!;
      const counter=context.claims.filter(c=>c.classification==='contradiction'&&memory.references.some(ref=>ref.itemId===c.itemId));
      const changed=memory.references.some(ref=>context.items.some(item=>item.id===ref.itemId&&item.versionId!==ref.versionId));
      const action=counter.length?'withdraw' as const:changed||old.position!==current.position?'revise' as const:'maintain' as const;
      return {memoryId:memory.id,action,previousConfidence:old.confidence,confidence:counter.length?0:current.confidence,counterClaimIds:counter.map(c=>c.id),
        reason:counter.length?'前提となる対象について反対材料が記録されたため、旧見解の採用を撤回し再考する。出典の真偽の独立確認とは区別する。':changed?
          '根拠文書が更新されたため、今回の理由・代替説明・修正条件とともに見解を書き直す。旧見解を事実として引き継がない。':
          action==='maintain'?'根拠と見解を再確認して維持。新しい裏付けが増えた扱いにはしない。':'同じ資料からの解釈を改めた。新しい事実による証明と取り違えず、旧見解も保持する。'};
    });
}
