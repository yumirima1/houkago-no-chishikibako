import { appendFile, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DeterministicProvider, OllamaProvider } from './ai';
import { autonomousPaths, type AutonomousConfig } from './autonomous-config';
import { checkCapacity, ensureDataDirectories, exportKnowledge } from './knowledge-export';
import { loadResearchSources } from './runtime-config';
import { ResearchRuntime, researchSnapshot } from './runtime-service';
import { ResearchEngine, safeDiagnostic, TopicHistory } from './research-engine';
import { publishArtifact } from './artifact-store';
import {planWeekly} from './weekly-service';
import {WeeklyStore} from './weekly-store';
import {exportPublicResearch} from './public-export';
import {publishResearch} from './public-publisher';

export async function backendLog(config: AutonomousConfig, event: unknown) {
  const file=path.join(autonomousPaths(config).logs,`${new Date().toISOString().slice(0,10)}.jsonl`);
  try {if ((await lstat(file)).size>10*1024*1024) throw new Error('LOG_CAPACITY_LIMIT');}
  catch(e) {if ((e as NodeJS.ErrnoException).code!=='ENOENT') throw e;}
  const record=JSON.stringify({at:new Date().toISOString(),event});
  await appendFile(file,record+'\n',{mode:0o600});
  console.log(record);
}

export async function backendStatus(config: AutonomousConfig) {
  const file=autonomousPaths(config).database;
  const snapshot=await researchSnapshot({databasePath:file,sources:await loadResearchSources(config.sourcesPath)});
  if(!existsSync(file))return {...snapshot,supervisor:null,schedules:[],cycles:[]};
  const reader=new DatabaseSync(file,{readOnly:true});
  try {
    if(!reader.prepare("SELECT name FROM sqlite_master WHERE name='autonomy_supervisor'").get()) return {...snapshot,supervisor:null,schedules:[],cycles:[]};
    const supervisor=reader.prepare('SELECT expires_at FROM autonomy_supervisor WHERE id=1').get();
    let operation:unknown=null;
    if(config.operation&&reader.prepare("SELECT name FROM sqlite_master WHERE name='weekly_operations'").get()){
      const store=new WeeklyStore(file,{readOnly:true});try{operation=store.snapshot(config.operation);}finally{store.close();}
    }
    return {...snapshot,supervisor:{active:Boolean(supervisor && String(supervisor.expires_at)>new Date().toISOString()),expiresAt:supervisor?.expires_at ?? null},
      schedules:reader.prepare('SELECT source_id,next_run_at FROM research_schedules ORDER BY source_id').all(),
      cycles:reader.prepare('SELECT id,started_at,finished_at,status FROM autonomy_runs ORDER BY id DESC LIMIT 10').all(),operation};
  } finally {reader.close();}
}

export async function runAutonomousCycle(config: AutonomousConfig, options: {schedule?: boolean} = {}) {
  const paths=await ensureDataDirectories(config);
  const sources=await loadResearchSources(config.sourcesPath);
  // Restrict all redirect hops as well as initial requests to configured feed hosts.
  process.env.KOUSATSU_FEED_HOSTS=[...new Set(sources.map(source=>new URL(source.feedUrl).hostname))].join(',');
  const runtime=await ResearchRuntime.open({databasePath:paths.database,outputDirectory:paths.notes,sources,
    providerForJob:jobId=>new ResearchEngine({jobId,database:runtime.database,history,
      provider:config.ai.provider==='ollama' ? new OllamaProvider({model:config.ai.model,timeoutMs:config.ai.timeoutMs}) : new DeterministicProvider(),
      exploration:config.exploration}),
  });
  const history=new TopicHistory(paths.database);
  const runId=history.beginRun();
  const ticks: Awaited<ReturnType<ResearchRuntime['tick']>>[]=[];
  try {
    await checkCapacity(config,history.artifacts().length);
    if(config.operation)await planWeekly(config,runtime,sources);
    const db=new DatabaseSync(paths.database,{readOnly:true});
    let jobsToday=0;
    try {jobsToday=Number(db.prepare('SELECT count(*) AS n FROM jobs WHERE created_at>=?').get(new Date().toISOString().slice(0,10))?.n);}
    finally {db.close();}
    for (let i=0;i<config.maxJobsPerCycle;i++) {
      if(config.operation && (Date.now()<Date.parse(config.operation.startsAt)||Date.now()>=Date.parse(config.operation.endsAt)))break;
      const result=await runtime.tick({schedule:config.operation?false:options.schedule,queuePrefix:config.operation?`weekly:${config.operation.id}:`:undefined,maxScheduledJobs:Math.max(0,config.maxJobsPerDay-jobsToday)});
      ticks.push(result);
      await backendLog(config,{type:'tick',runId,...result});
      if (result.status==='idle' || result.status==='busy') break;
      const reader=new DatabaseSync(paths.database,{readOnly:true});
      try {jobsToday=Number(reader.prepare('SELECT count(*) AS n FROM jobs WHERE created_at>=?').get(new Date().toISOString().slice(0,10))?.n);}
      finally {reader.close();}
    }
    const knowledge=await exportKnowledge(config,history);
    if(config.publication?.enabled){
      const bundle=await exportPublicResearch(config,sources);
      const publication=await publishResearch(paths.database,config.publication,bundle);
      if(publication.status==='retry_wait'||publication.status==='failed'||ticks.some(t=>t.status==='completed'))await backendLog(config,{type:'publication',...publication,notes:bundle.notes});
    }
    const failed=ticks.some(t=>t.status==='blocked' || t.status==='retry_wait') || knowledge.conflicts.length>0;
    const result={runId,status:failed ? 'attention' : 'succeeded',ticks,knowledge};
    if (ticks.some(t=>t.status!=='idle' && t.status!=='busy') || knowledge.repaired || knowledge.conflicts.length) {
      const report=path.join(paths.reports,`run-${runId}.md`);
      const contents=[`# 自律実行 ${runId}`, '', `完了日時: ${new Date().toISOString()}`, `状態: ${result.status}`, '',
        '## 実行結果', '', ...ticks.map(t=>`- ${JSON.stringify(t)}`), '',
        '## ファイル整合性', '',`一致: ${knowledge.matching} / 生成・復旧: ${knowledge.repaired} / 衝突: ${knowledge.conflicts.length}`, '',
        ...knowledge.conflicts.map(file=>`- 手編集を保護: ${file}`), '',
        '出典主張・解釈・仮説の独立した事実確認は未実施。JSONLログとSQLiteのautonomy_runsで処理履歴を追跡できます。', '',].join('\n');
      history.manifest(report,contents);
      await publishArtifact(report,contents,()=>{});
    }
    history.finishRun(runId,result.status,result);
    await backendLog(config,{type:'cycle',...result});
    return result;
  } catch(e) {
    const error=safeDiagnostic(e);
    history.finishRun(runId,'failed',{error});
    await backendLog(config,{type:'cycle',runId,status:'failed',error});
    throw e;
  } finally {history.close();runtime.close();}
}
