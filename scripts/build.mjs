#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const audit=path.join(root,'artifacts/audit.json');
fs.mkdirSync(dist,{recursive:true});
const markup=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
fs.writeFileSync(path.join(dist,'index.html'),markup);
let available=false;
if (fs.existsSync(audit)) {
  const data=JSON.parse(fs.readFileSync(audit,'utf8'));
  if (data.schema_version!=='reltroner-statistics-audit.v1') throw new Error('Unexpected audit schema');
  fs.copyFileSync(audit,path.join(dist,'audit.json'));
  available=true;
} else {
  fs.rmSync(path.join(dist,'audit.json'),{force:true});
}
process.stdout.write(JSON.stringify({status:'STATIC_PREVIEW_BUILT_NOT_DEPLOYED',directory:dist,has_audit:available},null,2)+'\n');
