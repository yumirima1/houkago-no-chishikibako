import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,unlink} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test,{type TestContext} from 'node:test';
import {ArticleContentStore,extractArticle} from '../../src/lib/kousatsu/article-content';
import {DeterministicProvider,type AnalysisContext} from '../../src/lib/kousatsu/ai';
import {createGroundedArticle} from '../../src/lib/kousatsu/article';
import {KousatsuDatabase} from '../../src/lib/kousatsu/database';
import {fetchFeed} from '../../src/lib/kousatsu/ingest';
import {KousatsuPipeline} from '../../src/lib/kousatsu/pipeline';
import {sourceSentences} from '../../src/lib/kousatsu/knowledge';
import {auditGroundedProposal,buildQualityAnalysis,evaluateHypothesisEvidence} from '../../src/lib/kousatsu/quality-analysis';
import {compareRecords,meaningfulTerms} from '../../src/lib/kousatsu/relevance';
import {ResearchEngine,selectResearchTopic,TopicHistory} from '../../src/lib/kousatsu/research-engine';
import {ResearchStore} from '../../src/lib/kousatsu/runtime-store';
import {verifyArticle} from '../../src/lib/kousatsu/verify';
import type {DocumentCoverage,GroundedModelProposal} from '../../src/lib/kousatsu/quality-types';
import type {StoredItem} from '../../src/lib/kousatsu/types';

const body='Artemis engine tests lasted 500 seconds at the Stennis facility. The engine will not be used in flight. Engineers will compare the recorded performance with previous tests before changing the design.';
const html=`<!doctype html><html><head><title>Artemis engine tests</title></head><body><nav>Other navigation</nav><article><h1>Artemis engine tests</h1><p>${body}</p><p>${body}</p><script>throw new Error('must not run')</script></article></body></html>`;
const item:StoredItem={id:'item-1',versionId:'version-1',sourceId:'nasa-science',title:'Artemis engine tests at Stennis facility',url:'https://example.org/article',canonicalUrl:'https://example.org/article',contentHash:'hash',fetchedAt:'2026-10-26T00:00:00.000Z',publishedAt:'2026-10-25T00:00:00.000Z',content:body};
const policy={enabled:true,allowedHosts:['example.org'],maxArticles:2,cacheMinutes:60,followLinks:1};
const coverage:DocumentCoverage[]=[{itemId:item.id,versionId:item.versionId!,kind:'article-body',status:'available',url:item.url,fetchedAt:item.fetchedAt}];
const context:AnalysisContext={topic:'Artemis engine tests',items:[item],relations:[],coverage,claims:[{id:'claim-1',itemId:item.id,versionId:item.versionId,text:body,classification:'source_claim',confidence:.5,reason:'出典の主張',createdAt:item.fetchedAt}]};
const proposal:GroundedModelProposal={observations:[{claimId:'claim-1',quote:body}],conclusions:[{text:'試験の評価は暫定の可能性がある。',premiseClaimIds:['claim-1'],reasoning:'飛行前の比較を必要とする記述を前提にしている。',alternative:'試験条件の違いも考えられる。'}],hypotheses:[{text:'試験条件が結果に影響する可能性がある。',premiseClaimIds:['claim-1'],prediction:'同じ条件の追加試験で同じ測定値が観測される。',falsification:'同じ条件の追加試験で異なる測定値が観測される。',alternative:'測定のばらつきが結果を説明する可能性がある。',requiredEvidence:'条件と測定方法を揃えた追加試験の原記録。',confidence:.99,status:'unverified'}]};

async function setup(t:TestContext){
  const dir=await mkdtemp(path.resolve('tmp/research-quality-'));
  const file=path.join(dir,'database.sqlite');const db=new KousatsuDatabase(file);
  const closers:Array<()=>void>=[];
  t.after(async()=>{for(const close of closers)close();db.close();await rm(dir,{recursive:true,force:true});});
  return {dir,file,db,closers};
}

