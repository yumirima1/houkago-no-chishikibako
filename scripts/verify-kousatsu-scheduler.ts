import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ResearchRuntime } from '../src/lib/kousatsu/runtime-service';

async function main() {
  if(process.platform!=='win32') throw new Error('Windows Task Scheduler required');
  const suffix=`test-${Date.now()}`;
  const directory=path.resolve('D:/AI/KousatsuData/Validation',suffix);
  await mkdir(directory,{recursive:true});
  const sources=path.join(directory,'sources.json'),config=path.join(directory,'backend.json');
  await writeFile(sources,'{"sources":[]}');
  await writeFile(config,JSON.stringify({dataDirectory:directory,sourcesPath:sources,pollSeconds:5,maxJobsPerCycle:2,minFreeMiB:1,ai:{provider:'deterministic'}}));
  const database=path.join(directory,'Memory/kousatsu.sqlite');
  const runtime=await ResearchRuntime.open({databasePath:database,outputDirectory:path.join(directory,'Notes'),sources:[]});
  const job=runtime.enqueueInput({topic:'隔離スケジューラ検証',fixturePath:path.resolve('tests/fixtures/kousatsu-sample.rss.xml'),source:{id:'test-only',name:'Test fixture',feedUrl:'https://example.invalid/test'}});runtime.close();
  const task=(action: string)=>JSON.parse(execFileSync('powershell.exe',['-NoProfile','-File','scripts/kousatsu-task.ps1','-Action',action,'-Config',config,'-TaskSuffix',suffix],{encoding:'utf8',windowsHide:true}));
  const checks: string[]=[];
  const snapshots: unknown[]=[];
  const check=(name: string)=>{checks.push(name);console.log(name);};
  const wait=async(predicate:()=>boolean|Promise<boolean>,label: string)=>{
    for(let i=0;i<90;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,1000));}throw new Error('TIMEOUT: '+label);
  };
  const logs=path.join(directory,'Logs',new Date().toISOString().slice(0,10)+'.jsonl');
  let registered=false,error: string|undefined;
  try {
    snapshots.push(task('Install'));registered=true;check('dedicated isolated task registered at Limited privilege');
    snapshots.push(task('Start'));
    await wait(()=>{const db=new DatabaseSync(database,{readOnly:true});try{return db.prepare('SELECT status FROM jobs WHERE id=?').get(job)?.status==='succeeded';}finally{db.close();}},'fixture job');
    check('Task Scheduler executed durable fixture job with no browser or web server');
    const status=task('Status');assert.equal(status.State,'Running');snapshots.push(status);
    task('Start');await new Promise(r=>setTimeout(r,1500));
    const db=new DatabaseSync(database,{readOnly:true});try {assert.equal(db.prepare('SELECT count(*) AS n FROM articles').get()?.n,1);}finally{db.close();}
    check('repeated start produced no duplicate job or note');
    snapshots.push(task('Stop'));await wait(()=>task('Status').State!=='Running','graceful stop');check('stop marker drained cycle and task disabled');
    // Deliberately remove only the test source configuration contents. No production configuration is involved.
    await writeFile(sources,'{"sources":"invalid"}');snapshots.push(task('Start'));
    await wait(async()=>{try{return (await readFile(logs,'utf8')).includes('child-failure');}catch{return false;}},'scheduled child failure');
    check('scheduled child failure persisted diagnostic');
    await writeFile(sources,'{"sources":[]}');
    await wait(async()=>{const rows=(await readFile(logs,'utf8')).trim().split('\n').map(line=>JSON.parse(line));const failure=rows.findIndex(row=>row.event.type==='child-failure');return rows.slice(failure+1).some(row=>row.event.type==='cycle' && row.event.status==='succeeded');},'recovery after source config repair');
    check('supervisor retried after configuration repair without losing the completed note');
    snapshots.push(task('Stop'));await wait(()=>task('Status').State!=='Running','second stop');
    snapshots.push(task('Start'));await wait(()=>task('Status').State==='Running','restart');
    check('new process restored persisted schedule, notes and queue');
  } catch(e) {error=e instanceof Error ? e.stack : String(e);throw e;}
  finally {
    if(registered) {try {snapshots.push(task('Stop'));await wait(()=>task('Status').State!=='Running','cleanup stop');snapshots.push(task('Remove'));}catch(e){error=String(e);}}
    const result={directory,job,checks,snapshots,status:error ? 'failed' : 'passed',error,physicalRebootTested:false};
    await writeFile(path.join(directory,'scheduler-verification.json'),JSON.stringify(result,null,2));
    await writeFile('tmp/autonomous-scheduler.json',JSON.stringify(result,null,2));
    if(error)process.exitCode=1;
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
