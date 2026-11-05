import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {renderComparativeDecision} from '../../src/lib/kousatsu/comparative-decision';
import {OllamaProvider,type AnalysisContext} from '../../src/lib/kousatsu/ai';
import {evaluateDecision} from '../../src/lib/kousatsu/decision-evaluation';
import {formReflection} from '../../src/lib/kousatsu/reflection';

const plan={利用場面:'小型研究用光源の開発',優先案:'複数材料での発生条件の探索',比較案:'既存試料での出力条件の最適化',達成したい結果:'テラヘルツ波出力の安定性の向上'};
const evaluatedPlan={利用場面:plan.利用場面,達成したい結果:plan.達成したい結果,候補:[{案:plan.優先案,期待寄与:3,根拠ID:['E1'],出典の主張:'研究は既存試料での観測を報告している。',期待の理由:'別の材料でも出力が安定すると仮定している。',不確実性:'別の材料における効果は未確認である。'},{案:plan.比較案,期待寄与:2,根拠ID:['E1'],出典の主張:'研究は既存試料での観測を報告している。',期待の理由:'既存試料の調整が出力に役立つと仮定している。',不確実性:'両案の効果の差は未確認である。'}]};
function strictView(selected:typeof plan){
 const quote='研究チームは固体からのテラヘルツ波放射を観測し、その発生過程の一部を明らかにしたと報告している。',url='https://example.invalid/research';
 const item={id:'doc',versionId:'v',sourceId:'science',url,canonicalUrl:url,title:'固体の光応答',content:quote,contentHash:'fixture',fetchedAt:'2026-10-30T00:00:00Z'};
 const context={topic:'光応答の研究方針',groundedRequest:true,items:[item],relations:[],claims:[{id:'claim',itemId:'doc',versionId:'v',text:quote,classification:'source_claim' as const,confidence:.5,reason:'出典',createdAt:item.fetchedAt}]};
 const observations=[{claimId:'claim',itemId:'doc',versionId:'v',quote,url,kind:'article-body' as const,confidence:'source-only' as const}];
 const comparison=renderComparativeDecision(selected),reflection={...comparison,reasoning:'資料は現象の観測を報告している。条件の適用範囲が安定性に影響すると仮定すると、発生条件を調べる便益を期待できる。',premiseClaimIds:['claim'],assumptions:[comparison.assumption],confidence:.4};
 return {context,observations,reflection};
}
test('a place-like scenario remains grammatical and a shared comparison passes the full strict gate',()=>{
 const selected={...plan,利用場面:'材料の光応答を調べる実験室'},fixture=strictView(selected);
 assert(fixture.reflection.position.includes(`「${selected.利用場面}」を想定するなら`));
 const result=formReflection(fixture.context,fixture.observations,{reflection:fixture.reflection});
 assert.deepEqual(result.issues,[]);assert.equal(result.reflection.origin,'model');
 const repeated=formReflection(fixture.context,fixture.observations,{reflection:{...fixture.reflection,alternative:fixture.reflection.position}});
 assert(repeated.issues.includes('REFLECTION_REPEATED_ALTERNATIVE'));
});
test('a proposed numerical outcome is explicitly hypothetical in every rendered field, never a source measurement',()=>{
 const fixture=strictView({...plan,達成したい結果:'1週間後の出力安定性の維持'});
 const result=formReflection(fixture.context,fixture.observations,{reflection:fixture.reflection});
 assert.deepEqual(result.issues,[]);assert(result.reflection.assumptions.some(text=>text.includes('数値条件を置いた思考実験')));
});
test('a free-form model response cannot bypass the controlled decision contract',async t=>{
 const server=createServer((req,res)=>{req.resume();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({done_reason:'stop',response:JSON.stringify({reflection:strictView(plan).reflection,observations:[],conclusions:[],hypotheses:[]})}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const address=server.address();assert(address&&typeof address!=='string');
 const provider=new OllamaProvider({model:'fixture',endpoint:`http://127.0.0.1:${address.port}`,timeoutMs:2000});
 await assert.rejects(provider.proposeGrounded(strictView(plan).context),/DECISION_COMPARISON_REQUIRED/);
});
test('both counterprediction and weakening observation retain the chosen scenario/outcome instead of changing the goal',()=>{
 const result=renderComparativeDecision(plan);
 for(const text of [result.position,result.alternative,result.revisionCondition]){assert(text.includes(plan.利用場面));assert(text.includes(plan.達成したい結果));assert(text.includes(plan.優先案));assert(text.includes(plan.比較案));}
 assert(result.revisionCondition.includes(`「${plan.優先案}」が「${plan.比較案}」を上回らない`));
 assert(result.assumption.includes('仮定'));assert(result.assumption.includes('実測した効果ではない'));
});
test('a material-changing option cannot acquire an invented same-material fixed control',()=>{
 assert.throws(()=>renderComparativeDecision({...plan,比較条件:'同じZnTe試料'}),/INVALID/);
 assert.doesNotThrow(()=>renderComparativeDecision(plan));
});
test('identical options, dismissive comparators and procedural or identical goals are rejected',()=>{
 assert.throws(()=>renderComparativeDecision({...plan,比較案:plan.優先案}),/IDENTICAL/);
 assert.throws(()=>renderComparativeDecision({...plan,比較案:'単なる従来方式の反復'}),/STRAWMAN/);
 assert.throws(()=>renderComparativeDecision({...plan,達成したい結果:'提示文の設計を評価する'}),/NOT_OUTCOME/);
 assert.throws(()=>renderComparativeDecision({...plan,達成したい結果:'テラヘルツ波放射の発生メカニズムの特定'}),/NOT_OUTCOME/);
 assert.throws(()=>renderComparativeDecision({...plan,達成したい結果:plan.優先案}),/NOT_OUTCOME/);
 assert.deepEqual(renderComparativeDecision({...plan,優先案:plan.優先案+'。'}),renderComparativeDecision(plan));
});
test('the actual HTTP provider maps the new internal plan to the existing stored reflection contract',async t=>{
 let prompt='',format:Record<string,unknown>|undefined;
 const server=createServer((req,res)=>{let body='';req.setEncoding('utf8');req.on('data',chunk=>body+=chunk);req.on('end',()=>{
  const request=JSON.parse(body);prompt=request.prompt;format=request.format;
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({done_reason:'stop',response:JSON.stringify({考察:{判断の比較:evaluatedPlan,理由:'資料は既存試料での観測を報告している。別の材料でも安定した出力を得られると仮定すると、利用範囲を広げられると考える。',前提ID:['E1'],仮定:[],確信度:.4,過去の見解ID:[]}})}));
 });});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
 const address=server.address();assert(address&&typeof address!=='string');
 const context={topic:'利用範囲',items:[{id:'document',title:'固体からの波放射',url:'https://example.org/research',canonicalUrl:'https://example.org/research'}],claims:[{id:'claim',itemId:'document',text:'研究は既存試料での観測を報告している。'}],relations:[],memories:[{id:'old',kind:'interpretation',text:'過去の未検証の誤った結論。',quality:{reflection:{position:'過去の未検証の立場。'}}}]} as unknown as AnalysisContext;
 const before=JSON.stringify(context),provider=new OllamaProvider({model:'fixture',endpoint:`http://127.0.0.1:${address.port}`,timeoutMs:2000,thinking:true});
 const result=await provider.proposeGrounded(context);
 assert.deepEqual(result.reflection?.premiseClaimIds,['claim']);assert.equal(result.reflection?.reasoning,evaluateDecision(evaluatedPlan,['E1']).reflection.reasoning);assert.deepEqual(result.reflection?.memoryIds,[]);assert.equal(result.reflection?.position,renderComparativeDecision(plan).position);
 assert(!prompt.includes('過去の未検証の立場'));assert(!prompt.includes('過去の未検証の誤った結論'));assert(format);
 assert.equal(JSON.stringify(context),before);assert.equal(provider.calls[0].promptVersion,34);assert.equal(provider.rawCalls[0].references?.E1,'claim');
 assert.equal(provider.calls[0].options.num_predict,4000);assert.equal(provider.calls[0].options.num_ctx,10240);
});

test('qualified past views and a bound inquiry reach the model as untrusted history and restore exact IDs',async t=>{
 let prompt='';
 const server=createServer((req,res)=>{let body='';req.setEncoding('utf8');req.on('data',c=>body+=c);req.on('end',()=>{
  const request=JSON.parse(body);prompt=request.prompt;
  const properties=request.format.properties;assert(properties.課題判定);assert.deepEqual(properties.考察.properties.過去の見解ID.items.enum,['M1']);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({done_reason:'stop',response:JSON.stringify({考察:{判断の比較:evaluatedPlan,仮定:[],確信度:.4,過去の見解ID:['M1']},課題判定:[{inquiryId:'Q1',criterion:'資料の観測条件を確認すること。',answer:'研究は既存試料での観測を報告している。',status:'partially_resolved',reason:'新しい材料の便益をまだ測定していないため。',claimIds:['E1'],remainingQuestions:['新材料の出力の安定性はどう変わるか。'],nextQuestions:[],memoryIds:['M1']}]})}));
 });});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});const address=server.address();assert(address&&typeof address!=='string');
 const context={topic:'利用範囲',items:[{id:'document',title:'固体からの波放射',url:'https://example.org/research',canonicalUrl:'https://example.org/research'}],claims:[{id:'claim',itemId:'document',text:'研究は既存試料での観測を報告している。'}],relations:[],inquiries:[{id:'question-real',question:'新しい材料の出力は安定するか。',originJob:'prior',references:['document:v']}],memories:[{id:'memory-real',jobId:'prior',kind:'interpretation',verificationStatus:'passed',factCheckStatus:'unverified',references:[{itemId:'document',versionId:'v',claimIds:['old-claim']}],text:'前回の暫定見解。',quality:{reflection:{position:'前回は材料の比較を優先した。',reasoning:'用途別の測定が不足していた。',revisionCondition:'測定条件が揃えば見直す。'},hypotheses:[],unresolved:['新材料の実測は未確認。']}}]} as unknown as AnalysisContext;
 const provider=new OllamaProvider({model:'fixture',endpoint:`http://127.0.0.1:${address.port}`,timeoutMs:2000}),result=await provider.proposeGrounded(context);
 assert.match(prompt,/前回は材料の比較を優先した/);assert.match(prompt,/独立証拠ではない/);assert.match(prompt,/新材料の実測は未確認/);
 assert.deepEqual(result.reflection?.memoryIds,['memory-real']);assert.equal((result.inquiryReviews as Array<{inquiryId:string}>)[0].inquiryId,'question-real');
});
