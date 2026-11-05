import { randomUUID } from 'node:crypto';
import { ArticleContentStore, type PageResult } from './article-content';
import { canonicalizeUrl, fetchFeed } from './ingest';
import { compareRecords, meaningfulTerms,specificResearchPeer } from './relevance';
import type { SourceInput, StoredItem } from './types';
import type {KousatsuDatabase} from './database';

export type DiscoveryAttempt={query:string;purpose:'related'|'counterevidence';status:'found'|'not-found';itemIds:string[]};

/** Network work is done before the caller's atomic version/checkpoint commit. */
export async function prepareResearchDocuments(file:string,items:StoredItem[],source:SourceInput,transport:typeof fetchFeed=fetchFeed,
  options:{database?:KousatsuDatabase;sources?:SourceInput[]}={}) {
  const policy=source.articlePolicy;
  if(!policy?.enabled || !items.length)return {entries:items.map(item=>({item,result:{status:'disabled'} as PageResult,source})),followUp:[],discovery:[] as DiscoveryAttempt[]};
  const primary=items[0];
  const references=(item:StoredItem,target:StoredItem)=>item.versionId&&options.database?.documentCoverage(item.versionId)?.metadata?.primaryLinks?.includes(target.canonicalUrl);
  const linked=(item:StoredItem)=>Boolean(references(primary,item)||references(item,primary));
  const relevant=(item:StoredItem)=>linked(item)||specificResearchPeer(primary,item);
  const related=items.slice(1).filter(relevant);
  const chosen=[primary,...related].slice(0,policy.maxArticles);
  const store=new ArticleContentStore(file,transport);
  try {
    const entries:Array<{item:StoredItem;result:PageResult;source:SourceInput}>=[];
    const followUp:Array<{url:string;status:string;reason:string}>=[];
    const discovery:DiscoveryAttempt[]=[];
    for(const item of chosen) entries.push({item,result:await store.fetch(item.url,policy),source});
    const primaryBody=entries[0]?.result.document?.text??'';
    const focusTerms=meaningfulTerms(primary.title);
    const bodyTerms=meaningfulTerms(primaryBody.slice(0,3500));
    const visited=new Set(chosen.map(item=>item.canonicalUrl));
    const configured=[source,...(options.sources??[]).filter(s=>s.id!==source.id)];
    const sourceFor=(url:string)=>configured.find(s=>s.articlePolicy?.enabled&&s.articlePolicy.allowedHosts.includes(new URL(url).hostname));
    const links=entries.flatMap(entry=>entry.result.document?.links ?? []).filter(link=>{
      if(visited.has(link.url) || !sourceFor(link.url)||/\/(?:subscribe|newsletter|privacy|contact|tags?|category)\b/i.test(new URL(link.url).pathname))return false;
      const common=[...meaningfulTerms(link.text)].filter(term=>focusTerms.has(term));
      const fromBody=[...meaningfulTerms(link.text)].filter(term=>bodyTerms.has(term));
      return common.length>=2||fromBody.length>=3||/論文|原資料|報告書|研究成果|\b(?:paper|study|report|source)\b/i.test(link.text);
    }).sort((a,b)=>{
      const score=(link:{url:string;text:string})=>[...meaningfulTerms(link.text)].filter(t=>focusTerms.has(t)).length+(/\/(?:news|press|car|abs)\//.test(link.url)?4:0);
      return score(b)-score(a);
    });
    for(const link of [...new Map(links.map(l=>[l.url,l])).values()].slice(0,policy.followLinks)) {
      const linkedSource=sourceFor(link.url)!;
      const result=await store.fetch(link.url,linkedSource.articlePolicy!);
      followUp.push({url:link.url,status:result.status,reason:`原記事で実際に参照された資料: ${link.text.slice(0,140)}。${result.error?`取得失敗: ${result.error}`:'支持・反証と独立性は未確認。'}`});
      visited.add(link.url);
      if(result.document) entries.push({item:{id:randomUUID(),sourceId:linkedSource.id,title:result.document.title || link.text,
        url:link.url,canonicalUrl:canonicalizeUrl(link.url),contentHash:'',fetchedAt:result.document.fetchedAt,content:result.document.text,publishedAt:result.document.metadata?.publishedAt},result,source:linkedSource});
    }
    if(options.database){
      const keys=[...focusTerms].slice(0,6);
      const queries=[{query:keys.join(' '),purpose:'related' as const},
        {query:keys.slice(0,3).join(' ')+' limitations criticism failed 検証 限界 異論',purpose:'counterevidence' as const}];
      const candidates=new Map<string,StoredItem>();
      const citing=options.database.referencingItems(primary.canonicalUrl).filter(item=>!visited.has(item.canonicalUrl));
      for(const item of citing)candidates.set(item.id,item);
      discovery.push({query:`参照関係: ${primary.canonicalUrl}`,purpose:'related',status:citing.length?'found':'not-found',itemIds:citing.map(i=>i.id)});
      for(const query of queries){
        const matches=options.database.search(query.query,30).filter(item=>!visited.has(item.canonicalUrl)&&
          relevant(item))
          .filter(item=>query.purpose!=='counterevidence'||/limit|critici|fail|not reproduce|no evidence|uncertain|反対|限界|疑義|課題|再現でき|誤り/i.test(`${item.title} ${item.summary??''} ${item.content??''}`));
        discovery.push({...query,status:matches.length?'found':'not-found',itemIds:matches.map(i=>i.id)});
        for(const item of matches)candidates.set(item.id,item);
      }
      // Search each specific term too: FTS conjunctions must not hide a related update.
      for(const key of keys.slice(0,3))for(const item of options.database.search(key,15))if(!visited.has(item.canonicalUrl)&&
        relevant(item))candidates.set(item.id,item);
      const ranked=[...candidates.values()].sort((a,b)=>Number(linked(b))-Number(linked(a))||Number(b.sourceId!==source.id)-Number(a.sourceId!==source.id)||compareRecords(primary,b).score-compareRecords(primary,a).score);
      for(const item of ranked){
        if(entries.length>=3)break;
        const peerSource=configured.find(s=>s.id===item.sourceId);if(!peerSource?.articlePolicy?.enabled)continue;
        const result=await store.fetch(item.url,peerSource.articlePolicy);
        visited.add(item.canonicalUrl);
        followUp.push({url:item.url,status:result.status,reason:linked(item)?'保存した原資料の参照関係に基づく追加資料。支持・反証と独立性は未確認。':'汎用的な研究用語を除いた共通対象による追加資料候補。支持・反証と独立性は未確認。'});
        if(result.document)entries.push({item,result,source:peerSource});
      }
    }
    return {entries,followUp,discovery};
  } finally {store.close();}
}
