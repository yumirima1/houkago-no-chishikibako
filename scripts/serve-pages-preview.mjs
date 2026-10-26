import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('out');
const prefix = '/houkago-no-chishikibako';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === prefix) { response.writeHead(302, { Location: prefix + '/' }); response.end(); return; }
    if (!pathname.startsWith(prefix + '/')) throw new Error('outside site');
    let file = path.resolve(root, '.' + pathname.slice(prefix.length));
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('outside artifact');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(4173, '127.0.0.1', () => console.log(`Static Pages preview: http://127.0.0.1:4173${prefix}/`));
