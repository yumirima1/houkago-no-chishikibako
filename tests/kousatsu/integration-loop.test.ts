import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {parseWeeklyOperation,weeklySlots,jstDay,jstDayStart} from '../../src/lib/kousatsu/weekly-config';
import {WeeklyStore,updatedArticle} from '../../src/lib/kousatsu/weekly-store';
import {ResearchAgenda,agendaDefaults} from '../../src/lib/kousatsu/research-agenda';
import {ResearchRuntime} from '../../src/lib/kousatsu/runtime-service';
import {ResearchEngine,TopicHistory} from '../../src/lib/kousatsu/research-engine';
import {DeterministicProvider} from '../../src/lib/kousatsu/ai';
import {parseResearchSources} from '../../src/lib/kousatsu/runtime-config';
import {parseAutonomousConfig} from '../../src/lib/kousatsu/autonomous-config';
import {planWeekly} from '../../src/lib/kousatsu/weekly-service';
import {verifyPublicDelivery} from '../../src/lib/kousatsu/public-delivery';
import {publishResearch} from '../../src/lib/kousatsu/public-publisher';
import {verifySourceBindings} from '../../src/lib/kousatsu/source-verification';
import {readResearchSummary} from '../../src/lib/kousatsu/research-status';
import {exportPublicResearch} from '../../src/lib/kousatsu/public-export';
import type {fetchFeed} from '../../src/lib/kousatsu/ingest';
import type {StoredItem} from '../../src/lib/kousatsu/types';
import type {AnalysisContext} from '../../src/lib/kousatsu/ai';
import type {QualityAnalysis} from '../../src/lib/kousatsu/quality-types';

const now=Date.parse(`${jstDay(Date.now())}T06:00:00+09:00`);
const operation=()=>parseWeeklyOperation({id:'continuous-test',startsAt:`${jstDay(now)}T00:00:00+09:00`,endsAt:null,continuous:true,runTimes:['06:00','18:00','22:00'],maxArticles:1,genres:['science','culture']});
async function fixture(){
  await mkdir('tmp',{recursive:true});const root=await mkdtemp(path.resolve('tmp','integration-loop-'));
  const sources=parseResearchSources({sources:['science','culture'].map(genre=>({id:genre,name:genre,genre,feedUrl:`https://example.org/${genre}.xml`,topic:'Artemis radiation shielding measurements',enabled:true,intervalMinutes:1440,contentPolicy:'metadata-only',articlePolicy:{enabled:true,allowedHosts:['example.org'],maxArticles:1,cacheMinutes:15,followLinks:0}}))});
  const config=parseAutonomousConfig({dataDirectory:root,operation:operation(),sourcesPath:path.join(root,'sources.json'),ai:{provider:'deterministic'},exploration:0,agenda:{initialScores:{science:100,culture:10},maxSources:1}},process.cwd());
  await mkdir(path.join(root,'Memory'),{recursive:true});
  const runtime=await ResearchRuntime.open({databasePath:path.join(root,'Memory','kousatsu.sqlite'),outputDirectory:path.join(root,'Notes'),sources,providerForJob:jobId=>new ResearchEngine({jobId,history,database:runtime.database,provider:new DeterministicProvider(),exploration:0})});
  const history=new TopicHistory(runtime.database.filePath);
  let edition=1,bodyEdition=1;
  const titles=['','Artemis radiation shielding measurements compare astronaut exposure','Artemis radiation shielding experiments assess instrument calibration'];
  const transport:typeof fetchFeed=async url=>({httpStatus:200,contentType:url.endsWith('.xml')?'application/rss+xml':'text/html',text:url.endsWith('robots.txt')?'User-agent: *\nAllow: /':url.endsWith('.xml')?`<rss version="2.0"><channel><title>fixture</title><item><title>${titles[edition]}</title><link>https://example.org/artemis-${edition}</link><pubDate>${new Date(now).toUTCString()}</pubDate></item></channel></rss>`:`<html><body><article><p>Artemis radiation shielding measurements reduced astronaut exposure by ${bodyEdition===1?20:35} percent in a controlled instrument experiment.</p><p>Document edition ${edition}. ${'Researchers compared instrument calibration and radiation shielding measurements across different astronaut exposure conditions. Independent confirmation requires additional measurements and cannot be inferred from this experiment alone. '.repeat(8)}</p></article></body></html>`});
  return {root,sources,config,runtime,history,transport,setEdition:(v:number)=>{edition=v;},setBody:(v:number)=>{bodyEdition=v;},close(){history.close();runtime.close();}};
}

