import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {OllamaProvider,type AnalysisContext} from '../../src/lib/kousatsu/ai';
import {auditSourceSummaries} from '../../src/lib/kousatsu/evidence-review';

async function runSummary(t:test.TestContext,truncated:boolean,invalid=false){
  const source='2026年11月15日、図書館は体験型ワークショップのイベントを開催します。',details='定員：100名。材料費：1,000円／名。支払い方法は当日現金払いです。';
  const item={id:'doc',versionId:'v',sourceId:'library',title:'図書館のワークショップ',url:'https://example.invalid/event',canonicalUrl:'https://example.invalid/event',content:source+details+(truncated?'追加の本文。'.repeat(1600):''),contentHash:'fixture',fetchedAt:'2026-10-30T00:00:00Z'};
  const context:AnalysisContext={topic:item.title,items:[item],relations:[],claims:[{id:'claim',itemId:item.id,versionId:item.versionId,text:source,classification:'source_claim',confidence:.5,reason:'出典の記述',createdAt:item.fetchedAt}]};
  let schema:Record<string,unknown>|undefined;
  const wrong='今回の資料だけでは、ワークショップの定員や参加費の支払い方法は確認できない。';
  const server=createServer((req,res)=>{let body='';req.setEncoding('utf8');req.on('data',chunk=>body+=chunk);req.on('end',()=>{
    schema=JSON.parse(body).format;
    // Even an unsolicited legacy field must not become a guessed absence claim.
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({done_reason:'stop',response:JSON.stringify({summaries:{D1:{facts:[{claimId:'E1',text:invalid?'図書館は9999人の参加者を招く体験型ワークショップを開催する予定である。':'図書館は2026年11月15日に体験型ワークショップを開催する予定だと告知している。'}],limitation:wrong}}})}));
  });});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
  const address=server.address();assert(address&&typeof address!=='string');
  const provider=new OllamaProvider({model:'fixture',endpoint:`http://127.0.0.1:${address.port}`,timeoutMs:2000});
  const result=await provider.summarizeGrounded(context),audit=auditSourceSummaries(context,result);
  assert(schema);assert(!JSON.stringify(schema).includes('limitation'));assert(provider.rawCalls[0].response?.includes(wrong));
  return {audit,item};
}

for(const truncated of [false,true])test(`reading scope is measured rather than guessed, with truncated=${truncated}`,async t=>{
  const {audit,item}=await runSummary(t,truncated);
  assert.deepEqual(audit.fatalIssues,[]);assert.equal(audit.summaries.length,1);
  const summary=audit.summaries[0];assert.equal(summary.limitationOrigin,'pipeline');assert.equal(summary.bodyTruncated,truncated);
  assert.equal(summary.inputBodyCharacters,Math.min(6000,item.content.length));assert(summary.limitation.includes('独立した検証は実施していない'));
  assert.equal(summary.limitation.includes('省略'),truncated);assert(!summary.limitation.includes('定員'));assert(!summary.limitation.includes('支払い方法'));
});

test('a correct scope statement cannot turn an unsupported factual summary into an accepted document',async t=>{
  const {audit}=await runSummary(t,false,true);
  assert.equal(audit.summaries.length,0);assert(audit.fatalIssues.some(issue=>issue.startsWith('SUMMARY_NO_ACCEPTED_FACT:')));
});
