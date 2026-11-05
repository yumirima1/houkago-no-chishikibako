import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ResearchStore} from '../../src/lib/kousatsu/runtime-store';

test('a saved headquarters misreading remains stored but is excluded from memory retrieval; its faithful counterpart remains usable',async t=>{
 const dir=await mkdtemp(path.resolve('tmp/summary-memory-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'legacy.sqlite'),db=new DatabaseSync(file);
 db.exec(`CREATE TABLE research_memory_events(id TEXT,job_id TEXT,article_id TEXT,topic TEXT,kind TEXT,text TEXT,reason TEXT,references_json TEXT,verification_status TEXT,fact_check_status TEXT,created_at TEXT);
 CREATE TABLE research_memory_revisions(old_memory_id TEXT);
 CREATE TABLE research_schema(version INTEGER);INSERT INTO research_schema VALUES(1);
 CREATE TABLE checkpoints(job_id TEXT,stage TEXT,data_json TEXT,status TEXT);`);
 const quote='Nearly 11,000 have sought sanctuary within the compound of a church based in Los Angeles, which does humanitarian work in Kenya, said IOM.';
 for(const id of ['bad','sound']){
  const quality={schema:2,coverage:[],observations:[{claimId:'c',quote}],reflection:{issue:'活動をどう評価するか。',position:'私は避難者への支援を重視する。',reasoning:'本文は避難者への支援を報告している。',alternative:'一方、別の制約もあり得る。',revisionCondition:'もし支援が届かないと観測されれば、見解の優先順位を下げる。',premiseClaimIds:['c']},evidenceReview:{summaries:[{itemId:'d',facts:[{claimId:'c',text:`IOMによると、${id==='bad'?'ケニア':'Los Angeles'}を拠点とする教会に約11,000人が避難している。`}]}]}};
  db.prepare('INSERT INTO checkpoints VALUES(?,?,?,?)').run(id,'analyze',JSON.stringify({quality}),'succeeded');
  db.prepare('INSERT INTO research_memory_events VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,id,id,'支援活動','interpretation','私は避難者への支援を重視する。','旧記録','[]','passed','unverified','2026-11-01T00:00:00Z');
 }
 const before=JSON.stringify(db.prepare('SELECT * FROM research_memory_events ORDER BY id').all());db.close();
 const store=new ResearchStore(file,{readOnly:true});try{assert.deepEqual(store.retrieveMemories('支援活動',10).map(m=>m.id),['sound']);}finally{store.close();}
 const read=new DatabaseSync(file,{readOnly:true});try{assert.equal(JSON.stringify(read.prepare('SELECT * FROM research_memory_events ORDER BY id').all()),before);}finally{read.close();}
});
