import type {QualityAnalysis} from './quality-types';

const day=24*60*60*1000;
function dated(value:string){
  return [...value.matchAll(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/g)].flatMap(match=>{
    const year=Number(match[1]),month=Number(match[2]),date=Number(match[3]),time=Date.UTC(year,month-1,date),actual=new Date(time);
    return actual.getUTCFullYear()===year&&actual.getUTCMonth()===month-1&&actual.getUTCDate()===date?
      [{key:`${year}-${month}-${date}`,time,index:match.index}]:[];
  });
}

/** Detect only an explicitly dated, future scheduled event described as
 * already performed. Missing dates and general semantic questions stay open. */
export function prematurelyCompletedEvent(value:string,evidence:string,readAt:number){
  if(!Number.isFinite(readAt)||!/(?:開催|実施)(?:いたします|します|する予定|予定)/.test(evidence))return false;
  // More than one day avoids making a decision from timezone/day boundaries.
  const future=new Set(dated(evidence.normalize('NFKC')).filter(date=>date.time>readAt+day).map(date=>date.key));
  if(!future.size)return false;
  return value.normalize('NFKC').split(/(?<=[。！？])\s*/u).some(sentence=>{
    if(/もし|仮に|仮定|なら|れば|場合|予定|計画|見込|誤り|誤記|誤読|未確認|確認できない|書いていない|とは限らない|かどうか|実施していない|開催していない/.test(sentence))return false;
    const dates=dated(sentence);
    for(const event of sentence.matchAll(/(?:イベント|講演会|ワークショップ)(?:を|が)[^。！？]{0,12}?(?:開催した|開催された|開催済み|実施した|実施された|実施している|開催している|行われた)/g)){
      const closest=dates.filter(date=>date.index<event.index&&event.index-date.index<120).at(-1);
      if(closest&&future.has(closest.key))return true;
    }
    return false;
  });
}
/** Recheck saved results too: a resumed job may have an older analysis checkpoint. */
export function prematureEventInQuality(quality:Pick<QualityAnalysis,'reflection'|'observations'|'coverage'>|undefined){
  const view=quality?.reflection;if(!view)return false;
  const evidence=(quality?.observations??[]).filter(o=>(view.premiseClaimIds??[]).includes(o.claimId)).map(o=>o.quote).join(' ');
  const readAt=Math.max(...(quality?.coverage??[]).map(c=>Date.parse(c.fetchedAt)).filter(Number.isFinite));
  return [view.issue,view.position,view.reasoning,view.alternative,view.revisionCondition].some(value=>typeof value==='string'&&prematurelyCompletedEvent(value,evidence,readAt));
}
