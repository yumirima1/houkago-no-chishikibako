import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import robotsParser from 'robots-parser';
import { fetchFeed, canonicalizeUrl, type FeedFetchOptions } from './ingest';
import type { SourceInput, StoredItem } from './types';
import type { DocumentCoverage } from './quality-types';

const now=()=>new Date().toISOString();
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const extractorVersion=4;
const clean=(value:string)=>value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
export type PageDocument={id:string;url:string;finalUrl:string;title:string;text:string;fetchedAt:string;links:Array<{url:string;text:string}>;metadata?:DocumentCoverage['metadata']};
export type PageResult={status:'available'|'failed'|'denied'|'disabled';document?:PageDocument;error?:string;cached?:boolean;failureKind?:DocumentCoverage['failureKind']};

/** No scripts, styles, frames or resources are executed or loaded by this DOM. */
export function extractArticle(html:string,url:string) {
  const {document}=parseHTML(html);
  const meta=(selector:string)=>document.querySelector(selector)?.getAttribute('content')??undefined;
  const date=(value:string|undefined)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():undefined;
  const metadata:NonNullable<DocumentCoverage['metadata']>={
    language:document.documentElement?.getAttribute('lang')??meta('meta[http-equiv="content-language"]'),
    publishedAt:date(meta('meta[property="article:published_time"]')??meta('meta[name="date"]')??meta('meta[name="citation_date"]')),
    modifiedAt:date(meta('meta[property="article:modified_time"]')),
    primaryLinks:[],
    extractorVersion,
    ...(meta('meta[name="citation_title"]')?{documentKind:'paper' as const}:{}),
  };
  // Only a structured Event startDate is an event time. A publication date is not.
  for(const script of document.querySelectorAll('script[type="application/ld+json"]')){
    try {
      const data=JSON.parse(script.textContent??'{}');
      const nodes=Array.isArray(data)?data:[data,...(Array.isArray(data['@graph'])?data['@graph']:[])];
      const event=nodes.find(node=>node&&(Array.isArray(node['@type'])?node['@type']:[node['@type']]).includes('Event'));
      if(event)metadata.eventAt=date(event.startDate);
    } catch { /* Invalid structured metadata does not invalidate the article. */ }
  }
  if(document.querySelectorAll('*').length>30000)throw new Error('ARTICLE_TOO_MANY_ELEMENTS');
  if([...document.querySelectorAll('meta[name="robots"]')].some(meta=>/\bnoarchive\b/i.test(meta.getAttribute('content') ?? ''))) throw new Error('ARTICLE_ARCHIVING_DENIED');
  const base=document.createElement('base');base.setAttribute('href',url);document.head?.prepend(base);
  Object.defineProperty(document,'documentURI',{value:url,configurable:true});
  // NASA's APOD redesign places its explanation in the media hero. Readability
  // otherwise prefers the recurring credits sidebar over the actual article.
  if(new URL(url).hostname==='science.nasa.gov'&&new URL(url).pathname.startsWith('/image-article/apod-')){
    const explanation=document.querySelector('article .media-detail-hero__description');
    if(!explanation||!/^\s*Explanation:/i.test(explanation.textContent??'')||(explanation.textContent??'').trim().length<160)throw Error('ARTICLE_BODY_APOD_EXPLANATION_MISSING');
    const paragraph=explanation.cloneNode(true) as typeof explanation;paragraph.removeAttribute('class');
    for(const label of paragraph.querySelectorAll('b,strong'))if(/^Tomorrow.s picture:/i.test(label.textContent??'')){
      let node:typeof label|null=label;
      while(node){const next=node.nextSibling as typeof label|null;node.remove();node=next;}
    }
    const content=document.createElement('article'),heading=document.createElement('h1');heading.textContent=document.title;
    content.appendChild(heading);content.appendChild(paragraph);document.body.replaceChildren(content);
  }
  const article=new Readability(document as unknown as Document,{charThreshold:160,maxElemsToParse:30000}).parse();
  const body=parseHTML(article?.content ?? '').document;
  for(const element of body.querySelectorAll('p,div,li,h1,h2,h3,h4,br'))element.appendChild(body.createTextNode('\n'));
  const text=clean(body.documentElement?.textContent ?? article?.textContent ?? '');
  if(text.length<160)throw new Error('ARTICLE_BODY_EMPTY_OR_TOO_SHORT');
  const links=[...body.querySelectorAll('a[href]')].flatMap(anchor=>{
    try {
      const link=new URL(anchor.getAttribute('href')!,url);
      const text=clean(anchor.textContent??'');
      const paragraph=anchor.closest('p,li');
      const ownContext=clean((paragraph?.textContent??'').replace(text,'').replace(/https?:\/\/\S+/g,'')).slice(0,180);
      const context=/^https?:\/\//.test(text)?ownContext||clean(paragraph?.previousElementSibling?.textContent??'').slice(-180):'';
      return link.protocol==='https:'?[{url:canonicalizeUrl(link.href),text:context||text.slice(0,180)}]:[];
    }catch{return [];}
  }).filter(link=>link.text.length>=3 && !/\.(jpg|jpeg|png|gif|mp4|mp3|pdf)(\?|$)/i.test(link.url));
  const unique=[...new Map(links.map(link=>[link.url,link])).values()].slice(0,40);
  metadata.primaryLinks=unique.filter(link=>new URL(link.url).hostname!==new URL(url).hostname||/doi\.org|arxiv\.org\/abs\/|論文|原資料|報告書|研究成果|paper|study|report|source|詳細/i.test(link.url+' '+link.text)).map(link=>link.url);
  metadata.referenceLinks=unique;
  return {title:clean(article?.title ?? ''),text:text.slice(0,120000),links:unique,metadata};
}

