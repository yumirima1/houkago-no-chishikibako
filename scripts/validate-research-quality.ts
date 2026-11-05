/** Explicit acceptance runner. Production uses the same daily execution budget
 * and, when configured, the same public outbox as regular operation. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {loadAutonomousConfig,autonomousPaths} from '../src/lib/kousatsu/autonomous-config';
import {loadResearchSources} from '../src/lib/kousatsu/runtime-config';
import {ResearchRuntime} from '../src/lib/kousatsu/runtime-service';
import {OllamaProvider} from '../src/lib/kousatsu/ai';
import {ResearchEngine,TopicHistory,safeDiagnostic} from '../src/lib/kousatsu/research-engine';
import {collectFeedXml,fetchFeed,parseFeed} from '../src/lib/kousatsu/ingest';
import {ResearchAgenda} from '../src/lib/kousatsu/research-agenda';
import {exportKnowledge} from '../src/lib/kousatsu/knowledge-export';
import {exportPublicResearch} from '../src/lib/kousatsu/public-export';
import {publishResearch} from '../src/lib/kousatsu/public-publisher';
import {verifyPublicDelivery} from '../src/lib/kousatsu/public-delivery';
import {jstDayStart} from '../src/lib/kousatsu/weekly-config';
import type {AnalysisResult,StoredItem,VerificationReport} from '../src/lib/kousatsu/types';

type AcceptanceCase={sourceId:string;url:string;question?:string};
async function main(){
  const args=process.argv.slice(2),options=new Map<string,string>();
  for(let i=0;i<args.length;i+=2){
    if(!['--config','--cases','--output','--phase'].includes(args[i])||!args[i+1]||options.has(args[i]))throw Error('ACCEPTANCE_ARGUMENT_INVALID');
    options.set(args[i],args[i+1]);
  }
  const config=await loadAutonomousConfig(options.get('--config'));
  const phase=options.get('--phase')??'trial';
  if(!['trial','production','collect'].includes(phase))throw Error('ACCEPTANCE_PHASE_INVALID');
  if(config.publication?.enabled&&phase!=='production')throw Error('ACCEPTANCE_REQUIRES_PUBLICATION_DISABLED');
  if(phase==='trial'&&!/[\\/]Validation[\\/]/i.test(config.dataDirectory))throw Error('TRIAL_REQUIRES_ISOLATED_DATA');
  const output=path.resolve(options.get('--output')??path.join(config.dataDirectory,'Validation','acceptance'));
  if(process.platform==='win32'&&!/^D:\\AI\\/i.test(output))throw Error('ACCEPTANCE_OUTPUT_REQUIRES_D_AI');
  await mkdir(output,{recursive:true});
  const paths=autonomousPaths(config),sources=await loadResearchSources(config.sourcesPath);
  // Manual cases also reserve normal daily receipts; they cannot bypass limits.
  const cases:AcceptanceCase[]=options.has('--cases')?JSON.parse(await readFile(options.get('--cases')!,'utf8')):[];
  if(!Array.isArray(cases)||cases.some(c=>!sources.some(s=>s.enabled&&s.id===c.sourceId)||typeof c.url!=='string'))throw Error('ACCEPTANCE_CASE_INVALID');
  const runtime=await ResearchRuntime.open({databasePath:paths.database,outputDirectory:paths.notes,sources,
    providerForJob:jobId=>new ResearchEngine({jobId,database:runtime.database,history,
      provider:new OllamaProvider({model:config.ai.model,timeoutMs:config.ai.timeoutMs,thinking:config.ai.thinking}),exploration:0})});
  const history=new TopicHistory(paths.database);
  const manifest:{phase:string;dataDirectory:string;startedAt:string;collection:unknown[];results:unknown[];finishedAt?:string;knowledge?:unknown;agenda?:unknown}={phase,dataDirectory:config.dataDirectory,startedAt:new Date().toISOString(),collection:[],results:[]};
  const save=()=>writeFile(path.join(output,'acceptance.json'),JSON.stringify(manifest,null,2));
  const agenda=new ResearchAgenda(paths.database,config.agenda);
  try{
    const pending=runtime.snapshot().jobs.filter(j=>j.queue==='ready');
    if(pending.length)throw Error('ACCEPTANCE_QUEUE_NOT_EMPTY: process existing queued work through normal operation first');
    for(const source of sources.filter(s=>s.enabled)){
      const start=Date.now();
      runtime.database.upsertSource(source);const id=runtime.database.beginFetch(source.id);
      try{
        const response=await fetchFeed(source.feedUrl,{allowedHosts:[new URL(source.feedUrl).hostname],allowCompression:true,retries:0,timeoutMs:15000});
        const collected=collectFeedXml(runtime.database,source,response.text,response.httpStatus,id);
        const titles=parseFeed(response.text).entries.slice(0,30).map(e=>({title:e.title,url:e.url,publishedAt:e.publishedAt}));
        manifest.collection.push({sourceId:source.id,status:'succeeded',ms:Date.now()-start,...collected,titles});
      }catch(error){runtime.database.finishFetch(id,{status:'failed',error:safeDiagnostic(error)});manifest.collection.push({sourceId:source.id,status:'failed',ms:Date.now()-start,error:safeDiagnostic(error)});}
      await save();
    }
    for(const entry of cases){
      const start=Date.now(),source=sources.find(s=>s.id===entry.sourceId)!;
      const budget=new DatabaseSync(paths.database,{readOnly:true});try{if(Number(budget.prepare('SELECT count(*) n FROM jobs WHERE created_at>=?').get(jstDayStart(Date.now()))?.n)>=config.maxJobsPerDay)throw Error('ACCEPTANCE_DAILY_BUDGET_EXHAUSTED');}finally{budget.close();}
      const item=runtime.database.getItemByCanonicalUrl(entry.url);
      if(!item||item.sourceId!==source.id){manifest.results.push({entry,error:'CASE_NOT_IN_FETCHED_FEED'});process.exitCode=1;await save();continue;}
      const question=entry.question??`${source.topic}: ${item.title}`;
      const inquiry=agenda.rank(item,source.genre??'science').inquiry;
      const jobId=runtime.enqueueInput({source,topic:question.slice(0,200),articleRef:{itemId:item.id,versionId:item.versionId!},maxAttempts:1,outputDirectory:paths.notes,researchPlan:{inquiryIds:inquiry?[inquiry.id]:[],question:inquiry?.question??question,reason:inquiry?'FOLLOW_UP_FROM_SAVED_QUESTION':'EXPLICIT_ACCEPTANCE_CASE',sourceBudget:{candidateLimit:1,bodyLimit:3}}});
      agenda.bind(jobId,inquiry?[inquiry.id]:[]);
      runtime.database.saveCheckpoint(jobId,'acceptance-purpose',{phase,manual:true,requestedAt:new Date().toISOString(),publication:config.publication?.enabled??false});
      console.log(JSON.stringify({phase,event:'started',jobId,title:item.title}));
      const tick=await runtime.tick({schedule:false,dailyMaxJobs:config.maxJobsPerDay});
      if(tick.status==='daily_budget')throw Error('ACCEPTANCE_DAILY_BUDGET_EXHAUSTED');
      if(!('jobId' in tick)||tick.jobId!==jobId)throw Error('ACCEPTANCE_QUEUE_OWNERSHIP_CHANGED');
      const analysis=runtime.database.getCheckpoint<AnalysisResult>(jobId,'analyze');
      const verification=runtime.database.getCheckpoint<VerificationReport>(jobId,'verify');
      const selected=runtime.database.getCheckpoint<{items:StoredItem[]}>(jobId,'selected-items');
      const passed=analysis?.research?.model.status==='succeeded'&&verification?.status==='passed'&&
        (selected?.items.length??0)>=2&&analysis?.quality?.evidenceReview?.summaries.length===selected?.items.length&&
        (analysis?.quality?.evidenceReview?.comparisons.length??0)>=1;
      manifest.results.push({entry,jobId,tick,automaticPassed:passed,humanReview:'pending',elapsedMs:Date.now()-start,model:analysis?.research?.model,
        verification,sourceCount:selected?.items.length,sourceUrls:selected?.items.map(i=>i.url),
        summaryCount:analysis?.quality?.evidenceReview?.summaries.length,comparisonCount:analysis?.quality?.evidenceReview?.comparisons.length,
        evidenceReview:analysis?.quality?.evidenceReview,reflection:analysis?.quality?.reflection,relatedMemories:analysis?.research?.memories,
        questions:analysis?.research?.questions});
      if(analysis)await writeFile(path.join(output,`${jobId}-analysis.json`),JSON.stringify(analysis,null,2));
      if(!passed)process.exitCode=1;
      console.log(JSON.stringify({phase,event:'finished',jobId,tick:tick.status,model:analysis?.research?.model.status,verification:verification?.status,sourceCount:selected?.items.length,ms:Date.now()-start}));
      manifest.agenda=agenda.reconcile(sources);
      if(phase==='production'&&config.publication?.enabled){
        const bundle=await exportPublicResearch(config,sources),publication=await publishResearch(paths.database,config.publication,bundle);
        const delivery=publication.status==='succeeded'&&typeof publication.commit==='string'?await verifyPublicDelivery(paths.database,bundle,publication.commit):{status:'not-attempted'};
        Object.assign(manifest.results.at(-1) as object,{publication,delivery,publicNotes:bundle.notes});
      }
      await save();
    }
    // Production export creates the normal private Articles/Memory artefacts.
    // Trial DBs may contain historical absolute paths; never export those paths.
    if(phase==='production')manifest.knowledge=await exportKnowledge(config,history);
    const reader=new DatabaseSync(paths.database,{readOnly:true});
    try{if(reader.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||reader.prepare('PRAGMA foreign_key_check').all().length)throw Error('ACCEPTANCE_DATABASE_INTEGRITY');}finally{reader.close();}
    manifest.finishedAt=new Date().toISOString();await save();
  }finally{agenda.close();history.close();runtime.close();}
}
main().catch(error=>{console.error(safeDiagnostic(error));process.exitCode=1;});
