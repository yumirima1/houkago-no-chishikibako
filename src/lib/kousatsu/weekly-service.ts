import {WeeklyStore,sameArticle,updatedArticle} from './weekly-store';
import type {AutonomousConfig} from './autonomous-config';
import {autonomousPaths} from './autonomous-config';
import type {ResearchRuntime} from './runtime-service';
import type {ResearchSource} from './runtime-types';
import {collectFeedXml,fetchFeed} from './ingest';
import {prepareResearchDocuments} from './research-documents';
import {safeDiagnostic} from './research-engine';
import type {PipelineInput,StoredItem} from './types';
import {meaningfulTerms} from './relevance';
import {operationEnd} from './weekly-config';
import {ResearchAgenda} from './research-agenda';
import {compareRecords} from './relevance';

/** Select articles with the existing network/content policy under the existing worker fence. */
export async function planWeekly(config:AutonomousConfig,runtime:ResearchRuntime,sources:ResearchSource[],transport:typeof fetchFeed=fetchFeed,now=Date.now()){
  const op=config.operation!;const store=new WeeklyStore(runtime.database.filePath),token=runtime.store.acquireWorker();
  if(!token){store.close();return {status:'busy'};}
  let leaseError:unknown;
  const heartbeat=setInterval(()=>{try{runtime.store.renewWorker(token);}catch(e){leaseError=e;}},10000);heartbeat.unref();
  const assertLease=()=>{if(leaseError)throw leaseError;runtime.store.renewWorker(token);};
  let slot:string|undefined;
  const agenda=new ResearchAgenda(runtime.database.filePath,config.agenda);
  try{
    agenda.reconcile(sources,now);
    store.register(op,now);
    const unfinished=store.db.prepare("SELECT a.article_key FROM weekly_articles a JOIN research_queue q ON q.job_id=a.job_id WHERE a.operation_id=? AND q.decision='ready' LIMIT 1").get(op.id);
    const due=unfinished?null:store.due(op,now);
    if(due){
      slot=due.day;store.begin(op,slot,now);
      const prior=store.history();
      // Existing immutable notes count too: adopting the scheduler must not duplicate old work.
      for(const row of store.db.prepare("SELECT data_json FROM checkpoints c JOIN jobs j ON j.id=c.job_id WHERE c.stage='selected-items' AND j.status IN ('succeeded','needs_review') ORDER BY j.created_at DESC LIMIT 1000").all()){
        for(const item of JSON.parse(String(row.data_json)).items??[])prior.push({genre:'legacy',item});
      }
      const available=sources.filter(s=>s.enabled&&s.genre&&op.genres.includes(s.genre));
      const researchPlan=agenda.plan(op.id,slot,available,config.exploration,now);
      const enabled=researchPlan.sources.flatMap(b=>available.filter(s=>s.id===b.id));
      const counts=new Map<string,number>();for(const p of prior.slice(0,50))counts.set(p.genre,(counts.get(p.genre)??0)+1);
      const collection:Array<Record<string,unknown>>=[{status:'planned',researchPlan}],candidates:Array<{source:ResearchSource;item:StoredItem}>=[];
      const canRevisit=(item:StoredItem,source:ResearchSource)=>{
        if(!op.continuous||!item.versionId||!agenda.rank(item,source.genre!,now).inquiry)return false;
        const coverage=runtime.database.documentCoverage(item.versionId);
        return coverage?.kind==='article-body'&&now-Date.parse(coverage.fetchedAt)>=(source.articlePolicy?.cacheMinutes??1440)*60000;
      };
      for(const source of enabled){
        assertLease();runtime.database.upsertSource(source);const fetchId=runtime.database.beginFetch(source.id);
        try{
          const fetched=await transport(source.feedUrl,{allowedHosts:[new URL(source.feedUrl).hostname],timeoutMs:15000,retries:1});assertLease();
          const collected=collectFeedXml(runtime.database,source,fetched.text,fetched.httpStatus,fetchId);
          const budget=researchPlan.sources.find(b=>b.id===source.id)!;
          const items=collected.itemIds.map(id=>runtime.database.getItem(id)!).filter(Boolean)
            // A syndicated alias must not use another publisher's primary
            // document under this feed's policy/source-version binding.
            .filter(item=>item.sourceId===source.id)
            .filter(item=>meaningfulTerms(item.title).size>=3 && (!prior.some(p=>sameArticle(p.item,item))||canRevisit(item,source)))
            .filter(item=>!item.publishedAt || Date.parse(item.publishedAt)<=now+86400000);
          const recent=items.filter(item=>!item.publishedAt||Date.parse(item.publishedAt)>=now-(config.agenda?.freshDays??90)*86400000)
            .sort((a,b)=>Date.parse(b.publishedAt??b.fetchedAt)-Date.parse(a.publishedAt??a.fetchedAt)).slice(0,budget.candidateLimit);
          collection.push({sourceId:source.id,genre:source.genre,fetchedAt:new Date().toISOString(),count:collected.totalItemCount,candidates:recent.length,scanLimit:budget.candidateLimit,interest:budget.score,status:'succeeded'});
          for(const item of recent)candidates.push({source,item});
        }catch(e){const error=safeDiagnostic(e);runtime.database.finishFetch(fetchId,{status:'failed',error});collection.push({sourceId:source.id,genre:source.genre,status:'failed',error});}
      }
      // Round-robin across sources, least-covered genres first. A failed body never blocks another genre.
      const ordered=candidates.map(c=>({...c,rank:agenda.rank(c.item,c.source.genre!,now)})).sort((a,b)=>
        (b.rank.score+((b.source.id===researchPlan.explorationSource)?8:0)+1/(1+(counts.get(b.source.genre!)??0)))-
        (a.rank.score+((a.source.id===researchPlan.explorationSource)?8:0)+1/(1+(counts.get(a.source.genre!)??0))));
      const selected:Array<{genre:string;item:StoredItem;source:ResearchSource;input:PipelineInput}>=[];
      const bodyAttempts=new Map<string,number>();
      for(const candidate of ordered){
        if(selected.length>=op.maxArticles)break;
        if((prior.some(p=>sameArticle(p.item,candidate.item))&&!canRevisit(candidate.item,candidate.source))||selected.some(p=>sameArticle(p.item,candidate.item)))continue;
        const budget=researchPlan.sources.find(b=>b.id===candidate.source.id)!;
        if((bodyAttempts.get(candidate.source.id)??0)>=budget.bodyLimit)continue;
        bodyAttempts.set(candidate.source.id,(bodyAttempts.get(candidate.source.id)??0)+1);
        assertLease();
        const prepared=await prepareResearchDocuments(runtime.database.filePath,[candidate.item],candidate.source,transport);assertLease();
        const entry=prepared.entries[0],body=entry.result.document;
        if(!body && (candidate.item.summary??candidate.item.content??'').length<160){collection.push({article:candidate.item.url,genre:candidate.source.genre,status:'skipped',reason:entry.result.error??'INSUFFICIENT_READABLE_CONTENT'});continue;}
        const item=body?runtime.database.getItem(runtime.database.upsertItem({...candidate.item,content:body.text,fetchedAt:body.fetchedAt}).id)!:candidate.item;
        if(body)runtime.database.saveDocumentCoverage(item.versionId!,body.id,{itemId:item.id,versionId:item.versionId!,url:item.url,fetchedAt:body.fetchedAt,documentId:body.id,kind:'article-body',status:'available'});
        const revision=prior.some(p=>updatedArticle(item,p.item));
        if(prior.some(p=>sameArticle(p.item,item))&&!revision){collection.push({status:'unchanged-source',article:item.url,reason:'NO_NEW_BODY_EVIDENCE'});continue;}
        // At maximum interest, spend one additional document fetch on a related
        // other publisher, inside this slot's budget; never create an extra job.
        if(budget.bodyLimit>1){
          const peer=ordered.find(c=>c.source.id!==candidate.source.id&&(bodyAttempts.get(c.source.id)??0)<(researchPlan.sources.find(b=>b.id===c.source.id)?.bodyLimit??1)&&['follow_up_candidate','same_issue_candidate'].includes(compareRecords(item,c.item).kind));
          if(peer){const checked=await prepareResearchDocuments(runtime.database.filePath,[peer.item],peer.source,transport);assertLease();const document=checked.entries[0]?.result.document;
            bodyAttempts.set(peer.source.id,(bodyAttempts.get(peer.source.id)??0)+1);
            if(document)runtime.database.upsertItem({...peer.item,content:document.text,fetchedAt:document.fetchedAt});
            collection.push({status:document?'corroboration-fetched':'corroboration-unavailable',sourceId:peer.source.id,article:peer.item.url,independence:'not-established'});
          }else collection.push({status:'corroboration-unavailable',reason:'NO_RELATED_OTHER_PUBLISHER_IN_SLOT_BUDGET'});
        }
        const inquiry=candidate.rank.inquiry;
        const question=inquiry?.question??`${candidate.source.topic}: ${item.title}`;
        selected.push({item,source:candidate.source,genre:candidate.source.genre!,input:{source:candidate.source,topic:question.slice(0,200),researchPlan:{inquiryIds:inquiry?[inquiry.id]:[],question:question.slice(0,900),reason:revision?'SOURCE_REVISION':inquiry?'FOLLOW_UP_FROM_SAVED_QUESTION':'NEW_SOURCE_EXPLORATION',sourceBudget:{candidateLimit:budget.candidateLimit,bodyLimit:budget.bodyLimit}},articleRef:{itemId:item.id,versionId:item.versionId!},outputDirectory:autonomousPaths(config).notes,maxAttempts:3}});
      }
      assertLease();
      if(!selected.length && collection.some(c=>c.status==='failed'))store.fail(op,slot,'COLLECTION_UNAVAILABLE: '+JSON.stringify(collection),now);
      else store.reserve(op,slot,selected,collection,now);
      agenda.deferPlan(researchPlan,selected.flatMap(e=>e.input.researchPlan?.inquiryIds??[]),op.id,slot,now);
    }
    assertLease();
    // The slot reservation is a durable outbox. Replaying after a crash yields the same queue ID.
    if(now>=Date.parse(op.startsAt)&&now<operationEnd(op))for(const entry of store.outbox(op)){
      const job=runtime.store.enqueueOnce(entry.input,`weekly:${op.id}:${entry.key}`,entry.source);store.attach(entry.key,job);agenda.bind(job,entry.input.researchPlan?.inquiryIds??[],now);
    }
    return {status:'planned',snapshot:store.snapshot(op,now)};
  }catch(e){if(slot&&!leaseError)store.fail(op,slot,safeDiagnostic(e),now);throw e;}
  finally{clearInterval(heartbeat);runtime.store.releaseWorker(token);store.close();agenda.close();}
}
