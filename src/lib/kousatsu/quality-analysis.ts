import type { AnalysisContext } from './ai';
import type { DocumentCoverage, GroundedModelProposal, GroundedObservation, QualityAnalysis, TestedHypothesis } from './quality-types';
import { compareRecords, meaningfulTerms } from './relevance';
import {formReflection,reviewViews} from './reflection';

const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim();
const japanese=(value:string)=>/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
const tentative=(value:string)=>/可能性|かもしれ|仮説|とは限ら|考えられ|未確認|断定でき|保留/.test(value);
const numbers=(value:string):string[]=>value.match(/\d+(?:[.,]\d+)*/g) ?? [];
const text=(value:unknown)=>typeof value==='string' && value.trim().length>0 && value.length<=1800;

/** Referential checks cannot prove semantic truth. Unsupported factual prose is
 * excluded; accepted model material remains explicitly tentative. */
export function auditGroundedProposal(context:AnalysisContext,proposal:unknown,coverage:DocumentCoverage[]) {
  const issues:string[]=[];
  const claimById=new Map(context.claims.map(claim=>[claim.id,claim]));
  const allText=context.claims.map(claim=>claim.text).join(' ');
  const bodyIds=new Set(coverage.filter(c=>c.kind!=='metadata').map(c=>c.itemId));
  const supplied=proposal as Partial<GroundedModelProposal>|null;
  if(!supplied || !Array.isArray(supplied.observations) || !Array.isArray(supplied.conclusions) || !Array.isArray(supplied.hypotheses)) {
    return {issues:['MODEL_SOURCE_BINDINGS_REQUIRED'],conclusions:[],hypotheses:[] as TestedHypothesis[]};
  }
  const observed=new Set<string>();
  for(const observation of supplied.observations.slice(0,8)) {
    const claim=claimById.get(observation?.claimId);
    if(!claim || !text(observation.quote) || normalize(claim.text)!==normalize(observation.quote)) {issues.push('MODEL_QUOTE_MISMATCH');continue;}
    observed.add(claim.id);
  }
  const bound=(ids:unknown):ids is string[]=>Array.isArray(ids) && ids.length>0 && ids.length<=4 && ids.every(id=>{
    const claim=claimById.get(id);return observed.has(id) && claim && bodyIds.has(claim.itemId!);
  });
  const grounded=(value:string,ids:string[])=>{
    const premises=ids.map(id=>claimById.get(id)!.text).join(' ');
    // Novel concepts in an explicitly labelled interpretation are allowed.
    // Quotations, factual quantities and source IDs remain separately checked.
    return !/https?:\/\/|www\./i.test(value) && numbers(value).every(n=>numbers(premises).includes(n)) &&
      meaningfulTerms(premises).size>1;
  };
  const conclusions:QualityAnalysis['conclusions']=[];
  for(const c of supplied.conclusions.slice(0,3)) {
    if(!c || !text(c.text) || !text(c.reasoning) || !text(c.alternative) || !japanese(c.text) ||
      !bound(c.premiseClaimIds) || ![c.text,c.reasoning,c.alternative].every(value=>grounded(value,c.premiseClaimIds))) {
      issues.push('MODEL_UNSUPPORTED_CONCLUSION');continue;
    }
    conclusions.push(c);
  }
  const hypotheses:TestedHypothesis[]=[];
  for(const h of supplied.hypotheses.slice(0,3)) {
    const fields=h && [h.text,h.prediction,h.falsification,h.alternative,h.requiredEvidence];
    if(!h || !fields?.every(text) || !japanese(h.text) || !tentative(h.text) || !bound(h.premiseClaimIds) ||
      !fields.every(value=>grounded(value,h.premiseClaimIds)) || normalize(h.prediction)===normalize(h.falsification) ||
      context.items.some(item=>normalize(item.title)===normalize(h.text)) || allText.includes(h.text)) {
      issues.push('MODEL_UNTESTABLE_HYPOTHESIS');continue;
    }
    hypotheses.push({...h,confidence:0.2,status:'unverified'});
  }
  return {issues:[...new Set(issues)],conclusions,hypotheses};
}

