import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {parseWeeklyOperation,weeklySlots,operationEnd} from '../../src/lib/kousatsu/weekly-config';
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
const publicBundle=(digest:string)=>({digest,files:{'public/research/snapshot.json':JSON.stringify({notes:[{id:'a-b'}]}),'public/research/notes/a-b.json':JSON.stringify({id:'a-b',markdown:'# Saved research'}),'public/research/notes/a-b.md':'# Saved research'}});
test('novel research ideas do not select the literary adaptation lens and publication cannot address private files',async()=>{
 assert.doesNotMatch(reflectionQuestion('LitPivot develops novel research ideas','Participants rated ideas as more novel and useful'),/作品|媒体|映像/);
 await assert.rejects(publishResearch('unused.sqlite',{enabled:true,repository:'yumirima1/houkago-no-chishikibako',branch:'main'},{digest:'test',files:{'Memory/kousatsu.sqlite':'private'}}),/PATH_REJECTED/);
});
test('JST slots retain the mandatory 18:00 slot, catch up once on first startup and never exceed three per date',()=>{
 const slots=weeklySlots(op());assert.equal(slots[0].day,'2026-10-26@18:00');
 for(const date of new Set(slots.map(s=>s.day.slice(0,10))))assert.ok(slots.filter(s=>s.day.startsWith(date)).length<=3);
 assert.ok(slots.every(s=>Date.parse(s.dueAt)<operationEnd(op())));
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
 // Diagnostics belong to the private checkpoint, including when a model reports
 // its runner's local path. Public status exposes the failure without the log.
 const diagnostic=new DatabaseSync(f.runtime.database.filePath);try{
   const row=diagnostic.prepare("SELECT job_id,data_json FROM checkpoints WHERE stage='analyze'").get()!,analysis=JSON.parse(String(row.data_json));
   analysis.research.model.error='PRIVATE_RUNNER_DIAGNOSTIC D:/private-runner';
   diagnostic.prepare("UPDATE checkpoints SET data_json=? WHERE job_id=? AND stage='analyze'").run(JSON.stringify(analysis),row.job_id);
 }finally{diagnostic.close();}
 // Use the same DB path in the public projection while preserving the fixture's notes.
 const publicConfig={...f.config,dataDirectory:path.join(f.directory,'public-store')};await mkdir(path.join(publicConfig.dataDirectory,'Memory'),{recursive:true});
 await f.runtime.database.backupTo(path.join(publicConfig.dataDirectory,'Memory','kousatsu.sqlite'));
 const bundle=await exportPublicResearch(publicConfig,f.sources);assert.equal(bundle.notes,1);
 const json=bundle.files['public/research/snapshot.json'];assert.ok(!json.includes(f.directory.replaceAll('\\','\\\\')));assert.ok(!json.includes('Evaluation requires comparing measurements'.repeat(2)));
 assert.ok(!JSON.stringify(bundle.files).includes('PRIVATE_RUNNER_DIAGNOSTIC'));assert.ok(!JSON.stringify(bundle.files).includes('D:/private-runner'));
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

test('all distinct eligible historical notes are exported beyond the old three-note cap; repeated exports retain their identity',async()=>{
 const f=await fixture();try{
 let edition=0;
 const titles=['','Agent evaluation reveals deployment limits','Laptop repair design reduces component waste','Satellite observation identifies changing ocean current patterns','Museum collection preserves handwritten historical letters','Energy storage compares industrial battery recycling techniques'];
 const transport:typeof fetchFeed=async(url,options)=>{
   const result=await f.transport(url,options);
   return {...result,text:result.text.replaceAll('Agent evaluation reveals deployment limits',titles[edition]).replaceAll('/agent',`/agent-${edition}`).replaceAll('Laptop repair design reduces component waste',titles[edition]).replaceAll('/laptop',`/laptop-${edition}`).replaceAll('engineering methods',`engineering methods for edition ${edition}`)};
 };
 const slots=weeklySlots(op()).slice(0,5);
 for(const slot of slots){edition++;await planWeekly(f.config,f.runtime,f.sources,transport,Math.max(at,Date.parse(slot.dueAt)));const tick=await f.runtime.tick({schedule:false,queuePrefix:`weekly:${op().id}:`});assert.equal(tick.status,'completed',slot.day+': '+JSON.stringify(tick));}
 const config={...f.config,dataDirectory:path.join(f.directory,'historical-store')};await mkdir(path.join(config.dataDirectory,'Memory'),{recursive:true});
 const file=path.join(config.dataDirectory,'Memory','kousatsu.sqlite');await f.runtime.database.backupTo(file);
 const db=new DatabaseSync(file);try{db.exec('DELETE FROM weekly_articles');}finally{db.close();}
 const first=await exportPublicResearch(config,f.sources);assert.equal(first.notes,5);
 const repeated=await exportPublicResearch(config,f.sources);assert.equal(repeated.digest,first.digest);
 assert.equal(new Set(JSON.parse(first.files['public/research/snapshot.json']).notes.map((n:{id:string})=>n.id)).size,5);
 }finally{f.close();}
});
test('expiry enqueues nothing, missed previous days remain visible, and repeated process failures stop after three attempts',async()=>{
 const f=await fixture();const store=new WeeklyStore(f.runtime.database.filePath);try{
 store.register(op(),at);const due=store.due(op(),at)!;
 for(let n=0;n<3;n++){store.begin(op(),due.day,at+n*61000);store.fail(op(),due.day,'injected failure',at+n*61000);}
 assert.equal(store.snapshot(op(),at+180000).days[0].state,'failed');
 assert.equal(store.due(op(),operationEnd(op())),null);
 store.due(op(),at+86400000);assert.ok(store.snapshot(op(),at+86400000).days.some(d=>d.state==='missed'));
 await planWeekly(f.config,f.runtime,f.sources,f.transport,operationEnd(op()));assert.equal(store.db.prepare('SELECT count(*) n FROM jobs').get()?.n,0);
 }finally{store.close();f.close();}
});
test('publication failure backs off, stops at three attempts and never logs a credential',async()=>{
 const f=await fixture(),db=new DatabaseSync(f.runtime.database.filePath);try{
 db.exec('CREATE TABLE public_publish_state(digest TEXT PRIMARY KEY,attempts INTEGER,next_at TEXT,status TEXT,error TEXT,commit_sha TEXT)');
 let requests=0;const adapters={credential:async()=>'fixture-secret',fetch:async()=>{requests++;return new Response('{}',{status:503});}};
 const bundle=publicBundle('immutable-fixture'),pub={enabled:true,repository:'yumirima1/houkago-no-chishikibako' as const,branch:'main'};
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
   if(p.includes('/contents/'))return new Response('{}',{status:404});
   if(options?.method==='PATCH'){assert.equal(JSON.parse(String(options.body)).force,false);return new Response('{}',{status:422});}
   const value=p.includes('/git/ref/')?{object:{sha:'base'}}:p.endsWith('/git/commits/base')?{tree:{sha:'base-tree'}}:p.endsWith('/git/trees')?{sha:'new-tree'}:{sha:'blob-or-commit'};
   return Response.json(value);
 }};
 const result=await publishResearch(f.runtime.database.filePath,{enabled:true,repository:'yumirima1/houkago-no-chishikibako',branch:'main'},publicBundle('race'),at,adapters);
 assert.equal(result.status,'retry_wait');assert.match(String(result.error),/422/);
 }finally{db.close();f.close();}
});

