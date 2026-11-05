import {renderComparativeDecision} from './comparative-decision';
import {auditSourceSummaries} from './evidence-review';
import type {AnalysisContext} from './ai';

export type DecisionEvaluation = {
  version:1; scenario:string; criterion:{outcome:string;weight:1;scale:'provisional-ordinal-0-4'};
  candidates:Array<{id:'A'|'B';action:string;score:number;sourceClaimIds:string[];sourceStatement:string;expectedBenefit:string;uncertainty:string}>;
  selectedId:'A'|'B'|null;
};
const fail=()=>{throw Error('DECISION_EVALUATION_INVALID');};
const sentence=(value:unknown):value is string=>typeof value==='string'&&value.length>=8&&value.length<=240&&/[。！？]$/.test(value)&&!/[\r\n]|https?:\/\/|\b[EDMC]\d+\b/.test(value);

/** Scores express a model's expectation, never an observed effect or probability.
 * The selected option and its explanation have one source of truth. */
export function evaluateDecision(value:unknown,allowedClaimIds:string[]){
  if(!value||typeof value!=='object'||Array.isArray(value))return fail();
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['利用場面','達成したい結果','候補'].includes(k))||!Array.isArray(v.候補)||v.候補.length!==2)return fail();
  const candidates:DecisionEvaluation['candidates']=v.候補.map((raw:unknown,index:number)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail();
    const row=raw as Record<string,unknown>;
    if(Object.keys(row).some(k=>!['案','期待寄与','根拠ID','出典の主張','期待の理由','不確実性'].includes(k))||typeof row.案!=='string'||!Number.isInteger(row.期待寄与)||Number(row.期待寄与)<0||Number(row.期待寄与)>4||
      !Array.isArray(row.根拠ID)||!row.根拠ID.length||row.根拠ID.length>3||row.根拠ID.some(id=>typeof id!=='string'||!allowedClaimIds.includes(id))||
      !sentence(row.出典の主張)||!sentence(row.期待の理由)||!sentence(row.不確実性))return fail();
    return {id:index===0?'A':'B',action:row.案,score:Number(row.期待寄与),sourceClaimIds:[...new Set(row.根拠ID as string[])],sourceStatement:row.出典の主張,expectedBenefit:row.期待の理由,uncertainty:row.不確実性};
  });
  // Reuse the existing comparable-scenario, non-strawman, outcome validation.
  renderComparativeDecision({利用場面:v.利用場面,達成したい結果:v.達成したい結果,優先案:candidates[0].action,比較案:candidates[1].action});
  const [a,b]=candidates;
  const decision:DecisionEvaluation={version:1,scenario:String(v.利用場面),criterion:{outcome:String(v.達成したい結果),weight:1,scale:'provisional-ordinal-0-4'},candidates,
    selectedId:a.score===b.score?null:a.score>b.score?a.id:b.id};
  return {decision,...renderDecisionEvaluation(decision)};
}

export function renderDecisionEvaluation(decision:DecisionEvaluation){
  const selected=decision.candidates.find(c=>c.id===decision.selectedId),other=selected?decision.candidates.find(c=>c.id!==selected.id):undefined;
  const [a,b]=decision.candidates,scenario=decision.scenario,goal=decision.criterion.outcome;
  const base=renderComparativeDecision({利用場面:scenario,達成したい結果:goal,優先案:(selected??a).action,比較案:(other??b).action});
  const explain=(c:DecisionEvaluation['candidates'][number])=>`資料の主張として、${c.sourceStatement} 仮に「${c.action}」を行う場合、${c.expectedBenefit} 不確実性として、${c.uncertainty}`;
  const reflection=selected?{...base,reasoning:explain(selected)}:{...base,
    position:`私は、仮に「${scenario}」を想定するなら、「${goal}」について「${a.action}」と「${b.action}」を同じ優先度で扱いたい。`,
    reasoning:`両案の期待評価は同点であり、一方の優位は確認できない。${explain(a)} ${explain(b)}`,
    alternative:`一方、逆に、もし同じ「${scenario}」で「${goal}」に両案の差があるなら、一方を優先する説明も成り立つ。`,
    revisionCondition:`もし、同じ「${scenario}」で同じ「${goal}」を基準に両案の結果を比べ、差が分かるなら、同じ優先度という見解を見直す。`,
    assumption:'両案の便益は未実測であり、同点は同等性を実証した結果ではない。'};
  return {reflection,premiseClaimIds:[...new Set((selected?[selected]:decision.candidates).flatMap(c=>c.sourceClaimIds))]};
}

/** Verify again when loading a saved draft; optional metadata preserves old notes. */
export function decisionEvaluationMatches(decision:DecisionEvaluation,reflection:Record<string,unknown>|undefined){
  try{
    const rebuilt=evaluateDecision({利用場面:decision.scenario,達成したい結果:decision.criterion.outcome,候補:decision.candidates.map(c=>({案:c.action,期待寄与:c.score,根拠ID:c.sourceClaimIds,出典の主張:c.sourceStatement,期待の理由:c.expectedBenefit,不確実性:c.uncertainty}))},decision.candidates.flatMap(c=>c.sourceClaimIds));
    return JSON.stringify(rebuilt.decision)===JSON.stringify(decision)&&Boolean(reflection)&&['issue','position','reasoning','alternative','revisionCondition'].every(key=>reflection![key]===rebuilt.reflection[key as keyof typeof rebuilt.reflection]);
  }catch{return false;}
}

export function decisionSourceIssues(context:AnalysisContext,decision:DecisionEvaluation){
  try{return decision.candidates.flatMap(candidate=>{
    const claim=context.claims.find(c=>c.id===candidate.sourceClaimIds[0]),item=context.items.find(i=>i.id===claim?.itemId);
    const unsupported=!item||candidate.sourceClaimIds.length!==1||auditSourceSummaries({...context,items:[item]},[{itemId:item.id,facts:[{claimId:claim!.id,text:candidate.sourceStatement}],limitation:'取得した本文の主張であり、独立した検証は実施していない。'}]).fatalIssues.length;
    return unsupported?[`DECISION_UNSUPPORTED_SOURCE_STATEMENT:${candidate.id}`]:[];
  });}catch{return ['DECISION_EVALUATION_INVALID'];}
}
