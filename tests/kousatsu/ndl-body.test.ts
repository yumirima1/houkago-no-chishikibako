import test from 'node:test';import assert from 'node:assert/strict';
import {extractArticle,ArticleContentStore} from '../../src/lib/kousatsu/article-content';
import {DatabaseSync} from 'node:sqlite';import {mkdtemp,mkdir,rm} from 'node:fs/promises';import path from 'node:path';

test('a short NDL article excludes unrelated widgets and separates background references from source assertions',()=>{
 const body='2026年10月31日から11月29日まで、スイス国立図書館が改修工事に伴う仮庁舎への移転のために一時閉館します。1931年に建築された現在の庁舎を改修・拡張する工事で、耐震性の強化や室内環境の改善を図るほか、将来的なニーズに応じて施設全体を多目的に利用できるようにすることなどが目的とされています。工事は2027年に開始され、2034年に竣工予定です。';
 const html=`<html><head><title>スイス国立図書館の改修</title></head><body><main><article><div class="entry-content"><p>${body}</p><p>原資料 <a href="https://example.org/swiss-renovation">改修計画</a></p><p>参考：英国図書館は2032年竣工予定。<a href="https://current.ndl.go.jp/car/285262">英国図書館</a></p><p>ドイツ国立図書館の増築計画。<a href="https://current.ndl.go.jp/car/285263">紹介記事</a></p></div></article><div class="widget"><p>${'100冊読破！泉佐野市の読書通帳。'.repeat(20)}</p></div></main></body></html>`;
 const result=extractArticle(html,'https://current.ndl.go.jp/car/286401');assert(result.text.includes(body));assert(!result.text.includes('英国図書館'));assert(!result.text.includes('ドイツ国立図書館'));assert(!result.text.includes('100冊読破'));
 assert(result.links.some(l=>l.url==='https://example.org/swiss-renovation'));assert(!result.links.some(l=>l.url.endsWith('/285262')));
 assert(result.metadata.referenceLinks?.some(l=>l.url.endsWith('/285262')&&l.text.startsWith('参考（別記事）')));assert.equal(result.metadata.extractorVersion,5);
});
test('a changed NDL layout fails closed rather than treating navigation as the article',()=>{
 assert.throws(()=>extractArticle('<html><body><article><p>'+ '関連ニュースだけがあるページ。'.repeat(30)+'</p></article></body></html>','https://current.ndl.go.jp/car/286401'),/NDL_CONTENT_MISSING/);
});

test('only obsolete NDL cache is refreshed, with old source bodies retained and a current NASA cache reused',async t=>{
 await mkdir('tmp',{recursive:true});const dir=await mkdtemp(path.resolve('tmp','ndl-cache-')),file=path.join(dir,'state.sqlite'),url='https://current.ndl.go.jp/car/286401',calls:string[]=[];
 const oldBody='以前に取得した本文と関連記事の記録。'.repeat(20),body='1931年の庁舎を改修し、耐震性と室内環境を改善します。工事は2027年に開始し、2034年に竣工予定です。'.repeat(4);
 const store=new ArticleContentStore(file,async target=>{calls.push(target);return {httpStatus:200,contentType:target.endsWith('robots.txt')?'text/plain':'text/html',text:target.endsWith('robots.txt')?'User-agent: *\nAllow: /':`<html><head><title>改修計画</title></head><body><article><div class="entry-content"><p>${body}</p><p>参考：英国図書館の工事 <a href="https://current.ndl.go.jp/car/285262">別記事</a></p></div></article></body></html>`};});const db=new DatabaseSync(file);
 t.after(async()=>{db.close();store.close();assert(dir.startsWith(path.resolve('tmp')+path.sep));await rm(dir,{recursive:true,force:true});});
 const seed=(id:string,target:string,version:number)=>{db.prepare('INSERT INTO research_page_documents VALUES(?,?,?,?,?,?,?,?)').run(id,target,target,'旧資料',oldBody,id,'[]',new Date().toISOString());db.prepare('INSERT INTO research_page_metadata VALUES(?,?)').run(id,JSON.stringify({extractorVersion:version}));db.prepare('INSERT INTO research_page_cache VALUES(?,?,?,?,?,?,?)').run(target,id,'available','2999-01-01T00:00:00Z',0,'2099-01-01',null);};
 seed('old',url,4);const result=await store.fetch(url,{enabled:true,allowedHosts:['current.ndl.go.jp'],maxArticles:1,followLinks:0,cacheMinutes:60});assert.equal(result.status,'available');assert.equal(result.document?.metadata?.extractorVersion,5);assert(calls.includes(url));assert.equal(db.prepare('SELECT body FROM research_page_documents WHERE id=?').get('old')?.body,oldBody);
 assert(result.document?.metadata?.referenceLinks?.some(l=>l.url.endsWith('/285262')));assert(!result.document?.links.some(l=>l.url.endsWith('/285262')));assert(!store.document(result.document!.id)?.links.some(l=>l.url.endsWith('/285262')));
 const nasa='https://science.nasa.gov/image-article/apod-current/';seed('nasa',nasa,4);const count=calls.length,cached=await store.fetch(nasa,{enabled:true,allowedHosts:['science.nasa.gov'],maxArticles:1,followLinks:0,cacheMinutes:60});assert.equal(cached.cached,true);assert.equal(calls.length,count);
});

test('upgrading NDL extraction cannot bypass the daily body-fetch attempt limit',async t=>{
 await mkdir('tmp',{recursive:true});const dir=await mkdtemp(path.resolve('tmp','ndl-limit-')),file=path.join(dir,'state.sqlite'),url='https://current.ndl.go.jp/car/286401',store=new ArticleContentStore(file,async()=>{throw Error('NO_NETWORK_EXPECTED');}),db=new DatabaseSync(file),at=new Date().toISOString();
 t.after(async()=>{db.close();store.close();assert(dir.startsWith(path.resolve('tmp')+path.sep));await rm(dir,{recursive:true,force:true});});
 db.prepare('INSERT INTO research_page_documents VALUES(?,?,?,?,?,?,?,?)').run('old',url,url,'旧資料','元本文','hash','[]',at);db.prepare('INSERT INTO research_page_metadata VALUES(?,?)').run('old',JSON.stringify({extractorVersion:4}));db.prepare('INSERT INTO research_page_cache VALUES(?,?,?,?,?,?,?)').run(url,'old','available','2999-01-01T00:00:00Z',3,at.slice(0,10),null);
 for(let i=0;i<3;i++)db.prepare('INSERT INTO research_page_attempts(id,url,started_at,status) VALUES(?,?,?,?)').run('attempt-'+i,url,at,'failed');
 const result=await store.fetch(url,{enabled:true,allowedHosts:['current.ndl.go.jp'],maxArticles:1,followLinks:0,cacheMinutes:60});assert.equal(result.status,'failed');assert.match(result.error!,/EXTRACTOR_UPGRADE_DAILY_LIMIT/);assert.equal(db.prepare('SELECT body FROM research_page_documents WHERE id=?').get('old')?.body,'元本文');
});
