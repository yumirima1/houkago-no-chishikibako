import {createHash} from 'node:crypto';
import type {GroundedObservation,QualityAnalysis} from './quality-types';
import {publicText,publicUrl} from './public-projection';
import {summaryMeaningIssues} from './evidence-review';
import {sourceDatePrecisionSupported} from './source-date';

export type PublicEvidence={label:string;claimId:string;itemId:string;versionId:string;sourceId:string|null;url:string;kind:string;quoteExcerpt:string;quoteFragments:string[];quoteSha256:string};
export const evidenceAppendixHeading='## 証拠対応表（出典補足）';

/** Supplement only; the source note and frozen public_documents row stay intact. */
export function sourceFragments(quote:string,title=''){
 const tokens=[...quote.matchAll(/\S+/g)];let spans:Array<[number,number]>;
 if(tokens.length>20){
  const names=(title.match(/\b[A-Z][A-Za-z0-9-]{3,}\b/g)??[]).filter(n=>!['APOD','NASA','January','November','Research','Study'].includes(n));
  const subject=tokens.findIndex(t=>names.some(n=>t[0].replace(/^[^\w]+|[^\w]+$/g,'').toLowerCase()===n.toLowerCase()));
  const modal=tokens.findIndex(t=>/^(?:likely|could|might|may|will|not|never|planned|scheduled)$/i.test(t[0]));
  const start=modal>=0?Math.max(0,modal-4):subject>=0?subject:0,end=Math.min(tokens.length,start+12);
  const core:[number,number]=[tokens[start].index!,tokens[end-1].index!+tokens[end-1][0].length];
  if(end===tokens.length)spans=[core];
  else if(tokens.length-8<=end)spans=[[core[0],quote.length]];
  else spans=[core,[tokens[tokens.length-8].index!,quote.length]];
 }else spans=quote.length>170?[[0,95],[quote.length-60,quote.length]]:[[0,quote.length]];
 return spans.map(([a,b])=>quote.slice(a,b).trim().slice(0,180)).filter(Boolean);
}
export function publicEvidence(observations:GroundedObservation[],claim:(id:string)=>{text:string;itemId:string;versionId:string;sourceId?:string;url?:string;title?:string}|null){
 const entries:PublicEvidence[]=[],unavailable:string[]=[];
 for(const [index,o] of observations.entries()){
  const label=`E${index+1}`,record=claim(o.claimId),url=publicUrl(o.url);
  if(!record||record.text!==o.quote||record.itemId!==o.itemId||record.versionId!==o.versionId||!url||record.url&&publicUrl(record.url)!==url){unavailable.push(label);continue;}
  const fragments=sourceFragments(o.quote,record.title),excerpt=fragments[0]??'';
  if(!excerpt||fragments.some(f=>publicText(f)!==f)){unavailable.push(label);continue;}
  entries.push({label,claimId:o.claimId,itemId:o.itemId,versionId:o.versionId,sourceId:record.sourceId??null,url,kind:o.kind,quoteExcerpt:excerpt,quoteFragments:fragments,quoteSha256:createHash('sha256').update(o.quote).digest('hex')});
 }
 return {entries,unavailable};
}
export function publicSourceWarnings(quality:QualityAnalysis|undefined){
 if(!quality)return [];
 const codes=(quality.evidenceReview?.summaries??[]).flatMap(s=>s.facts.flatMap(f=>{
  const quote=quality.observations.find(o=>o.claimId===f.claimId)?.quote;
  if(!quote)return [];
  const issues=summaryMeaningIssues(quote,f.text);if(!sourceDatePrecisionSupported(quote,f.text)&&!issues.includes('SUMMARY_DATE_PRECISION_INVENTED'))issues.push('SUMMARY_DATE_PRECISION_INVENTED');return issues;
 }));
 const warnings:string[]=codes.map(code=>code==='SUMMARY_DATE_PRECISION_INVENTED'?'原文の年月にない日付を要約へ補っているため、再確認が必要です。':'保存済み日本語要約と原文の意味対応に再検査の指摘があります。');
 const decision=quality.decisionEvaluation;
 if(decision&&!('reasoning' in quality&&quality.reasoning)){
  const source=quality.observations.map(o=>o.quote).join(' ');
  if(/教育|教材|授業|広告|販売|収益/.test(decision.scenario)&&!/教育|教材|授業|広告|販売|収益|education|learning|teach|classroom|advertis|sales|revenue/i.test(source))warnings.push('利用場面の設定と今回の出典記述との接続を確認できていません。');
  if(decision.candidates.length===2&&decision.candidates[0].score===decision.candidates[1].score)warnings.push('同じ点数であっても同等性が確認されたことにはなりません。比較材料の再確認が必要です。');
 }
 return [...new Set(warnings)];
}
export function appendPublicEvidence(markdown:string,evidence:ReturnType<typeof publicEvidence>,warnings:string[]=[]){
 if(!evidence.entries.length&&!evidence.unavailable.length&&!warnings.length)return markdown;
 if(markdown.includes(evidenceAppendixHeading))throw Error('PUBLIC_EVIDENCE_DUPLICATE_APPENDIX');
 const safe=(v:string)=>publicText(v).replaceAll('|','｜').replaceAll('[','［').replaceAll(']','］');
 return markdown+'\n\n'+[evidenceAppendixHeading,'',
  '以下は保存済みの引用記録との対応を示す補足です。上の考察本文は変更していません。短い原文抜粋は出典の主張であり、独立した事実確認ではありません。','',
  ...(warnings.length?['追加の検証状態: 要確認・保存後の出典再検査で問題を検出',...warnings.map(w=>`- ${publicText(w)}`),'']:[]),
  ...evidence.entries.flatMap(e=>[`- **${e.label}** — [原資料](${e.url})`,`  - 取得範囲: ${e.kind==='article-body'?'記事本文':e.kind==='feed-summary'?'RSS要約':'題名・URL'}`,
    `  - 原文抜粋: ${e.quoteFragments.map(f=>`「${safe(f)}」`).join(' … ')}`,`  - 資料ID: ${e.itemId} / 版ID: ${e.versionId} / 証拠の主張ID: ${e.claimId}${e.sourceId?` / 取得元ID: ${e.sourceId}`:''}`]),
  ...evidence.unavailable.map(label=>`- ${label}: 対応する保存記録を確認できないため、引用の補完はしていません。`),''].join('\n');
}
export function isEvidenceOnlyAppend(previous:string,next:string){return next.startsWith(previous+'\n\n'+evidenceAppendixHeading+'\n');}
