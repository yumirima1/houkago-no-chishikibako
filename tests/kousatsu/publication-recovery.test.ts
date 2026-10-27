import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {publishResearch} from '../../src/lib/kousatsu/public-publisher';
import {verifyPublicDelivery} from '../../src/lib/kousatsu/public-delivery';
import {resetPublicationAttempts} from '../../src/lib/kousatsu/publication-history';
const pub={enabled:true,repository:'yumirima1/houkago-no-chishikibako' as const,branch:'main'};
const bundle={digest:'recovery-fixture',files:{'public/research/snapshot.json':'{"notes":[{"id":"a-b"}]}','public/research/notes/a-b.json':'{"id":"a-b","markdown":"actual research"}','public/research/notes/a-b.md':'actual research'}};
async function fixture(){await mkdir('tmp',{recursive:true});const dir=await mkdtemp(path.resolve('tmp','publication-recovery-')),file=path.join(dir,'state.sqlite'),db=new DatabaseSync(file);db.exec('CREATE TABLE public_publish_state(digest TEXT PRIMARY KEY,attempts INTEGER,next_at TEXT,status TEXT,error TEXT,commit_sha TEXT)');return {file,db};}
function remote(){
 let commit='original',tree='original-tree',created=0,patches=0,loseAcknowledgement=false;const files:Record<string,string>={},blobs=new Map<string,string>();
 const fetchImpl:typeof fetch=async(url,options)=>{const p=new URL(String(url)).pathname,body=options?.body?JSON.parse(String(options.body)):null;
  if(p.includes('/git/ref/'))return Response.json({object:{sha:commit}});
  if(p.includes('/git/commits/')&&options?.method!=='POST')return Response.json({tree:{sha:tree}});
  if(p.includes('/contents/'))return files['public/research/snapshot.json']?Response.json({content:Buffer.from(files['public/research/snapshot.json']).toString('base64')}):new Response('{}',{status:404});
  if(p.endsWith('/git/blobs')){const content=Buffer.from(body.content,'base64').toString('utf8'),sha=`blob-${blobs.size}`;blobs.set(sha,content);return Response.json({sha});}
  if(p.endsWith('/git/trees')){const same=body.tree.every((entry:{path:string;sha:string})=>files[entry.path]===blobs.get(entry.sha));if(!same){for(const entry of body.tree)files[entry.path]=blobs.get(entry.sha)!;tree='research-tree';}return Response.json({sha:tree});}
  if(p.endsWith('/git/commits')){created++;return Response.json({sha:`research-commit-${created}`});}
  if(options?.method==='PATCH'){assert.equal(body.force,false);patches++;commit=body.sha;if(loseAcknowledgement){loseAcknowledgement=false;throw Error('ACKNOWLEDGEMENT_LOST_AFTER_REMOTE_UPDATE');}return Response.json({object:{sha:commit}});}
  throw Error('UNEXPECTED_FIXTURE_REQUEST');
 };
 return {adapters:{credential:async()=>'fixture-only',fetch:fetchImpl},failAfterWrite(){loseAcknowledgement=true;},counts:()=>({created,patches}),commit:()=>commit};
}

test('a committed remote update with a lost acknowledgement recovers after reopening without another public commit',async()=>{
 const f=await fixture(),server=remote();server.failAfterWrite();
 try{assert.equal((await publishResearch(f.file,pub,bundle,Date.now(),server.adapters)).status,'retry_wait');assert.deepEqual(server.counts(),{created:1,patches:1});}finally{f.db.close();}
 const reopened=new DatabaseSync(f.file);try{
  // Reproduce process death in its final attempt, with the remote data already present.
  reopened.prepare("UPDATE public_publish_state SET status='running',attempts=3,next_at=?").run(new Date(0).toISOString());
  assert.equal((await publishResearch(f.file,pub,bundle,Date.now(),server.adapters)).status,'failed');
  resetPublicationAttempts(reopened,bundle.digest);
  const recovered=await publishResearch(f.file,pub,bundle,Date.now(),server.adapters);assert.equal(recovered.status,'succeeded');assert.equal(recovered.commit,server.commit());assert.deepEqual(server.counts(),{created:1,patches:1});
  await publishResearch(f.file,pub,bundle,Date.now(),server.adapters);assert.deepEqual(server.counts(),{created:1,patches:1});
  const history=reopened.prepare('SELECT status,error FROM public_attempt_events ORDER BY id').all();assert.ok(history.some(e=>e.error==='PUBLICATION_INTERRUPTED'));assert.ok(history.some(e=>e.status==='operator-retry'));assert.equal(history.at(-1)!.status,'succeeded');
 }finally{reopened.close();}
});

test('live publication and delivery leases prevent recovery and explicit retry until the owner expires',async()=>{
 const f=await fixture(),at=Date.now();try{
  f.db.prepare("INSERT INTO public_publish_state VALUES(?,3,?,'running',NULL,NULL)").run(bundle.digest,new Date(0).toISOString());
  f.db.exec('CREATE TABLE public_publish_lease(id INTEGER PRIMARY KEY,owner TEXT,expires_at INTEGER)');f.db.prepare('INSERT INTO public_publish_lease VALUES(1,?,?)').run('live-owner',at+300000);
  assert.equal((await publishResearch(f.file,pub,bundle,at,{credential:async()=>{throw Error('NO_CREDENTIAL_REQUEST');}})).status,'busy');assert.throws(()=>resetPublicationAttempts(f.db,bundle.digest,at),/PUBLICATION_RUNNING/);assert.equal(f.db.prepare('SELECT status FROM public_publish_state').get()!.status,'running');
  await verifyPublicDelivery(f.file,bundle,'remote',{fetch:async()=>new Response('',{status:503})});f.db.exec("UPDATE public_delivery_checks SET attempts=3,status='running'");f.db.prepare('INSERT INTO public_delivery_lease VALUES(1,?,?)').run('live-delivery',at+300000);
  assert.equal((await verifyPublicDelivery(f.file,bundle,'remote',{now:at})).status,'busy');assert.equal(f.db.prepare('SELECT status FROM public_delivery_checks').get()!.status,'running');
  f.db.exec('UPDATE public_publish_lease SET expires_at=0; UPDATE public_delivery_lease SET expires_at=0');
  assert.equal((await verifyPublicDelivery(f.file,bundle,'remote')).status,'failed');resetPublicationAttempts(f.db,bundle.digest);
  const get:typeof fetch=async url=>{const p=new URL(String(url)).pathname;return p.endsWith('build-info.json')?Response.json({branch:'main',target:'github-pages',commit:'remote'}):new Response(bundle.files[p.includes('snapshot')?'public/research/snapshot.json':p.endsWith('.md')?'public/research/notes/a-b.md':'public/research/notes/a-b.json']);};
  assert.equal((await verifyPublicDelivery(f.file,bundle,'remote',{fetch:get})).status,'succeeded');assert.equal(f.db.prepare('SELECT count(*) n FROM public_delivery_checks').get()!.n,1);assert.ok(f.db.prepare("SELECT id FROM public_attempt_events WHERE error='PUBLIC_DELIVERY_INTERRUPTED'").get());
 }finally{f.db.close();}
});
