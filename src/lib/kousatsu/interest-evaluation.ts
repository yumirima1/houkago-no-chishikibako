import {DatabaseSync} from 'node:sqlite';
import {meaningfulTerms} from './relevance';
import type {StoredItem} from './types';
import type {AnalysisContext} from './ai';

export type InterestCandidate={id:string;term:string;kind:'word'|'concept';itemId:string;versionId:string;url:string;quote:string};
export type InterestBasis={key:string;label:string;score:number};
export type InterestAppraisal={classification:'opinion';factCheckStatus:'unverified';candidateId:string;term:string;theme:string;impact:number;reason:string;confidence:number;direction:'strengthen'|'weaken'|'aversion'|'neutral';relatedInterestKeys:string[];memoryIds:string[];reference:Omit<InterestCandidate,'id'|'term'|'kind'>};
export type InterestAssessment={status:'succeeded'|'failed'|'not-requested';provider:string;method:'model'|'none';candidates:InterestCandidate[];evaluations:InterestAppraisal[];issues:string[]};
const normalized=(text:string)=>text.normalize('NFKC').toLowerCase();

/** Three source-bound targets keep appraisal inside the existing inference budget.
 * Terms are candidates, not an AI rating or a statement that they are facts. */
export function extractInterestCandidates(items:StoredItem[]):InterestCandidate[]{
  const item=items[0];if(!item?.versionId)return [];
  const title=normalized(item.title),body=normalized((item.content??item.summary??'').slice(0,12000)),words=[...meaningfulTerms(item.title)];
  const targets:Array<{term:string;kind:'word'|'concept'}>=words.slice(0,2).map(term=>({term,kind:'word'}));
  const compound=words.length>=2?[`${words[0]} ${words[1]}`,`${words[0]}${words[1]}`].find(term=>title.includes(term)):undefined;
  if(compound&&compound.length<=80)targets.push({term:compound,kind:'concept'});
  for(const term of meaningfulTerms(body))if(targets.length<3&&!targets.some(t=>t.term===term))targets.push({term,kind:'word'});
  return targets.slice(0,3).map((target,index)=>{
    const text=title.includes(target.term)?item.title.normalize('NFKC'):(item.content??item.summary??'').normalize('NFKC');
    const at=normalized(text).indexOf(target.term),start=Math.max(0,at-40),end=Math.min(text.length,at+target.term.length+80);
    return {id:`t${index+1}`,term:target.term,kind:target.kind,itemId:item.id,versionId:item.versionId!,url:item.url,quote:text.slice(start,end)};
  });
}

export function readInterestBasis(file:string):InterestBasis[]{
  const db=new DatabaseSync(file,{readOnly:true});try{
    if(!db.prepare("SELECT name FROM sqlite_master WHERE name='research_interests'").get())return [];
    return db.prepare('SELECT key,label,score FROM research_interests ORDER BY score DESC,key LIMIT 20').all().map(r=>({key:String(r.key),label:String(r.label),score:Number(r.score)}));
  }finally{db.close();}
}

/** A malformed or incomplete batch changes no interest scores. Quotes and source
 * identity are attached by code; the model cannot invent their provenance. */
export function assessInterests(proposal:unknown,context:AnalysisContext,provider:string):InterestAssessment{
  const candidates=context.interestCandidates??[],base={provider,candidates,evaluations:[] as InterestAppraisal[]};
  if(provider.startsWith('deterministic/'))return {...base,status:'not-requested',method:'none',issues:[]};
  if(candidates.some(c=>!context.items.some(i=>i.id===c.itemId&&i.versionId===c.versionId&&[i.title,i.content,i.summary].some(t=>t&&normalized(t).includes(normalized(c.quote))))||!normalized(c.quote).includes(normalized(c.term))))return {...base,status:'failed',method:'none',issues:['INTEREST_CANDIDATE_UNBOUND']};
  const raw=proposal&&typeof proposal==='object'?(proposal as {interestEvaluations?:unknown}).interestEvaluations:undefined;
  if(!candidates.length||!Array.isArray(raw)||raw.length!==candidates.length)return {...base,status:'failed',method:'none',issues:['INTEREST_EVALUATION_MISSING_OR_INCOMPLETE']};
  const evaluations:InterestAppraisal[]=[],seen=new Set<string>(),basis=context.interestBasis??[];
  for(const value of raw){
    if(!value||typeof value!=='object')return {...base,status:'failed',method:'none',issues:['INTEREST_EVALUATION_INVALID']};
    const v=value as Record<string,unknown>,candidate=candidates.find(c=>c.id===v.candidateId);
    const theme=typeof v.theme==='string'?basis.find(i=>i.key.startsWith('theme:')&&normalized(i.label)===normalized(v.theme as string))?.label??candidates.find(c=>normalized(c.term)===normalized(v.theme as string))?.term??null:null;
    const related=v.relatedInterestKeys,memoryIds=v.memoryIds;
    const direction=v.direction,impact=v.impact,confidence=v.confidence;
    if(!candidate||seen.has(candidate.id)||!theme||typeof v.reason!=='string'||v.reason.trim().length<8||v.reason.length>240||typeof impact!=='number'||!Number.isFinite(impact)||impact< -10||impact>10||typeof confidence!=='number'||!Number.isFinite(confidence)||confidence<0||confidence>1||
      !((direction==='strengthen'&&impact>0)||((direction==='weaken'||direction==='aversion')&&impact<0)||(direction==='neutral'&&impact===0))||
      !Array.isArray(related)||related.length>4||related.some(k=>typeof k!=='string'||!basis.some(i=>i.key===k))||!Array.isArray(memoryIds)||memoryIds.length>2||memoryIds.some(id=>typeof id!=='string'||!context.memories?.some(m=>m.id===id)))return {...base,status:'failed',method:'none',issues:['INTEREST_EVALUATION_INVALID_OR_UNBOUND']};
    seen.add(candidate.id);evaluations.push({classification:'opinion',factCheckStatus:'unverified',candidateId:candidate.id,term:candidate.term,theme,impact,reason:v.reason.trim(),confidence,direction,relatedInterestKeys:related,memoryIds,reference:{itemId:candidate.itemId,versionId:candidate.versionId,url:candidate.url,quote:candidate.quote}});
  }
  return {...base,status:'succeeded',method:'model',evaluations,issues:[]};
}

export const interestDelta=(evaluation:Pick<InterestAppraisal,'impact'|'confidence'>)=>Math.round(evaluation.impact*evaluation.confidence)/2;
