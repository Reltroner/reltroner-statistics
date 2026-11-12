#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const host='127.0.0.1';
const port=Number(process.env.PORT || '4173');
if (!Number.isInteger(port) || port<1024 || port>65535) throw Error('Invalid preview PORT');
if (!fs.existsSync(path.join(root,'index.html'))) throw Error('Run npm run build before preview');
const routes=new Map([['/','index.html'],['/index.html','index.html'],['/audit.json','audit.json']]);
const mime=new Map([['.html','text/html; charset=utf-8'],['.json','application/json; charset=utf-8']]);
http.createServer((request,response)=>{
  let pathname;
  try { pathname=new URL(request.url,'http://localhost').pathname; }
  catch {response.writeHead(400);response.end('Invalid request');return;}
  if (!['GET','HEAD'].includes(request.method)){response.writeHead(405,{Allow:'GET, HEAD'});response.end();return;}
  const file=routes.get(pathname);
  if (!file){response.writeHead(404);response.end('Not found');return;}
  const absolute=path.join(root,file);
  if (!fs.existsSync(absolute)){response.writeHead(404);response.end('Not available');return;}
  response.writeHead(200,{'Content-Type':mime.get(path.extname(absolute)),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  if (request.method==='HEAD'){response.end();return;}
  fs.createReadStream(absolute).pipe(response);
}).listen(port,host,()=>process.stdout.write('Reltroner Statistics preview: http://'+host+':'+port+'\n'));
