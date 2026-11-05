import assert from 'node:assert/strict';
import test from 'node:test';
import {buildQualityAnalysis,selectGroundedClaims} from '../../src/lib/kousatsu/quality-analysis';
import {renderComparativeDecision} from '../../src/lib/kousatsu/comparative-decision';

test('three sources retain every offered evidence slot, including the tenth to twelfth; invented premises remain rejected',()=>{
 const items=[0,1,2].map(i=>({id:`d${i}`,versionId:`v${i}`,sourceId:`s${i}`,title:'材料の応答観測',url:`https://example.org/${i}`,canonicalUrl:`https://example.org/${i}`,contentHash:'h',fetchedAt:'2026-11-05T00:00:00Z'}));
 const claims=items.flatMap(item=>[0,1,2,3,4].map(i=>({id:`${item.id}-c${i}`,itemId:item.id,versionId:item.versionId,text:`研究チームは条件${i}における材料の応答を観測したと報告している。`,classification:'source_claim' as const,confidence:.5,reason:'出典',createdAt:item.fetchedAt})));
 const context={topic:'材料の応答',groundedRequest:true,items,claims,relations:[],coverage:items.map(item=>({itemId:item.id,versionId:item.versionId,url:item.url,fetchedAt:item.fetchedAt,kind:'article-body' as const,status:'available' as const}))};
 const ids=items.map(i=>i.id),offered=selectGroundedClaims(context,ids);assert.equal(offered.length,12);for(const item of items)assert.equal(offered.filter(c=>c.itemId===item.id).length,4);
 const decision=renderComparativeDecision({利用場面:'材料の応答を利用する装置',優先案:'照射条件の系統的な調整',比較案:'別の材料の応答の測定',達成したい結果:'出力の安定性の向上'});
 const proposal={observations:[],conclusions:[],hypotheses:[],reflection:{...decision,reasoning:'資料は条件を変えた応答観測を報告している。照射条件を調べると安定した出力を得られると仮定する。',premiseClaimIds:offered.slice(9).map(c=>c.id),assumptions:[decision.assumption],confidence:.4}};
 const quality=buildQualityAnalysis({...context,claims:offered},context.topic,ids,proposal);assert.equal(quality.reflection?.origin,'model');assert.deepEqual(quality.modelIssues,[]);assert.deepEqual(quality.observations.map(o=>o.claimId),offered.map(c=>c.id));
 const rejected=buildQualityAnalysis(context,context.topic,ids,{...proposal,reflection:{...proposal.reflection,premiseClaimIds:['not-an-offered-claim']}});assert(rejected.modelIssues.includes('REFLECTION_UNKNOWN_PREMISE'));
});
