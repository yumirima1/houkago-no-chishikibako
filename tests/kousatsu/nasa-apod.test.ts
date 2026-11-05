import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {extractArticle,ArticleContentStore} from '../../src/lib/kousatsu/article-content';

const caption='Explanation: The image was captured by the spacecraft in 2009. Jets from the southern pole are visible in sunlight. The icy material may originate in an ocean beneath the surface. The picture alone does not establish conditions suitable for life.';
const sidebar='Astronomy Picture of the Day. Each day a different image is featured. Authors and editors provide credits and navigation links. '.repeat(8);
const html=(include=true)=>`<html lang="en"><head><title>APOD: Icy moon</title><meta property="article:published_time" content="2026-11-05T00:00:00Z"></head><body><main><article>${include?`<p class="media-detail-hero__description"><strong>Explanation:</strong>${caption.slice('Explanation:'.length)} <a href="https://science.nasa.gov/mission/cassini/">Cassini mission</a><b>Tomorrow's picture:</b> other topic</p>`:''}<aside><p>${sidebar}</p></aside></article></main></body></html>`;
test('NASA APOD extraction reads the explanation instead of credits and preserves observation/publication times separately',()=>{
 const result=extractArticle(html(),'https://science.nasa.gov/image-article/apod-2026-november-5-icy-moon/');
 assert(result.text.includes('captured by the spacecraft in 2009'));assert(result.text.includes('may originate'));assert(result.text.includes('does not establish'));
 assert(!result.text.includes('Each day a different'));assert(!result.text.includes('Tomorrow'));assert.equal(result.metadata.publishedAt,'2026-11-05T00:00:00.000Z');assert.equal(result.metadata.eventAt,undefined);assert.equal(result.metadata.extractorVersion,4);
 assert(result.links.some(l=>l.url==='https://science.nasa.gov/mission/cassini/'));
});
test('a missing APOD explanation cannot turn a long credits sidebar into an available article body',()=>{
 assert.throws(()=>extractArticle(html(false),'https://science.nasa.gov/image-article/apod-2026-november-5-icy-moon/'),/APOD_EXPLANATION_MISSING/);
});
test('a daily attempt limit cannot make an obsolete-extractor document usable again',async t=>{
 const dir=await mkdtemp(path.resolve('tmp/apod-cache-'));
 const file=path.join(dir,'cache.sqlite'),url='https://science.nasa.gov/image-article/apod-old/',store=new ArticleContentStore(file,async()=>{throw Error('NO_NETWORK_EXPECTED');});
 const db=new DatabaseSync(file),now=new Date().toISOString(),day=now.slice(0,10);
 t.after(()=>{db.close();store.close();assert(dir.startsWith(path.resolve('tmp')+path.sep));return rm(dir,{recursive:true,force:true});});
 db.prepare('INSERT INTO research_page_documents VALUES(?,?,?,?,?,?,?,?)').run('old',url,url,'Old APOD',sidebar,'old-hash','[]',now);
 db.prepare('INSERT INTO research_page_metadata VALUES(?,?)').run('old',JSON.stringify({extractorVersion:3}));
 db.prepare('INSERT INTO research_page_cache VALUES(?,?,?,?,?,?,?)').run(url,'old','available','2999-01-01T00:00:00Z',3,day,null);
 for(let i=0;i<3;i++)db.prepare('INSERT INTO research_page_attempts(id,url,started_at,status) VALUES(?,?,?,?)').run('attempt-'+i,url,now,'failed');
 const result=await store.fetch(url,{enabled:true,allowedHosts:['science.nasa.gov'],maxArticles:1,followLinks:1,cacheMinutes:60});
 assert.equal(result.status,'failed');assert.equal(result.document,undefined);assert.match(result.error!,/EXTRACTOR_UPGRADE_DAILY_LIMIT/);assert.equal(db.prepare('SELECT body FROM research_page_documents WHERE id=?').get('old')?.body,sidebar);
});
