import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, {type TestContext} from 'node:test';
import { DeterministicProvider, OllamaProvider, type KousatsuAiProvider } from '../../src/lib/kousatsu/ai';
import { parseAutonomousConfig } from '../../src/lib/kousatsu/autonomous-config';
import { runAutonomousCycle } from '../../src/lib/kousatsu/autonomous-service';
import { checkCapacity, ensureDataDirectories, exportKnowledge } from '../../src/lib/kousatsu/knowledge-export';
import { fetchFeed } from '../../src/lib/kousatsu/ingest';
import { ResearchRuntime } from '../../src/lib/kousatsu/runtime-service';
import { ResearchEngine, selectResearchTopic, TopicHistory } from '../../src/lib/kousatsu/research-engine';

async function setup(t: TestContext, provider: KousatsuAiProvider=new DeterministicProvider()) {
  const dir=await mkdtemp(path.resolve('tmp/autonomous-test-'));
  const config=parseAutonomousConfig({dataDirectory:dir,sourcesPath:path.join(dir,'sources.json'),ai:{provider:'deterministic'},minFreeMiB:1});
  await writeFile(config.sourcesPath,'{"sources":[]}');
  const paths=await ensureDataDirectories(config);
  const history = new TopicHistory(paths.database);
  const runtime=await ResearchRuntime.open({databasePath:paths.database,outputDirectory:paths.notes,sources:[],
    providerForJob:jobId=>new ResearchEngine({jobId,database:runtime.database,history,provider,exploration:0.5}),
  });
  t.after(async()=>{history.close();runtime.close();await rm(dir,{recursive:true,force:true});});
  const fixture=path.join(dir,'fixture.xml');
  await writeFile(fixture,await readFile('tests/fixtures/kousatsu-sample.rss.xml'));
  const input={fixturePath:fixture,source:{id:'isolated',name:'Fixture',feedUrl:'https://example.invalid/feed'},topic:'AI検証'};
  return {dir,config,paths,history,runtime,input,fixture};
}

test('autonomous topic selection explores event questions while avoiding recent repeats',()=>{
  const context={items:[{title:'Climate forests science research'}],claims:[],relations:[],topic:'自然'} as unknown as Parameters<typeof selectResearchTopic>[0];
  const first=selectResearchTopic(context,[],1,0.1);
  const second=selectResearchTopic(context,[first.topic],1,0.1);
  assert.notEqual(first.topic,second.topic);assert(first.candidates.includes(first.topic));assert.match(first.reason,/探索抽選/);
  assert.deepEqual(first,selectResearchTopic(context,[],1,0.1));
});

test('versioned knowledge exports repair missing files, preserve manual edits and remain stable on subsequent collection',async t=>{
  const f=await setup(t);
  f.runtime.enqueueInput(f.input);
  assert.equal((await f.runtime.tick({schedule:false})).status,'completed');
  const initial=await exportKnowledge(f.config,f.history);
  assert(initial.repaired>0);assert.equal(initial.conflicts.length,0);
  const document=f.history.artifacts().find(a=>a.path.startsWith(f.paths.articles))!;
  // Insufficient feed evidence must not force a hypothesis merely to test exports.
  const hypothesis=f.history.artifacts().find(a=>a.path.startsWith(f.paths.memory))!;
  await unlink(document.path);await writeFile(hypothesis.path,'手動編集された仮説');
  const restored=await exportKnowledge(f.config,f.history);
  assert.equal(restored.repaired,1);assert.deepEqual(restored.conflicts,[hypothesis.path]);
  assert.equal(await readFile(document.path,'utf8'),document.contents);
  assert.equal(await readFile(hypothesis.path,'utf8'),'手動編集された仮説');
  f.runtime.enqueueInput(f.input);await f.runtime.tick({schedule:false});
  assert.deepEqual((await exportKnowledge(f.config,f.history)).conflicts,[hypothesis.path]);
  const db=new DatabaseSync(f.paths.database,{readOnly:true});
  try {assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);}
  finally {db.close();}
});

