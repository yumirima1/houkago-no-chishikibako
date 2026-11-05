import assert from 'node:assert/strict';
import {createServer,type RequestListener} from 'node:http';
import test,{type TestContext} from 'node:test';
import {postOllamaJson} from '../../src/lib/kousatsu/ollama-http';
import {OllamaProvider} from '../../src/lib/kousatsu/ai';

async function fixture(t:TestContext,listener:RequestListener){
  const server=createServer(listener);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const address=server.address();assert(address&&typeof address!=='string');return new URL(`http://127.0.0.1:${address.port}/api/generate`);
}

test('the configured deadline permits delayed headers and a complete UTF-8 streamed body',async t=>{
  let received='';
  const url=await fixture(t,(req,res)=>{req.setEncoding('utf8');req.on('data',chunk=>{received+=chunk;});req.on('end',()=>setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/json'});res.write('{"response":"日本');setTimeout(()=>res.end('語"}'),30);},50));});
  const result=await postOllamaJson(url,{prompt:'検証'},AbortSignal.timeout(2000));
  assert.equal(result.status,200);assert.deepEqual(JSON.parse(result.body),{response:'日本語'});
  assert.deepEqual(JSON.parse(received),{prompt:'検証'});
});

test('the overall deadline aborts a body that stops progressing after headers',async t=>{
  const url=await fixture(t,(req,res)=>{req.resume();res.writeHead(200);res.write('unfinished');});
  await assert.rejects(postOllamaJson(url,{},AbortSignal.timeout(80)),/abort/i);
});

test('an oversized response is rejected without retaining an unbounded model body',async t=>{
  const url=await fixture(t,(req,res)=>{req.resume();res.end(Buffer.alloc(129*1024,65));});
  await assert.rejects(postOllamaJson(url,{},AbortSignal.timeout(2000)),/RESPONSE_TOO_LARGE/);
});

test('redirects are returned to the provider and never followed to a different path',async t=>{
  let requests=0;
  const url=await fixture(t,(req,res)=>{req.resume();requests++;res.writeHead(302,{Location:'/should-not-be-called'});res.end('redirect');});
  const result=await postOllamaJson(url,{},AbortSignal.timeout(2000));
  assert.equal(result.status,302);assert.equal(requests,1);
});

test('a token-limited generation remains failed even when its truncated text happens to be valid JSON',async t=>{
  const text=JSON.stringify({observations:[],conclusions:[],hypotheses:[]});
  const url=await fixture(t,(req,res)=>{req.resume();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({response:text,done_reason:'length',eval_count:1600}));});
  const provider=new OllamaProvider({model:'fixture',endpoint:url.origin,timeoutMs:2000});
  await assert.rejects(provider.proposeGrounded({topic:'検証',items:[],claims:[],relations:[]}),/OLLAMA_OUTPUT_LIMIT/);
  assert.equal(provider.calls[0].status,'failed');assert.equal(provider.calls[0].outputTokens,1600);assert.equal(provider.rawCalls[0].response,text);
});
