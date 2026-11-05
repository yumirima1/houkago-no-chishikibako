import {createHash} from 'node:crypto';
import type {AnalysisContext} from './ai';
import type {QualityAnalysis} from './quality-types';
import {auditSourceSummaries} from './evidence-review';

export type InquiryContext={id:string;question:string;originJob:string;references:string[]};
export type InquiryReview={
  inquiryId:string;question:string;criterion:string;answer:string|null;
  status:'resolved'|'partially_resolved'|'unresolved';reason:string;
  evidence:Array<{claimId:string;itemId:string;versionId:string;quote:string;url:string}>;
  remainingQuestions:string[];nextQuestions:string[];memoryIds:string[];
  limitations:string[];independentVerification:'not-established';
};
export function inquiryKey(question:string){
  return createHash('sha256').update(question.normalize('NFKC').toLowerCase().replace(/[\s「」『』“”"'。？！?!]/g,'')).digest('hex');
}
// A documentary answer can close only a question about the contents of a source.
// Causal, normative, future-effect and independent-confirmation questions stay open.
function documentary(question:string,evidence:string,titles:string[]){
  const requested=[...question.matchAll(/[「『]([^」』]{15,500})[」』]/g)].map(m=>m[1]);
  return /(?:記事|資料|文書|原文|出典).{0,24}(?:記載|書かれ|述べ|報告され|掲載)/u.test(question)&&
    !/独立|裏付け|反証|効果|原因|因果|優先|再評価|修正|べき|仮説|実証|将来|どう|なぜ/u.test(question)&&
    requested.length===1&&!titles.includes(requested[0])&&evidence.includes(requested[0]);
}
const text=(v:unknown,min=8,max=900):v is string=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
const list=(v:unknown)=>Array.isArray(v)&&v.length<=4&&v.every(s=>text(s));

/** Ground every proposed answer again against the current pinned document/quote.
 * Matching an ID or a reviewed hypothesis alone never closes an inquiry. */
export function reviewInquiries(context:AnalysisContext,quality:QualityAnalysis,raw:unknown):InquiryReview[]{
  return (context.inquiries??[]).map(inquiry=>{
    const base:InquiryReview={inquiryId:inquiry.id,question:inquiry.question,criterion:'質問に対応した回答と検証可能な解決条件が必要。',answer:null,status:'unresolved',reason:'質問別の有効な回答を取得できていない。',evidence:[],remainingQuestions:[inquiry.question],nextQuestions:[],memoryIds:[],limitations:[],independentVerification:'not-established'};
    const rows=Array.isArray(raw)?raw.filter(r=>r?.inquiryId===inquiry.id):[];
    const r=rows[0];
    if(rows.length!==1||!r||!text(r.criterion)||!text(r.answer)||!text(r.reason)||!['resolved','partially_resolved','unresolved'].includes(r.status)||!list(r.remainingQuestions)||!list(r.nextQuestions)||!Array.isArray(r.claimIds)||r.claimIds.length<1||r.claimIds.length>4||new Set(r.claimIds).size!==r.claimIds.length)return base;
    const observations=r.claimIds.map((id:unknown)=>quality.observations.find(o=>o.claimId===id));
    if(observations.some((o:QualityAnalysis['observations'][number]|undefined)=>!o||o.kind!=='article-body'||!context.claims.some(c=>c.id===o.claimId&&c.itemId===o.itemId&&c.versionId===o.versionId&&c.text===o.quote)||!context.items.some(i=>i.id===o.itemId&&i.versionId===o.versionId&&i.content?.includes(o.quote))||!context.coverage?.some(c=>c.itemId===o.itemId&&c.versionId===o.versionId&&c.kind==='article-body'&&c.status==='available')))return {...base,reason:'回答の引用が取得済み本文と一致しない。'};
    const evidence=observations as QualityAnalysis['observations'];
    // The answer is an attributed paraphrase. Reuse the same narrow fidelity
    // checks as source summaries, without pretending they prove all semantics.
    const combined=evidence.map(o=>o.quote).join(' '),first=evidence[0];
    const audit=auditSourceSummaries({...context,items:[context.items.find(i=>i.id===first.itemId)!],claims:[{...context.claims.find(c=>c.id===first.claimId)!,text:combined}]},[{itemId:first.itemId,facts:[{claimId:first.claimId,text:r.answer}],limitation:'今回の取得資料に基づく回答。独立検証は未実施。'}]);
    if(audit.fatalIssues.length||quality.modelIssues.length||quality.evidenceReview?.summaryIssues.length||quality.generationStatus==='failed')return {...base,reason:'回答または考察の根拠検査が未完了。',limitations:audit.fatalIssues};
    const conflict=quality.sourceVerification?.claims.some(c=>r.claimIds.includes(c.claimId)&&c.result==='conflict-candidate');
    const ids=Array.isArray(r.memoryIds)?r.memoryIds:[];
    if(ids.some((id:unknown)=>!context.memories?.some(m=>m.id===id)))return {...base,reason:'存在しない過去記憶が回答に参照されている。'};
    const canClose=r.status==='resolved'&&documentary(inquiry.question,combined,context.items.map(i=>i.title))&&!conflict&&r.remainingQuestions.length===0;
    const status=canClose?'resolved':r.status==='unresolved'?'unresolved':'partially_resolved';
    return {...base,criterion:r.criterion,answer:r.answer,status,reason:r.reason,evidence:evidence.map(o=>({claimId:o.claimId,itemId:o.itemId,versionId:o.versionId,quote:o.quote,url:o.url})),memoryIds:ids,
      remainingQuestions:canClose?[]:r.remainingQuestions.length?r.remainingQuestions:[inquiry.question],nextQuestions:r.nextQuestions,
      limitations:[...(!canClose?['文書の記載範囲を超える結論は未解決。独立検証・効果測定を完了扱いにしない。']:['記載の確認に限定した自動判定。記述内容の真偽の独立検証ではない。']),...(conflict?['保存済み資料に矛盾候補がある。']:[])]};
  });
}
