import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';

/** The caller's single deadline covers headers and body, including retries.
 * Node fetch has a separate headers deadline which can be shorter than that. */
export function postOllamaJson(url:URL,value:unknown,signal:AbortSignal):Promise<{status:number;body:string}>{
  const body=JSON.stringify(value);
  return new Promise((resolve,reject)=>{
    const request=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method:'POST',signal,
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},response=>{
      const chunks:Buffer[]=[];let size=0;
      response.on('data',(chunk:Buffer)=>{
        size+=chunk.length;
        if(size>128*1024){const error=new Error('OLLAMA_RESPONSE_TOO_LARGE');reject(error);response.destroy(error);return;}
        chunks.push(chunk);
      });
      response.once('error',reject);
      response.once('aborted',()=>reject(new Error('OLLAMA_RESPONSE_ABORTED')));
      response.once('end',()=>resolve({status:response.statusCode??0,body:Buffer.concat(chunks).toString('utf8')}));
    });
    request.once('error',reject);
    request.end(body);
  });
}