test('continuous scheduling rolls beyond the former deadline and records offline gaps without unbounded catch-up',async()=>{
  const f=await fixture(),s=new WeeklyStore(f.runtime.database.filePath);try{
    s.register(operation(),now);const first=Number(s.db.prepare('SELECT count(*) n FROM weekly_days').get()?.n);assert.ok(first<=24);
    const later=now+106*86400000+12*3600000;s.register(operation(),later);
    assert.ok(s.due(operation(),later));assert.equal(s.snapshot(operation(),later).state,'active');
    assert.ok(Number(s.db.prepare('SELECT untracked_days FROM weekly_schedule_gaps').get()?.untracked_days)>80);
    assert.ok(Number(s.db.prepare('SELECT count(*) n FROM weekly_days').get()?.n)<=48);
    assert.equal(weeklySlots(operation(),later).length,24);
    assert.equal(jstDay(Date.parse('2026-10-27T15:00:00Z')),'2026-10-28');assert.equal(jstDayStart(Date.parse('2026-10-27T15:00:00Z')),'2026-10-27T15:00:00.000Z');
  }finally{s.close();f.close();}
});

test('cycle leases exclude concurrent execution and preserve active runs during recovery',async()=>{
  const f=await fixture(),other=new TopicHistory(f.runtime.database.filePath);try{
    const token=f.history.acquireCycle()!;assert.ok(token);assert.equal(other.acquireCycle(),null);
    const id=f.history.beginRun();f.history.bindCycle(token,id);other.recoverRuns();
    const db=new DatabaseSync(f.runtime.database.filePath);try{assert.equal(db.prepare('SELECT status FROM autonomy_runs WHERE id=?').get(id)?.status,'running');}finally{db.close();}
    f.history.releaseCycle(token);assert.ok(other.acquireCycle());other.recoverRuns();
    const db2=new DatabaseSync(f.runtime.database.filePath);try{assert.equal(db2.prepare('SELECT status FROM autonomy_runs WHERE id=?').get(id)?.status,'interrupted');}finally{db2.close();}
    assert.throws(()=>f.history.renewCycle(token),/CYCLE_LEASE_LOST/);
  }finally{other.close();f.close();}
});

test('daily execution receipts share the JST budget across schedules and same-job retries consume one slot',async()=>{
  const f=await fixture();try{
    const token=f.runtime.store.acquireWorker()!,at=Date.now(),ids=[];
    for(let i=0;i<4;i++)ids.push(f.runtime.store.enqueue({source:f.sources[0],topic:`Actual bounded request ${i}`,outputDirectory:path.join(f.root,'Notes')}));
    for(const id of ids.slice(0,3))assert.equal(f.runtime.store.reserveDailyExecution(id,token,3,at),true);
    assert.equal(f.runtime.store.reserveDailyExecution(ids[0],token,3,at),true);
    assert.equal(f.runtime.store.reserveDailyExecution(ids[3],token,3,at),false);
    assert.equal(f.runtime.store.reserveDailyExecution(ids[3],token,3,at+86400000),true);
    f.runtime.store.releaseWorker(token);
  }finally{f.close();}
});

