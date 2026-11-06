import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceDatePrecisionSupported} from '../../src/lib/kousatsu/source-date';
import {summaryMeaningIssues,auditSourceSummaries} from '../../src/lib/kousatsu/evidence-review';
import type {AnalysisContext} from '../../src/lib/kousatsu/ai';
import {publicSourceWarnings,appendPublicEvidence} from '../../src/lib/kousatsu/public-evidence';
import type {QualityAnalysis} from '../../src/lib/kousatsu/quality-types';

test('a month-only observation cannot acquire a day from the unrelated word One',()=>{
 const source='One of the images was recorded in January of 2009.';
 assert.equal(sourceDatePrecisionSupported(source,'画像は2009年1月1日に撮影された。'),false);
 assert.equal(sourceDatePrecisionSupported(source,'画像は2009年1月に撮影された。'),true);
 assert(summaryMeaningIssues(source,'画像は2009年1月1日に撮影された。').includes('SUMMARY_DATE_PRECISION_INVENTED'));
});
test('an invented date sentence is excluded and diagnosed while a separate faithful summary survives',()=>{
 const quote='One image was recorded in January of 2009.',item={id:'d',versionId:'v',sourceId:'s',title:'写真',url:'https://example.org/p',canonicalUrl:'https://example.org/p',content:quote,contentHash:'h',fetchedAt:'2026-11-06T00:00:00Z'};
 const context:AnalysisContext={topic:'写真',items:[item],relations:[],claims:[{id:'c',itemId:'d',versionId:'v',text:quote,classification:'source_claim',confidence:.5,reason:'出典',createdAt:item.fetchedAt}]};
 const raw=[{itemId:'d',facts:[{claimId:'c',text:'画像は2009年1月1日に撮影された。'},{claimId:'c',text:'画像は2009年1月に撮影された。'}],limitation:'今回読んだ出典の記述であり、独立確認前である。'}];
 const audit=auditSourceSummaries(context,raw);assert.deepEqual(audit.fatalIssues,[]);assert(audit.warnings.includes('SUMMARY_DATE_PRECISION_INVENTED:c'));
 assert.deepEqual(audit.summaries[0].facts,[raw[0].facts[1]]);assert(raw[0].facts[0].text.includes('1月1日'));
});

test('a saved date defect is publicly annotated without correcting or discarding the original prose',()=>{
 const q={observations:[{claimId:'c',quote:'One image was recorded in January of 2009.'}],evidenceReview:{summaries:[{facts:[{claimId:'c',text:'2009年1月1日の画像である。'}]}]}} as QualityAnalysis;
 const warnings=publicSourceWarnings(q);assert(warnings.some(w=>w.includes('日付')));
 const original='元の保存本文。',projection=appendPublicEvidence(original,{entries:[],unavailable:[]},warnings);
 assert(projection.startsWith(original));assert(projection.includes('要確認・保存後の出典再検査で問題を検出'));
});
test('complete English, ISO and Japanese dates keep the actual day and year',()=>{
 for(const source of ['recorded on Jan. 1, 2009.','recorded on 1 January 2009.','recorded on 2009-01-01.','2009年1月1日に撮影。']){
  assert.equal(sourceDatePrecisionSupported(source,'画像は2009年1月1日に撮影された。'),true,source);
  assert.equal(sourceDatePrecisionSupported(source,'画像は2009年1月2日に撮影された。'),false,source);
 }
 assert.equal(sourceDatePrecisionSupported('2026年11月15日に開催します。','11月15日に開催予定である。'),true);
});
