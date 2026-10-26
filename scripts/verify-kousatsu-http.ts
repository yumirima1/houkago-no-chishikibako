import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { ResearchRuntime } from '../src/lib/kousatsu/runtime-service';

async function main() {
  const projectDirectory=process.argv[2]==='--project' && process.argv[3] ? path.resolve(process.argv[3]) : process.cwd();
  const directory=await mkdtemp(path.resolve('tmp/backend-http-'));
  const databasePath=path.join(directory,'http.sqlite'),outputDirectory=path.join(directory,'Notes'),sources=path.join(directory,'sources.json');
  await writeFile(sources,'{"sources":[]}');
  const listener=net.createServer();await new Promise<void>(resolve=>listener.listen(0,'127.0.0.1',resolve));
  const address=listener.address();assert(address && typeof address!=='string');
  const port=address.port;await new Promise<void>(resolve=>listener.close(()=>resolve()));
  const base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{
    cwd:projectDirectory,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',
      KOUSATSU_LOCAL_ENABLED:'1',KOUSATSU_AI_PROVIDER:'deterministic',KOUSATSU_DB_PATH:databasePath,
      KOUSATSU_OUTPUT_DIRECTORY:outputDirectory,KOUSATSU_SOURCES_PATH:sources},
  });
  let logs='';child.stdout.on('data',v=>logs+=v);child.stderr.on('data',v=>logs+=v);
  const checks: string[]=[];
  const checked=(name:string)=>{checks.push(name);console.log(name);};
  const get=(suffix='')=>fetch(base+'/api/kousatsu'+suffix,{signal:AbortSignal.timeout(15000)});
  const post=(body:unknown,origin=base)=>fetch(base+'/api/kousatsu',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  let error: string|undefined;
  try {
    for(let i=0;i<100;i++) {try {if ((await get()).ok) break;} catch{} if(child.exitCode!==null || i===99) throw new Error('SERVER_DID_NOT_START');await new Promise(r=>setTimeout(r,100));}
    assert.equal((await(await get()).json()).initialized,false);assert(!existsSync(databasePath));checked('GET creates no DB');
    assert.equal((await post({action:'initialize'},'https://other.invalid')).status,403);assert(!existsSync(databasePath));checked('cross-origin rejected before DB creation');
    assert.equal((await post({action:'initialize'})).status,200);checked('HTTP initialization');
    assert.equal((await post({action:'enqueue',sourceId:'not-configured'})).status,400);checked('unknown source rejected');
    assert.equal((await post({action:'enqueue',sourceId:'x',fixturePath:'outside'})).status,400);checked('HTTP cannot inject local fixture paths');
    const runtime=await ResearchRuntime.open({databasePath,outputDirectory,sources:[]});
    const jobId=runtime.enqueueInput({topic:'AI検証',fixturePath:path.resolve('tests/fixtures/kousatsu-sample.rss.xml'),source:{id:'http-fixture',name:'Isolated HTTP fixture',feedUrl:'https://example.invalid/feed'}});runtime.close();
    const result=await(await post({action:'tick'})).json();assert.equal(result.status,'completed',JSON.stringify(result));checked('compiled production API processes durable queue');
    const noteUrl=`?note=${result.result.articleId}`;const original=await readFile(result.result.articlePath,'utf8');
    assert.equal((await(await get(noteUrl)).json()).markdown,original);checked('SQLite canonical note equals D-drive Markdown');
    assert.equal((await(await get(noteUrl)).json()).verification.factCheckStatus,'unverified');checked('independent fact check stays unverified');
    const download=await get(noteUrl+'&download=1');assert.equal(await download.text(),original);checked('Markdown download');
    await unlink(result.result.articlePath);assert.equal((await(await get(noteUrl)).json()).artifact,'missing');checked('missing Markdown detected');
    assert.equal((await post({action:'retry',jobId})).status,200);assert.equal((await(await post({action:'tick'})).json()).status,'completed');assert.equal(await readFile(result.result.articlePath,'utf8'),original);checked('retry repairs missing note');
    await writeFile(result.result.articlePath,'手動編集\n');await post({action:'retry',jobId});assert.equal((await(await post({action:'tick'})).json()).status,'blocked');assert.equal(await readFile(result.result.articlePath,'utf8'),'手動編集\n');checked('hand edits preserved and conflict reported');
    const snapshot=await(await get()).json();assert.equal(snapshot.notes.length,1);assert(snapshot.memories.length>0);assert.equal(snapshot.worker.active,false);checked('no duplicate notes, memory durable, lease released');
    const forwarded=await fetch(base+'/api/kousatsu',{headers:{'x-forwarded-for':'203.0.113.1'}});assert.equal(forwarded.status,403);checked('proxy chain rejected');
    assert.equal((await get('?note=invalid')).status,400);checked('invalid note ID rejected');
    assert.equal((await post({action:'initialize',padding:'x'.repeat(5000)})).status,413);checked('oversized request rejected');
  } catch(e) {error=e instanceof Error ? e.stack : String(e);throw e;}
  finally {
    if(child.exitCode===null) {const ended=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill();await ended;}
    await writeFile(path.join(directory,'server.log'),logs);
    await writeFile('tmp/autonomous-http.json',JSON.stringify({directory,projectDirectory,checks,status:error ? 'failed' : 'passed',error},null,2));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
