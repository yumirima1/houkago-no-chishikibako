import {execFile} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {safeDiagnostic} from './research-engine';
type Publication={repository:'yumirima1/houkago-no-chishikibako';branch:string;enabled:boolean};
/** Publish only the explicit public projection. Credentials remain in Git's credential helper. */
export async function publishResearch(file:string,publication:Publication,bundle:{files:Record<string,string>;digest:string},now=Date.now(),adapters:{credential?:()=>Promise<string>;fetch?:typeof fetch}={}){
  if(!publication.enabled)return {status:'disabled'};
  if(publication.repository!=='yumirima1/houkago-no-chishikibako'||!/^[-\w/]+$/.test(publication.branch))throw Error('PUBLICATION_TARGET_INVALID');
  if(Object.keys(bundle.files).some(p=>!/^public\/research\/(snapshot\.json|notes\/[a-f0-9-]+\.(json|md))$/.test(p)))throw Error('PUBLICATION_PATH_REJECTED');
  const db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=5000');
  try{
    const previous=db.prepare('SELECT * FROM public_publish_state WHERE digest=?').get(bundle.digest);
    if(previous&&(previous.status==='succeeded'||Number(previous.attempts)>=3||String(previous.next_at)>new Date(now).toISOString()))return {status:String(previous.status),commit:previous.commit_sha};
    db.prepare(`INSERT INTO public_publish_state VALUES(?,1,?,'running',NULL,NULL) ON CONFLICT(digest) DO UPDATE SET attempts=attempts+1,status='running',next_at=excluded.next_at`)
      .run(bundle.digest,new Date(now+300000).toISOString());
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
      const api=async(endpoint:string,method='GET',value?:unknown)=>{
        const r=await (adapters.fetch??fetch)(base+endpoint,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'Kousatsu-Autonomous-Publisher','Content-Type':'application/json'},...(value?{body:JSON.stringify(value)}:{})});
        if(!r.ok)throw Error(`GITHUB_PUBLICATION_HTTP_${r.status}`);return r.json();
      };
      const ref=await api(`/git/ref/heads/${publication.branch}`),head=await api(`/git/commits/${ref.object.sha}`);
      const tree=[];
      for(const [p,content]of Object.entries(bundle.files)){const blob=await api('/git/blobs','POST',{content:Buffer.from(content).toString('base64'),encoding:'base64'});tree.push({path:p,mode:'100644',type:'blob',sha:blob.sha});}
      const createdTree=await api('/git/trees','POST',{base_tree:head.tree.sha,tree});
      let commit=ref.object.sha;
      if(createdTree.sha!==head.tree.sha){const created=await api('/git/commits','POST',{message:`Update generated research archive (${bundle.digest.slice(0,12)})`,tree:createdTree.sha,parents:[ref.object.sha]});
        // Fast-forward only: a concurrent UI push causes a bounded retry, never an overwrite.
        await api(`/git/refs/heads/${publication.branch}`,'PATCH',{sha:created.sha,force:false});commit=created.sha;
      }
      db.prepare("UPDATE public_publish_state SET status='succeeded',error=NULL,commit_sha=? WHERE digest=?").run(commit,bundle.digest);
      return {status:'succeeded',commit};
    }catch(e){const error=safeDiagnostic(e);db.prepare("UPDATE public_publish_state SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'retry_wait' END,error=? WHERE digest=?").run(error,bundle.digest);return {status:'retry_wait',error};}
  }finally{db.close();}
}