test('revised source evidence appends a correction history and excludes superseded memory without deleting its text',async t=>{
  const f=await setup(t);
  f.runtime.enqueueInput(f.input);await f.runtime.tick({schedule:false});
  const previous=f.runtime.store.retrieveMemories(f.input.topic);
  assert(previous.length>0);
  const text=await readFile(f.fixture,'utf8');
  await writeFile(f.fixture,text.replace('AI検証の記録を保存する','改訂されたAI検証の記録'));
  f.runtime.enqueueInput(f.input);assert.equal((await f.runtime.tick({schedule:false})).status,'completed');
  const db=new DatabaseSync(f.paths.database,{readOnly:true});
  try {
    const revised=db.prepare('SELECT * FROM research_memory_revisions').all();assert(revised.length>0);
    for(const r of revised) {
      assert.match(String(r.reason),/誤り・反証成立は未確認/);
      assert(!f.runtime.store.retrieveMemories(f.input.topic).some(m=>m.id===r.old_memory_id));
      assert(db.prepare('SELECT text FROM research_memory_events WHERE id=?').get(String(r.old_memory_id)));
    }
  } finally {db.close();}
  await exportKnowledge(f.config,f.history);
  assert((await readdir(f.paths.hypotheses)).some(file=>file.startsWith('revision-')));
});

