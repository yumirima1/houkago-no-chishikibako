import type {DatabaseSync} from 'node:sqlite';

export function publicationEvent(db:DatabaseSync,stage:'transport'|'delivery',digest:string,attempt:number,status:string,now:number,error:string|null=null,commit:string|null=null){
  db.exec(`CREATE TABLE IF NOT EXISTS public_attempt_events(id INTEGER PRIMARY KEY,stage TEXT NOT NULL,digest TEXT NOT NULL,attempt INTEGER NOT NULL,status TEXT NOT NULL,error TEXT,commit_sha TEXT,created_at TEXT NOT NULL)`);
  db.prepare('INSERT INTO public_attempt_events(stage,digest,attempt,status,error,commit_sha,created_at) VALUES(?,?,?,?,?,?,?)').run(stage,digest,attempt,status,error,commit,new Date(now).toISOString());
}

/** Explicit operator retry. Expired owners may recover; a live owner is fenced.
 * Attempts are reset only for this immutable bundle. Prior events remain intact. */
export function resetPublicationAttempts(db:DatabaseSync,digest:string,now=Date.now()){
  db.exec('BEGIN IMMEDIATE');try{
    const exists=(table:string)=>Boolean(db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(table));
    for(const table of ['public_publish_lease','public_delivery_lease'])if(exists(table)&&Number(db.prepare(`SELECT expires_at FROM ${table} WHERE id=1`).get()?.expires_at??0)>now)throw Error('PUBLICATION_RUNNING');
    for(const [table,stage] of [['public_publish_state','transport'],['public_delivery_checks','delivery']] as const){
      if(!exists(table))continue;
      const changed=db.prepare(`UPDATE ${table} SET attempts=0,status='retry_wait',next_at=?,error=NULL WHERE digest=? AND status<>'succeeded'`).run(new Date(now).toISOString(),digest).changes;
      if(changed)publicationEvent(db,stage,digest,0,'operator-retry',now);
    }
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}