test('title-only records never turn an unsupported plan summary into factual prose',()=>{
  const titleOnly={...item,content:undefined,summary:undefined,title:'Why do planes keep circling before landing? The UN has a plan to fix it'};
  const c={...context,items:[titleOnly],coverage:[{...coverage[0],kind:'metadata' as const}],claims:[{...context.claims[0],text:titleOnly.title}]};
  const q=buildQualityAnalysis(c,'航空機の到着待機を減らす条件は何か。',[item.id],{summary:'The UN has provided a clear and detailed plan',hypotheses:[]});
  assert.equal(q.conclusions.length,0);assert.equal(q.hypotheses.length,0);assert.equal(q.status,'limited');
  const article=createGroundedArticle({analysis:{quality:q,summary:'DO NOT REPEAT THIS UNSUPPORTED SUMMARY',hypotheses:[],model:'fixture',provider:'fixture'},...c});
  assert(!article.markdown.includes('DO NOT REPEAT'));assert(!article.markdown.includes('clear and detailed'));
  assert.match(article.markdown,/題名の問いについての見解/);assert(!article.markdown.includes('## 仮説と別の解釈'));
});

test('RSS summaries remain attributed and do not unlock body-dependent conclusions',()=>{
  const q=buildQualityAnalysis({...context,coverage:[{...coverage[0],kind:'feed-summary'}]},'試験の効果は何か。',[item.id],proposal);
  assert.equal(q.observations[0].kind,'feed-summary');assert.equal(q.conclusions.length,0);assert.equal(q.hypotheses.length,0);
});

test('May as a month is never misreported as a prediction or possibility',()=>{
  const quote='In Europe the programme avoided delays between May and August 2026.';
  const c={...context,items:[{...item,content:quote}],claims:[{...context.claims[0],text:quote}]};
  const q=buildQualityAnalysis(c,'期間別の比較は可能か。',[item.id]);
  const draft=createGroundedArticle({...c,analysis:{quality:q,summary:'unused',hypotheses:[],model:'fixture',provider:'fixture'}});
  assert(!draft.markdown.includes('「May」という予定'));assert(draft.markdown.includes(quote));assert(draft.assertions.some(a=>a.classification==='inference'));
});

test('RS-25 identifiers are not mistaken for a measured quantity and regional totals are not equated',()=>{
  const q=buildQualityAnalysis(context,context.topic,[item.id]);
  q.observations=[{...q.observations[0],quote:'RS-25 produced 2 million pounds of thrust in 2026.'}];
  const draft=createGroundedArticle({...context,analysis:{quality:q,summary:'unused',hypotheses:[],model:'fixture',provider:'fixture'}});
  assert(!draft.markdown.includes('「25」は'));assert(draft.markdown.includes('RS-25 produced 2 million pounds'));assert(draft.markdown.includes('**私の見解（推論）**'));
});

test('body-grounded tentative reasoning records premises, alternatives, test conditions and capped confidence',()=>{
  const q=buildQualityAnalysis(context,'試験結果は何を意味するか。',[item.id],proposal);
  assert.equal(q.status,'grounded');assert.equal(q.conclusions.length,1);assert.equal(q.hypotheses.length,1);
  assert.equal(q.hypotheses[0].confidence,.2);assert.equal(q.hypotheses[0].status,'unverified');
  assert.deepEqual(q.hypotheses[0].premiseClaimIds,['claim-1']);
});

for(const invalid of [null,{},'', {observations:[],conclusions:[{text:'断定'}],hypotheses:[]}]) {
  test(`empty or malformed model proposals remain safe: ${JSON.stringify(invalid)}`,()=>{
    const result=auditGroundedProposal(context,invalid,coverage);assert.equal(result.conclusions.length,0);assert.equal(result.hypotheses.length,0);
  });
}

test('fabricated numbers, source IDs, URLs and altered quotations are rejected',()=>{
  for(const change of [
    {...proposal,observations:[{claimId:'unknown',quote:body}]},
    {...proposal,observations:[{claimId:'claim-1',quote:'Fabricated observation'}]},
    {...proposal,conclusions:[{...proposal.conclusions[0],text:'9000人が影響を受けた可能性がある。'}]},
    {...proposal,conclusions:[{...proposal.conclusions[0],text:'https://invented.invalid/ の可能性がある。'}]},
  ])assert.equal(auditGroundedProposal(context,change,coverage).conclusions.length,0);
});