test('Ollama outage falls back, persists timing/error, and the same provider succeeds after recovery',async t=>{
  let healthy=false;
  const server=createServer((req,res)=>{req.resume();res.setHeader('content-type','application/json');if(!healthy){res.statusCode=503;res.end('{}');return;}
    res.end(JSON.stringify({response:JSON.stringify({observations:[],conclusions:[],hypotheses:[]})}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const address=server.address();assert(address && typeof address!=='string');
  const provider=new OllamaProvider({endpoint:`http://127.0.0.1:${address.port}`,model:'fixture-model',timeoutMs:1000});
  const f=await setup(t,provider);
  const first=f.runtime.enqueueInput(f.input);assert.equal((await f.runtime.tick({schedule:false})).status,'completed');
  const failed=f.runtime.database.getCheckpoint<import('../../src/lib/kousatsu/types').AnalysisResult>(first,'analyze')!;
  assert.equal(failed.provider,'deterministic');assert.match(failed.research!.model.error!,/503/);assert(failed.research!.model.elapsedMs>=0);
  healthy=true;
  const second=f.runtime.enqueueInput(f.input);assert.equal((await f.runtime.tick({schedule:false})).status,'completed');
  assert.equal(f.runtime.database.getCheckpoint<{provider:string}>(second,'analyze')?.provider,'ollama');
  assert.equal(f.runtime.snapshot().notes.length,2);
});

for(const output of ['not JSON','{"summary":"text","hypotheses":[]}',JSON.stringify({summary:'https://fabricated.invalid/source',hypotheses:[{text:'x',rationale:'y'}]})]) {
  test(`invalid model output is rejected: ${output.slice(0,35)}`,async t=>{
    const server=createServer((req,res)=>{req.resume();res.setHeader('content-type','application/json');res.end(JSON.stringify({response:output}));});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
    const address=server.address();assert(address && typeof address!=='string');
    await assert.rejects(new OllamaProvider({endpoint:`http://127.0.0.1:${address.port}`,model:'fixture',timeoutMs:1000}).analyze({topic:'a',claims:[],items:[],relations:[]}));
  });
}

test('model timeout aborts the request instead of hanging the queue',async t=>{
  const server=createServer(req=>req.resume());
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const address=server.address();assert(address && typeof address!=='string');
  await assert.rejects(new OllamaProvider({endpoint:`http://127.0.0.1:${address.port}`,model:'fixture',timeoutMs:50}).analyze({topic:'a',claims:[],items:[],relations:[]}),/timeout|abort/i);
  server.closeAllConnections();
});

test('supervisor leases exclude multiple launches and recover after expiration without overwriting another owner',async t=>{
  const f=await setup(t);const now=Date.now();
  const first=f.history.acquireSupervisor(now)!;assert(first);
  assert.equal(f.history.acquireSupervisor(now+1000),null);
  const second=f.history.acquireSupervisor(now+90001)!;assert(second);
  f.history.releaseSupervisor(first);
  assert.throws(()=>f.history.renewSupervisor(first),/LEASE_LOST/);
  assert.equal(f.history.acquireSupervisor(now+90002),null);
  f.history.releaseSupervisor(second);
});

test('network failures persist source fetch history and terminate at the job retry limit',async t=>{
  const f=await setup(t);
  const job=f.runtime.enqueueInput({...f.input,fixturePath:undefined,maxAttempts:2,source:{...f.input.source,feedUrl:'http://127.0.0.1:1/private'}});
  assert.equal((await f.runtime.tick({schedule:false})).status,'retry_wait');
  f.runtime.store.retry(job);assert.equal((await f.runtime.tick({schedule:false})).status,'blocked');
  assert.equal(f.runtime.database.getJob(job)?.attempts,2);
  const db=new DatabaseSync(f.paths.database,{readOnly:true});
  try {assert.equal(db.prepare("SELECT count(*) AS n FROM fetch_runs WHERE status='failed'").get()?.n,2);}
  finally {db.close();}
  assert.throws(()=>f.runtime.store.retry(job),/JOB_NOT_RETRYABLE/);
});

test('capacity guards stop new collection, and SQLite backups never overwrite an existing backup',async t=>{
  const f=await setup(t);const backup=path.join(f.paths.backups,'kept.sqlite');
  await f.runtime.database.backupTo(backup);const bytes=await readFile(backup);
  await assert.rejects(f.runtime.database.backupTo(backup),/EEXIST/);assert.deepEqual(await readFile(backup),bytes);
  await assert.rejects(checkCapacity({...f.config,maxKnowledgeFiles:1},1),/CAPACITY_LIMIT/);
  f.runtime.enqueueInput(f.input);await f.runtime.tick({schedule:false});
  const result=await runAutonomousCycle({...f.config,maxJobsPerDay:1});
  assert.equal(result.status,'succeeded');assert.equal(f.runtime.database.getCounts().jobs,1);
});

test('a killed writer rolls back its uncommitted DB transaction',async t=>{
  const f=await setup(t);const childFile=path.join(f.dir,'crash.cjs');
  const raw=new DatabaseSync(f.paths.database);raw.exec('CREATE TABLE crash_fixture(value TEXT)');raw.close();
  await writeFile(childFile,`const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(${JSON.stringify(f.paths.database)});db.exec("BEGIN IMMEDIATE; INSERT INTO crash_fixture VALUES('uncommitted')");process.send('uncommitted');setInterval(()=>{},1000);`);
  const child=fork(childFile,[],{silent:true});t.after(()=>{if(child.exitCode===null)child.kill();});
  await once(child,'message');const exited=once(child,'exit');child.kill();await exited;
  const db=new DatabaseSync(f.paths.database);try {assert.equal(db.prepare('SELECT count(*) AS n FROM crash_fixture').get()?.n,0);assert.equal(db.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');}finally{db.close();}
});

test('feed allowlist rejects an unconfigured public redirect before connecting',async()=>{
  let calls=0;
  await assert.rejects(fetchFeed('https://93.184.216.34/rss',{allowedHosts:['93.184.216.34'],retries:0,fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://93.184.216.35/unconfigured'}});}}),/HOST_NOT_ALLOWED/);
  assert.equal(calls,1);
});

test('malformed feed failures retain completed fetch diagnostics after the collection transaction rolls back',async t=>{
  const f=await setup(t);await writeFile(f.fixture,'<unrecognized/>');
  f.runtime.enqueueInput(f.input);assert.equal((await f.runtime.tick({schedule:false})).status,'retry_wait');
  const db=new DatabaseSync(f.paths.database,{readOnly:true});
  try {assert.equal(db.prepare('SELECT status FROM fetch_runs').get()?.status,'failed');assert.equal(db.prepare('SELECT count(*) AS n FROM items').get()?.n,0);}finally{db.close();}
});

test('a transient Ollama runner failure retries once within the inference deadline',async t=>{
  let calls=0;
  const server=createServer((req,res)=>{req.resume();res.setHeader('content-type','application/json');
    if(++calls===1){res.statusCode=500;res.end('{"error":"runner restarting"}');return;}
    res.end(JSON.stringify({response:JSON.stringify({observations:[],conclusions:[],hypotheses:[]})}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const address=server.address();assert(address && typeof address!=='string');
  const result=await new OllamaProvider({endpoint:`http://127.0.0.1:${address.port}`,model:'fixture',timeoutMs:2000}).analyze({topic:'a',items:[],claims:[],relations:[]});
  assert.equal(result.provider,'ollama');assert.equal(calls,2);
});
