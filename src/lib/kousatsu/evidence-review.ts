import {createHash} from 'node:crypto';
import {sourceDatePrecisionSupported,withoutSupportedCalendarDates} from './source-date';
import type {AnalysisContext} from './ai';
import type {QualityAnalysis} from './quality-types';

export type ModelCallMetrics = {
  validationIssues?:string[];
  phase:'summary'|'analysis'; model:string; promptVersion:number; promptHash:string;
  inputCharacters:number; outputCharacters:number; elapsedMs:number; attempts:number;
  thinking?:boolean;
  status:'succeeded'|'failed'; error?:string; promptTokens?:number; outputTokens?:number;
  totalMs?:number; loadMs?:number; evaluationMs?:number;
  options:{temperature:number;num_ctx:number;num_predict:number};
};
export type SourceSummary = {
  itemId:string; facts:Array<{claimId:string;text:string}>; limitation:string;
  inputBodyCharacters?:number;bodyTruncated?:boolean;limitationOrigin?:'pipeline';
};
export type EvidenceReview = {
  version:'evidence-review-v1'; checkedAt:string;
  summaries:SourceSummary[]; summaryIssues:string[];
  summaryWarnings?:string[];
  comparisons:Array<{leftItemId:string;rightItemId:string;agreement:string;difference:string;claimIds:string[];agreementClaimIds?:string[];differenceClaimIds?:string[]}>;
  sources:Array<{itemId:string;sourceId:string;publisher:string;kind:string;language:string;region:string;
    originGroup:string;independence:'same-origin'|'not-established';reason:string}>;
  documentCount:number;originGroups:number;independentlyVerifiedSources:number;
  claims:Array<{claimId:string;itemId:string;versionId:string;classification:'strong'|'some'|'unverified'|'disputed';
    use:'factual-evidence'|'attributed-claim'|'discourse-analysis'|'investigation-only'|'excluded';reason:string;supportingIds:string[];opposingIds:string[];unknowns:string[]}>;
  confidenceBasis:string;
  automaticChecks:string[];humanReview:string[];
};

const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,' ').trim();
export const sourceQuantities=(value:string):string[]=>{
  const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
  return normalize(value).replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi,'').replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,word=>String(words.indexOf(word.toLowerCase()))).match(/\d+(?:[.,]\d+)*/g)??[];
};
export const sourceNumbersSupported=(text:string,source:string)=>sourceDatePrecisionSupported(source,text)&&sourceQuantities(withoutSupportedCalendarDates(source,text)).every(n=>sourceQuantities(source).includes(n));
const percentageValues=(value:string)=>[...normalize(value).matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent(?!age? points?| points?)|パーセント(?!ポイント)|パーセンテージ(?!ポイント|点))/gi)].map(m=>m[1]);
export const percentageUnitsSupported=(text:string,source:string)=>percentageValues(text).every(n=>percentageValues(source).includes(n));
/** Preserve explicit units too: an existing number cannot move from a fee to a capacity. */
export function quantityUnitsSupported(text:string,source:string){
  const pairs=(value:string)=>[...normalize(value).matchAll(/(\d+(?:[.,]\d+)*)\s*(people|participants?|persons?|yen|keV|eV|fs|ps|ns|ms|nm|cm|kg|人|名|円)(?![A-Za-z])/gi)].map(m=>{
    const unit=m[2].toLowerCase();return `${m[1]}:${/^(?:people|participants?|persons?|人|名)$/.test(unit)?'person':/^(?:yen|円)$/.test(unit)?'yen':unit}`;
  });
  const supported=new Set(pairs(source));return pairs(text).every(pair=>{
    const number=pair.slice(0,pair.indexOf(':'));
    return ![...supported].some(p=>p.startsWith(number+':'))||supported.has(pair);
  });
}
const ja=(value:unknown):value is string=>typeof value==='string'&&value.length>=8&&value.length<=700&&/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
const namesSupported=(text:string,source:string)=>(text.match(/\b[A-Z][A-Za-z0-9]*(?:[-.][A-Za-z0-9]+)*\b/g)??[]).every(name=>normalize(source).includes(name));

