#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareRepositories} from '../src/comparator.mjs';

function argsToObject(argv) {
  const out={};
  for (let i=0;i<argv.length;i+=2) {
    const key=argv[i], value=argv[i+1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected --key value pairs');
    if (key in out) throw new Error('Duplicate argument: '+key);
    out[key]=value;
  }
  return out;
}
const args=argsToObject(process.argv.slice(2));
const expected=['--production-dir','--remodeling-dir','--production-sha','--remodeling-sha'];
for (const key of expected) if (!args[key]) throw new Error('Missing argument: '+key);
for (const key of Object.keys(args)) if (!expected.includes(key)) throw new Error('Unsupported argument: '+key);

const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const result=compareRepositories({
  productionDir:path.resolve(args['--production-dir']),
  remodelingDir:path.resolve(args['--remodeling-dir']),
  productionSha:args['--production-sha'],
  remodelingSha:args['--remodeling-sha']
});
const outdir=path.join(cwd,'artifacts');
fs.mkdirSync(outdir,{recursive:true});
const tmp=path.join(outdir,'audit.json.tmp');
const out=path.join(outdir,'audit.json');
fs.writeFileSync(tmp,JSON.stringify(result,null,2)+'\n');
fs.renameSync(tmp,out);
process.stdout.write(JSON.stringify({status:'AUDIT_GENERATED_NOT_DEPLOYED',result:out,summary:result.summary},null,2)+'\n');
