import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {specificResearchPeer} from '../../src/lib/kousatsu/relevance';
import {KousatsuDatabase} from '../../src/lib/kousatsu/database';
import {prepareResearchDocuments} from '../../src/lib/kousatsu/research-documents';
import {ArticleContentStore} from '../../src/lib/kousatsu/article-content';
import type {SourceInput} from '../../src/lib/kousatsu/types';
import type {fetchFeed} from '../../src/lib/kousatsu/ingest';

test('shared LLM evaluation vocabulary does not make unrelated benchmarks evidence for novelty evaluation',()=>{
 const a={title:'Old Ideas Novel Problems: LLM Novelty Evaluation',summary:'LLM evaluation benchmark research',canonicalUrl:'https://example.org/novelty'};
 const b={...a,title:'LLM evaluation benchmark for Arabic language generation',canonicalUrl:'https://example.org/arabic'};
 assert.equal(specificResearchPeer(a,b),false);
 assert.equal(specificResearchPeer({...a,title:'Enceladus plume measurements of ice activity'},{...b,title:'Enceladus plume measurements compare ice activity'}),true);
});

test('stored reverse citations recover a real companion document while generic benchmark matches are not fetched',async()=>{
 await mkdir('tmp',{recursive:true});const dir=await mkdtemp(path.resolve('tmp','specific-discovery-')),file=path.join(dir,'state.sqlite'),db=new KousatsuDatabase(file);
 const source:SourceInput={id:'science',name:'Research',feedUrl:'https://example.org/feed',contentPolicy:'metadata-only',articlePolicy:{enabled:true,allowedHosts:['example.org'],maxArticles:3,followLinks:0,cacheMinutes:15}};
 db.upsertSource(source);const at='2026-11-06T00:00:00Z';
 const initialize=new ArticleContentStore(file);initialize.close();
 const add=(slug:string,title:string)=>db.getItem(db.upsertItem({id:slug,sourceId:source.id,title,url:`https://example.org/${slug}`,canonicalUrl:`https://example.org/${slug}`,contentHash:'',fetchedAt:at,summary:'LLM evaluation benchmark research'}).id)!;
 const primary=add('paper','Old Ideas Novel Problems: LLM Novelty Evaluation'),citing=add('blog','What makes an idea original'),unrelated=add('arabic','LLM evaluation benchmark for Arabic language generation');
 db.saveDocumentCoverage(citing.versionId!,null,{itemId:citing.id,versionId:citing.versionId,kind:'article-body',status:'available',url:citing.url,fetchedAt:at,metadata:{primaryLinks:[primary.canonicalUrl]}});
 assert.deepEqual(db.referencingItems(primary.canonicalUrl).map(i=>i.id),[citing.id]);assert.equal(specificResearchPeer(primary,citing),false);
 const calls:string[]=[];const transport:typeof fetchFeed=async url=>{calls.push(url);const item=[primary,citing,unrelated].find(i=>i.url===url);return {httpStatus:200,contentType:'text/html',text:url.endsWith('robots.txt')?'User-agent: *\nAllow: /':`<html><head><title>${item?.title}</title></head><body><article><h1>${item?.title}</h1><p>${'Researchers report source-specific observations and describe the limits of the evaluation method. '.repeat(8)}</p></article></body></html>`};};
 try{const prepared=await prepareResearchDocuments(file,[primary],source,transport,{database:db,sources:[source]});assert.deepEqual(prepared.entries.map(e=>e.item.id),[primary.id,citing.id]);assert(!calls.includes(unrelated.url));assert(prepared.discovery.some(d=>d.query.startsWith('参照関係:')&&d.itemIds.includes(citing.id)));}finally{db.close();}
});