test('a source title copied as a hypothesis and identical prediction/refutation are rejected',()=>{
  for(const h of [{...proposal.hypotheses[0],text:item.title},{...proposal.hypotheses[0],falsification:proposal.hypotheses[0].prediction}])
    assert.equal(auditGroundedProposal(context,{...proposal,hypotheses:[h]},coverage).hypotheses.length,0);
});

test('readability extracts static article paragraphs without executing embedded scripts',()=>{
  const result=extractArticle(html,item.url);assert(result.text.includes(body));assert(!result.text.includes('must not run'));assert(!result.text.includes('Other navigation'));
  assert.throws(()=>extractArticle('<html><body>Too short</body></html>',item.url),/EMPTY_OR_TOO_SHORT/);
  assert.throws(()=>extractArticle('<meta name="robots" content="noarchive">'+html,item.url),/ARCHIVING_DENIED/);
});

test('English abbreviations do not cut the Stennis test date and engine identifier into false claims',()=>{
  const sentence='Teams near Bay St. Louis tested engine No. 10001 on Oct. 21, 2026.';
  assert.deepEqual(sourceSentences(sentence+' The test lasted 500 seconds.'),[sentence,'The test lasted 500 seconds.']);
});

test('article success is cached and repeated retrieval retains one immutable document',async t=>{
  const f=await setup(t);let requests=0;
  const transport:typeof fetchFeed=async url=>{requests++;return {httpStatus:200,text:url.endsWith('/robots.txt')?'User-agent: *\nAllow: /':html,finalUrl:url,contentType:url.endsWith('/robots.txt')?'text/plain':'text/html'};};
  const store=new ArticleContentStore(f.file,transport);f.closers.push(()=>store.close());
  const first=await store.fetch(item.url,policy),second=await store.fetch(item.url,policy);
  assert.equal(first.status,'available');assert.equal(second.cached,true);assert.equal(second.document?.id,first.document?.id);assert.equal(requests,2);
  const check=new DatabaseSync(f.file,{readOnly:true});try{assert.equal(check.prepare('SELECT count(*) n FROM research_page_documents').get()?.n,1);}finally{check.close();}
});

test('an updated article appends a document and retains the previous cached source text',async t=>{
  const f=await setup(t);let changed=false;
  const store=new ArticleContentStore(f.file,async url=>({httpStatus:200,text:url.endsWith('/robots.txt')?'':changed ? html.replaceAll('500 seconds','600 seconds') : html}));f.closers.push(()=>store.close());
  const old=await store.fetch(item.url,policy);changed=true;
  const check=new DatabaseSync(f.file);check.prepare("UPDATE research_page_cache SET next_at='2000-01-01T00:00:00Z'").run();check.close();
  const updated=await store.fetch(item.url,policy);assert.notEqual(updated.document?.id,old.document?.id);assert(store.document(old.document!.id)!.text.includes('500 seconds'));assert(updated.document!.text.includes('600 seconds'));
});

test('robots denial and body timeout persist failures and suppress repeated network requests',async t=>{
  const f=await setup(t);let requests=0;
  const denied=new ArticleContentStore(f.file,async()=>{requests++;return {httpStatus:200,text:'User-agent: *\nDisallow: /'};});
  assert.equal((await denied.fetch(item.url,policy)).status,'denied');assert.equal((await denied.fetch(item.url,policy)).cached,true);assert.equal(requests,1);denied.close();
  const other='https://example.org/timeout';
  const check=new DatabaseSync(f.file);check.prepare('DELETE FROM research_robots').run();check.close();
  const failed=new ArticleContentStore(f.file,async url=>{if(url.endsWith('/robots.txt'))return {httpStatus:200,text:'User-agent: *\nAllow: /'};throw new Error('REQUEST_TIMEOUT');});
  f.closers.push(()=>failed.close());const result=await failed.fetch(other,policy);assert.equal(result.status,'failed');assert.match(result.error!,/TIMEOUT/);assert.equal((await failed.fetch(other,policy)).cached,true);
});

