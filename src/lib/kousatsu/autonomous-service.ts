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
import {operationEnd,jstDayStart} from './weekly-config';
import {ResearchAgenda} from './research-agenda';
import {verifyPublicDelivery} from './public-delivery';
import {inspectBackend} from './research-status';

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
      cycles:reader.prepare('SELECT id,started_at,finished_at,status FROM autonomy_runs ORDER BY id DESC LIMIT 10').all(),operation,inspection:inspectBackend(config)};
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
  const cycle=history.acquireCycle();
  if(!cycle){history.close();runtime.close();return {runId:null,status:'busy',ticks:[],knowledge:{matching:0,repaired:0,conflicts:[] as string[]}};}
  let leaseError:unknown;const heartbeat=setInterval(()=>{try{history.renewCycle(cycle);}catch(e){leaseError=e;}},10000);heartbeat.unref();
  const assertCycle=()=>{if(leaseError)throw leaseError;history.renewCycle(cycle);};
  const agenda=new ResearchAgenda(paths.database,config.agenda);
  history.recoverRuns();
  const runId=history.beginRun();
  history.bindCycle(cycle,runId);
  const ticks: Awaited<ReturnType<ResearchRuntime['tick']>>[]=[];
  try {
    await checkCapacity(config,history.artifacts().length);
    const planningBefore=agenda.reconcile(sources);
    if(config.operation)await planWeekly(config,runtime,sources);
    const db=new DatabaseSync(paths.database,{readOnly:true});
    let jobsToday=0;
    try {jobsToday=Number(db.prepare('SELECT count(*) AS n FROM jobs WHERE created_at>=?').get(jstDayStart(Date.now()))?.n);}
    finally {db.close();}
    for (let i=0;i<config.maxJobsPerCycle;i++) {
      if(config.operation && (Date.now()<Date.parse(config.operation.startsAt)||Date.now()>=operationEnd(config.operation)))break;
      assertCycle();
      const result=await runtime.tick({schedule:config.operation?false:options.schedule,queuePrefix:config.operation?'weekly:':undefined,maxScheduledJobs:Math.max(0,config.maxJobsPerDay-jobsToday),dailyMaxJobs:config.maxJobsPerDay});
      ticks.push(result);
      await backendLog(config,{type:'tick',runId,...result});
      if (result.status==='idle' || result.status==='busy'||result.status==='daily_budget') break;
      const reader=new DatabaseSync(paths.database,{readOnly:true});
      try {jobsToday=Number(reader.prepare('SELECT count(*) AS n FROM jobs WHERE created_at>=?').get(jstDayStart(Date.now()))?.n);}
      finally {reader.close();}
    }
    assertCycle();const planningAfter=agenda.reconcile(sources);
    const outcomes=ticks.flatMap(t=>{
      if(!('jobId' in t)||!t.jobId)return [];
      const job=runtime.database.getJob(t.jobId),analysis=runtime.database.getCheckpoint<import('./types').AnalysisResult>(t.jobId,'analyze'),verification=runtime.database.getCheckpoint<import('./types').VerificationReport>(t.jobId,'verify');
      return [{jobId:t.jobId,startedAt:job?.startedAt??null,finishedAt:job?.finishedAt??null,attempts:job?.attempts??0,saved:t.status==='completed',model:analysis?.research?.model??null,verification:verification?{status:verification.status,factCheckStatus:verification.factCheckStatus}:null,sourceChecks:analysis?.quality?.sourceVerification?{claims:analysis.quality.sourceVerification.claims.length,conflicts:analysis.quality.sourceVerification.claims.filter(c=>c.result==='conflict-candidate').length,independentVerification:'unverified'}:null,relatedMemories:analysis?.research?.memories.length??0,errorClass:'error' in t?errorCategory(t.error):null}];
    });
    const knowledge=await exportKnowledge(config,history);
    let publication:{status:string;commit?:unknown;error?:string}={status:'disabled'},delivery:{status:string;attempts?:number;commit?:unknown;error?:string}={status:'not-attempted'};
    if(config.publication?.enabled){
      assertCycle();
      const bundle=await exportPublicResearch(config,sources);
      publication=await publishResearch(paths.database,config.publication,bundle);
      if(publication.status==='succeeded'&&typeof publication.commit==='string')delivery=await verifyPublicDelivery(paths.database,bundle,publication.commit);
      if(publication.status==='retry_wait'||publication.status==='failed'||ticks.some(t=>t.status==='completed'))await backendLog(config,{type:'publication',...publication,notes:bundle.notes});
      if(delivery.status==='retry_wait'||delivery.status==='failed')await backendLog(config,{type:'delivery',...delivery});
    }
    const failed=ticks.some(t=>t.status==='blocked' || t.status==='retry_wait') || knowledge.conflicts.length>0||publication.status==='failed'||publication.status==='retry_wait'||delivery.status==='failed';
    const result={runId,status:failed ? 'attention' : 'succeeded',ticks,knowledge,outcomes,planning:{before:planningBefore,after:planningAfter,counts:agenda.summary().inquiryCounts},publication,delivery};
    if (ticks.some(t=>t.status!=='idle' && t.status!=='busy') || knowledge.repaired || knowledge.conflicts.length) {
      const report=path.join(paths.reports,`run-${runId}.md`);
      const contents=[`# 自律実行 ${runId}`, '', `完了日時: ${new Date().toISOString()}`, `状態: ${result.status}`, '',
        '## 実行結果', '', ...ticks.map(t=>`- ${JSON.stringify(t)}`), '',
        '## ファイル整合性', '',`一致: ${knowledge.matching} / 生成・復旧: ${knowledge.repaired} / 衝突: ${knowledge.conflicts.length}`, '',
        ...knowledge.conflicts.map(file=>`- 手編集を保護: ${file}`), '', '## 分析・記憶・次の調査・公開','',JSON.stringify({outcomes,planning:result.planning,publication,delivery},null,2),'',
        '出典主張・解釈・仮説の独立した事実確認は未実施。JSONLログとSQLiteのautonomy_runsで処理履歴を追跡できます。', '',].join('\n');
      history.manifest(report,contents);
      await publishArtifact(report,contents,()=>{});
    }
    history.finishRun(runId,result.status,result);
    await backendLog(config,{type:'cycle',...result});
    return result;
  } catch(e) {
    const error=safeDiagnostic(e);
    history.finishRun(runId,'failed',{error,errorClass:errorCategory(error)});
    await backendLog(config,{type:'cycle',runId,status:'failed',error,errorClass:errorCategory(error)});
    throw e;
  } finally {clearInterval(heartbeat);history.releaseCycle(cycle);agenda.close();history.close();runtime.close();}
}

export function errorCategory(value:unknown){const s=String(value);return /timeout|abort/i.test(s)?'timeout':/LEASE|SUPERVISOR/.test(s)?'lease':/CAPACITY|space/i.test(s)?'capacity':/CONFIG|SOURCE_IDENTITY|CHECKPOINT_SOURCE/.test(s)?'configuration':/CONFLICT|MISMATCH|INTEGRITY|MEMORY_/.test(s)?'data-integrity':/PUBLIC|GITHUB|CREDENTIAL/.test(s)?'publication':/robots|denied|forbidden/i.test(s)?'source-policy':/fetch|network|HTTP|DNS/i.test(s)?'network':'unknown';}
