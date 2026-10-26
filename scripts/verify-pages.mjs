import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),directory=(await readFile('tmp/pages-artifact-path.txt','utf8')).trim();
const manifest=JSON.parse(await readFile(path.join(directory,'deployment.json'),'utf8'));
const remote=process.argv.find(a=>a.startsWith('--url='))?.slice(6);
const results=[];
async function read(relative,binary=false){
  if(!remote)return readFile(path.join(directory,(!relative||relative.endsWith('/'))?relative+'index.html':relative),binary?undefined:'utf8');
  const url=new URL(relative,new URL(remote.endsWith('/')?remote:remote+'/'));
  const response=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'error'});
  assert.equal(response.status,200,url.href);
  return binary?Buffer.from(await response.arrayBuffer()):response.text();
}
const html=await read('index.html');
assert.match(html,/考察箱/);assert.ok(!html.includes('CRTモニターを開く'),'preview does not expose private API controls');
const refs=[...html.matchAll(/(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g)].map(m=>m[1]).filter(s=>s.startsWith('/'));
assert.ok(refs.length>3);
for(const ref of refs){assert.ok(ref.startsWith(manifest.basePath+'/'),`unprefixed resource ${ref}`);await read(ref.slice(manifest.basePath.length+1));}
results.push({check:'HTML and framework/font resources',count:refs.length});
async function files(directory,prefix=''){
  const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){
    if(entry.isDirectory())result.push(...await files(path.join(directory,entry.name),prefix+entry.name+'/'));else result.push(prefix+entry.name);
  }return result;
}
for(const category of ['furniture','city'])for(const name of await files(path.join(root,'public/assets/observer-room',category))){
  const rel=`assets/observer-room/${category}/${name}`,bytes=await read(rel,true),original=await readFile(path.join(root,'public',rel));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(original).digest('hex'),rel);
  if(name.endsWith('.glb')){
    assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
    for(const image of json.images??[])if(image.uri && !image.uri.startsWith('data:')){
      assert.ok(!image.uri.includes('..') && !/^(https?:|\/)/.test(image.uri));await read(`assets/observer-room/${category}/${image.uri}`,true);
    }
  }
  results.push({check:rel,bytes:bytes.length});
}
await read('observer-room/index.html');
if(remote){const published=JSON.parse(await read('deployment.json'));assert.equal(published.commit,manifest.commit);results.push({check:'published commit',commit:published.commit});}
const evidence={at:new Date().toISOString(),target:remote??directory,manifest,results,browserRendering:'not-checked'};
await writeFile('tmp/pages-verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({target:evidence.target,checks:results.length,resources:refs.length,commit:manifest.commit,browserRendering:evidence.browserRendering}));