test('long robots crawl delays defer retrieval and interrupted attempts still consume the daily budget',async t=>{
  const f=await setup(t);let requests=0;
  const store=new ArticleContentStore(f.file,async()=>{requests++;return {httpStatus:200,text:'User-agent: *\nCrawl-delay: 120'};});f.closers.push(()=>store.close());
  assert.match((await store.fetch(item.url,policy)).error!,/CRAWL_DELAY_EXCEEDS_BUDGET/);assert.equal(requests,1);
  const check=new DatabaseSync(f.file);const target='https://example.org/crashed';
  for(let i=0;i<3;i++)check.prepare("INSERT INTO research_page_attempts(id,url,started_at,status) VALUES(?,?,?,'running')").run(`crash-${i}`,target,new Date(Date.now()-180000).toISOString());check.close();
  assert.match((await store.fetch(target,policy)).error!,/DAILY_ATTEMPT_LIMIT/);assert.equal(requests,1);
});

test('unapproved hosts and unsupported MIME types are rejected before parsing',async t=>{
  const f=await setup(t);let requests=0;
  const store=new ArticleContentStore(f.file,async url=>{requests++;return {httpStatus:200,text:url.endsWith('/robots.txt')?'':html,contentType:'application/octet-stream'};});f.closers.push(()=>store.close());
  assert.equal((await store.fetch('https://private.invalid/secret',policy)).status,'denied');assert.equal(requests,0);
  assert.match((await store.fetch(item.url,policy)).error!,/CONTENT_TYPE_REJECTED/);
});

test('general vocabulary and letter fragments never create a strong relation',()=>{
  const weak=[
    ['Women first to suffer under siege in Sudan','First human case of Shamonda virus reported in France'],
    ['World News in Brief: Iran nuclear inspections','World News in Brief: Jordan church attack'],
    ['Yemen war continues to force families from homes','Orion spacecraft returns from orbit'],
  ];
  for(const [left,right] of weak)assert(['unrelated','lexical_overlap'].includes(compareRecords({...item,title:left},{...item,canonicalUrl:'https://example.org/other',title:right}).kind));
  assert(!meaningfulTerms('World News in Brief why from first the').size);
});

test('a dated update about the same named engine remains a follow-up candidate, not proven causality',()=>{
  const relation=compareRecords(item,{...item,canonicalUrl:'https://example.org/second',title:'Artemis engine tests at Stennis show new results',publishedAt:'2026-10-26T00:00:00Z'});
  assert.equal(relation.kind,'follow_up_candidate');assert.match(relation.reason,/因果関係の推定はしていない/);
});

test('topic selection produces event questions and defers single-word noise',()=>{
  const decision=selectResearchTopic(context,[],0,0.5);assert(decision.topic.includes(item.title));assert.match(decision.topic,/か。$/);assert(decision.focusItemIds!.includes(item.id));
  const skipped=selectResearchTopic({...context,items:[{...item,title:'why',content:undefined,summary:undefined}]},[],0,0.5);assert.deepEqual(skipped.focusItemIds,[]);assert.match(skipped.reason,/保留/);
});

test('new document evidence supports, refutes or leaves a recorded test inconclusive without treating no hit as refutation',()=>{
  const h={expectedQuote:'The mission completed the planned engine test successfully.',contradictingQuote:'The mission cancelled the planned engine test permanently.'};
  assert.equal(evaluateHypothesisEvidence(h,[h.expectedQuote]).status,'supported');assert.equal(evaluateHypothesisEvidence(h,[h.contradictingQuote]).status,'refuted');
  assert.equal(evaluateHypothesisEvidence(h,[h.expectedQuote,h.contradictingQuote]).status,'inconclusive');assert.equal(evaluateHypothesisEvidence(h,['No observation supplied']).status,'inconclusive');
  assert.equal(evaluateHypothesisEvidence({expectedQuote:'',contradictingQuote:'the'},['the']).status,'inconclusive');
});

