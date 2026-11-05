import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {createServer} from 'node:http';
import {OllamaProvider,type AnalysisContext} from '../../src/lib/kousatsu/ai';
import {auditSourceSummaries,evaluateEvidence} from '../../src/lib/kousatsu/evidence-review';
import {buildQualityAnalysis} from '../../src/lib/kousatsu/quality-analysis';
import {assessInterests,extractInterestCandidates,interestDirection} from '../../src/lib/kousatsu/interest-evaluation';

const quote='研究チームはLLMの評価結果がプロンプトで変動することを報告している。';
const item={id:'document-a',versionId:'version-a',sourceId:'source',title:'LLMの評価',url:'https://example.org/a',canonicalUrl:'https://example.org/a',content:quote,contentHash:'h',fetchedAt:'2026-11-05T00:00:00Z'};
const context:AnalysisContext={topic:'評価の改善',items:[item],relations:[],claims:[{id:'claim-a',itemId:item.id,versionId:item.versionId,text:quote,classification:'source_claim',confidence:.5,reason:'出典',createdAt:item.fetchedAt}],coverage:[{itemId:item.id,versionId:item.versionId,url:item.url,fetchedAt:item.fetchedAt,kind:'article-body',status:'available'}]};
async function endpoint(t:TestContext,reply:(request:Record<string,unknown>,index:number)=>unknown,delay=0){
 let calls=0;
 const server=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const response=reply(JSON.parse(body),++calls);setTimeout(()=>{if(!res.destroyed){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({done_reason:'stop',response:JSON.stringify(response)}));}},delay);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const address=server.address();assert(address&&typeof address!=='string');return {url:`http://127.0.0.1:${address.port}`,calls:()=>calls};
}
const summary=(text:string)=>({summaries:{D1:{facts:[{claimId:'E1',text}]}}});
test('a rejected fragment is corrected once, retaining both responses and the validation diagnosis',async t=>{
 const server=await endpoint(t,(_,i)=>summary(i===1?'研究チームはLLMの評価結果を用いて':'研究チームはLLMの評価がプロンプトによって変動すると報告している。'));
 const provider=new OllamaProvider({model:'fixture',endpoint:server.url,timeoutMs:2000});
 const result=await provider.summarizeGrounded(context),audit=auditSourceSummaries(context,result);
 assert.deepEqual(audit.fatalIssues,[]);assert.equal(server.calls(),2);assert.equal(provider.rawCalls.length,2);
 assert(provider.rawCalls[0].metrics.validationIssues?.some(i=>i.startsWith('SUMMARY_FRAGMENT:')));
 assert(provider.rawCalls[0].response?.includes('を用いて'));assert(provider.rawCalls[1].response?.includes('報告している。'));
 assert.equal(audit.summaries[0].facts[0].claimId,'claim-a');
});
test('a persistently invalid summary remains rejected after its single repair',async t=>{
 const server=await endpoint(t,()=>summary('研究チームはLLMの評価結果を用いて'));
 const provider=new OllamaProvider({model:'fixture',endpoint:server.url,timeoutMs:2000});
 assert(auditSourceSummaries(context,await provider.summarizeGrounded(context)).fatalIssues.length>0);assert.equal(server.calls(),2);
});
test('summary repair shares the original deadline instead of receiving another full timeout',async t=>{
 const server=await endpoint(t,()=>summary('研究チームはLLMの評価結果を用いて'),70);
 const provider=new OllamaProvider({model:'fixture',endpoint:server.url,timeoutMs:120});
 await assert.rejects(provider.summarizeGrounded(context),/timeout|abort/i);assert.equal(server.calls(),2);
});
test('comparison repair restores an omitted citation without replacing the evaluated actions or their reason',async t=>{
 const peer={...item,id:'document-b',versionId:'version-b',url:'https://example.org/b',canonicalUrl:'https://example.org/b',content:quote+'研究チームはOpenReviewから評価用データを構築したと報告している。'};
 const c:AnalysisContext={...context,groundedRequest:true,items:[item,peer],claims:[...context.claims,{...context.claims[0],id:'claim-b',itemId:peer.id,versionId:peer.versionId},{...context.claims[0],id:'claim-c',itemId:peer.id,versionId:peer.versionId,text:'研究チームはOpenReviewから評価用データを構築したと報告している。'}],coverage:[...context.coverage!,{...context.coverage![0],itemId:peer.id,versionId:peer.versionId,url:peer.url}]};
 c.interestCandidates=extractInterestCandidates([item]);c.interestBasis=[];assert(c.interestCandidates.length>0);
 const plan={利用場面:'学術論文の評価',達成したい結果:'評価結果の一貫性の向上',候補:[{案:'入力条件の感度分析',期待寄与:3,根拠ID:['E1'],出典の主張:quote,期待の理由:'入力の変動要因を把握して判定を安定させると期待する。',不確実性:'実際の安定化の効果は未測定である。'},{案:'複数評価者の一致度の比較',期待寄与:2,根拠ID:['E2'],出典の主張:quote,期待の理由:'評価者間の差を把握して判定を安定させると期待する。',不確実性:'両案の便益の差は未測定である。'}]};
 const comparison=(repaired:boolean)=>({D2:{agreementMainClaimId:'E1',agreementOtherClaimId:'E2',agreement:'両資料はLLMの評価が入力に応じて変動すると報告している。',differenceMainClaimIds:['E1'],differenceOtherClaimIds:[repaired?'E3':'E2'],difference:'追加資料にはOpenReviewを用いた評価データの構築がある。'}});
 const server=await endpoint(t,(request,i)=>{if(i===1)return {考察:{判断の比較:plan,仮定:[],確信度:.4},資料比較:comparison(false),興味評価:c.interestCandidates!.map((candidate,i)=>({candidateId:`C${i+1}`,theme:candidate.term,impact:7,aversion:false,reason:'入力条件のばらつきが研究の継続性に影響するため。',confidence:.6,relatedInterestKeys:[],memoryIds:[]}))};
   assert.equal(request.think,false);assert.deepEqual(Object.keys((request.format as {properties:object}).properties),['資料比較']);return {資料比較:comparison(true)};});
 const provider=new OllamaProvider({model:'fixture',endpoint:server.url,timeoutMs:2000,thinking:true}),proposal=await provider.proposeGrounded(c);
 assert.equal(server.calls(),2);assert.equal(proposal.decisionEvaluation?.selectedId,'A');assert(proposal.reflection?.reasoning.includes(plan.候補[0].期待の理由));
 const quality=buildQualityAnalysis(c,c.topic,c.items.map(i=>i.id),proposal);assert.deepEqual(quality.modelIssues,[]);
 assert.deepEqual(evaluateEvidence(c,quality,[],[],proposal).summaryIssues,[]);assert(provider.rawCalls[0].metrics.validationIssues?.includes('COMPARISON_UNGROUNDED'));
 const interests=assessInterests(proposal,c,'fixture');assert.equal(interests.status,'succeeded');assert(interests.evaluations.every(e=>e.direction==='strengthen'&&e.impact===7));
 assert.equal(interestDirection(-3,true),'aversion');assert.equal(interestDirection(-3,false),'weaken');assert.equal(interestDirection(0,false),'neutral');
 assert.equal(interestDirection(3,true),undefined);assert.equal(interestDirection(99,false),undefined);
});
