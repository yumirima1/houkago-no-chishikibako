import {WeeklyStore,sameArticle} from './weekly-store';
import type {AutonomousConfig} from './autonomous-config';
import {autonomousPaths} from './autonomous-config';
import type {ResearchRuntime} from './runtime-service';
import type {ResearchSource} from './runtime-types';
import {collectFeedXml,fetchFeed} from './ingest';
import {prepareResearchDocuments} from './research-documents';
import {safeDiagnostic} from './research-engine';
import type {PipelineInput,StoredItem} from './types';
import {meaningfulTerms} from './relevance';

/** Select articles with the existing network/content policy under the existing worker fence. */
export async function planWeekly(config:AutonomousConfig,runtime:ResearchRuntime,sources:ResearchSource[],transport:typeof fetchFeed=fetchFeed,now=Date.now()){
  const op=config.operation!;const store=new WeeklyStore(runtime.database.filePath),token=runtime.store.acquireWorker();
  if(!token){store.close();return {status:'busy'};}
  let leaseError:unknown;
  const heartbeat=setInterval(()=>{try{runtime.store.renewWorker(token);}catch(e){leaseError=e;}},10000);heartbeat.unref();
  const assertLease=()=>{if(leaseError)throw leaseError;runtime.store.renewWorker(token);};
  let slot:string|undefined;
  try{
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
      const enabled=sources.filter(s=>s.enabled&&s.genre&&op.genres.includes(s.genre));
      const counts=new Map<string,number>();for(const p of prior.slice(0,50))counts.set(p.genre,(counts.get(p.genre)??0)+1);
      enabled.sort((a,b)=>(counts.get(a.genre!)??0)-(counts.get(b.genre!)??0));
      const collection:Array<Record<string,unknown>>=[],candidates:Array<{source:ResearchSource;item:StoredItem}>=[];
      for(const source of enabled){
        assertLease();runtime.database.upsertSource(source);const fetchId=runtime.database.beginFetch(source.id);
        try{
          const fetched=await transport(source.feedUrl,{allowedHosts:[new URL(source.feedUrl).hostname],timeoutMs:15000,retries:1});assertLease();
          const collected=collectFeedXml(runtime.database,source,fetched.text,fetched.httpStatus,fetchId);
          const items=collected.itemIds.slice(0,30).map(id=>runtime.database.getItem(id)!).filter(Boolean)
            .filter(item=>meaningfulTerms(item.title).size>=3 && !prior.some(p=>sameArticle(p.item,item)))
            .filter(item=>!item.publishedAt || Date.parse(item.publishedAt)<=now+86400000);
          const recent=items.filter(item=>!item.publishedAt||Date.parse(item.publishedAt)>=now-90*86400000);
          collection.push({sourceId:source.id,genre:source.genre,fetchedAt:new Date().toISOString(),count:collected.totalItemCount,candidates:items.length,status:'succeeded'});
          for(const item of recent.slice(0,2))candidates.push({source,item});
        }catch(e){const error=safeDiagnostic(e);runtime.database.finishFetch(fetchId,{status:'failed',error});collection.push({sourceId:source.id,genre:source.genre,status:'failed',error});}
      }
      // Round-robin across sources, least-covered genres first. A failed body never blocks another genre.
      const ordered=[...candidates.filter((c,i)=>candidates.findIndex(p=>p.source.id===c.source.id)===i),...candidates.filter((c,i)=>candidates.findIndex(p=>p.source.id===c.source.id)!==i)];
      const selected:Array<{genre:string;item:StoredItem;source:ResearchSource;input:PipelineInput}>=[];
      for(const candidate of ordered){
        if(selected.length>=op.maxArticles)break;
        if(prior.some(p=>sameArticle(p.item,candidate.item))||selected.some(p=>sameArticle(p.item,candidate.item)))continue;
        assertLease();
        const prepared=await prepareResearchDocuments(runtime.database.filePath,[candidate.item],candidate.source,transport);assertLease();
        const entry=prepared.entries[0],body=entry.result.document;
        if(!body && (candidate.item.summary??candidate.item.content??'').length<160){collection.push({article:candidate.item.url,genre:candidate.source.genre,status:'skipped',reason:entry.result.error??'INSUFFICIENT_READABLE_CONTENT'});continue;}
        const item=body?runtime.database.getItem(runtime.database.upsertItem({...candidate.item,content:body.text,fetchedAt:body.fetchedAt}).id)!:candidate.item;
        selected.push({item,source:candidate.source,genre:candidate.source.genre!,input:{source:candidate.source,topic:`${candidate.source.topic}: ${item.title}`.slice(0,200),articleRef:{itemId:item.id,versionId:item.versionId!},outputDirectory:autonomousPaths(config).notes,maxAttempts:3}});
      }
      assertLease();
      if(!selected.length && collection.some(c=>c.status==='failed'))store.fail(op,slot,'COLLECTION_UNAVAILABLE: '+JSON.stringify(collection),now);
      else store.reserve(op,slot,selected,collection,now);
    }
    assertLease();
    // The slot reservation is a durable outbox. Replaying after a crash yields the same queue ID.
    if(now>=Date.parse(op.startsAt)&&now<Date.parse(op.endsAt))for(const entry of store.outbox(op)){
      const job=runtime.store.enqueueOnce(entry.input,`weekly:${op.id}:${entry.key}`,entry.source);store.attach(entry.key,job);
    }
    return {status:'planned',snapshot:store.snapshot(op,now)};
  }catch(e){if(slot&&!leaseError)store.fail(op,slot,safeDiagnostic(e),now);throw e;}
  finally{clearInterval(heartbeat);runtime.store.releaseWorker(token);store.close();}
}