export function buildQualityAnalysis(context:AnalysisContext,question:string,focusItemIds:string[],proposal?:unknown):QualityAnalysis {
  const focus=new Set(focusItemIds);
  const coverage=context.coverage ?? context.items.map(item=>({itemId:item.id,versionId:item.versionId!,url:item.url,fetchedAt:item.fetchedAt,
    kind:item.summary || item.content ? 'feed-summary' as const : 'metadata' as const,status:'available' as const}));
  const relevantCoverage=coverage.filter(c=>focus.has(c.itemId));
  const bodyAvailable=relevantCoverage.some(c=>c.kind==='article-body' && c.status==='available');
  const seen=new Set<string>();
  const observations:GroundedObservation[]=context.claims.filter(claim=>claim.itemId && focus.has(claim.itemId) && claim.versionId &&
    ['source_claim','unverified'].includes(claim.classification))
    .filter(claim=>{const value=normalize(claim.text);if(seen.has(value))return false;seen.add(value);return true;}).slice(0,8)
    .map(claim=>({claimId:claim.id,itemId:claim.itemId!,versionId:claim.versionId!,quote:claim.text,
      url:context.items.find(item=>item.id===claim.itemId)!.url,kind:coverage.find(c=>c.itemId===claim.itemId)?.kind ?? 'metadata',confidence:'source-only'}));
  const audit=proposal===undefined ? {issues:[],conclusions:[],hypotheses:[]} : auditGroundedProposal({...context,
    claims:context.claims.filter(c=>observations.some(o=>o.claimId===c.id)),items:context.items.filter(i=>focus.has(i.id))},proposal,relevantCoverage);
  // A title cannot support assertions about a plan's details or measured effects.
  const allowed=observations.filter(o=>o.kind!=='metadata');
  const unresolved:string[]=[];
  if(!bodyAvailable)unresolved.push('原記事の本文は未取得。以下の見解は、題名・RSS要約が示す問いに対する推論であり、記事の詳しい内容の確認ではない。');
  unresolved.push('出典の記述と独立した確認は別です。情報源の独立性を確認した資料はなく、主張は未確認です。');
  const comparisons:QualityAnalysis['comparisons']=[];
  const items=context.items.filter(item=>focus.has(item.id));
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    const relation=compareRecords(items[i],items[j]);
    if(['same_document','follow_up_candidate','same_issue_candidate'].includes(relation.kind))comparisons.push({leftItemId:items[i].id,rightItemId:items[j].id,kind:relation.kind,reason:relation.reason});
  }
  const formed=formReflection({...context,items:focusItemIds.flatMap(id=>context.items.filter(item=>item.id===id))},observations,proposal);
  const quality:QualityAnalysis={schema:2,question,focusItemIds,coverage:relevantCoverage,observations,reflection:formed.reflection,
    conclusions:bodyAvailable ? audit.conclusions : [],hypotheses:bodyAvailable ? audit.hypotheses : [],
    unresolved,comparisons,modelIssues:[...audit.issues,...formed.issues],status:bodyAvailable && allowed.length ? 'grounded' : context.items.length ? 'limited' : 'deferred',
    priorMemory:(context.memories ?? []).map(memory=>{
      const revised=memory.references.filter(ref=>focus.has(ref.itemId) && context.items.some(item=>item.id===ref.itemId && item.versionId!==ref.versionId));
      const related=Boolean(memory.quality && memory.references.some(ref=>focus.has(ref.itemId)));
      return {id:memory.id,decision:related ? 'related' : 'excluded',reason:!related ? '根拠資料との対応・品質監査がない生成文章は再利用しない。' :
        revised.length ? `同じ文書の新しい版を確認（${revised.map(r=>r.versionId).join(', ')}から改訂）。旧解釈は再評価が必要。反証成立は未判定。` : '同じ文書版を参照している。独立した裏付けが増えたわけではない。'};
    }),hypothesisReviews:(context.memories ?? []).filter(m=>m.kind==='hypothesis' && m.quality && m.references.some(ref=>focus.has(ref.itemId)))
      .map(memory=>{
        const h=memory.quality!.hypotheses.find(h=>h.text===memory.text);
        const fresh=context.items.filter(item=>focus.has(item.id) && memory.references.some(ref=>ref.itemId===item.id && ref.versionId!==item.versionId));
        const criteria=h && h.prediction.length>=25 && h.falsification.length>=25 && h.prediction!==h.falsification;
        const result=criteria ? evaluateHypothesisEvidence({expectedQuote:h.prediction,contradictingQuote:h.falsification},fresh.map(item=>item.content ?? '')) : {status:'inconclusive' as const,confidence:0};
        const matched=observations.filter(o=>fresh.some(item=>item.id===o.itemId) && h && (o.quote.includes(h.prediction) || o.quote.includes(h.falsification)));
        // Only traceable, exact observations can change this recorded evaluation.
        return {memoryId:memory.id,...(matched.length ? result : {status:'inconclusive' as const,confidence:0}),claimIds:matched.map(o=>o.claimId),
          reason:matched.length ? '事前に記録された観測条件と新版の原文引用が完全一致。出典の記述による支持・反証候補であり、独立した事実確認は未実施。' :
            '事前の支持条件・反証条件に対応する原文引用を新版から確認できない。未判定を維持し、無一致を反証とは扱わない。'};
      }),followUp:[]};
  const counter=context.claims.filter(c=>c.classification==='contradiction'&&c.itemId&&focus.has(c.itemId));
  quality.reflection!.counterClaimIds=counter.map(c=>c.id);
  if(counter.length)quality.reflection!.confidence=Math.min(.25,quality.reflection!.confidence);
  quality.viewReviews=reviewViews(context,quality);
  return quality;
}

/** Objective evidence changes for a testable, quoted observation. Never accepts
 * a model's confidence as confirmation or treats no hit as refutation. */
export function evaluateHypothesisEvidence(hypothesis:{expectedQuote:string;contradictingQuote:string},documents:string[]) {
  const supports=hypothesis.expectedQuote.trim().length>=25 && documents.some(doc=>doc.includes(hypothesis.expectedQuote));
  const contradicts=hypothesis.contradictingQuote.trim().length>=25 && documents.some(doc=>doc.includes(hypothesis.contradictingQuote));
  return supports && contradicts ? {status:'inconclusive' as const,confidence:0.2} : contradicts ? {status:'refuted' as const,confidence:0.1} :
    supports ? {status:'supported' as const,confidence:0.6} : {status:'inconclusive' as const,confidence:0};
}