test('interests decay once per week and change the actual selected feed, scan quota and body budget',async()=>{
  const f=await fixture(),agenda=new ResearchAgenda(f.runtime.database.filePath,{...agendaDefaults,initialScores:{science:100,culture:10},maxSources:1});try{
    agenda.reconcile(f.sources,now);const high=agenda.plan('a','first',f.sources,0,now,0.9);assert.equal(high.sources[0].id,'science');assert.equal(high.sources[0].candidateLimit,12);assert.equal(high.sources[0].bodyLimit,2);
    agenda.reconcile(f.sources,now+7*86400000);assert.equal(agenda.interests().find(i=>i.label==='science')?.score,95);
    agenda.reconcile(f.sources,now+7*86400000);assert.equal(agenda.interests().find(i=>i.label==='science')?.score,95);
    agenda.db.prepare("UPDATE research_interests SET score=0 WHERE label='science'").run();agenda.db.prepare("UPDATE research_interests SET score=90 WHERE label='culture'").run();
    const calls:string[]=[];await planWeekly(f.config,f.runtime,f.sources,async(u,o)=>{calls.push(u);return f.transport(u,o);},now);
    assert.ok(calls.includes(f.sources[1].feedUrl));assert.ok(!calls.includes(f.sources[0].feedUrl));
    const row=agenda.db.prepare('SELECT input_json FROM jobs').get()!;const input=JSON.parse(String(row.input_json));assert.equal(input.source.id,'culture');assert.equal(input.researchPlan.sourceBudget.candidateLimit,11);
    const frozen=agenda.plan('a','first',f.sources,1,now+1,0);assert.deepEqual(frozen,high);
    const explored=agenda.plan('a','explore',f.sources,1,now,0.9);assert.equal(explored.explorationSource,'science');
  }finally{agenda.close();f.close();}
});

test('a saved inquiry selects a distinct follow-up, reuses memory, journals reviews, and retains original notes',async()=>{
  const f=await fixture(),agenda=new ResearchAgenda(f.runtime.database.filePath,f.config.agenda);try{
    await planWeekly(f.config,f.runtime,f.sources,f.transport,now);const first=await f.runtime.tick({schedule:false});assert.equal(first.status,'completed');assert.ok(first.status==='completed');
    const original=await readFile(first.result.articlePath!,'utf8');agenda.reconcile(f.sources,Date.now());assert.ok(agenda.inquiries().length>0);
    const interest=agenda.interests().find(i=>i.label==='science')!;assert.ok(interest.observations>0);
    f.setEdition(2);await planWeekly(f.config,f.runtime,f.sources,f.transport,now+12*3600000);
    const queued=agenda.db.prepare('SELECT id,input_json FROM jobs ORDER BY rowid DESC LIMIT 1').get()!;const input=JSON.parse(String(queued.input_json));assert.equal(input.researchPlan.reason,'FOLLOW_UP_FROM_SAVED_QUESTION');assert.equal(input.researchPlan.inquiryIds.length,1);
    const second=await f.runtime.tick({schedule:false});assert.equal(second.status,'completed',JSON.stringify(second));
    const analysis=f.runtime.database.getCheckpoint<import('../../src/lib/kousatsu/types').AnalysisResult>(String(queued.id),'analyze')!;
    assert.ok(analysis.research!.memories.length>0);assert.ok(analysis.quality!.viewReviews!.length>0);assert.equal(analysis.research!.model.status,'not-requested');assert.equal(analysis.quality!.sourceVerification!.independentVerification,'unverified');
    agenda.reconcile(f.sources);assert.ok(Number(agenda.db.prepare('SELECT count(*) n FROM research_inquiry_attempts').get()?.n)>0);assert.equal(await readFile(first.result.articlePath!,'utf8'),original);
    // Low-interest genres must remain visible even after many stronger themes.
    agenda.db.prepare("UPDATE research_interests SET score=1 WHERE key='genre:science'").run();
    for(let i=0;i<25;i++)agenda.db.prepare("INSERT INTO research_interests VALUES(?,'theme',?,100,0,NULL,?)").run(`test-theme-${i}`,`theme ${i}`,new Date(now).toISOString());
    const bundle=await exportPublicResearch(f.config,f.sources);assert.equal(bundle.notes,2);assert.ok(!bundle.files['public/research/snapshot.json'].includes('origin_job'));assert.equal(JSON.parse(bundle.files['public/research/snapshot.json']).research.interestScores.find((g:{genre:string})=>g.genre==='science').score,1);
  }finally{agenda.close();f.close();}
});

