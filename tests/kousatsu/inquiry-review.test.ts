import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewInquiries,inquiryKey} from '../../src/lib/kousatsu/inquiry-review';
import type {AnalysisContext} from '../../src/lib/kousatsu/ai';
import type {QualityAnalysis} from '../../src/lib/kousatsu/quality-types';

const quote='研究チームは評価結果が入力条件によって変動すると報告している。';
const context:AnalysisContext={topic:'評価',relations:[],inquiries:[{id:'q',question:'資料には「評価結果が入力条件によって変動する」と記載されているか。',originJob:'old',references:['d:v0']}],items:[{id:'d',versionId:'v',sourceId:'s',url:'https://example.org/a',canonicalUrl:'https://example.org/a',title:'入力条件と評価',content:quote,contentHash:'h',fetchedAt:'2026-11-05T00:00:00Z'}],claims:[{id:'c',itemId:'d',versionId:'v',text:quote,classification:'source_claim',confidence:.5,createdAt:'2026-11-05T00:00:00Z',reason:'本文'}],coverage:[{itemId:'d',versionId:'v',kind:'article-body',status:'available',url:'https://example.org/a',fetchedAt:'2026-11-05T00:00:00Z'}]};
const quality={observations:[{claimId:'c',itemId:'d',versionId:'v',quote,url:'https://example.org/a',kind:'article-body'}],modelIssues:[],generationStatus:'succeeded'} as unknown as QualityAnalysis;
const proposal={inquiryId:'q',criterion:'資料に入力条件による変動の記載があること。',answer:'研究チームは入力条件によって評価が変動すると述べている。',status:'resolved',reason:'取得済み本文に対応する記述があるため。',claimIds:['c'],remainingQuestions:[],nextQuestions:['どの入力条件で変動が小さくなるか。'],memoryIds:[]};
test('a documentary answer records the precise pinned quote and limits closure to the source statement',()=>{
 const r=reviewInquiries(context,quality,[proposal])[0];assert.equal(r.status,'resolved');assert.equal(r.evidence[0].versionId,'v');assert.equal(r.evidence[0].quote,quote);assert.equal(r.independentVerification,'not-established');assert.match(r.limitations[0],/真偽/);
});
test('an answer about causal effects, independent confirmation or a choice remains partially resolved',()=>{
 for(const question of ['この入力条件の効果は独立した実験で裏付けられるか。','評価の変動の原因は何か。','どの調査を優先するべきか。']){const r=reviewInquiries({...context,inquiries:[{...context.inquiries![0],question}]},quality,[proposal])[0];assert.equal(r.status,'partially_resolved');assert.deepEqual(r.remainingQuestions,[question]);}
});
test('unknown citations, duplicate question answers and failed body extraction never close an inquiry',()=>{
 for(const raw of [[{...proposal,claimIds:['unknown']}],[proposal,proposal],undefined])assert.equal(reviewInquiries(context,quality,raw)[0].status,'unresolved');
 assert.equal(reviewInquiries({...context,coverage:[{...context.coverage![0],status:'failed'}]},quality,[proposal])[0].status,'unresolved');
});
test('invented answer quantities, unknown memories and a rejected generation fail closed',()=>{
 assert.equal(reviewInquiries(context,quality,[{...proposal,answer:'研究チームは評価が90パーセント改善したと報告している。'}])[0].status,'unresolved');
 assert.equal(reviewInquiries(context,quality,[{...proposal,memoryIds:['invented']}])[0].status,'unresolved');
 assert.equal(reviewInquiries(context,{...quality,modelIssues:['REJECTED']},[proposal])[0].status,'unresolved');
});
test('conflicting evidence preserves remaining questions instead of a resolved status',()=>{
 const q={...quality,sourceVerification:{claims:[{claimId:'c',result:'conflict-candidate'}]}} as QualityAnalysis;
 const r=reviewInquiries(context,q,[proposal])[0];assert.equal(r.status,'partially_resolved');assert(r.limitations.some(s=>s.includes('矛盾')));
});
test('a plausible answer to another question cannot close the requested documentary proposition',()=>{
 const c={...context,inquiries:[{...context.inquiries![0],question:'資料には「評価結果が入力条件にかかわらず一定である」と記載されているか。'}]};
 assert.equal(reviewInquiries(c,quality,[proposal])[0].status,'partially_resolved');
});
test('question fingerprints suppress formatting duplicates while retaining different questions',()=>{
 assert.equal(inquiryKey('「入力条件」の効果は？'),inquiryKey('入力条件 の効果は?'));assert.notEqual(inquiryKey('入力条件の効果は？'),inquiryKey('入力条件の費用は？'));
});