/** Additive cache/provenance tables. Existing item versions and notes are never rewritten. */
export class ArticleContentStore {
  private readonly db:DatabaseSync;
  constructor(file:string,private readonly transport:typeof fetchFeed=fetchFeed) {
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS research_content_schema(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO research_content_schema VALUES(1);
      CREATE TABLE IF NOT EXISTS research_page_documents(id TEXT PRIMARY KEY,url TEXT NOT NULL,final_url TEXT NOT NULL,
        title TEXT NOT NULL,body TEXT NOT NULL,digest TEXT NOT NULL,links_json TEXT NOT NULL,fetched_at TEXT NOT NULL,UNIQUE(url,digest));
      CREATE TABLE IF NOT EXISTS research_page_cache(url TEXT PRIMARY KEY,document_id TEXT REFERENCES research_page_documents(id),
        status TEXT NOT NULL,next_at TEXT NOT NULL,attempts INTEGER NOT NULL,attempt_day TEXT NOT NULL,error TEXT);
      CREATE TABLE IF NOT EXISTS research_page_attempts(id TEXT PRIMARY KEY,url TEXT NOT NULL,started_at TEXT NOT NULL,
        finished_at TEXT,status TEXT NOT NULL,http_status INTEGER,error TEXT,document_id TEXT REFERENCES research_page_documents(id));
      CREATE TABLE IF NOT EXISTS research_robots(origin TEXT PRIMARY KEY,body TEXT NOT NULL,status TEXT NOT NULL,fetched_at TEXT NOT NULL,error TEXT);
      CREATE TABLE IF NOT EXISTS research_content_provenance(version_id TEXT PRIMARY KEY REFERENCES item_versions(id),
        document_id TEXT REFERENCES research_page_documents(id),coverage_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_page_metadata(document_id TEXT PRIMARY KEY REFERENCES research_page_documents(id),metadata_json TEXT NOT NULL);
    `);
  }
  close(){this.db.close();}
  document(id:string):PageDocument|null {
    const row=this.db.prepare('SELECT * FROM research_page_documents WHERE id=?').get(id);
    const metadata=row?this.db.prepare('SELECT metadata_json FROM research_page_metadata WHERE document_id=?').get(id):undefined;
    const parsed=metadata?JSON.parse(String(metadata.metadata_json)):undefined;
    return row ? {id:String(row.id),url:String(row.url),finalUrl:String(row.final_url),title:String(row.title),text:String(row.body),fetchedAt:String(row.fetched_at),links:parsed?.referenceLinks??JSON.parse(String(row.links_json)),...(parsed?{metadata:parsed}:{})} : null;
  }
  coverage(item:StoredItem):DocumentCoverage {
    const row=item.versionId ? this.db.prepare('SELECT coverage_json FROM research_content_provenance WHERE version_id=?').get(item.versionId) : undefined;
    return row ? JSON.parse(String(row.coverage_json)) : {itemId:item.id,versionId:item.versionId!,url:item.url,
      fetchedAt:item.fetchedAt,kind:item.summary || item.content ? 'feed-summary' : 'metadata',status:'available'};
  }
  bind(item:StoredItem,result:PageResult) {
    const coverage:DocumentCoverage={itemId:item.id,versionId:item.versionId!,url:item.url,
      kind:result.document ? 'article-body' : item.summary || item.content ? 'feed-summary' : 'metadata',
      status:result.status,fetchedAt:result.document?.fetchedAt ?? item.fetchedAt,
      ...(result.document ? {documentId:result.document.id} : {}),...(result.error ? {error:result.error} : {})};
    if(result.document?.metadata)coverage.metadata=result.document.metadata;
    if(result.failureKind)coverage.failureKind=result.failureKind;
    this.db.prepare('INSERT OR IGNORE INTO research_content_provenance VALUES(?,?,?)').run(item.versionId!,result.document?.id ?? null,JSON.stringify(coverage));
    return coverage;
  }
  private async robots(url:URL,options:FeedFetchOptions) {
    const cached=this.db.prepare('SELECT * FROM research_robots WHERE origin=?').get(url.origin);
    let body=String(cached?.body ?? ''),status=String(cached?.status ?? '');
    if(!cached || Date.now()-Date.parse(String(cached.fetched_at))>86400000) {
      let error:string|null=null;
      try {const result=await this.transport(new URL('/robots.txt',url).href,{...options,accept:'text/plain',retries:0});body=result.text;status='available';}
      catch(e) {const code=(e as {httpStatus?:number}).httpStatus;status=code===404 || code===410 ? 'not-found' : 'unavailable';body='';error=e instanceof Error ? e.message : String(e);}
      this.db.prepare(`INSERT INTO research_robots VALUES(?,?,?,?,?) ON CONFLICT(origin) DO UPDATE SET
        body=excluded.body,status=excluded.status,fetched_at=excluded.fetched_at,error=excluded.error`).run(url.origin,body,status,now(),error);
    }
    if(status==='unavailable')throw new Error('ROBOTS_UNAVAILABLE: body retrieval deferred');
    const parser=robotsParser(new URL('/robots.txt',url).href,body);
    if(parser.isDisallowed(url.href,'Kousatsu-bako'))throw new Error('ROBOTS_DENIED');
    const crawlDelay=parser.getCrawlDelay('Kousatsu-bako');
    if(crawlDelay && crawlDelay>30)throw new Error('ROBOTS_CRAWL_DELAY_EXCEEDS_BUDGET: retrieval deferred');
    if(crawlDelay && crawlDelay>1) await new Promise(resolve=>setTimeout(resolve,crawlDelay*1000));
  }
  async fetch(urlValue:string,policy:NonNullable<SourceInput['articlePolicy']>):Promise<PageResult> {
    if(!policy.enabled)return {status:'disabled',error:'ARTICLE_RETRIEVAL_DISABLED'};
    let url:URL;
    try {url=new URL(canonicalizeUrl(urlValue));if(url.protocol!=='https:' || !policy.allowedHosts.includes(url.hostname))throw new Error('ARTICLE_HOST_NOT_ALLOWED');}
    catch(e){return {status:'denied',error:String(e)};}
    const cached=this.db.prepare('SELECT * FROM research_page_cache WHERE url=?').get(url.href);
    const day=now().slice(0,10);
    // Count started attempts too: a killed process must not reset the daily budget.
    this.db.prepare("UPDATE research_page_attempts SET status='interrupted',finished_at=?,error='PROCESS_INTERRUPTED' WHERE status='running' AND started_at<?")
      .run(now(),new Date(Date.now()-120000).toISOString());
    const attemptsToday=Number(this.db.prepare('SELECT count(*) n FROM research_page_attempts WHERE url=? AND started_at>=?').get(url.href,day)?.n);
    const cachedDocument=cached?.document_id?this.document(String(cached.document_id)):null;
    const currentExtractor=!cachedDocument||cachedDocument.metadata?.extractorVersion===extractorVersion;
    if(attemptsToday>=3&&!currentExtractor)return {status:'failed',error:'ARTICLE_BODY_EXTRACTOR_UPGRADE_DAILY_LIMIT',failureKind:'extraction',cached:true};
    if(cached && currentExtractor && (String(cached.next_at)>now() || attemptsToday>=3)) {
      const doc=cached.document_id ? this.document(String(cached.document_id)) : null;
      return {status:cached.status as PageResult['status'],...(doc ? {document:doc} : {}),...(cached.error ? {error:String(cached.error),failureKind:classifyArticleFailure(String(cached.error))} : {}),cached:true};
    }
    if(attemptsToday>=3)return {status:'failed',error:'ARTICLE_DAILY_ATTEMPT_LIMIT',cached:true};
    const id=randomUUID();this.db.prepare("INSERT INTO research_page_attempts(id,url,started_at,status) VALUES(?,?,?,'running')").run(id,url.href,now());
    const options={allowedHosts:policy.allowedHosts,allowCompression:true,timeoutMs:15000,retries:1,includeMetadata:true};
    let result:PageResult,httpStatus:number|null=null;
    try {
      await this.robots(url,options);
      const fetched=await this.transport(url.href,{...options,accept:'text/html, application/xhtml+xml'});httpStatus=fetched.httpStatus;
      if(fetched.contentType && !/text\/html|application\/xhtml\+xml/i.test(fetched.contentType))throw new Error('ARTICLE_CONTENT_TYPE_REJECTED');
      if(fetched.finalUrl && new URL(fetched.finalUrl).origin!==url.origin)await this.robots(new URL(fetched.finalUrl),options);
      const extracted=extractArticle(fetched.text,fetched.finalUrl ?? url.href);const hash=digest(extracted.text);
      const old=this.db.prepare('SELECT id FROM research_page_documents WHERE url=? AND digest=?').get(url.href,hash);
      const docId=old ? String(old.id) : randomUUID();
      this.db.prepare('INSERT OR IGNORE INTO research_page_documents VALUES(?,?,?,?,?,?,?,?)').run(docId,url.href,fetched.finalUrl ?? url.href,
        extracted.title,extracted.text,hash,JSON.stringify(extracted.links),now());
      this.db.prepare('INSERT INTO research_page_metadata VALUES(?,?) ON CONFLICT(document_id) DO UPDATE SET metadata_json=excluded.metadata_json').run(docId,JSON.stringify(extracted.metadata));
      result={status:'available',document:this.document(docId)!};
    } catch(e) {
      const error=e instanceof Error ? e.message : String(e);httpStatus=(e as {httpStatus?:number}).httpStatus ?? httpStatus;
      result={status:/DENIED|HOST_NOT_ALLOWED|HTTP 40[13]/.test(error) ? 'denied' : 'failed',error,failureKind:classifyArticleFailure(error)};
    }
    const attempts=cached?.attempt_day===day ? Number(cached.attempts)+1 : 1;
    const delay=result.status==='available' ? policy.cacheMinutes : result.status==='denied' ? 1440 : 15;
    this.db.prepare(`INSERT INTO research_page_cache VALUES(?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET
      document_id=excluded.document_id,status=excluded.status,next_at=excluded.next_at,attempts=excluded.attempts,attempt_day=excluded.attempt_day,error=excluded.error`)
      .run(url.href,result.document?.id ?? null,result.status,new Date(Date.now()+delay*60000).toISOString(),attempts,day,result.error ?? null);
    this.db.prepare('UPDATE research_page_attempts SET finished_at=?,status=?,http_status=?,error=?,document_id=? WHERE id=?')
      .run(now(),result.status,httpStatus,result.error ?? null,result.document?.id ?? null,id);
    return result;
  }
}

export function classifyArticleFailure(error:string):NonNullable<DocumentCoverage['failureKind']>{
  return /HTTP (404|410)/.test(error)?'missing':/HTTP (401|403|429)/.test(error)?'access-restricted':
    /ROBOTS|DENIED|HOST_NOT_ALLOWED/.test(error)?'policy':/timeout|timed out|abort/i.test(error)?'timeout':
    /ARTICLE_BODY|ARTICLE_CONTENT|ARTICLE_TOO/.test(error)?'extraction':'network';
}