test('metadata polling preserves fetched bodies and an unchanged revisit creates no duplicate generation',async()=>{
  const f=await fixture(),agenda=new ResearchAgenda(f.runtime.database.filePath,f.config.agenda);try{
    await planWeekly(f.config,f.runtime,f.sources,f.transport,now);assert.equal((await f.runtime.tick({schedule:false})).status,'completed');agenda.reconcile(f.sources);
    const original=f.runtime.database.getItemByCanonicalUrl('https://example.org/artemis-1')!;assert.ok(original.content!.includes('20 percent'));
    assert.equal((await exportPublicResearch(f.config,f.sources)).notes,1);
    await planWeekly(f.config,f.runtime,f.sources,f.transport,now+36*3600000);
    assert.equal(Number(agenda.db.prepare('SELECT count(*) n FROM jobs').get()?.n),1);assert.equal(f.runtime.database.getItem(original.id)!.content,original.content);
    f.setBody(2);agenda.db.prepare("UPDATE research_page_cache SET next_at=?").run(new Date(0).toISOString());await planWeekly(f.config,f.runtime,f.sources,f.transport,now+40*3600000);
    const latest=f.runtime.database.getItem(original.id)!;assert.ok(updatedArticle(latest,original));assert.ok(latest.content!.includes('35 percent'));assert.equal(Number(agenda.db.prepare('SELECT count(*) n FROM jobs').get()?.n),2);
    const result=await f.runtime.tick({schedule:false});assert.equal(result.status,'completed',JSON.stringify(result));
    const bundle=await exportPublicResearch(f.config,f.sources);assert.equal(bundle.notes,2);assert.ok(Object.entries(bundle.files).some(([p,v])=>p.endsWith('.json')&&p.includes('/notes/')&&JSON.parse(v).revisionOf));
  }finally{agenda.close();f.close();}
});

test('cross-source numeric differences are candidates, and repeated or same-publisher text never establishes independence',()=>{
  const quote='Artemis radiation shielding measurements reduced astronaut exposure by 20 percent in a controlled instrument experiment.';
  const item={id:'a',sourceId:'science',versionId:'v-a',contentHash:'hash',url:'https://science.example/a',canonicalUrl:'https://science.example/a',title:'Artemis radiation shielding measurements compare astronaut exposure',content:quote,fetchedAt:new Date(now).toISOString(),publishedAt:new Date(now).toISOString()} as StoredItem;
  const claim={id:'c',itemId:'a',versionId:'v-a',text:quote};
  const context={items:[item],claims:[claim,{...claim,id:'unbound',text:'This absent result has been independently proven.'}]} as AnalysisContext;
  const quality={observations:[{claimId:'c',itemId:'a',versionId:'v-a',quote,url:item.url}]} as QualityAnalysis;
  const peer=(id:string,url:string,content:string)=>({...item,id,versionId:`v-${id}`,url,canonicalUrl:url,content});
  const result=verifySourceBindings(context,quality,[peer('copy','https://news.example/b',quote),peer('same','https://sub.science.example/c',quote),peer('conflict','https://other.test/d',quote.replace('20 percent','35 percent'))],now);
  assert.deepEqual(result.unboundClaimIds,['unbound']);assert.equal(result.independentVerification,'unverified');assert.equal(result.claims[0].result,'conflict-candidate');assert.deepEqual(result.claims[0].comparisons.map(c=>c.kind),['syndicated','same-publisher','conflict-candidate']);assert.ok(result.claims[0].comparisons.every(c=>c.independence==='not-established'));
});

