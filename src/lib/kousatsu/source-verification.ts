import {meaningfulTerms,compareRecords} from './relevance';
import type {AnalysisContext} from './ai';
import type {QualityAnalysis} from './quality-types';
import type {StoredItem} from './types';

export type SourceVerification={
  method:'stored-source-comparison';checkedAt:string;independentVerification:'unverified';
  unboundClaimIds:string[];documentWarnings:Array<{itemId:string;kind:'old-source'|'future-date'|'correction-notice'}>;
  claims:Array<{claimId:string;itemId:string;versionId:string;url:string;quote:string;result:'source-bound-only'|'corroboration-candidate'|'conflict-candidate';comparisons:Array<{itemId:string;versionId:string;url:string;quote:string;kind:'same-publisher'|'syndicated'|'related'|'corroboration-candidate'|'conflict-candidate';independence:'not-established';reason:string}>}>;
};
const normalized=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const publisher=(url:string)=>{try{return new URL(url).hostname.toLowerCase().split('.').slice(-2).join('.');}catch{return '';}};
const metrics=(text:string)=>[...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(percent|%|kilometers?|km|megawatts?|mw|million|billion|degrees?|meters?)(?=\s|[.,;]|$)/gi)].map(m=>({value:m[1].replaceAll(',',''),unit:m[2].toLowerCase().replace(/s$/,'').replace('percent','%')}));

/** Compare actual stored quotations, not a model's confidence. Different hosts
 * and matching statements are leads; neither proves editorial independence or truth. */
export function verifySourceBindings(context:AnalysisContext,quality:QualityAnalysis,candidates:StoredItem[],now=Date.now()):SourceVerification{
  const result:SourceVerification={method:'stored-source-comparison',checkedAt:new Date(now).toISOString(),independentVerification:'unverified',unboundClaimIds:[],documentWarnings:[],claims:[]};
  for(const claim of context.claims){
    const item=context.items.find(i=>i.id===claim.itemId&&i.versionId===claim.versionId);
    if(!item||!claim.versionId||![item.content,item.summary,item.title].some(t=>t&&normalized(t).includes(normalized(claim.text))))result.unboundClaimIds.push(claim.id);
  }
  for(const item of context.items){
    if(item.publishedAt&&now-Date.parse(item.publishedAt)>90*86400000)result.documentWarnings.push({itemId:item.id,kind:'old-source'});
    if(item.publishedAt&&Date.parse(item.publishedAt)>now+86400000)result.documentWarnings.push({itemId:item.id,kind:'future-date'});
    if(/\bcorrection|\bcorrected|\brevised|訂正|誤りを修正/i.test(item.title))result.documentWarnings.push({itemId:item.id,kind:'correction-notice'});
  }
  for(const observation of quality.observations.filter(o=>!result.unboundClaimIds.includes(o.claimId))){
    const primary=context.items.find(i=>i.id===observation.itemId)!;
    const binding:SourceVerification['claims'][number]={claimId:observation.claimId,itemId:primary.id,versionId:observation.versionId,url:primary.url,quote:observation.quote,result:'source-bound-only',comparisons:[]};
    const relevant=candidates.filter(item=>item.id!==primary.id&&item.versionId&&['same_document','follow_up_candidate','same_issue_candidate'].includes(compareRecords(primary,item).kind)).slice(0,4);
    for(const peer of relevant){
      const quoteTerms=meaningfulTerms(observation.quote);
      const sentences=(peer.content??peer.summary??'').split(/(?<=[.!?。])\s+/).filter(s=>s.length>=30&&s.length<=1500);
      const ranked=sentences.map(quote=>({quote,common:[...meaningfulTerms(quote)].filter(t=>quoteTerms.has(t)).length})).sort((a,b)=>b.common-a.common);
      const match=ranked[0];if(!match||match.common<3)continue;
      const quote=match.quote.slice(0,500),same=publisher(primary.url)===publisher(peer.url),exact=normalized(quote)===normalized(observation.quote);
      const left=metrics(observation.quote),right=metrics(quote);
      const comparable=left.filter(a=>right.some(b=>b.unit===a.unit));
      const conflict=comparable.some(a=>right.some(b=>a.unit===b.unit&&a.value!==b.value));
      const support=comparable.length>0&&!conflict&&match.common>=Math.max(3,Math.ceil(quoteTerms.size*.5));
      const kind=conflict?'conflict-candidate':same?'same-publisher':exact?'syndicated':support?'corroboration-candidate':'related';
      binding.comparisons.push({itemId:peer.id,versionId:peer.versionId!,url:peer.url,quote,kind,independence:'not-established',reason:same?'同一発表主体の記述を独立した裏付けと数えない。':exact?'同文の引用・転載候補。独立した裏付けと数えない。':conflict?'共通の対象・単位に異なる数値がある。観測時点・条件・転載元の確認が必要で、矛盾成立は未確定。':support?'共通の対象・単位の数値が一致。別発表主体の照合候補であり、独立性と真偽は未確認。':'同じ問題の追加資料候補。主張の支持・反証は未確認。'});
    }
    if(binding.comparisons.some(c=>c.kind==='conflict-candidate'))binding.result='conflict-candidate';
    else if(binding.comparisons.some(c=>c.kind==='corroboration-candidate'))binding.result='corroboration-candidate';
    result.claims.push(binding);
  }
  return result;
}
