import { randomUUID } from 'node:crypto';
import { ArticleContentStore, type PageResult } from './article-content';
import { canonicalizeUrl, fetchFeed } from './ingest';
import { compareRecords, meaningfulTerms } from './relevance';
import type { SourceInput, StoredItem } from './types';

/** Network work is done before the caller's atomic version/checkpoint commit. */
export async function prepareResearchDocuments(file:string,items:StoredItem[],source:SourceInput,transport:typeof fetchFeed=fetchFeed) {
  const policy=source.articlePolicy;
  if(!policy?.enabled || !items.length)return {entries:items.map(item=>({item,result:{status:'disabled'} as PageResult})),followUp:[]};
  const primary=items[0];
  const related=items.slice(1).filter(item=>['same_document','follow_up_candidate','same_issue_candidate'].includes(compareRecords(primary,item).kind));
  const chosen=[primary,...related].slice(0,policy.maxArticles);
  const store=new ArticleContentStore(file,transport);
  try {
    const entries:Array<{item:StoredItem;result:PageResult}>=[];
    const followUp:Array<{url:string;status:string;reason:string}>=[];
    for(const item of chosen) entries.push({item,result:await store.fetch(item.url,policy)});
    const focusTerms=meaningfulTerms(primary.title);
    const visited=new Set(items.map(item=>item.canonicalUrl));
    const links=entries.flatMap(entry=>entry.result.document?.links ?? []).filter(link=>{
      if(visited.has(link.url) || !policy.allowedHosts.includes(new URL(link.url).hostname))return false;
      const common=[...meaningfulTerms(link.text)].filter(term=>focusTerms.has(term));return common.length>=2;
    });
    for(const link of [...new Map(links.map(l=>[l.url,l])).values()].slice(0,policy.followLinks)) {
      const result=await store.fetch(link.url,policy);
      followUp.push({url:link.url,status:result.status,reason:`原記事で実際に参照された資料。共通対象: ${[...meaningfulTerms(link.text)].filter(term=>focusTerms.has(term)).join('、')}`});
      if(result.document) entries.push({item:{id:randomUUID(),sourceId:source.id,title:result.document.title || link.text,
        url:link.url,canonicalUrl:canonicalizeUrl(link.url),contentHash:'',fetchedAt:result.document.fetchedAt,content:result.document.text},result});
    }
    return {entries,followUp};
  } finally {store.close();}
}