test('delivery checks back off at three attempts and verify actual hashes even after a later UI commit',async()=>{
  const f=await fixture();try{
    const bundle={digest:'fixture-delivery',files:{'public/research/snapshot.json':'{"notes":[{"id":"note"}]}','public/research/notes/note.json':'{"id":"note","markdown":"actual"}'}};
    let calls=0;const pending:typeof fetch=async()=>{calls++;return Response.json({branch:'main',target:'github-pages',commit:'later-ui'});};
    assert.equal((await verifyPublicDelivery(f.runtime.database.filePath,bundle,'data-commit',{now,fetch:pending})).status,'retry_wait');const initial=calls;
    await verifyPublicDelivery(f.runtime.database.filePath,bundle,'data-commit',{now:now+1,fetch:pending});assert.equal(calls,initial);
    const good:typeof fetch=async url=>{const p=new URL(String(url)).pathname;return p.endsWith('build-info.json')?Response.json({branch:'main',target:'github-pages',commit:'later-ui'}):new Response(bundle.files[p.endsWith('snapshot.json')?'public/research/snapshot.json':'public/research/notes/note.json']);};
    const success=await verifyPublicDelivery(f.runtime.database.filePath,bundle,'data-commit',{now:now+300001,fetch:good});assert.equal(success.status,'succeeded');assert.equal(success.commit,'later-ui');
    const failed={...bundle,digest:'bounded-failure'};for(let i=0;i<4;i++)await verifyPublicDelivery(f.runtime.database.filePath,failed,'data-commit',{now:now+i*300001,fetch:pending});
    const db=new DatabaseSync(f.runtime.database.filePath);try{assert.equal(db.prepare('SELECT attempts FROM public_delivery_checks WHERE digest=?').get(failed.digest)?.attempts,3);}finally{db.close();}
  }finally{f.close();}
});

test('read-only planning inspection neither creates tables nor changes existing SQLite rows',async()=>{
  const f=await fixture();try{
    const db=new DatabaseSync(f.runtime.database.filePath);try{const before=JSON.stringify(db.prepare('SELECT name FROM sqlite_master ORDER BY name').all());readResearchSummary(f.runtime.database.filePath);assert.equal(JSON.stringify(db.prepare('SELECT name FROM sqlite_master ORDER BY name').all()),before);}finally{db.close();}
  }finally{f.close();}
});

test('a killed final publication or delivery attempt becomes failed after its lease expires',async()=>{
  const f=await fixture();try{
    const bundle={digest:'interrupted-final',files:{'public/research/snapshot.json':'{"notes":[{"id":"a-b"}]}','public/research/notes/a-b.json':'{"id":"a-b","markdown":"actual"}','public/research/notes/a-b.md':'actual'}};
    const db=new DatabaseSync(f.runtime.database.filePath);try{
      db.exec('CREATE TABLE public_publish_state(digest TEXT PRIMARY KEY,attempts INTEGER,next_at TEXT,status TEXT,error TEXT,commit_sha TEXT)');
      db.prepare("INSERT INTO public_publish_state VALUES(?,3,?,'running',NULL,NULL)").run(bundle.digest,new Date(0).toISOString());
      const p=await publishResearch(f.runtime.database.filePath,{enabled:true,repository:'yumirima1/houkago-no-chishikibako',branch:'main'},bundle,Date.now(),{credential:async()=>{throw Error('MUST_NOT_REQUEST_CREDENTIAL');}});assert.equal(p.status,'failed');
      assert.equal(db.prepare('SELECT error FROM public_publish_state').get()?.error,'PUBLICATION_INTERRUPTED');
      await verifyPublicDelivery(f.runtime.database.filePath,bundle,'commit',{fetch:async()=>new Response('',{status:503})});
      db.exec("UPDATE public_delivery_checks SET attempts=3,status='running'");
      const d=await verifyPublicDelivery(f.runtime.database.filePath,bundle,'commit',{fetch:async()=>{throw Error('MUST_NOT_REQUEST_NETWORK');}});assert.equal(d.status,'failed');assert.equal(d.attempts,3);
      assert.equal(db.prepare('SELECT error FROM public_delivery_checks').get()?.error,'PUBLIC_DELIVERY_INTERRUPTED');
    }finally{db.close();}
  }finally{f.close();}
});
