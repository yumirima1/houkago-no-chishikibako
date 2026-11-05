import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {OllamaProvider} from '../../src/lib/kousatsu/ai';
import type {AnalysisContext,KousatsuAiProvider} from '../../src/lib/kousatsu/ai';
import {auditSourceSummaries,evaluateEvidence,publisherFamily,percentageUnitsSupported} from '../../src/lib/kousatsu/evidence-review';
import {extractArticle,classifyArticleFailure} from '../../src/lib/kousatsu/article-content';
import {KousatsuDatabase} from '../../src/lib/kousatsu/database';
import {ResearchRuntime} from '../../src/lib/kousatsu/runtime-service';
import {ResearchEngine,TopicHistory} from '../../src/lib/kousatsu/research-engine';
import {KousatsuPipeline} from '../../src/lib/kousatsu/pipeline';
import {buildQualityAnalysis} from '../../src/lib/kousatsu/quality-analysis';
import {compareRecords} from '../../src/lib/kousatsu/relevance';
import type {AnalysisResult,SourceInput,StoredItem} from '../../src/lib/kousatsu/types';
import {parseFeed,hostRatePolicy} from '../../src/lib/kousatsu/ingest';
import {extractSourceClaims} from '../../src/lib/kousatsu/knowledge';

test('model references round-trip to stored IDs and never substitute prose',async t=>{
  const server=createServer(async(req,res)=>{
    let input='';for await(const chunk of req)input+=chunk;
    const request=JSON.parse(input);
    assert(request.prompt.includes('"claimId":"E1"'));
    assert(!request.prompt.includes('stored-claim-reference'));
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({response:JSON.stringify({summaries:{D1:{facts:[{claimId:'E1',text:'資料は計算機の試行計画について説明している。'}],limitation:'今回の資料だけでは独立した再現性は確認できない。'}}})}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
  const address=server.address();assert(address&&typeof address==='object');
  const provider=new OllamaProvider({model:'fixture',endpoint:`http://127.0.0.1:${address.port}`,timeoutMs:3000});
  const raw=await provider.summarizeGrounded({...context,claims:[{...context.claims[0],id:'stored-claim-reference'}]}) as Array<{itemId:string;facts:Array<{claimId:string;text:string}>}>;
  assert.equal(raw[0].itemId,'a');assert.equal(raw[0].facts[0].claimId,'stored-claim-reference');
  assert.equal(raw[0].facts[0].text,'資料は計算機の試行計画について説明している。');
  assert.equal(provider.rawCalls[0].references?.E1,'stored-claim-reference');
});

test('official Japanese RSS 1.0 preserves dc:date and numeric entities',()=>{
  const parsed=parseFeed('<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><channel><title>JAXA</title></channel><item><title>宇宙 &#8217; 試験</title><link>https://example.org/test</link><dc:date>2026-10-28T09:00:00+09:00</dc:date></item></rdf:RDF>');
  assert.equal(parsed.entries.length,1);assert.equal(parsed.entries[0].publishedAt,'2026-10-28T00:00:00.000Z');assert.equal(parsed.entries[0].title,'宇宙 ’ 試験');
});

test('published host limits cover subdomains together',()=>{
  assert.equal(hostRatePolicy('blogs.loc.gov').key,hostRatePolicy('www.loc.gov').key);
  assert.equal(hostRatePolicy('www.loc.gov').intervalMs,6000);
  assert.equal(hostRatePolicy('arxiv.org').intervalMs,3000);
});

test('paper results outrank revision timestamps and source URL anchors retain their own caption',async t=>{
  const dir=await mkdtemp(path.resolve('tmp/evidence-extraction-')),db=new KousatsuDatabase(path.join(dir,'db.sqlite'));
  t.after(async()=>{db.close();await rm(dir,{recursive:true,force:true});});
  db.upsertSource({id:'source',name:'paper',feedUrl:'https://example.org/feed'});
  const result='Across six judges, we find that prompt design choices change accuracy by over 50 points on identical idea pairs.';
  const stored=db.getItem(db.upsertItem({...item,content:`We build an evaluation set automatically, mining reviews for original research ideas. ${result}\nThu, 1 Oct 2026 16:43:18 UTC (1,095 KB)\nWed, 14 Oct 2026 17:45:03 UTC (1,034 KB)`}).id)!;
  const claims=extractSourceClaims(db,[stored],[{...context.coverage![0],itemId:stored.id,versionId:stored.versionId!}]);
  assert(claims.some(c=>c.text===result));assert(claims.every(c=>!c.text.includes('KB)')));
  const html=`<html><head><title>図書館の資料紹介</title></head><body><article><p>${'図書館は古い作品の背景を残しながら、現代の読者が実物を体験できる取り組みを紹介した。'.repeat(6)}</p><p>組上燈籠絵の講演会とワークショップ<br><a href="https://example.org/news/2026/">https://example.org/news/2026/</a></p><p>別の資料の紹介<br><a href="https://example.org/archive/">https://example.org/archive/</a></p></article></body></html>`;
  const links=extractArticle(html,item.url).links;
  assert.match(links.find(l=>l.url.includes('/news/'))!.text,/講演会/);
  assert(!links.find(l=>l.url.includes('/archive/'))!.text.includes('講演会'));
});

test('written cardinal quantities are comparable without inventing a number',()=>{
  const c={...context,claims:[{...context.claims[0],text:'Across six judges, we find changes in measured accuracy.'}]};
  const result=auditSourceSummaries(c,[{itemId:'a',facts:[{claimId:'c',text:'6つの評価モデルで、測定した正解率の変化が見られたと述べる。'}],limitation:'今回の資料だけでは他のモデルでも再現するかは未確認である。'}]);
  assert.equal(result.summaries.length,1);assert.deepEqual(result.issues,[]);
});

test('a negated example does not reverse the main finding and percentage points stay distinct',()=>{
  const c={...context,claims:[{...context.claims[0],text:'Small prompt changes have large consequences; e.g., telling judges that one idea is novel and the other not changes accuracy by over 50 points.'}]};
  const summary={itemId:'a',facts:[{claimId:'c',text:'プロンプトの小さな変更が、判断に大きな影響を及ぼすと述べる。'}],limitation:'今回の資料だけでは他の課題でも同じ影響があるかは確認できない。'};
  assert.deepEqual(auditSourceSummaries(c,[summary]).issues,[]);
  assert.equal(percentageUnitsSupported('正解率が50％変化した。',c.claims[0].text),false);
  assert.equal(percentageUnitsSupported('正解率が50パーセントポイント変化した。',c.claims[0].text),true);
  assert.equal(percentageUnitsSupported('正解率が50％変化した。','Accuracy changed by 50 percent.'),true);
  assert(auditSourceSummaries(c,[{...summary,facts:[{claimId:'c',text:'プロンプトの小さな変更が正解率を50％変化させた。'}]}]).issues.length);
});

const item:StoredItem={id:'a',versionId:'va',sourceId:'source',title:'Quantum processor error correction',url:'https://example.org/a',canonicalUrl:'https://example.org/a',fetchedAt:'2026-10-28T00:00:00Z',contentHash:'hash',content:'The processor will run 500 trials. The results are not evidence of a speedup.'};
const context:AnalysisContext={items:[item],claims:[{id:'c',itemId:'a',versionId:'va',text:item.content!,classification:'source_claim',confidence:null,reason:'source',createdAt:item.fetchedAt}],relations:[],topic:item.title,
  coverage:[{itemId:'a',versionId:'va',url:item.url,fetchedAt:item.fetchedAt,kind:'article-body',status:'available'}]};

test('Japanese summaries reject invented quantities, lost modality and lost negation',()=>{
  for(const value of ['計算機は9000回の試行を予定しており、高速化の証拠はない。','計算機は500回の試行を実施し、高速化の証拠はない。','計算機は500回の試行を予定しており、高速化が確認された。']){
    const result=auditSourceSummaries(context,[{itemId:'a',facts:[{claimId:'c',text:value}],limitation:'独立した測定結果は未確認である。'}]);
    assert.equal(result.summaries.length,0);assert(result.issues.length);
  }
  const result=auditSourceSummaries(context,[{itemId:'a',facts:[{claimId:'c',text:'計算機は500回の試行を予定しており、高速化の証拠ではないと述べる。'}],limitation:'独立した測定結果は未確認である。'}]);
  assert.equal(result.summaries.length,1);assert.deepEqual(result.issues,[]);
});

test('Japanese planned events and explicit negative findings cannot become completed or positive facts',()=>{
  const cases=[
    {source:'図書館は2026年11月15日に講演会を開催します。',summary:'図書館は2026年11月15日に講演会を開催した。'},
    {source:'実験の結果は高速化の証拠ではないと研究チームは述べた。',summary:'研究チームは実験によって高速化の証拠を示した。'},
  ];
  for(const entry of cases){
    const c={...context,claims:[{...context.claims[0],text:entry.source}]};
    const result=auditSourceSummaries(c,[{itemId:'a',facts:[{claimId:'c',text:entry.summary}],limitation:'今回の資料だけでは別の条件への適用範囲は確認できない。'}]);
    assert.equal(result.summaries.length,0);assert(result.issues.length);
  }
  const future={...context,claims:[{...context.claims[0],text:cases[0].source}]};
  const valid=auditSourceSummaries(future,[{itemId:'a',facts:[{claimId:'c',text:'図書館は2026年11月15日に講演会を開催する予定である。'}],limitation:'今回の資料だけでは参加後の評価は確認できない。'}]);
  assert.deepEqual(valid.issues,[]);
});

test('a summary cannot borrow another article claim or invent a named product',()=>{
  for(const fact of [{claimId:'absent',text:'計算機が500回の試行を予定しており高速化の証拠ではない。'},{claimId:'c',text:'FabricatedChipは500回の試行を予定するが、高速化の証拠ではない。'}])
    assert.equal(auditSourceSummaries(context,[{itemId:'a',facts:[fact],limitation:'別の資料による確認は未実施である。'}]).summaries.length,0);
});

test('Japanese public suffixes identify different institutions and NASA subdomains stay one publisher',()=>{
  assert.equal(publisherFamily('https://www.riken.jp/a'),'riken.jp');
  assert.equal(publisherFamily('https://current.ndl.go.jp/a'),'ndl.go.jp');
  assert.notEqual(publisherFamily('https://www.jst.go.jp/a'),publisherFamily('https://www.ndl.go.jp/a'));
  assert.equal(publisherFamily('https://science.nasa.gov/a'),publisherFamily('https://www.nasa.gov/a'));
});

test('exact copies across hosts and same-publisher documents do not become independent proof',()=>{
  const content='The same announcement about quantum error correction measurements. '.repeat(4);
  const c={...context,items:[{...item,content},{...item,id:'b',versionId:'vb',url:'https://other.org/b',canonicalUrl:'https://other.org/b',content}]};
  const report=evaluateEvidence(c,buildQualityAnalysis(c,c.topic,['a','b']));
  assert.equal(report.documentCount,2);assert.equal(report.originGroups,1);assert.equal(report.independentlyVerifiedSources,0);
  assert.equal(report.sources[1].independence,'same-origin');
  assert(report.claims.every(claim=>claim.classification!=='strong'));
});

test('article metadata separates publication, modification, event date and retrieval failure causes',()=>{
  const html=`<html lang="ja"><head><title>実験報告</title><meta property="article:published_time" content="2026-10-28"><meta property="article:modified_time" content="2026-10-29"><script type="application/ld+json">{"@type":"Event","startDate":"1955-01-01"}</script></head><body><article><h1>実験報告</h1><p>${'資料の保存条件について測定した記録を比較し、異なる観測時点の情報と区別する。'.repeat(12)}</p></article></body></html>`;
  const result=extractArticle(html,item.url);
  assert.equal(result.metadata.language,'ja');assert.match(result.metadata.publishedAt!,/^2026-10-28/);assert.match(result.metadata.eventAt!,/^1955/);
  assert.equal(classifyArticleFailure('Feed request failed with HTTP 410.'),'missing');
  assert.equal(classifyArticleFailure('Feed request failed with HTTP 403.'),'access-restricted');
  assert.equal(classifyArticleFailure('ROBOTS_DENIED'),'policy');assert.equal(classifyArticleFailure('TimeoutError'),'timeout');
});

test('specific Japanese subjects can form a relation without Latin word boundaries',()=>{
  assert.equal(compareRecords({...item,title:'量子計算機の誤り訂正を検証する実験'},{...item,canonicalUrl:'https://other.org/b',title:'量子計算機の誤り訂正を比較する新しい実験'}).kind,'same_issue_candidate');
});

for(const variant of ['valid','timeout','partial','all-invalid'])test(`multi-publisher pipeline preserves evidence: ${variant}`,async t=>{
  const failed=variant==='timeout'||variant==='all-invalid';
  const dir=await mkdtemp(path.resolve('tmp/evidence-review-'));
  const file=path.join(dir,'memory.sqlite'),db=new KousatsuDatabase(file),history=new TopicHistory(file);
  const source:SourceInput={id:'one',name:'実験機関',feedUrl:'https://one.org/feed',articlePolicy:{enabled:true,allowedHosts:['one.org'],maxArticles:1,cacheMinutes:60,followLinks:0}};
  const peer:SourceInput={...source,id:'two',name:'比較機関',feedUrl:'https://two.org/feed',articlePolicy:{...source.articlePolicy!,allowedHosts:['two.org']}};
  for(const s of [source,peer])db.upsertSource(s);
  const body='量子計算機の誤り訂正を調べる実験では、異なる条件で測定した記録を比較し、誤差が減る条件と減らない条件を分けて検討した。';
  const add=(s:SourceInput)=>db.getItem(db.upsertItem({...item,id:s.id,versionId:undefined,sourceId:s.id,title:s.id==='one'?'量子計算機の誤り訂正を調べる実験':'量子計算機の誤り訂正を比較する実験',url:`https://${s.id==='one'?'one':'two'}.org/article`,canonicalUrl:`https://${s.id==='one'?'one':'two'}.org/article`,content:undefined,contentHash:''}).id)!;
  const primary=add(source);add(peer);
  const runtime=await ResearchRuntime.open({databasePath:file,outputDirectory:dir,sources:[]});
  t.after(async()=>{runtime.close();history.close();db.close();await rm(dir,{recursive:true,force:true});});
  const provider:KousatsuAiProvider={id:'fixture',model:'grounded',analyze:async()=>{throw Error('unexpected');},
    summarizeGrounded:async c=>{if(variant==='timeout')throw new Error('MODEL_TIMEOUT');return c.items.map(i=>({itemId:i.id,facts:[
      ...(variant==='all-invalid'?[]:[{claimId:c.claims.find(claim=>claim.itemId===i.id)!.id,text:'出典は、量子計算機の誤り訂正について測定条件を分けて比較したと述べる。'}]),
      ...(['partial','all-invalid'].includes(variant)?[{claimId:c.claims.find(claim=>claim.itemId===i.id)!.id,text:'出典は9000回の試験で量子計算機の誤差が減少したと述べている。'}]:[]),
    ],limitation:'独立した再現実験の結果は未確認である。'}));},
    proposeGrounded:async c=>({observations:[],conclusions:[],hypotheses:[],reflection:{issue:'量子計算機の測定条件をどのように比較すべきか。',position:'私は、同じ条件で誤差が減るかを優先して比較したい。',reasoning:'誤り訂正の測定条件が異なるため、条件を揃えた評価が必要と考える。',alternative:'一方で測定方法自体に制約があるなら、条件を揃えるだけでは差を説明できない可能性がある。',revisionCondition:'同じ条件でも測定方法を変えると結果が逆転すれば、条件の一致を優先する見解を修正する。',premiseClaimIds:c.items.map(i=>c.claims.find(claim=>claim.itemId===i.id)!.id),assumptions:[],confidence:.4},sourceComparisons:[{leftItemId:c.items[0].id,rightItemId:c.items[1].id,agreement:'どちらも量子計算機の誤り訂正で測定条件を比較している。',difference:'同じ条件で独立した測定を行ったかは資料から確認できない。',claimIds:c.items.map(i=>c.claims.find(claim=>claim.itemId===i.id)!.id)}]})};
  const input={source,topic:primary.title,articleRef:{itemId:primary.id,versionId:primary.versionId!},outputDirectory:dir};
  const job=runtime.enqueueInput(input);
  const engine=new ResearchEngine({jobId:job,database:db,history,provider,exploration:0});
  const pipeline=new KousatsuPipeline(db,{provider:engine,sources:[source,peer],articleTransport:async url=>({httpStatus:200,text:url.endsWith('/robots.txt')?'User-agent: *\nAllow: /':`<html lang="ja"><head><title>量子計算機の誤り訂正を調べる実験</title></head><body><article><p>${body.repeat(6)}</p></article></body></html>`})});
  const result=await pipeline.resume(job);
  assert.equal(result.status,failed?'needs_review':'succeeded',JSON.stringify({analysis:db.getCheckpoint<AnalysisResult>(job,'analyze'),verify:db.getCheckpoint(job,'verify')}));
  const analysis=db.getCheckpoint<AnalysisResult>(job,'analyze')!;
  assert.equal(analysis.quality!.coverage.length,2);assert.equal(analysis.quality!.evidenceReview!.comparisons.length,1);
  assert.equal(analysis.quality!.evidenceReview!.independentlyVerifiedSources,0);
  assert.match(await readFile(result.articlePath!,'utf8'),/日本語要約/);
  if(variant==='partial'){
    assert.equal(analysis.quality!.evidenceReview!.summaryWarnings?.length,2);
    assert.equal(analysis.quality!.evidenceReview!.summaryIssues.length,0);
    assert(!result.articlePath||!(await readFile(result.articlePath,'utf8')).includes('9000'));
    assert(analysis.quality!.evidenceReview!.summaries.every(s=>s.facts.length===1));
  }
  assert(db.getCheckpoint(job,'research-model-output'));
  const token=runtime.store.acquireWorker()!;try{runtime.store.complete(job,token);}finally{runtime.store.releaseWorker(token);}
  const reader=new DatabaseSync(file,{readOnly:true});
  try{assert.equal(Number(reader.prepare('SELECT count(*) n FROM research_memory_events WHERE job_id=?').get(job)!.n),failed?0:1);}finally{reader.close();}
  const restored=await pipeline.resume(job);assert.equal(restored.articleId,result.articleId);
});
