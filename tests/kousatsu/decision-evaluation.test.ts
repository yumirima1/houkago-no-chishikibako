import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateDecision,decisionEvaluationMatches} from '../../src/lib/kousatsu/decision-evaluation';
import {buildQualityAnalysis} from '../../src/lib/kousatsu/quality-analysis';
import {formReflection} from '../../src/lib/kousatsu/reflection';
import {auditSourceSummaries,quantityUnitsSupported} from '../../src/lib/kousatsu/evidence-review';

const value={利用場面:'学習活動の設計',達成したい結果:'学習した内容の理解の持続',候補:[
  {案:'体験を通じた学習',期待寄与:2,根拠ID:['c1'],出典の主張:'図書館は体験学習を予定している。',期待の理由:'体験が理解の持続に役立つと仮定する。',不確実性:'理解の持続への実測した効果は未確認である。'},
  {案:'資料を用いた学習',期待寄与:3,根拠ID:['c2'],出典の主張:'図書館は資料の展示を予定している。',期待の理由:'振り返りが理解の持続に役立つと仮定する。',不確実性:'両案の効果の差は実測していない。'}]};

test('ranking, reason and stored evidence come from the same evaluation even when the second candidate wins',()=>{
 const result=evaluateDecision(value,['c1','c2']);
 assert.equal(result.decision.selectedId,'B');assert(result.reflection.position.includes('「体験を通じた学習」より「資料を用いた学習」'));
 assert(result.reflection.reasoning.includes(value.候補[1].期待の理由));assert(!result.reflection.reasoning.includes(value.候補[0].期待の理由));assert.deepEqual(result.premiseClaimIds,['c2']);
 assert.equal(result.decision.criterion.weight,1);assert.equal(result.decision.criterion.scale,'provisional-ordinal-0-4');
 assert(decisionEvaluationMatches(result.decision,result.reflection));
 const reversed=structuredClone(value);reversed.候補.reverse();const again=evaluateDecision(reversed,['c1','c2']);
 assert.equal(again.reflection.reasoning,result.reflection.reasoning);assert.equal(again.reflection.position,result.reflection.position);
 assert(!decisionEvaluationMatches({...result.decision,selectedId:'A'},result.reflection));
 assert(!decisionEvaluationMatches(result.decision,{...result.reflection,reasoning:'別の案を支持する理由である。'}));
});
test('tied scores do not invent a winner or treat a subjective expectation as measured equivalence',()=>{
 const tied=structuredClone(value);tied.候補[1].期待寄与=2;
 const result=evaluateDecision(tied,['c1','c2']);assert.equal(result.decision.selectedId,null);
 assert(result.reflection.position.includes('同じ優先度'));assert(result.reflection.assumption.includes('実証した結果ではない'));
 for(const candidate of tied.候補)assert(result.reflection.reasoning.includes(candidate.期待の理由));
 assert.deepEqual(result.premiseClaimIds,['c1','c2']);
 const context={topic:'学習',groundedRequest:true,relations:[],items:[{id:'d',sourceId:'s',versionId:'v',title:'学習',url:'https://example.org',canonicalUrl:'https://example.org',contentHash:'h',fetchedAt:'2026-11-05T00:00:00Z'}],claims:value.候補.map((c,i)=>({id:'c'+(i+1),itemId:'d',versionId:'v',text:c.出典の主張,classification:'source_claim' as const,confidence:.5,reason:'出典',createdAt:'2026-11-05T00:00:00Z'}))};
 const observations=context.claims.map(c=>({claimId:c.id,itemId:'d',versionId:'v',quote:c.text,url:'https://example.org',kind:'article-body' as const,confidence:'source-only' as const}));
 const formed=formReflection(context,observations,{reflection:{...result.reflection,premiseClaimIds:result.premiseClaimIds,assumptions:[result.reflection.assumption],confidence:.4}});
 assert.deepEqual(formed.issues,[]);assert.equal(formed.reflection.origin,'model');assert(decisionEvaluationMatches(result.decision,result.reflection));
});
test('malformed evaluations, unknown evidence, out-of-range scores and a separately supplied winner are rejected',()=>{
 for(const change of [()=>({...value,優先案:'資料を用いた学習'}),()=>({...value,候補:[value.候補[0]]}),()=>({...value,候補:[{...value.候補[0],期待寄与:5},value.候補[1]]}),()=>({...value,候補:[{...value.候補[0],根拠ID:['invented']},value.候補[1]]})])assert.throws(()=>evaluateDecision(change(),['c1','c2']));
});
test('summary checks distinguish correlation, tentative claims and supported causal reports',()=>{
 assert(!quantityUnitsSupported('定員1000人、費用100円である。','定員100人、費用1000円です。'));
 assert(quantityUnitsSupported('定員100人、費用1000円である。','Capacity: 100 people. Fee: 1000 yen.'));
 assert(!quantityUnitsSupported('エネルギーは15fsである。','The energy is 15 keV.'));
 assert(quantityUnitsSupported('2026年10月28日の発表である。','Published October 28, 2026.'));
 assert(quantityUnitsSupported('避難した約11,000人が教会の敷地に滞在している。','Amongst those who fled, nearly 11,000 sought sanctuary in the compound.'));
 const check=(source:string,text:string)=>auditSourceSummaries({topic:'研究',relations:[],items:[{id:'d',sourceId:'s',title:'研究の結果',url:'https://example.org',canonicalUrl:'https://example.org',content:source,contentHash:'h',fetchedAt:'2026-11-05T00:00:00Z'}],claims:[{id:'c',itemId:'d',text:source,classification:'source_claim',confidence:.5,reason:'出典',createdAt:'2026-11-05T00:00:00Z'}]},[{itemId:'d',facts:[{claimId:'c',text}],limitation:'取得本文の独立した検証は実施していない。'}]);
 assert(check('The study found a correlation between exercise and health.','研究は運動が健康を改善させたと報告している。').issues.includes('SUMMARY_CORRELATION_AS_CAUSATION:c'));
 assert.deepEqual(check('The study found a correlation between exercise and health.','研究は運動と健康の相関を報告している。').fatalIssues,[]);
 assert(check('The study suggests a possible benefit from exercise.','研究は運動による健康改善を実証したと報告している。').issues.includes('SUMMARY_UNCERTAINTY_LOST:c'));
 assert.deepEqual(check('The study suggests a possible benefit from exercise.','研究は運動による便益の可能性を示唆している。').fatalIssues,[]);
 assert.deepEqual(check('The study measured a causal effect and a correlation.','研究は因果関係を実証したと報告している。').fatalIssues,[]);
 const location='Nearly 11,000 have sought sanctuary within the compound of a church based in Los Angeles, which does humanitarian work in Kenya, said IOM.';
 assert(check(location,'IOMによると、ケニアを拠点とする教会に約11,000人が避難している。').issues.includes('SUMMARY_LOCATION_BINDING_LOST:c'));
 assert.deepEqual(check(location,'IOMによると、Los Angelesを拠点とする教会の敷地に約11,000人が避難している。').fatalIssues,[]);
});