/** Distribute a bounded reading budget across sources before model inference. */
export function summaryDocuments(context:AnalysisContext){
  const limit=Math.floor(6000/Math.max(1,context.items.length));
  return context.items.map(item=>({itemId:item.id,title:item.title,
    language:context.coverage?.find(c=>c.itemId===item.id)?.metadata?.language,
    publishedAt:item.publishedAt??context.coverage?.find(c=>c.itemId===item.id)?.metadata?.publishedAt,
    retrievedAt:item.fetchedAt,eventAt:context.coverage?.find(c=>c.itemId===item.id)?.metadata?.eventAt,
    body:(item.content??item.summary??'').slice(0,limit),bodyTruncated:(item.content??item.summary??'').length>limit,
    claims:context.claims.filter(c=>c.itemId===item.id).slice(0,4).map(c=>({claimId:c.id,text:c.text}))}));
}

/** Narrow semantic hazards with explicit source wording, also applied to old memory. */
export function summaryMeaningIssues(source:string,text:string){
  const issues:string[]=[];
  if(!sourceDatePrecisionSupported(source,text))issues.push('SUMMARY_DATE_PRECISION_INVENTED');
  const bases=[...source.matchAll(/\b(?:based|headquartered) in ([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,3})\b/g)].map(m=>m[1]);
  if(bases.length===1&&/(?:を|に)拠点|本拠地|本社/.test(text)&&!text.includes(bases[0]))issues.push('SUMMARY_LOCATION_BINDING_LOST');
  const correlation=/\b(?:correlat\w*|associat\w*)\b|相関|関連性/i.test(source);
  const causalAssertion=/(?:原因である|原因だ|原因となった|引き起こした|によって改善した|(?:改善|増加|低下)させた|因果関係を(?:証明|実証|確認)した)/.test(text)&&!/とは限らない|わけではない|とは言えない|とはいえない|確認されていない/.test(text);
  const causalSource=/\b(?:caused|causes|causal effect|demonstrated causality)\b|原因となった|因果関係を(?:証明|実証|確認)した/i.test(source)&&!/\b(?:no causal effect|not caus(?:ed|es)|not establish causation)\b/i.test(source);
  if(correlation&&causalAssertion&&!causalSource)issues.push('SUMMARY_CORRELATION_AS_CAUSATION');
  if(/\b(?:may(?!\s+\d)|possibly|suggests?)\b/i.test(source)&&!/可能性|かもしれ|示唆|とされ|未確認|仮説|考えられ/.test(text))issues.push('SUMMARY_UNCERTAINTY_LOST');
  return issues;
}

