import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {publicationEvent} from './publication-history';
const digest=(s:string)=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
/** Git transport success and actual Pages delivery are separate durable states.
 * Only public, fixed-host URLs are requested; credentials are never needed here. */
export async function verifyPublicDelivery(file:string,bundle:{digest:string;files:Record<string,string>},publishedCommit:string,options:{now?:number;fetch?:typeof fetch;force?:boolean}={}){
  const now=options.now??Date.now(),db=new DatabaseSync(file),owner=randomUUID();db.exec(`PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS public_delivery_checks(digest TEXT PRIMARY KEY,attempts INTEGER NOT NULL,next_at TEXT NOT NULL,status TEXT NOT NULL,error TEXT,expected_commit TEXT NOT NULL,deployed_commit TEXT,checked_at TEXT,notes_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS public_delivery_lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
  const snapshot=JSON.parse(bundle.files['public/research/snapshot.json']),ids=(snapshot.notes as Array<{id:string}>).map(n=>n.id);
  if(!ids.length){db.close();throw Error('PUBLIC_DELIVERY_EMPTY');}
  try{
    const lease=db.prepare('INSERT INTO public_delivery_lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE expires_at<=?').run(owner,now+300000,now);
    if(!lease.changes)return {status:'busy',attempts:0};
    const previous=db.prepare('SELECT * FROM public_delivery_checks WHERE digest=?').get(bundle.digest);
    if(previous?.status==='running'){
      previous.status=Number(previous.attempts)>=3?'failed':'retry_wait';previous.error='PUBLIC_DELIVERY_INTERRUPTED';
      db.prepare('UPDATE public_delivery_checks SET status=?,error=? WHERE digest=?').run(previous.status,previous.error,bundle.digest);
      publicationEvent(db,'delivery',bundle.digest,Number(previous.attempts),String(previous.status),now,String(previous.error));
    }
    if(previous&&(previous.status==='succeeded'||Number(previous.attempts)>=3||(!options.force&&String(previous.next_at)>new Date(now).toISOString())))return {status:String(previous.status),attempts:Number(previous.attempts),commit:previous.deployed_commit};
    db.prepare(`INSERT INTO public_delivery_checks VALUES(?,1,?,'running',NULL,?,NULL,NULL,?) ON CONFLICT(digest) DO UPDATE SET attempts=attempts+1,status='running',next_at=excluded.next_at`).run(bundle.digest,new Date(now+300000).toISOString(),publishedCommit,JSON.stringify(ids));
    const attempt=Number(db.prepare('SELECT attempts FROM public_delivery_checks WHERE digest=?').get(bundle.digest)!.attempts);
    publicationEvent(db,'delivery',bundle.digest,attempt,'running',now);
    try{
      const base='https://yumirima1.github.io/houkago-no-chishikibako/';
      const get=async(relative:string)=>{db.prepare('UPDATE public_delivery_lease SET expires_at=? WHERE id=1 AND owner=?').run(Date.now()+300000,owner);const response=await (options.fetch??fetch)(new URL(relative,base),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`PUBLIC_DELIVERY_HTTP_${response.status}`);return response.text();};
      const info=JSON.parse(await get(`build-info.json?verify=${now}`));
      if(info.branch!=='main'||info.target!=='github-pages'||typeof info.commit!=='string')throw Error('PUBLIC_DELIVERY_WRONG_BUILD');
      if(digest(await get(`research/snapshot.json?verify=${now}`))!==digest(bundle.files['public/research/snapshot.json']))throw Error('PUBLIC_DELIVERY_PENDING_SNAPSHOT');
      const artifacts=ids.flatMap(id=>[`research/notes/${id}.json`,...(bundle.files[`public/research/notes/${id}.md`]!==undefined?[`research/notes/${id}.md`]:[])]);
      for(let i=0;i<artifacts.length;i+=3)await Promise.all(artifacts.slice(i,i+3).map(async name=>{if(digest(await get(name))!==digest(bundle.files[`public/${name}`]))throw Error('PUBLIC_DELIVERY_PENDING_NOTE');}));
      db.prepare("UPDATE public_delivery_checks SET status='succeeded',error=NULL,deployed_commit=?,checked_at=? WHERE digest=?").run(info.commit,new Date(now).toISOString(),bundle.digest);
      publicationEvent(db,'delivery',bundle.digest,attempt,'succeeded',now,null,info.commit);
      return {status:'succeeded',attempts:Number(db.prepare('SELECT attempts FROM public_delivery_checks WHERE digest=?').get(bundle.digest)!.attempts),commit:info.commit};
    }catch(e){
      const raw=e instanceof Error?e.message:'PUBLIC_DELIVERY_NETWORK_ERROR';const error=/^PUBLIC_DELIVERY_[A-Z_0-9]+$/.test(raw)?raw:'PUBLIC_DELIVERY_NETWORK_ERROR';
      db.prepare("UPDATE public_delivery_checks SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'retry_wait' END,error=? WHERE digest=?").run(error,bundle.digest);
      const row=db.prepare('SELECT status,attempts FROM public_delivery_checks WHERE digest=?').get(bundle.digest)!;publicationEvent(db,'delivery',bundle.digest,attempt,String(row.status),now,error);return {status:String(row.status),attempts:Number(row.attempts),error};
    }
  }finally{db.prepare('DELETE FROM public_delivery_lease WHERE id=1 AND owner=?').run(owner);db.close();}
}
