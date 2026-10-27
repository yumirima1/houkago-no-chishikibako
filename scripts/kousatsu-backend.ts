import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { autonomousPaths, loadAutonomousConfig } from '../src/lib/kousatsu/autonomous-config';
import { backendLog, backendStatus, runAutonomousCycle } from '../src/lib/kousatsu/autonomous-service';
import { ensureDataDirectories, exportKnowledge } from '../src/lib/kousatsu/knowledge-export';
import { KousatsuDatabase } from '../src/lib/kousatsu/database';
import { ResearchRuntime } from '../src/lib/kousatsu/runtime-service';
import { loadResearchSources } from '../src/lib/kousatsu/runtime-config';
import { safeDiagnostic, TopicHistory } from '../src/lib/kousatsu/research-engine';
import {exportPublicResearch} from '../src/lib/kousatsu/public-export';
import {operationEnd} from '../src/lib/kousatsu/weekly-config';
import {inspectBackend} from '../src/lib/kousatsu/research-status';
import {publishResearch} from '../src/lib/kousatsu/public-publisher';
import {verifyPublicDelivery} from '../src/lib/kousatsu/public-delivery';
import {resetPublicationAttempts} from '../src/lib/kousatsu/publication-history';

async function main() {
  const [command='status',...args]=process.argv.slice(2);
  if(command==='help' || command==='--help') {console.log('Commands: status, audit, health, run, daemon, doctor, export, public-export, public-verify, public-retry, backup, retry --job ID, cancel --job ID, enqueue --source ID. All accept --config PATH.');return;}
  const options=new Map<string,string>();
  for(let i=0;i<args.length;i+=2) {
    const key=args[i],value=args[i+1];
    const allowed=['--config',...(['retry','cancel'].includes(command) ? ['--job'] : []),...(command==='enqueue' ? ['--source'] : [])];
    if(!allowed.includes(key) || options.has(key) || !value || value.startsWith('--')) throw new Error('BACKEND_ARGUMENT_INVALID');
    options.set(key,value);
  }
  const configFile=options.get('--config') ?? 'config/kousatsu-backend.json';
  const config=await loadAutonomousConfig(configFile);
  const paths=autonomousPaths(config);
  if(command==='audit'||command==='health'){const inspection=inspectBackend(config);console.log(JSON.stringify(inspection,null,2));if(command==='health'&&inspection.health.status!=='healthy')process.exitCode=1;return;}
  if(command==='public-verify'||command==='public-retry'){
    if(!config.publication?.enabled)throw Error('PUBLICATION_DISABLED');
    const bundle=await exportPublicResearch(config,await loadResearchSources(config.sourcesPath));
    if(command==='public-retry'){
      const db=new DatabaseSync(paths.database);try{resetPublicationAttempts(db,bundle.digest);}finally{db.close();}
    }
    const publication=await publishResearch(paths.database,config.publication,bundle);
    const delivery=publication.status==='succeeded'&&typeof publication.commit==='string'?await verifyPublicDelivery(paths.database,bundle,publication.commit,{force:true}):{status:'not-attempted'};
    console.log(JSON.stringify({publication,delivery}));if(delivery.status!=='succeeded')process.exitCode=1;return;
  }
  if(['retry','cancel','enqueue'].includes(command)) {
    const job=options.get('--job');
    if(command!=='enqueue' && (!job || !/^[0-9a-f-]{36}$/i.test(job))) throw new Error('BACKEND_JOB_ID_INVALID');
    if(command==='enqueue' && !options.get('--source')) throw new Error('BACKEND_SOURCE_ID_REQUIRED');
    const runtime=await ResearchRuntime.open({databasePath:paths.database,outputDirectory:paths.notes,sources:await loadResearchSources(config.sourcesPath)});
    try {
      if(command==='retry')runtime.store.retry(job!);
      if(command==='cancel')runtime.store.cancel(job!);
      console.log(JSON.stringify({status:command,jobId:command==='enqueue' ? runtime.enqueue(options.get('--source')!) : job}));
    } finally {runtime.close();}return;
  }
  if (command==='status') {console.log(JSON.stringify(await backendStatus(config),null,2));return;}
  if(command==='public-export'){const bundle=await exportPublicResearch(config,await loadResearchSources(config.sourcesPath));console.log(JSON.stringify({directory:bundle.directory,notes:bundle.notes,digest:bundle.digest}));return;}
  if (command==='run') {const result=await runAutonomousCycle(config);if (!['succeeded','busy'].includes(result.status)) process.exitCode=1;return;}
  if (command==='export') {
    const runtime=await ResearchRuntime.open({databasePath:paths.database,outputDirectory:paths.notes,sources:[]});
    const history=new TopicHistory(paths.database);
    try {const result=await exportKnowledge(config,history);console.log(JSON.stringify(result));if (result.conflicts.length) process.exitCode=1;}
    finally {history.close();runtime.close();}return;
  }
  if (command==='backup') {
    await ensureDataDirectories(config);
    const db=new KousatsuDatabase(paths.database);
    const output=path.join(paths.backups,`kousatsu-${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}.sqlite`);
    try {await db.backupTo(output);const read=new DatabaseSync(output,{readOnly:true});try {
      if (read.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok' || read.prepare('PRAGMA foreign_key_check').all().length) throw new Error('BACKUP_INTEGRITY_FAILED');
    } finally {read.close();} console.log(JSON.stringify({backup:output,integrity:'ok'}));} finally {db.close();}return;
  }
  if (command==='doctor') {
    const start=Date.now();
    try {
      const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(5000),redirect:'error'});
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const tags=await response.json() as {models:Array<{name:string;size:number}>};
      const installed=tags.models.some(m=>m.name===config.ai.model);
      console.log(JSON.stringify({ollama:'connected',models:tags.models.map(m=>({name:m.name,bytes:m.size})),selected:config.ai.model,installed,ms:Date.now()-start},null,2));
      if (config.ai.provider==='ollama' && !installed) process.exitCode=1;
    } catch(e) {console.log(JSON.stringify({ollama:'unavailable',error:safeDiagnostic(e),ms:Date.now()-start}));process.exitCode=1;}return;
  }
  if (command!=='daemon') throw new Error('Commands: status, audit, health, run, daemon, doctor, export, backup, public-verify, public-retry');
  await ensureDataDirectories(config);
  const init=await ResearchRuntime.open({databasePath:paths.database,outputDirectory:paths.notes,sources:[]});init.close();
  const supervisor=new TopicHistory(paths.database);
  const token=supervisor.acquireSupervisor();
  if (!token) {supervisor.close();throw new Error('SUPERVISOR_ALREADY_RUNNING');}
  supervisor.recoverRuns();
  let stopping=false;
  const stop=()=>{stopping=true;};
  const heartbeat=setInterval(()=>{try {supervisor.renewSupervisor(token);} catch {stopping=true;}},10000);
  heartbeat.unref();
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  const marker=path.join(paths.logs,'STOP');
  await backendLog(config,{type:'supervisor-start',pid:process.pid,config:configFile});
  try {
    while (!stopping && !existsSync(marker)) {
      if(config.operation && Date.now()>=operationEnd(config.operation)){
        await runAutonomousCycle(config);
        await backendLog(config,{type:'operation-ended',endsAt:config.operation.endsAt});break;
      }
      // A real child-process deadline can terminate a stuck dependency. SQLite
      // checkpoints and expiring leases let the next child resume safely.
      const child=spawn(process.execPath,['--import','tsx',path.resolve('scripts/kousatsu-backend.ts'),'run','--config',path.resolve(configFile)],
        {cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});
      let diagnostic='';
      child.stdout.on('data',chunk=>process.stdout.write(chunk));
      child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-4000);});
      const timeout=setTimeout(()=>child.kill(),Math.max(240000,config.maxJobsPerCycle*(config.ai.timeoutMs+60000)));
      const exit=await new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));})
        .finally(()=>clearTimeout(timeout));
      if (exit.code!==0) await backendLog(config,{type:'child-failure',...exit,error:safeDiagnostic(diagnostic)});
      if (stopping || existsSync(marker)) break;
      for (let i=0;i<config.pollSeconds && !stopping && !existsSync(marker);i++) await new Promise(resolve=>setTimeout(resolve,1000));
    }
  } finally {clearInterval(heartbeat);supervisor.releaseSupervisor(token);supervisor.close();process.off('SIGINT',stop);process.off('SIGTERM',stop);await backendLog(config,{type:'supervisor-stop',pid:process.pid});}
}

main().catch(error=>{console.error(safeDiagnostic(error));process.exitCode=1;});
