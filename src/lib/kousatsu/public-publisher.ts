import {execFile} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {safeDiagnostic} from './research-engine';
import {randomUUID} from 'node:crypto';
import {publicationEvent} from './publication-history';
type Publication={repository:'yumirima1/houkago-no-chishikibako';branch:string;enabled:boolean};
function archiveNotes(files:Record<string,string>){
  const snapshot=JSON.parse(files['public/research/snapshot.json']??'null');
  const notes=snapshot?.notes as Array<{id:string}>|undefined;
  if(!Array.isArray(notes)||!notes.length)throw Error('PUBLICATION_EMPTY_ARCHIVE');
  if(new Set(notes.map(n=>n.id)).size!==notes.length)throw Error('PUBLICATION_DUPLICATE_NOTE');
  for(const note of notes){
    if(typeof note.id!=='string'||!/^[-a-f0-9]+$/.test(note.id))throw Error('PUBLICATION_NOTE_INVALID');
    const payload=JSON.parse(files[`public/research/notes/${note.id}.json`]??'null');
    if(payload?.id!==note.id||!payload.markdown?.trim()||files[`public/research/notes/${note.id}.md`]!==payload.markdown)throw Error('PUBLICATION_NOTE_MISSING');
  }
  return notes;
}
/** Publish only the explicit public projection. Credentials remain in Git's credential helper. */
export async function publishResearch(file:string,publication:Publication,bundle:{files:Record<string,string>;digest:string},now=Date.now(),adapters:{credential?:()=>Promise<string>;fetch?:typeof fetch}={}){
  if(!publication.enabled)return {status:'disabled'};
  if(publication.repository!=='yumirima1/houkago-no-chishikibako'||!/^[-\w/]+$/.test(publication.branch))throw Error('PUBLICATION_TARGET_INVALID');
  if(Object.keys(bundle.files).some(p=>!/^public\/research\/(snapshot\.json|notes\/[a-f0-9-]+\.(json|md))$/.test(p)))throw Error('PUBLICATION_PATH_REJECTED');
  const notes=archiveNotes(bundle.files);
  const db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=5000');
  const owner=randomUUID();
  try{
    db.exec('CREATE TABLE IF NOT EXISTS public_publish_lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,expires_at INTEGER NOT NULL)');
    const lease=db.prepare('INSERT INTO public_publish_lease VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE expires_at<=?')
      .run(owner,now+300000,now);
    if(!lease.changes)return {status:'busy'};
    const previous=db.prepare('SELECT * FROM public_publish_state WHERE digest=?').get(bundle.digest);
    // Owning this lease means a prior running attempt lost its process/lease.
    // A killed final attempt must become a visible terminal failure.
    if(previous?.status==='running'){
      previous.status=Number(previous.attempts)>=3?'failed':'retry_wait';
      previous.error='PUBLICATION_INTERRUPTED';
      db.prepare('UPDATE public_publish_state SET status=?,error=? WHERE digest=?').run(previous.status,previous.error,bundle.digest);
      publicationEvent(db,'transport',bundle.digest,Number(previous.attempts),String(previous.status),now,String(previous.error));
    }
    if(previous&&(previous.status==='succeeded'||Number(previous.attempts)>=3||String(previous.next_at)>new Date(now).toISOString()))return {status:String(previous.status),commit:previous.commit_sha};
    db.prepare(`INSERT INTO public_publish_state VALUES(?,1,?,'running',NULL,NULL) ON CONFLICT(digest) DO UPDATE SET attempts=attempts+1,status='running',next_at=excluded.next_at`)
      .run(bundle.digest,new Date(now+300000).toISOString());
    const attempt=Number(db.prepare('SELECT attempts FROM public_publish_state WHERE digest=?').get(bundle.digest)!.attempts);
    publicationEvent(db,'transport',bundle.digest,attempt,'running',now);
    try{
      // No token is stored in source, arguments, environment, logs, or public artifacts.
      const credential=async()=>{
        const child=execFile('git',['-c','credential.interactive=false','credential','fill'],{windowsHide:true,timeout:15000,maxBuffer:32768,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
        const result=new Promise<string>((resolve,reject)=>{let out='';child.stdout!.on('data',c=>out+=c);child.on('error',()=>reject(Error('GITHUB_CREDENTIAL_UNAVAILABLE')));child.on('exit',code=>code===0?resolve(out):reject(Error('GITHUB_CREDENTIAL_UNAVAILABLE')));});
        child.stdin!.end('protocol=https\nhost=github.com\n\n');
        return (await result).split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9)??'';
      };
      const token=await (adapters.credential??credential)();if(!token)throw Error('GITHUB_CREDENTIAL_UNAVAILABLE');
      const base=`https://api.github.com/repos/${publication.repository}`;
      const api=async(endpoint:string,method='GET',value?:unknown,missing=false)=>{
        db.prepare('UPDATE public_publish_lease SET expires_at=? WHERE id=1 AND owner=?').run(Date.now()+300000,owner);
        const r=await (adapters.fetch??fetch)(base+endpoint,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Kousatsu-Autonomous-Publisher','Content-Type':'application/json'},...(value?{body:JSON.stringify(value)}:{})});
        if(missing&&r.status===404)return null;
        if(!r.ok)throw Error(`GITHUB_PUBLICATION_HTTP_${r.status}`);return r.json();
      };
      const ref=await api(`/git/ref/heads/${publication.branch}`),head=await api(`/git/commits/${ref.object.sha}`);
      const remote=await api(`/contents/public/research/snapshot.json?ref=${ref.object.sha}`,'GET',undefined,true);
      if(remote){
        const current=JSON.parse(Buffer.from(remote.content,'base64').toString('utf8'));
        if(!Array.isArray(current.notes)||current.notes.some((n:{id:string})=>!notes.some(note=>note.id===n.id)))throw Error('PUBLICATION_STALE_ARCHIVE');
      }
      const tree=[];
      for(const [p,content]of Object.entries(bundle.files)){const blob=await api('/git/blobs','POST',{content:Buffer.from(content).toString('base64'),encoding:'base64'});tree.push({path:p,mode:'100644',type:'blob',sha:blob.sha});}
      const createdTree=await api('/git/trees','POST',{base_tree:head.tree.sha,tree});
      let commit=ref.object.sha;
      if(createdTree.sha!==head.tree.sha){const created=await api('/git/commits','POST',{message:`Update generated research archive (${bundle.digest.slice(0,12)})`,tree:createdTree.sha,parents:[ref.object.sha]});
        // Fast-forward only: a concurrent UI push causes a bounded retry, never an overwrite.
        await api(`/git/refs/heads/${publication.branch}`,'PATCH',{sha:created.sha,force:false});commit=created.sha;
      }
      db.prepare("UPDATE public_publish_state SET status='succeeded',error=NULL,commit_sha=? WHERE digest=?").run(commit,bundle.digest);
      publicationEvent(db,'transport',bundle.digest,attempt,'succeeded',Date.now(),null,commit);
      return {status:'succeeded',commit};
    }catch(e){const error=safeDiagnostic(e);db.prepare("UPDATE public_publish_state SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'retry_wait' END,error=? WHERE digest=?").run(error,bundle.digest);const state=db.prepare('SELECT status FROM public_publish_state WHERE digest=?').get(bundle.digest)!;publicationEvent(db,'transport',bundle.digest,attempt,String(state.status),Date.now(),error);return {status:String(state.status),error};}
  }finally{db.prepare('DELETE FROM public_publish_lease WHERE id=1 AND owner=?').run(owner);db.close();}
}