test('old hypothesis reviews cite matching new-version claims and preserve independent verification as unknown',()=>{
  const h={...proposal.hypotheses[0],prediction:body,falsification:'The planned engine test was permanently cancelled by engineers.'};
  const q=buildQualityAnalysis({...context,memories:[{id:'old-memory',jobId:'old-job',topic:'Artemis engine tests',kind:'hypothesis',text:h.text,reason:'testable',createdAt:item.fetchedAt,verificationStatus:'passed',factCheckStatus:'unverified',references:[{itemId:item.id,versionId:'previous-version',claimIds:['previous-claim']}],quality:{...buildQualityAnalysis(context,context.topic,[item.id]),hypotheses:[h]}}]},context.topic,[item.id]);
  assert.equal(q.hypothesisReviews?.[0].status,'supported');assert.deepEqual(q.hypothesisReviews?.[0].claimIds,['claim-1']);assert.match(q.hypothesisReviews![0].reason,/独立した事実確認は未実施/);
  assert.match(q.priorMemory[0].reason,/新版|新しい版/);
});

for(const state of ['supported','refuted'] as const) {
  test(`a ${state} observation appends a durable hypothesis review without rewriting the old memory`,async t=>{
    const f=await setup(t);const store=new ResearchStore(f.file);const history=new TopicHistory(f.file);
    f.closers.push(()=>store.close(),()=>history.close());
    const prediction='同条件で追加試験を実施したところ試験時間は再び同じ値だった。';
    const falsification='同条件で追加試験を実施したところ試験時間に大きな差が出た。';
    const fixture=path.join(f.dir,'review.xml');
    await writeFile(fixture,`<rss version="2.0"><channel><title>fixture</title><item><title>${item.title}</title><link>${item.url}</link></item></channel></rss>`);
    let document=html;
    const input={topic:'Artemis engine tests',fixturePath:fixture,outputDirectory:path.join(f.dir,'Notes'),source:{id:'nasa-science',name:'fixture',feedUrl:'https://example.org/rss',articlePolicy:policy}};
    const run=async()=>{
      const memories=store.retrieveMemories(input.topic),id=store.enqueue(input);
      const model={id:'fixture',model:'bound',analyze:async()=>{throw Error('unexpected legacy model call');},proposeGrounded:async(c:AnalysisContext)=>({
        observations:[{claimId:c.claims[0].id,quote:c.claims[0].text}],conclusions:[],hypotheses:[{...proposal.hypotheses[0],premiseClaimIds:[c.claims[0].id],prediction,falsification}],
      })};
      const engine=new ResearchEngine({jobId:id,database:f.db,history,provider:model,exploration:0});
      const provider={id:engine.id,model:engine.model,configurationFingerprint:engine.configurationFingerprint,analyze:(c:AnalysisContext)=>engine.analyze({...c,memories})};
      await new KousatsuPipeline(f.db,{provider,articleTransport:async url=>({httpStatus:200,text:url.endsWith('/robots.txt')?'':document})}).resume(id);
      const token=store.acquireWorker()!;try{store.complete(id,token);}finally{store.releaseWorker(token);}
      return id;
    };
    await run();const old=store.retrieveMemories(input.topic).find(m=>m.kind==='hypothesis')!;assert(old);
    const observation=state==='supported'?prediction:falsification;
    document=`<html><head><title>Artemis engine follow-up</title></head><body><article><p>${observation}</p><p>${'試験条件と測定方法を記録し、比較可能な原資料として保存した。'.repeat(7)}</p></article></body></html>`;
    const sql=new DatabaseSync(f.file);sql.prepare("UPDATE research_page_cache SET next_at='2000-01-01T00:00:00Z'").run();sql.close();
    const job=await run();
    const check=new DatabaseSync(f.file,{readOnly:true});try{
      const row=check.prepare('SELECT review_json FROM research_hypothesis_reviews WHERE memory_id=? AND job_id=?').get(old.id,job)!;
      assert(row);const review=JSON.parse(String(row.review_json));assert.equal(review.status,state);assert(review.claimIds.length>0);
      assert.equal(check.prepare('SELECT text FROM research_memory_events WHERE id=?').get(old.id)?.text,old.text);
      assert.equal(check.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');assert.equal(check.prepare('PRAGMA foreign_key_check').all().length,0);
    }finally{check.close();}
  });
}

test('independent verifier rejects a claim quote changed after analysis',()=>{
  const quality=buildQualityAnalysis(context,context.topic,[item.id],proposal);
  const draft=createGroundedArticle({...context,analysis:{quality,summary:'summary',hypotheses:[],provider:'test',model:'test'}});
  const bad=structuredClone(draft);bad.quality!.observations[0].quote='Invented statement';
  assert(verifyArticle({article:bad,...context,evidence:[]}).issues.some(i=>i.code==='UNGROUNDED_OBSERVATION'));
});

test('body-stage crash resumes the saved version without refetch and restores a missing readable note',async t=>{
  const f=await setup(t);const fixture=path.join(f.dir,'feed.xml');
  await writeFile(fixture,`<rss version="2.0"><channel><title>fixture</title><item><title>${item.title}</title><link>${item.url}</link><description>RSS excerpt only</description></item></channel></rss>`);
  const input={topic:'Artemis engine tests',fixturePath:fixture,outputDirectory:path.join(f.dir,'Notes'),source:{id:'nasa-science',name:'NASA fixture',feedUrl:'https://example.org/rss',articlePolicy:policy}};
  let requests=0;const transport:typeof fetchFeed=async url=>{requests++;return {httpStatus:200,text:url.endsWith('/robots.txt')?'User-agent: *\nAllow: /':html,contentType:url.endsWith('/robots.txt')?'text/plain':'text/html'};};
  const id=f.db.createJob(input);const history=new TopicHistory(f.file);f.closers.push(()=>history.close());
  const provider=new ResearchEngine({jobId:id,database:f.db,history,provider:new DeterministicProvider(),exploration:0});
  const interrupted=new KousatsuPipeline(f.db,{provider,articleTransport:transport,failAfterStage:'article-content'});
  await assert.rejects(interrupted.resume(id),/Injected failure/);assert.equal(requests,2);
  const pipeline=new KousatsuPipeline(f.db,{provider,articleTransport:transport});const result=await pipeline.resume(id);
  assert.equal(result.status,'succeeded');assert.equal(requests,2);
  const note=await readFile(result.articlePath!,'utf8');assert.match(note,/取得した記事本文/);assert(note.includes('500 seconds'));assert(!note.includes('DO NOT'));
  await unlink(result.articlePath!);await pipeline.resume(id);assert.equal(await readFile(result.articlePath!,'utf8'),note);assert.equal(requests,2);
});

test('legacy claims on the same body version remain protected while new extraction selects a smaller citation set',async t=>{
 const f=await setup(t),fixture=path.join(f.dir,'legacy.xml');
 await writeFile(fixture,`<rss version="2.0"><channel><title>fixture</title><item><title>${item.title}</title><link>${item.url}</link></item></channel></rss>`);
 const input={topic:'Artemis engine tests',fixturePath:fixture,outputDirectory:path.join(f.dir,'Notes'),source:{id:'nasa-science',name:'fixture',feedUrl:'https://example.org/rss',articlePolicy:policy}};
 const history=new TopicHistory(f.file);f.closers.push(()=>history.close());let legacy='';
 const id=f.db.createJob(input),provider=new ResearchEngine({jobId:id,database:f.db,history,provider:new DeterministicProvider(),exploration:0});
 const pipeline=new KousatsuPipeline(f.db,{provider,articleTransport:async url=>({httpStatus:200,text:url.endsWith('/robots.txt')?'':html}),afterStage:stage=>{
  if(stage!=='article-content')return;const selected=f.db.getCheckpoint<{items:StoredItem[]}>(id,'selected-items')!.items[0];
  legacy=f.db.upsertClaim({classification:'source_claim',confidence:.5,itemId:selected.id,versionId:selected.versionId,text:'Artemis engine tests lasted 500 seconds',reason:'旧抽出方式の断片を保存'});
  f.db.upsertEvidence({claimId:legacy,itemId:selected.id,versionId:selected.versionId,excerpt:'Artemis engine tests lasted 500 seconds',locator:selected.url,stance:'supports'});
 }});
 const result=await pipeline.resume(id);assert.equal(result.status,'succeeded');
 const classified=f.db.getCheckpoint<{claims:Array<{id:string}>;integrityDigest:string}>(id,'classify')!;assert(classified.integrityDigest);assert(!classified.claims.some(c=>c.id===legacy));
 assert(f.db.listClaims(f.db.getCheckpoint<{items:StoredItem[]}>(id,'selected-items')!.items.map(i=>i.id)).some(c=>c.id===legacy));
 await unlink(result.articlePath!);assert.equal((await pipeline.resume(id)).status,'succeeded');
 const next=f.db.createJob(input),nextProvider=new ResearchEngine({jobId:next,database:f.db,history,provider:new DeterministicProvider(),exploration:0});
 const protectedPipeline=new KousatsuPipeline(f.db,{provider:nextProvider,articleTransport:async url=>({httpStatus:200,text:url.endsWith('/robots.txt')?'':html}),afterStage:stage=>{
  if(stage!=='classify')return;const sql=new DatabaseSync(f.file);try{sql.prepare("UPDATE claims SET reason='unexpected modification' WHERE id=?").run(legacy);}finally{sql.close();}
 }});
 await assert.rejects(protectedPipeline.resume(next),/CHECKPOINT_VERSION_MISMATCH: claims or evidence changed/);
});

test('body retrieval failure still saves RSS evidence and a limited report',async t=>{
  const f=await setup(t);const fixture=path.join(f.dir,'failure.xml');
  await writeFile(fixture,`<rss version="2.0"><channel><title>fixture</title><item><title>${item.title}</title><link>${item.url}</link><description>Engine tests are planned; results are not available.</description></item></channel></rss>`);
  const input={topic:'Artemis engine tests',fixturePath:fixture,outputDirectory:path.join(f.dir,'Notes'),source:{id:'nasa-science',name:'NASA fixture',feedUrl:'https://example.org/rss',contentPolicy:'metadata-and-feed-summary' as const,articlePolicy:policy}};
  const id=f.db.createJob(input);const history=new TopicHistory(f.file);f.closers.push(()=>history.close());
  const provider=new ResearchEngine({jobId:id,database:f.db,history,provider:new DeterministicProvider(),exploration:0});
  const pipeline=new KousatsuPipeline(f.db,{provider,articleTransport:async url=>{if(url.endsWith('/robots.txt'))return {httpStatus:200,text:''};throw new Error('REQUEST_TIMEOUT');}});
  const result=await pipeline.resume(id);assert.equal(result.status,'succeeded');
  const q=f.db.getCheckpoint<import('../../src/lib/kousatsu/types').AnalysisResult>(id,'analyze')!.quality!;
  assert.equal(q.status,'limited');assert.equal(q.coverage[0].status,'failed');assert.equal(q.observations[0].kind,'feed-summary');assert.equal(q.conclusions.length,0);assert.equal(q.hypotheses.length,0);
  assert.match(await readFile(result.articlePath!,'utf8'),/REQUEST_TIMEOUT/);
});

test('captured NASA and United Nations cases discard old unsupported prose and word-lottery topics',async()=>{
  const cases=JSON.parse(await readFile('tests/fixtures/kousatsu-quality-regressions.json','utf8')) as Array<{items:StoredItem[];badSummary:string;oldTopic:string}>;
  for(const fixture of cases){
    const c={...context,items:fixture.items,coverage:undefined,claims:fixture.items.map((i,index)=>({...context.claims[0],id:`claim-${index}`,itemId:i.id,versionId:i.versionId,text:i.title}))};
    const decision=selectResearchTopic(c,[],0,0.5);assert.notEqual(decision.topic,fixture.oldTopic);assert(decision.topic.length>30);
    const q=buildQualityAnalysis(c,decision.topic,decision.focusItemIds!,{summary:fixture.badSummary,hypotheses:[]});
    const draft=createGroundedArticle({...c,analysis:{quality:q,summary:fixture.badSummary,hypotheses:[],model:'regression',provider:'test'}});
    assert(!draft.markdown.includes(fixture.badSummary));assert.equal(q.hypotheses.length,0);assert.equal(q.conclusions.length,0);
  }
});
