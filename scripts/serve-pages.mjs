import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=(await readFile('tmp/pages-artifact-path.txt','utf8')).trim();
const manifest=JSON.parse(await readFile(path.join(root,'deployment.json'),'utf8'));
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.glb':'model/gltf-binary','.png':'image/png','.ico':'image/x-icon'};
createServer(async(req,res)=>{
 try{
   const url=new URL(req.url,'http://127.0.0.1:4173'),prefix=manifest.basePath+'/';
   if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
   let relative=decodeURIComponent(url.pathname.slice(prefix.length));if(!relative||relative.endsWith('/'))relative+='index.html';
   const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('path');
   if(!(await stat(file)).isFile())throw Error('file');
   res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
}).listen(4173,'127.0.0.1',()=>console.log('Pages fixture: http://127.0.0.1:4173'+manifest.basePath+'/'));
