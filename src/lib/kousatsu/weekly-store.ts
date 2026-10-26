import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {PipelineInput,StoredItem} from './types';
import type {ResearchSource} from './runtime-types';
import type {WeeklyOperation} from './weekly-config';
import {weeklySlots} from './weekly-config';
import {meaningfulTerms} from './relevance';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function articleIdentity(item:StoredItem){return hash(item.canonicalUrl);}
function normalized(s:string){return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
export function sameArticle(a:Pick<StoredItem,'canonicalUrl'|'title'|'content'|'summary'>,b:Pick<StoredItem,'canonicalUrl'|'title'|'content'|'summary'>) {
  if(a.canonicalUrl===b.canonicalUrl || normalized(a.title)===normalized(b.title))return true;
  const at=meaningfulTerms(a.title),bt=meaningfulTerms(b.title),common=[...at].filter(t=>bt.has(t)).length;
  if(Math.min(at.size,bt.size)>=6 && common/Math.max(at.size,bt.size)>=.85)return true;
  const av=normalized(a.content??a.summary??''),bv=normalized(b.content??b.summary??'');
  return av.length>=160 && av===bv;
}
export class WeeklyStore {
  readonly db:DatabaseSync;
  constructor(file:string){
    this.db=new DatabaseSync(file);this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS weekly_operations(id TEXT PRIMARY KEY,config_json TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS weekly_days(operation_id TEXT NOT NULL REFERENCES weekly_operations(id),day TEXT NOT NULL,due_at TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT NOT NULL,started_at TEXT,finished_at TEXT,collection_json TEXT,
        PRIMARY KEY(operation_id,day));
      CREATE TABLE IF NOT EXISTS weekly_articles(article_key TEXT PRIMARY KEY,operation_id TEXT NOT NULL,day TEXT NOT NULL,genre TEXT NOT NULL,
        item_json TEXT NOT NULL,input_json TEXT NOT NULL,source_json TEXT NOT NULL,job_id TEXT UNIQUE REFERENCES jobs(id),
        FOREIGN KEY(operation_id,day) REFERENCES weekly_days(operation_id,day));`);
  }
  close(){this.db.close();}
  private atomic<T>(fn:()=>T){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  register(op:WeeklyOperation,now=Date.now()) {
    this.atomic(()=>{
      const previous=this.db.prepare('SELECT config_json FROM weekly_operations WHERE id=?').get(op.id);
      if(previous && previous.config_json!==JSON.stringify(op))throw Error('WEEKLY_OPERATION_CONFIG_CHANGED: use a new operation id; history stays immutable');
      this.db.prepare('INSERT OR IGNORE INTO weekly_operations VALUES(?,?,?)').run(op.id,JSON.stringify(op),new Date(now).toISOString());
      for(const s of weeklySlots(op))this.db.prepare('INSERT OR IGNORE INTO weekly_days(operation_id,day,due_at,next_attempt_at) VALUES(?,?,?,?)').run(op.id,s.day,s.dueAt,s.dueAt);
    });
  }
  due(op:WeeklyOperation,now=Date.now()) {
    if(now<Date.parse(op.startsAt) || now>=Date.parse(op.endsAt))return null;
    return this.db.prepare("SELECT day,attempts FROM weekly_days WHERE operation_id=? AND state IN ('pending','collecting','retry_wait') AND attempts<3 AND due_at<=? AND next_attempt_at<=? ORDER BY day LIMIT 1").get(op.id,new Date(now).toISOString(),new Date(now).toISOString()) as {day:string;attempts:number}|undefined;
  }
  begin(op:WeeklyOperation,day:string,now=Date.now()){
    this.db.prepare("UPDATE weekly_days SET state='collecting',attempts=attempts+1,started_at=COALESCE(started_at,?),next_attempt_at=? WHERE operation_id=? AND day=?")
      .run(new Date(now).toISOString(),new Date(now+60000).toISOString(),op.id,day);
  }
  history(){return this.db.prepare('SELECT genre,item_json FROM weekly_articles ORDER BY rowid DESC LIMIT 1000').all().map(r=>({genre:String(r.genre),item:JSON.parse(String(r.item_json)) as StoredItem}));}
  reserve(op:WeeklyOperation,day:string,entries:Array<{genre:string;item:StoredItem;input:PipelineInput;source:ResearchSource}>,collection:unknown,now=Date.now()) {
    this.atomic(()=>{
      const count=Number(this.db.prepare('SELECT count(*) n FROM weekly_articles WHERE operation_id=? AND day=?').get(op.id,day)?.n);
      const previous=this.history();let added=0;
      for(const e of entries){if(count+added>=op.maxArticles)break;
        if(previous.some(p=>sameArticle(p.item,e.item)))continue;
        const result=this.db.prepare('INSERT OR IGNORE INTO weekly_articles(article_key,operation_id,day,genre,item_json,input_json,source_json) VALUES(?,?,?,?,?,?,?)')
          .run(articleIdentity(e.item),op.id,day,e.genre,JSON.stringify(e.item),JSON.stringify(e.input),JSON.stringify(e.source));
        if(result.changes){added++;previous.push({genre:e.genre,item:e.item});}
      }
      this.db.prepare("UPDATE weekly_days SET state='planned',collection_json=?,finished_at=? WHERE operation_id=? AND day=?")
        .run(JSON.stringify(collection),new Date(now).toISOString(),op.id,day);
    });
  }
  outbox(op:WeeklyOperation){return this.db.prepare('SELECT * FROM weekly_articles WHERE operation_id=? AND job_id IS NULL ORDER BY rowid').all().map(r=>({key:String(r.article_key),input:JSON.parse(String(r.input_json)) as PipelineInput,source:JSON.parse(String(r.source_json)) as ResearchSource}));}
  attach(key:string,jobId:string){this.db.prepare('UPDATE weekly_articles SET job_id=? WHERE article_key=? AND (job_id IS NULL OR job_id=?)').run(jobId,key,jobId);}
  snapshot(op:WeeklyOperation,now=Date.now()) {
    const days=this.db.prepare('SELECT * FROM weekly_days WHERE operation_id=? ORDER BY day').all();
    const articles=this.db.prepare(`SELECT a.day,a.genre,a.job_id,a.item_json,j.status,j.attempts,q.decision,q.next_attempt_at,q.error,
      (SELECT value_json FROM job_checkpoints WHERE job_id=j.id AND stage='analyze') analysis_json FROM weekly_articles a
      LEFT JOIN jobs j ON j.id=a.job_id LEFT JOIN research_queue q ON q.job_id=j.id WHERE a.operation_id=? ORDER BY a.day,a.rowid`).all(op.id);
    const results=days.map(d=>{
      const items=articles.filter(a=>a.day===d.day),success=items.filter(a=>['succeeded','needs_review'].includes(String(a.status))).length;
      const pending=items.filter(a=>!a.status || (!['succeeded','needs_review','failed','cancelled'].includes(String(a.status))&&a.decision!=='blocked')).length;
      const failed=items.length-success-pending;
      let state=String(d.state);
      if(state==='planned')state=pending ? (items.some(a=>a.status==='running')?'running':items.some(a=>a.status==='retry_wait')?'retry_wait':'pending') : success ? (failed?'partial_success':'succeeded') : 'failed';
      if(now>=Date.parse(op.endsAt) && (pending || ['pending','collecting','retry_wait'].includes(state)))state='expired';
      return {day:d.day,dueAt:d.due_at,state,collection:d.collection_json?JSON.parse(String(d.collection_json)):null,success,failed,pending,startedAt:d.started_at,finishedAt:d.finished_at,
        articles:items.map(a=>{const analysis=a.analysis_json?JSON.parse(String(a.analysis_json)):null;return {jobId:a.job_id,genre:a.genre,title:JSON.parse(String(a.item_json)).title,status:a.status,queue:a.decision,error:a.error,attempts:a.attempts,nextAttemptAt:a.next_attempt_at,model:analysis?.research?.model??null};})};
    });
    return {operation:op,timezone:'Asia/Tokyo',state:now>=Date.parse(op.endsAt)?'ended':now<Date.parse(op.startsAt)?'scheduled':'active',
      nextRunAt:now>=Date.parse(op.endsAt)?null:days.find(d=>['pending','collecting','retry_wait'].includes(String(d.state)))?.next_attempt_at??null,
      lastRunAt:[...days].reverse().find(d=>d.started_at)?.started_at??null,days:results};
  }
}