test('a validated decision enters the existing hypothesis lifecycle without treating its score as evidence',()=>{
 const result=evaluateDecision(value,['c1','c2']);
 const item={id:'d',versionId:'v',sourceId:'s',title:'学習の研究',url:'https://example.org',canonicalUrl:'https://example.org',content:'図書館は体験学習と資料の展示を予定している。',contentHash:'h',fetchedAt:'2026-11-05T00:00:00Z'};
 const claims=value.候補.map((c,i)=>({id:'c'+(i+1),itemId:'d',versionId:'v',text:c.出典の主張,classification:'source_claim' as const,confidence:.5,reason:'出典',createdAt:item.fetchedAt}));
 const context={topic:'学習',groundedRequest:true,items:[item],claims,relations:[],coverage:[{itemId:'d',versionId:'v',url:item.url,fetchedAt:item.fetchedAt,kind:'article-body' as const,status:'available' as const}]};
 const proposal={decisionEvaluation:result.decision,reflection:{...result.reflection,premiseClaimIds:result.premiseClaimIds,assumptions:[result.reflection.assumption],confidence:.4},observations:[],conclusions:[],hypotheses:[]};
 const quality=buildQualityAnalysis(context,'学習の選択',['d'],proposal);
 assert.deepEqual(quality.modelIssues,[]);assert.equal(quality.hypotheses.length,1);assert.equal(quality.hypotheses[0].status,'unverified');
 assert(quality.hypotheses[0].prediction.includes('資料を用いた学習'));assert(quality.hypotheses[0].falsification.includes('上回らない'));
 const memory={id:'old',jobId:'old-job',kind:'hypothesis' as const,topic:'学習',text:quality.hypotheses[0].text,reason:'未確認',createdAt:item.fetchedAt,verificationStatus:'passed' as const,factCheckStatus:'unverified' as const,references:[{itemId:'d',versionId:'v',claimIds:['c2']}],quality};
 const reviewed=buildQualityAnalysis({...context,memories:[memory]},'学習の選択',['d'],proposal);
 assert.equal(reviewed.hypothesisReviews![0].status,'inconclusive');assert.deepEqual(reviewed.hypothesisReviews![0].claimIds,[]);
 const bad=structuredClone(proposal);bad.decisionEvaluation.candidates[1].sourceStatement='図書館は999人の参加者を集めたと報告している。';
 // A matching regenerated reflection still cannot bypass the source-fidelity audit.
 const rendered=evaluateDecision({利用場面:value.利用場面,達成したい結果:value.達成したい結果,候補:value.候補.map((c,i)=>i===1?{...c,出典の主張:bad.decisionEvaluation.candidates[1].sourceStatement}:c)},['c1','c2']);
 const rejected=buildQualityAnalysis(context,'学習の選択',['d'],{...proposal,decisionEvaluation:rendered.decision,reflection:{...proposal.reflection,...rendered.reflection}});
 assert(rejected.modelIssues.some(i=>i.startsWith('DECISION_UNSUPPORTED_SOURCE_STATEMENT:')));assert.equal(rejected.hypotheses.length,0);
});
