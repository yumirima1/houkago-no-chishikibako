/** Explicit, local, read-only diagnostic. Never changes a job, note, memory or verdict. */
import {createHash} from 'node:crypto';
import {mkdir,readFile,realpath,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {consistencyPrompt,consistencyRequests,consistencySchema,parseConsistencyReviews} from '../src/lib/kousatsu/reflection-consistency';
import type {AnalysisResult} from '../src/lib/kousatsu/types';

async function main(){
  const args=process.argv.slice(2),analyses:string[]=[],options=new Map<string,string>();
  for(let i=0;i<args.length;i+=2){
    const key=args[i],value=args[i+1];
    if(!['--analysis','--model','--output','--thinking'].includes(key)||!value||(key!=='--analysis'&&options.has(key)))throw Error('CONSISTENCY_ARGUMENT_INVALID');
    if(key==='--analysis')analyses.push(path.resolve(value));else options.set(key,value);
  }
  const model=options.get('--model'),output=options.get('--output'),thinking=options.get('--thinking')??'false';
  if(!model||!output||!analyses.length||analyses.length>10||new Set(analyses).size!==analyses.length||!['true','false'].includes(thinking))throw Error('CONSISTENCY_ARGUMENT_INVALID');
  const outputPath=path.resolve(output),parent=await realpath(path.dirname(outputPath));
  if(process.platform!=='win32'||!/^D:\\AI\\KousatsuData\\Validation\\/i.test(outputPath)||!/^D:\\AI\\KousatsuData\\Validation(?:\\|$)/i.test(parent))
    throw Error('CONSISTENCY_OUTPUT_REQUIRES_VALIDATION');
  const inputs=[];
  for(const file of analyses){
    if((await stat(file)).size>1024*1024)throw Error('CONSISTENCY_INPUT_TOO_LARGE');
    const text=await readFile(file,'utf8'),analysis=JSON.parse(text) as AnalysisResult;
    if(!analysis.quality?.reflection)throw Error('CONSISTENCY_REFLECTION_MISSING');
    inputs.push({id:`view-${inputs.length+1}`,file,sha256:createHash('sha256').update(text).digest('hex'),reflection:analysis.quality.reflection});
  }
  const requests=consistencyRequests(inputs);
  // An installed model is required: no implicit download, remote endpoint or paid API.
  const tags=await fetch('http://127.0.0.1:11434/api/tags',{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!tags.ok)throw Error('CONSISTENCY_LOCAL_MODELS_UNAVAILABLE');
  const installed=await tags.json() as {models?:Array<{name:string}>};
  if(!installed.models?.some(m=>m.name===model))throw Error('CONSISTENCY_MODEL_NOT_INSTALLED');
  // Exclusive directory creation prevents accidental overwrite of prior reviews.
  await mkdir(outputPath);
  const prompt=consistencyPrompt(requests),format=consistencySchema(requests),started=Date.now();
  await writeFile(path.join(outputPath,'input.json'),JSON.stringify({at:new Date().toISOString(),model,thinking:thinking==='true',
    inputs,requests,prompt,format,limitations:'Model diagnostics only; semantic review remains pending. No database or source file writes.'},null,2));
  try{
    const response=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model,prompt,format,stream:false,think:thinking==='true',keep_alive:'1m',options:{temperature:0,num_ctx:8192,num_predict:3200}}),signal:AbortSignal.timeout(240000)});
    if(!response.ok)throw Error(`CONSISTENCY_LOCAL_HTTP_${response.status}`);
    const reader=response.body?.getReader();if(!reader)throw Error('CONSISTENCY_EMPTY_RESPONSE');
    const chunks:Uint8Array[]= [];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128*1024){await reader.cancel();throw Error('CONSISTENCY_RESPONSE_TOO_LARGE');}chunks.push(value);}}
    finally{reader.releaseLock();}
    const raw=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {response?:string;done_reason?:string;eval_count?:number;prompt_eval_count?:number};
    await writeFile(path.join(outputPath,'response.json'),JSON.stringify({response:raw.response,doneReason:raw.done_reason,elapsedMs:Date.now()-started,
      outputTokens:raw.eval_count,promptTokens:raw.prompt_eval_count},null,2));
    if(raw.done_reason==='length')throw Error('CONSISTENCY_RESPONSE_TRUNCATED');
    const review=parseConsistencyReviews(requests,JSON.parse(raw.response??''));
    const report={at:new Date().toISOString(),model,elapsedMs:Date.now()-started,...review,
      inputs:inputs.map(({id,file,sha256})=>({id,file,sha256}))};
    await writeFile(path.join(outputPath,'review.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }catch(error){await writeFile(path.join(outputPath,'error.json'),JSON.stringify({at:new Date().toISOString(),elapsedMs:Date.now()-started,
    status:'diagnostic-failed',semanticReview:'pending',error:error instanceof Error?error.message:String(error)},null,2));throw error;}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
