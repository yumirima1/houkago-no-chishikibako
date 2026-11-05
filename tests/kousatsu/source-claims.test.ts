import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {KousatsuDatabase} from '../../src/lib/kousatsu/database';
import {extractSourceClaims} from '../../src/lib/kousatsu/knowledge';

test('a bare archive link is retained in the document but never selected as a source assertion',t=>{
 const tempRoot=fileURLToPath(new URL('../../tmp/',import.meta.url)),directory=mkdtempSync(path.join(tempRoot,'source-claims-')),file=directory+'/test.sqlite';
 const database=new KousatsuDatabase(file),reader=new DatabaseSync(file,{readOnly:true});t.after(()=>{reader.close();database.close();if(!directory.startsWith(tempRoot))throw Error('UNEXPECTED_TEST_PATH');rmSync(directory,{recursive:true,force:true});});
 const source={id:'s',feedUrl:'https://example.org/feed',name:'Library'};database.upsertSource(source);
 const body='https://example.org/digital-archive/collection\n\n図書館は、所蔵資料を現代の人が気軽に楽しめるようにワークショップキットを制作したと報告した。\n\n2026年11月15日には「知る！つくる！あそぶ！」を開催します。';
 database.upsertItem({id:'item',sourceId:'s',url:'https://example.org/article',canonicalUrl:'https://example.org/article',title:'図書館のワークショップキット',content:body,contentHash:'fixture',fetchedAt:new Date().toISOString()});
 const item=database.getItem('item')!,legacy=database.upsertClaim({itemId:item.id,versionId:item.versionId,text:'https://example.org/digital-archive/collection',classification:'unverified',confidence:.1,reason:'保存済みの記録'});
 const before=reader.prepare('SELECT * FROM claims WHERE id=?').get(legacy);
 const claims=extractSourceClaims(database,[item],[{itemId:item.id,versionId:item.versionId!,kind:'article-body',status:'available',url:item.url,fetchedAt:item.fetchedAt}]);
 assert(claims.length>=2);assert(claims.every(claim=>!/^https?:\/\/\S+$/.test(claim.text)));
 assert(claims.some(claim=>claim.text.includes('2026年11月15日')&&claim.text.includes('開催します。')));
 assert.equal(database.getItem('item')!.content,body);assert.deepEqual(reader.prepare('SELECT * FROM claims WHERE id=?').get(legacy),before);
});