/** Checks traceability and obvious mistranslations. Semantic fidelity still needs a reader. */
export function auditSourceSummaries(context:AnalysisContext,raw:unknown) {
  const summaries:SourceSummary[]=[],issues:string[]=[];
  const supplied=Array.isArray(raw)?raw:[];
  if(supplied.some(row=>!context.items.some(i=>i.id===row?.itemId)))issues.push('SUMMARY_UNKNOWN_SOURCE');
  for(const item of context.items){
    const rows=supplied.filter(s=>s&&typeof s==='object'&&s.itemId===item.id);
    const row=rows[0];
    if(rows.length!==1||!row||!Array.isArray(row.facts)||!row.facts.length||row.facts.length>3||!ja(row.limitation)){
      issues.push(`SUMMARY_INCOMPLETE:${item.id}`);continue;
    }
    if(!/今回|入力|取得|資料|本文|抜粋|未確認|確認でき|判断でき/.test(row.limitation))issues.push(`SUMMARY_UNSUPPORTED_LIMITATION:${item.id}`);
    const facts:SourceSummary['facts']=[];
    for(const fact of row.facts){
      const claim=context.claims.find(c=>c.id===fact?.claimId&&c.itemId===item.id);
      if(claim&&ja(fact.text)&&!sourceDatePrecisionSupported(claim.text,fact.text)){issues.push(`SUMMARY_DATE_PRECISION_INVENTED:${claim.id}`);continue;}
      if(!claim||!ja(fact.text)||fact.text.length>200||/https?:\/\//i.test(fact.text)||!sourceNumbersSupported(fact.text,claim.text)||!percentageUnitsSupported(fact.text,claim.text)||!quantityUnitsSupported(fact.text,claim.text)){
        issues.push(`SUMMARY_UNSUPPORTED_FACT:${item.id}`);continue;
      }
      if(fact.text.length>=80&&normalize(claim.text).includes(normalize(fact.text))){issues.push(`SUMMARY_COPIED_SOURCE:${claim.id}`);continue;}
      if(row.limitationOrigin==='pipeline'&&(!/[。！？][」』”]?$/.test(fact.text.trim())||/(?:を用いて|を利用して|によって|として|における|に関する|には|は|が|を|の|へ|や)[。！？]$/.test(fact.text.trim()))){
        issues.push(`SUMMARY_FRAGMENT:${claim.id}`);continue;
      }
      const source=claim.text;
      const meaning=summaryMeaningIssues(source,fact.text);
      if(meaning.length){issues.push(...meaning.map(code=>`${code}:${claim.id}`));continue;}
      if(/\b(?:will|planned|scheduled|aims? to|expected to|could|might)\b/i.test(source)&&
        !/予定|計画|目指|見込|可能性|かもしれ|とされ|予測|見通し|期待/.test(fact.text)){
        issues.push(`SUMMARY_MODALITY_LOST:${claim.id}`);continue;
      }
      if(/予定|計画|見込|開催します|開催されます/.test(source)&&
        /開催した|開催された|開催済み|実施した|実施された|完了した|行われた/.test(fact.text)){
        issues.push(`SUMMARY_MODALITY_LOST:${claim.id}`);continue;
      }
      // A negated object inside an illustrative example does not negate the
      // preceding main finding. Do not require every short summary to repeat it.
      const mainStatement=source.split(/;\s*(?:e\.g\.,?|for example)\s*/i)[0];
      if((/\b(?:not(?! only)|never|cannot|no evidence|failed to)\b/i.test(mainStatement)||
        /ではない|ではなかった|できない|できなかった|未確認|未検証|確認されていない|認められなかった|示されなかった/.test(mainStatement))&&
        !/ない|なかっ|ず|未|不|無|否定|中止|禁止|失敗|限/.test(fact.text)){
        issues.push(`SUMMARY_NEGATION_LOST:${claim.id}`);continue;
      }
      if(!namesSupported(fact.text,`${item.title} ${source}`)){issues.push(`SUMMARY_UNKNOWN_NAME:${claim.id}`);continue;}
      facts.push({claimId:claim.id,text:fact.text});
    }
    const suppliedDocument=summaryDocuments(context).find(d=>d.itemId===item.id)!;
    if(facts.length) summaries.push({itemId:item.id,facts,limitation:row.limitation,...(row.limitationOrigin==='pipeline'?{limitationOrigin:'pipeline' as const}:{}),inputBodyCharacters:suppliedDocument.body.length,bodyTruncated:suppliedDocument.bodyTruncated});
    else issues.push(`SUMMARY_NO_ACCEPTED_FACT:${item.id}`);
  }
  const uniqueIssues=[...new Set(issues)];
  // Unsupported sentences are already omitted above. A document with another
  // accepted sentence still satisfies the minimum summary requirement. Keep
  // all diagnostics, and fail if any document has no accepted facts or if any
  // other source/translation constraint failed.
  const recoverable=new Set(summaries.filter(s=>s.facts.length>0).map(s=>`SUMMARY_UNSUPPORTED_FACT:${s.itemId}`));
  for(const summary of summaries)for(const claim of context.claims.filter(c=>c.itemId===summary.itemId))recoverable.add(`SUMMARY_DATE_PRECISION_INVENTED:${claim.id}`);
  return {summaries,issues:uniqueIssues,fatalIssues:uniqueIssues.filter(issue=>!recoverable.has(issue)),
    warnings:uniqueIssues.filter(issue=>recoverable.has(issue))};
}

