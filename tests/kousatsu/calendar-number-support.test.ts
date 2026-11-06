import test from 'node:test';import assert from 'node:assert/strict';
import {auditSourceSummaries,evaluateEvidence,sourceNumbersSupported} from '../../src/lib/kousatsu/evidence-review';import type {AnalysisContext} from '../../src/lib/kousatsu/ai';
import {sourceDatePrecisionSupported} from '../../src/lib/kousatsu/source-date';
import type {QualityAnalysis} from '../../src/lib/kousatsu/quality-types';
const source='One image was captured on November 1, 2009.';
function audit(text:string,quote=source){
 const item={id:'d',sourceId:'source',versionId:'v',title:'Image observation',url:'https://example.org/image',canonicalUrl:'https://example.org/image',content:quote,contentHash:'hash',fetchedAt:'2026-11-06T00:00:00Z'},context:AnalysisContext={topic:'撮影日時',items:[item],claims:[{id:'c',itemId:'d',versionId:'v',text:quote,classification:'source_claim',confidence:.5,reason:'出典',createdAt:item.fetchedAt}],relations:[]};
 return auditSourceSummaries(context,[{itemId:'d',facts:[{claimId:'c',text}],limitation:'今回読んだ出典の記述であり、独立確認前である。',limitationOrigin:'pipeline'}]);
}
test('the complete summary audit accepts an accurately translated English month instead of treating it as a new quantity',()=>{
 const result=audit('画像は2009年11月1日に撮影されたと出典は述べている。');assert.deepEqual(result.fatalIssues,[]);assert.equal(result.summaries[0].facts.length,1);
});
test('a comparison date is checked against each source separately instead of borrowing it from the other side',()=>{
 const items=['a','b'].map(id=>({id,sourceId:id,versionId:id,title:'Image observation',url:`https://${id}.example.org/image`,canonicalUrl:`https://${id}.example.org/image`,content:source,contentHash:id,fetchedAt:'2026-11-06T00:00:00Z'}));
 const claims=items.map(item=>({id:item.id,itemId:item.id,versionId:item.versionId,text:item.content,classification:'source_claim' as const,confidence:.5,reason:'出典',createdAt:item.fetchedAt}));
 const context:AnalysisContext={topic:'撮影日時',items,claims,relations:[]},q={observations:[]} as unknown as QualityAnalysis;
 const proposed={sourceComparisons:[{leftItemId:'a',rightItemId:'b',claimIds:['a','b'],agreement:'両資料は2009年11月1日に画像が撮影されたと述べている。',difference:'取得した記述には相違を特定できない。'}]};
 assert.equal(evaluateEvidence(context,q,[],[],proposed).comparisons.length,1);
 const other={...context,claims:[claims[0],{...claims[1],text:'The image was captured in November 2009.'}]};
 const rejected=evaluateEvidence(other,q,[],[],proposed);assert.equal(rejected.comparisons.length,0);assert(rejected.summaryIssues.includes('COMPARISON_UNGROUNDED'));
});
test('calendar translation preserves month and precision while ordinary quantities cannot borrow the month number',()=>{
 for(const text of ['画像は2009年11月1日に撮影された。','画像は2009年11月に撮影された。','画像は１１月１日に撮影された。'])assert.equal(sourceNumbersSupported(text,source),true,text);
 for(const text of ['画像は2009年1月1日に撮影された。','画像は2009年1月に撮影された。','画像は2010年11月1日に撮影された。','参加者は11人である。','期間は11か月である。','直径は11である。'])assert.equal(sourceNumbersSupported(text,source),false,text);
 assert.equal(sourceNumbersSupported('2009年11月1日の画像に11人が写っている。',source),false);
 assert.equal(sourceNumbersSupported('2009年11月1日の画像に11人が写っている。',source+' It shows 11 people.'),true);
 for(const quote of ['recorded in November 2009.','recorded in November of 2009.','2009年11月に撮影。']){
  assert.equal(sourceNumbersSupported('画像は2009年11月に撮影された。',quote),true,quote);
  assert.equal(sourceNumbersSupported('画像は2009年11月1日に撮影された。',quote),false,quote);
 }
 assert.equal(sourceNumbersSupported('2009年11月1日に撮影された。','recorded on November 1.'),false);
 assert.equal(sourceNumbersSupported('11月1日に撮影された。','recorded on November 1.'),true);
 assert.equal(sourceDatePrecisionSupported('May improve results.','改善する可能性がある。'),true);
 for(const quote of ['2025-02-30','2025年13月1日','February 30, 2025'])assert.equal(sourceDatePrecisionSupported(quote,'2025年2月30日'),false,quote);
 assert.equal(sourceNumbersSupported('2024年2月29日に開催。','February 29, 2024'),true);
 assert.equal(sourceNumbersSupported('2025年2月29日に開催。','February 29, 2025'),false);
});