test('empty or incomplete exports cannot replace a public archive',async()=>{
 const pub={enabled:true,repository:'yumirima1/houkago-no-chishikibako' as const,branch:'main'};
 await assert.rejects(publishResearch('unused',pub,{digest:'empty',files:{'public/research/snapshot.json':'{"notes":[]}'}}),/EMPTY_ARCHIVE/);
 const bundle=publicBundle('missing');delete (bundle.files as Record<string,string>)['public/research/notes/a-b.md'];
 await assert.rejects(publishResearch('unused',pub,bundle),/NOTE_MISSING/);
 const f=await fixture();try{
   const config={...f.config,dataDirectory:path.join(f.directory,'empty-store')};await mkdir(path.join(config.dataDirectory,'Memory'),{recursive:true});
   await f.runtime.database.backupTo(path.join(config.dataDirectory,'Memory','kousatsu.sqlite'));
   await assert.rejects(exportPublicResearch(config,f.sources),/PUBLIC_EXPORT_EMPTY/);
 }finally{f.close();}
});

test('a stale archive cannot drop remote notes and simultaneous publishers share a lease',async()=>{
 const f=await fixture(),db=new DatabaseSync(f.runtime.database.filePath);try{
 db.exec('CREATE TABLE public_publish_state(digest TEXT PRIMARY KEY,attempts INTEGER,next_at TEXT,status TEXT,error TEXT,commit_sha TEXT)');
 let entered!:()=>void,release!:()=>void;
 const started=new Promise<void>(resolve=>entered=resolve),held=new Promise<void>(resolve=>release=resolve);
 const pub={enabled:true,repository:'yumirima1/houkago-no-chishikibako' as const,branch:'main'};
 const adapters={credential:async()=>{entered();await held;return 'fixture-secret';},fetch:async(url:Parameters<typeof fetch>[0],options?:Parameters<typeof fetch>[1])=>{
   assert.ok(!options?.method||options.method==='GET','stale data must never write remote objects');
   const p=new URL(String(url)).pathname;
   return Response.json(p.includes('/contents/')?{content:Buffer.from('{"notes":[{"id":"newer"}]}').toString('base64')}:p.includes('/git/ref/')?{object:{sha:'base'}}:{tree:{sha:'tree'}});
 }};
 const first=publishResearch(f.runtime.database.filePath,pub,publicBundle('stale'),at,adapters);await started;
 assert.equal((await publishResearch(f.runtime.database.filePath,pub,publicBundle('other'),at,adapters)).status,'busy');
 release();const result=await first;assert.match(String(result.error),/STALE_ARCHIVE/);
 assert.equal(db.prepare('SELECT count(*) n FROM public_publish_lease').get()?.n,0);
 }finally{db.close();f.close();}
});