/** A publisher family and a copy of an announcement are not independent evidence. */
export function publisherFamily(url:string) {
  try {
    const host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');
    if(host==='nasa.gov'||host.endsWith('.nasa.gov'))return 'nasa.gov';
    // Preserve registrants under Japanese/UK public suffixes (not "go.jp"/"ac.jp").
    const parts=host.split('.');
    return parts.slice(/\.(?:go|ac|co|or|ne)\.jp$|\.(?:ac|co|gov)\.uk$/.test(host)?-3:-2).join('.');
  } catch {return 'unknown';}
}

export function evaluateEvidence(context:AnalysisContext,quality:QualityAnalysis,summaries:SourceSummary[]=[],summaryIssues:string[]=[],proposal?:unknown):EvidenceReview {
  const comparisons:EvidenceReview['comparisons']=[];
  const raw=(proposal as {sourceComparisons?:unknown}|undefined)?.sourceComparisons;
  if(context.items.length>1){
    for(const comparison of Array.isArray(raw)?raw:[]){
      const ids=comparison?.claimIds;
      const claims=Array.isArray(ids)?ids.flatMap((id:unknown)=>context.claims.filter(c=>c.id===id)):[];
      const agreementIds=Array.isArray(comparison?.agreementClaimIds)?comparison.agreementClaimIds:ids;
      const differenceIds=Array.isArray(comparison?.differenceClaimIds)?comparison.differenceClaimIds:ids;
      const agreementClaims=claims.filter(c=>agreementIds?.includes(c.id));
      const differenceClaims=claims.filter(c=>differenceIds?.includes(c.id));
      const quoted=claims.map(c=>c.text).join(' ');
      const titles=context.items.filter(i=>[comparison?.leftItemId,comparison?.rightItemId].includes(i.id)).map(i=>i.title).join(' ');
      const eventFuture=/開催します|開催されます|開催する予定|開催予定/.test(quoted);
      if(eventFuture&&/開催した|開催済み/.test(`${comparison?.agreement??''} ${comparison?.difference??''}`)){
        summaryIssues.push('COMPARISON_MODALITY_LOST');continue;
      }
      if(!comparison||comparison.leftItemId===comparison.rightItemId||!context.items.some(i=>i.id===comparison.leftItemId)||!context.items.some(i=>i.id===comparison.rightItemId)||
        !ja(comparison.agreement)||(!ja(comparison.difference)&&!/^特になし。?$/.test(comparison.difference??''))||!Array.isArray(ids)||ids.length<2||ids.length>8||claims.length!==ids.length||
        !claims.some(c=>c.itemId===comparison.leftItemId)||!claims.some(c=>c.itemId===comparison.rightItemId)||
        ![comparison.leftItemId,comparison.rightItemId].every(itemId=>agreementClaims.some(c=>c.itemId===itemId)&&
          sourceNumbersSupported(comparison.agreement,agreementClaims.filter(c=>c.itemId===itemId).map(c=>c.text).join(' '))&&
          percentageUnitsSupported(comparison.agreement,agreementClaims.filter(c=>c.itemId===itemId).map(c=>c.text).join(' ')))||
        !sourceNumbersSupported(comparison.difference,differenceClaims.map(c=>c.text).join(' '))||!percentageUnitsSupported(comparison.difference,differenceClaims.map(c=>c.text).join(' '))||
        !namesSupported(comparison.agreement,`${titles} ${agreementClaims.map(c=>c.text).join(' ')}`)||!namesSupported(comparison.difference,`${titles} ${differenceClaims.map(c=>c.text).join(' ')}`)){
        summaryIssues.push('COMPARISON_UNGROUNDED');continue;
      }
      comparisons.push({leftItemId:comparison.leftItemId,rightItemId:comparison.rightItemId,agreement:comparison.agreement,difference:comparison.difference,claimIds:ids,agreementClaimIds:agreementIds,differenceClaimIds:differenceIds});
    }
    if(!comparisons.length)summaryIssues.push('COMPARISON_MISSING');
  }
  const sources:EvidenceReview['sources']=[];
  for(const item of context.items){
    const coverage=context.coverage?.find(c=>c.itemId===item.id),profile=coverage?.sourceProfile;
    const text=normalize(item.content??item.summary??item.title);
    const exact=text.length>=160?sources.find(other=>{
      const previous=context.items.find(i=>i.id===other.itemId)!;
      return normalize(previous.content??previous.summary??previous.title)===text;
    }):undefined;
    const family=profile?.publisher??publisherFamily(item.url);
    const dependency=sources.find(other=>{
      const previous=context.items.find(i=>i.id===other.itemId)!;
      const previousLinks=context.coverage?.find(c=>c.itemId===other.itemId)?.metadata?.primaryLinks??[];
      return previousLinks.includes(item.canonicalUrl)||(coverage?.metadata?.primaryLinks??[]).includes(previous.canonicalUrl);
    });
    const originGroup=exact?.originGroup??dependency?.originGroup??family;
    const shared=sources.some(s=>s.originGroup===originGroup);
    sources.push({itemId:item.id,sourceId:item.sourceId,publisher:family,kind:coverage?.metadata?.documentKind??profile?.kind??'unknown',
      language:coverage?.metadata?.language??profile?.language??(/[\p{Script=Hiragana}]/u.test(text)?'ja':'und'),region:profile?.region??'unknown',
      originGroup,independence:shared?'same-origin':'not-established',reason:exact?'保存本文が一致するため転載・共通原資料として集約。':dependency?'一方が他方を参照している。同じ原資料に依存する可能性があるため独立した証拠に加算しない。':shared?'同じ発信主体。独立した裏付けに加算しない。':'発信主体を区別しただけで、編集上・データ上の独立性は未確認。'});
  }
  const claims:EvidenceReview['claims']=quality.observations.map(o=>{
    const binding=quality.sourceVerification?.claims.find(c=>c.claimId===o.claimId);
    const broken=quality.sourceVerification?.unboundClaimIds.includes(o.claimId)??false;
    const available=context.coverage?.some(c=>c.itemId===o.itemId&&c.kind==='article-body'&&c.status==='available');
    const descriptor=context.coverage?.find(c=>c.itemId===o.itemId);
    const known=Boolean(descriptor?.sourceProfile||descriptor?.metadata?.documentKind==='paper');
    return {claimId:o.claimId,itemId:o.itemId,versionId:o.versionId,classification:broken?'disputed':available&&known?'some':'unverified',
      use:broken?'excluded':!available?'investigation-only':descriptor?.sourceProfile?.kind==='commentary'?'discourse-analysis':'attributed-claim',
      reason:broken?'引用と保存原文の不一致が確認された。事実の根拠には使用しない。':available&&known?'保存本文と発信主体・資料種別を確認。発信者の主張として一定の裏付けがあるが、独立検証は未実施。':available?'保存本文と引用は対応するが、発信主体の専門性・原資料の独立検証は不足。主張の真偽は保留する。':'本文未取得のため、題名・抜粋の内容を調査対象として保持する。',
      supportingIds:binding?.comparisons.filter(c=>c.kind==='corroboration-candidate').map(c=>c.itemId)??[],
      opposingIds:binding?.comparisons.filter(c=>c.kind==='conflict-candidate').map(c=>c.itemId)??[],
      unknowns:['情報源の独立性','主張の外部検証',...(binding?.result==='conflict-candidate'?['数値差の観測条件・時点']:[])]};
  });
  return {version:'evidence-review-v1',checkedAt:new Date().toISOString(),summaries,summaryIssues:[...new Set(summaryIssues)],comparisons,sources,
    documentCount:sources.length,originGroups:new Set(sources.map(s=>s.originGroup)).size,independentlyVerifiedSources:0,claims,
    confidenceBasis:'確信度は見解への順序尺度であり真偽の確率ではない。題名のみは最大0.25。本文があっても独立検証が未実施なら最大0.45。数値差候補がある場合は最大0.25。本文未取得の主記事では考察の完成を認めない。',
    automaticChecks:['原文引用・保存版・出典IDの対応','要約の数値・予定表現・否定表現','同一主体・保存本文一致の集約','見解の前提・代替説明・修正条件の構造'],
    humanReview:['日本語の自然さ','翻訳・固有名詞・日時・主語と条件の意味的一致','根拠から見解への論理の妥当性','対立する見解の証拠の強さ','別言語の転載と原資料の独立性']};
}

export const promptDigest=(prompt:string)=>createHash('sha256').update(prompt).digest('hex');
