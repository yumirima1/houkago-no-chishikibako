import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {parseWeeklyOperation,weeklySlots} from '../../src/lib/kousatsu/weekly-config';
import {WeeklyStore,sameArticle} from '../../src/lib/kousatsu/weekly-store';
import {planWeekly} from '../../src/lib/kousatsu/weekly-service';
import {parseAutonomousConfig} from '../../src/lib/kousatsu/autonomous-config';
import {ResearchRuntime} from '../../src/lib/kousatsu/runtime-service';
import {ResearchEngine,TopicHistory} from '../../src/lib/kousatsu/research-engine';
import {DeterministicProvider} from '../../src/lib/kousatsu/ai';
import {exportPublicResearch} from '../../src/lib/kousatsu/public-export';
import {parseResearchSources} from '../../src/lib/kousatsu/runtime-config';
import {reflectionQuestion} from '../../src/lib/kousatsu/reflection';
import {publishResearch} from '../../src/lib/kousatsu/public-publisher';
import type {fetchFeed} from '../../src/lib/kousatsu/ingest';
import {DatabaseSync} from 'node:sqlite';
const op=()=>parseWeeklyOperation({id:'fixture-week',startsAt:'2026-10-26T20:00:00+09:00',endsAt:'2026-11-02T20:00:00+09:00',runTimes:['06:00','18:00','22:00'],maxArticles:1,genres:['ai','pc']});
const at=Date.parse('2026-10-26T20:01:00+09:00');
test('novel research ideas do not select the literary adaptation lens and publication cannot address private files',async()=>{
 assert.doesNotMatch(reflectionQuestion('LitPivot develops novel research ideas','Participants rated ideas as more novel and useful'),/作品|媒体|映像/);
 await assert.rejects(publishResearch('unused.sqlite',{enabled:true,repository:'yumirima1/houkago-no-chishikibako',branch:'main'},{digest:'test',files:{'Memory/kousatsu.sqlite':'private'}}),/PATH_REJECTED/);
});
test('JST slots retain the mandatory 18:00 slot, catch up once on first startup and never exceed three per date',()=>{
 const slots=weeklySlots(op());assert.equal(slots[0].day,'2026-10-26@18:00');
 for(const date of new Set(slots.map(s=>s.day.slice(0,10))))assert.ok(slots.filter(s=>s.day.startsWith(date)).length<=3);
 assert.ok(slots.every(s=>Date.parse(s.dueAt)<Date.parse(op().endsAt)));
 assert.throws(()=>parseWeeklyOperation({...op(),runTimes:['06:00','22:00']}),/18:00/);
 assert.throws(()=>parseWeeklyOperation({...op(),runTimes:['06:00','12:00','18:00','22:00']}));
});
test('URL aliases, normalized headlines, and identical substantial body text are duplicate articles',()=>{
 const a={canonicalUrl:'https://example.org/a',title:'Research reveals major battery lifetime improvement',content:'Long research results '.repeat(20)};
 assert.ok(sameArticle(a,{...a,canonicalUrl:'https://example.org/b'}));
 assert.ok(sameArticle(a,{...a,canonicalUrl:'https://example.org/b',title:'Other headline'}));
 assert.equal(sameArticle(a,{canonicalUrl:'https://example.org/c',title:'Cultural archive preserves rare handwritten letters',content:'Different content '.repeat(20)}),false);
});
async function fixture(){
 await mkdir('tmp',{recursive:true});const directory=await mkdtemp(path.resolve('tmp','weekly-test-'));
 const sources=parseResearchSources({sources:['ai','pc'].map(genre=>({id:genre,name:genre,genre,feedUrl:`https://example.org/${genre}.xml`,topic:genre,enabled:true,intervalMinutes:1440,contentPolicy:'metadata-only',articlePolicy:{enabled:true,allowedHosts:['example.org'],maxArticles:1,cacheMinutes:1440,followLinks:0}}))});
 const config=parseAutonomousConfig({dataDirectory:directory,operation:op(),sourcesPath:path.join(directory,'sources.json'),ai:{provider:'deterministic'}},process.cwd());
 const runtime=await ResearchRuntime.open({databasePath:path.join(directory,'database.sqlite'),outputDirectory:path.join(directory,'Notes'),sources,providerForJob:jobId=>new ResearchEngine({jobId,history,database:runtime.database,provider:new DeterministicProvider(),exploration:0})});
 const history=new TopicHistory(runtime.database.filePath);
 const transport:typeof fetchFeed=async(url)=>({text:url.endsWith('robots.txt')?'User-agent: *\nAllow: /':url.endsWith('.xml')?`<rss version="2.0"><channel><title>test</title><item><title>${url.includes('/ai')?'Agent evaluation reveals deployment limits':'Laptop repair design reduces component waste'}</title><link>https://example.org/${url.includes('/ai')?'agent':'laptop'}</link></item></channel></rss>`:`<html><head><title>Fixture research</title></head><body><article><p>Researchers reported a controlled test of engineering methods and observed different outcomes across deployment conditions. This does not independently confirm general effects outside the experiment.</p><p>${'Evaluation requires comparing measurements, alternative explanations and implementation costs. '.repeat(8)}</p></article></body></html>`,httpStatus:200,contentType:url.endsWith('.xml')?'application/rss+xml':'text/html'});
 return {directory,config,sources,runtime,history,transport,close(){history.close();runtime.close();}};
}
test('a daily slot creates one durable per-article job; duplicate planning and an outbox receipt crash do not duplicate it',async()=>{
 const f=await fixture();try{
 await planWeekly(f.config,f.runtime,f.sources,f.transport,at);const store=new WeeklyStore(f.runtime.database.filePath);
 try{
 const row=store.db.prepare('SELECT job_id FROM weekly_articles').get()!;const id=String(row.job_id);
 assert.equal(store.db.prepare('SELECT count(*) n FROM jobs').get()?.n,1);
 store.db.prepare('UPDATE weekly_articles SET job_id=NULL').run();
 await planWeekly(f.config,f.runtime,f.sources,f.transport,at+1);
 assert.equal(store.db.prepare('SELECT job_id FROM weekly_articles').get()?.job_id,id);
 assert.equal(store.db.prepare('SELECT count(*) n FROM jobs').get()?.n,1);
 const queued=f.runtime.database.getJob(id)!;assert.ok(queued.input.articleRef);assert.equal(queued.input.fixturePath,undefined);
 }finally{store.close();}
 }finally{f.close();}
});
test('a stored article reaches a readable note with source bindings; the public projection excludes raw bodies and local paths',async()=>{
 const f=await fixture();try{
 await planWeekly(f.config,f.runtime,f.sources,f.transport,at);
 const result=await f.runtime.tick({schedule:false,queuePrefix:`weekly:${op().id}:`});assert.equal(result.status,'completed');
 assert.ok(result.status==='completed');assert.equal(result.result.collectedCount,1);
 assert.ok((await readFile(result.result.articlePath!,'utf8')).includes('見解'));
 // Use the same DB path in the public projection while preserving the fixture's notes.
 const publicConfig={...f.config,dataDirectory:path.join(f.directory,'public-store')};await mkdir(path.join(publicConfig.dataDirectory,'Memory'),{recursive:true});
 await f.runtime.database.backupTo(path.join(publicConfig.dataDirectory,'Memory','kousatsu.sqlite'));
 const bundle=await exportPublicResearch(publicConfig,f.sources);assert.equal(bundle.notes,1);
 const json=bundle.files['public/research/snapshot.json'];assert.ok(!json.includes(f.directory.replaceAll('\\','\\\\')));assert.ok(!json.includes('Evaluation requires comparing measurements'.repeat(2)));
 assert.ok(Object.keys(bundle.files).every(p=>p.startsWith('public/research/')));
 const note=Object.entries(bundle.files).find(([p])=>p.endsWith('.md'))![1];assert.match(note,/推論/);assert.match(note,/修正する条件/);assert.ok(!note.includes('Evaluation requires comparing measurements'.repeat(2)));
 }finally{f.close();}
});
test('one feed failure leaves the other genre runnable and records the actual failure',async()=>{
 const f=await fixture();try{
 const broken:typeof fetchFeed=async(url,options)=>{if(url.endsWith('/ai.xml'))throw Error('NETWORK_FIXTURE_FAILURE');return f.transport(url,options);};
 await planWeekly(f.config,f.runtime,f.sources,broken,at);const store=new WeeklyStore(f.runtime.database.filePath);
 try{const state=store.snapshot(op(),at);assert.equal(state.days[0].articles[0].genre,'pc');assert.ok(JSON.stringify(state.days[0].collection).includes('NETWORK_FIXTURE_FAILURE'));}finally{store.close();}
 }finally{f.close();}
});
test('expiry enqueues nothing, missed previous days remain visible, and repeated process failures stop after three attempts',async()=>{
 const f=await fixture();const store=new WeeklyStore(f.runtime.database.filePath);try{
 store.register(op(),at);const due=store.due(op(),at)!;
 for(let n=0;n<3;n++){store.begin(op(),due.day,at+n*61000);store.fail(op(),due.day,'injected failure',at+n*61000);}
 assert.equal(store.snapshot(op(),at+180000).days[0].state,'failed');
 assert.equal(store.due(op(),Date.parse(op().endsAt)),null);
 store.due(op(),at+86400000);assert.ok(store.snapshot(op(),at+86400000).days.some(d=>d.state==='missed'));
 await planWeekly(f.config,f.runtime,f.sources,f.transport,Date.parse(op().endsAt));assert.equal(store.db.prepare('SELECT count(*) n FROM jobs').get()?.n,0);
 }finally{store.close();f.close();}
});
test('publication failure backs off, stops at three attempts and never logs a credential',async()=>{
 const f=await fixture(),db=new DatabaseSync(f.runtime.database.filePath);try{
 db.exec('CREATE TABLE public_publish_state(digest TEXT PRIMARY KEY,attempts INTEGER,next_at TEXT,status TEXT,error TEXT,commit_sha TEXT)');
 let requests=0;const adapters={credential:async()=>'fixture-secret',fetch:async()=>{requests++;return new Response('{}',{status:503});}};
 const bundle={digest:'immutable-fixture',files:{'public/research/snapshot.json':'{}'}},pub={enabled:true,repository:'yumirima1/houkago-no-chishikibako' as const,branch:'main'};
 await publishResearch(f.runtime.database.filePath,pub,bundle,at,adapters);await publishResearch(f.runtime.database.filePath,pub,bundle,at+1,adapters);assert.equal(requests,1);
 await publishResearch(f.runtime.database.filePath,pub,bundle,at+301000,adapters);await publishResearch(f.runtime.database.filePath,pub,bundle,at+602000,adapters);await publishResearch(f.runtime.database.filePath,pub,bundle,at+903000,adapters);
 assert.equal(requests,3);const row=db.prepare('SELECT * FROM public_publish_state').get()!;assert.equal(row.status,'failed');assert.ok(!String(row.error).includes('fixture-secret'));
 }finally{db.close();f.close();}
});
test('public Git updates are fast-forward only and a concurrent push remains a visible retry',async()=>{
 const f=await fixture(),db=new DatabaseSync(f.runtime.database.filePath);try{
 db.exec('CREATE TABLE public_publish_state(digest TEXT PRIMARY KEY,attempts INTEGER,next_at TEXT,status TEXT,error TEXT,commit_sha TEXT)');
 const adapters={credential:async()=>'fixture-secret',fetch:async(url:Parameters<typeof fetch>[0],options?:Parameters<typeof fetch>[1])=>{
   const p=new URL(String(url)).pathname;
   if(options?.method==='PATCH'){assert.equal(JSON.parse(String(options.body)).force,false);return new Response('{}',{status:422});}
   const value=p.includes('/git/ref/')?{object:{sha:'base'}}:p.endsWith('/git/commits/base')?{tree:{sha:'base-tree'}}:p.endsWith('/git/trees')?{sha:'new-tree'}:{sha:'blob-or-commit'};
   return Response.json(value);
 }};
 const result=await publishResearch(f.runtime.database.filePath,{enabled:true,repository:'yumirima1/houkago-no-chishikibako',branch:'main'},{digest:'race',files:{'public/research/snapshot.json':'{}'}},at,adapters);
 assert.equal(result.status,'retry_wait');assert.match(String(result.error),/422/);
 }finally{db.close();f.close();}
});
