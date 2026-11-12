import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const RULES_VERSION = 'P0-0.1.0';
const SHA_RE = /^[0-9a-f]{40}$/;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const KEY_FIELDS = ['name','code','id','series_id','indicator_id','event_id'];
const COLLECTIONS = new Set(['blog','characters','cultures','events','factions','items','laws','music','myths','organizations','philosophies','places','principles','research','series','statistics','technologies','video']);

export function isComparedPath(relativePath) {
  const p = relativePath.replaceAll('\\','/');
  const parts = p.split('/');
  if (p.includes('..') || p.startsWith('/') || parts.some(x => !x || x === '.')) return false;
  if (parts[0] === 'content') {
    return parts.length >= 3 && COLLECTIONS.has(parts[1]) && p.endsWith('.md') && !p.endsWith('/README.md');
  }
  if (parts[0] === 'data' && parts[1] === 'asthortera') return parts.length === 3 && p.endsWith('.json');
  return false;
}

function listComparedFiles(root) {
  const found = new Map();
  for (const sub of ['content','data/asthortera']) {
    const start = path.join(root,sub);
    if (!fs.existsSync(start)) continue;
    const pending = [start];
    while (pending.length) {
      const dir = pending.pop();
      for (const item of fs.readdirSync(dir,{withFileTypes:true})) {
        if (item.isSymbolicLink()) continue;
        const absolute = path.join(dir,item.name);
        if (item.isDirectory()) pending.push(absolute);
        else if (item.isFile()) {
          const relative = path.relative(root,absolute).split(path.sep).join('/');
          if (!isComparedPath(relative)) continue;
          if (fs.statSync(absolute).size > MAX_FILE_BYTES) throw new Error('File exceeds safety cap: ' + relative);
          found.set(relative,absolute);
        }
      }
    }
  }
  return found;
}

function gitBlobSha(buffer) {
  return crypto.createHash('sha1').update('blob ' + buffer.length + '\0').update(buffer).digest('hex');
}

function metadataFor(markdown) {
  if (!markdown.startsWith('---\n')) return {};
  const end = markdown.indexOf('\n---',4);
  if (end < 0) return {};
  const head = markdown.slice(4,end);
  const fields = {};
  for (const line of head.split(/\r?\n/)) {
    const match = line.match(/^(title|published|visibility|canonStatus|lastUpdated|date):\s*(.+?)\s*$/);
    if (match) fields[match[1]] = match[2].replace(/^["']|["']$/g,'');
  }
  return fields;
}

function normalize(value) {
  if (Array.isArray(value)) {
    for (const field of KEY_FIELDS) {
      if (value.length && value.every(x => x && typeof x === 'object' && !Array.isArray(x) && typeof x[field] === 'string' && x[field].length)) {
        const keys = value.map(x => x[field]);
        if (new Set(keys).size === keys.length) return Object.fromEntries(value.map(x => ['[' + x[field] + ']',normalize(x)]));
      }
    }
    return value.map(normalize);
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,normalize(v)]));
  return value;
}

function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function compareJsonValues(production, remodeling) {
  const differences = [];
  const emitSubtree=(value,pointer,change) => {
    if (value && typeof value === 'object') {
      const pairs = Array.isArray(value) ? value.map((x,i)=>['['+i+']',x]) : Object.entries(value).sort(([a],[b])=>a.localeCompare(b));
      if (pairs.length) {
        for (const [key,child] of pairs) {
          const next=key.startsWith('[') ? pointer+key : (pointer ? pointer+'.'+key : key);
          emitSubtree(child,next,change);
        }
        return;
      }
    }
    differences.push({pointer,change,
      ...(change==='ADDED'?{remodeling_value:value}:{production_value:value})});
  };
  const walk = (a,b,pointer) => {
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      const keys = new Set([...Object.keys(a),...Object.keys(b)]);
      for (const key of [...keys].sort()) {
        const next = key.startsWith('[') ? pointer + key : (pointer ? pointer + '.' + key : key);
        if (!(key in a)) emitSubtree(b[key],next,'ADDED');
        else if (!(key in b)) emitSubtree(a[key],next,'REMOVED');
        else walk(a[key],b[key],next);
      }
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const n=Math.max(a.length,b.length);
      for (let i=0;i<n;i++) {
        const next=pointer+'['+i+']';
        if (i>=a.length) differences.push({pointer:next,change:'ADDED',remodeling_value:b[i]});
        else if (i>=b.length) differences.push({pointer:next,change:'REMOVED',production_value:a[i]});
        else walk(a[i],b[i],next);
      }
      return;
    }
    if (Object.is(a,b)) return;
    const change = a === null && b !== null ? 'UNASSIGNED_TO_ASSIGNED' :
      b === null && a !== null ? 'ASSIGNED_TO_UNASSIGNED' :
      kindOf(a) !== kindOf(b) ? 'TYPE_CHANGED' : 'VALUE_CHANGED';
    differences.push({pointer,change,production_value:a,remodeling_value:b});
  };
  walk(normalize(production),normalize(remodeling),'');
  return differences;
}

function safeValue(value) {
  if (value === undefined) return {present:false};
  return {present:true,value};
}
function stableId(file,pointer,change) {
  return 'CRD-' + crypto.createHash('sha256').update(file+'\0'+pointer+'\0'+change).digest('hex').slice(0,12).toUpperCase();
}
function readIndicators(root) {
  const file=path.join(root,'data/asthortera/nccm-v6-active-cross-domain.json');
  if (!fs.existsSync(file)) return null;
  try {
    const x=JSON.parse(fs.readFileSync(file,'utf8'));
    return {model:x.schema_version??null, planet_population_billion:x.planet?.population_billion??null,
      planet_sdi:x.planet?.sdi??null, sovereign_states:x.planet?.sovereign_states??null,
      year0_real_gdp_growth:x.planet?.year0?.real_gdp_growth??null};
  } catch { return null; }
}

export function compareRepositories({productionDir,remodelingDir,productionSha,remodelingSha}) {
  if (!SHA_RE.test(productionSha??'') || !SHA_RE.test(remodelingSha??'')) throw new Error('Full 40-character Git SHAs required');
  if (!fs.statSync(productionDir).isDirectory() || !fs.statSync(remodelingDir).isDirectory()) throw new Error('Both source roots must exist');
  const prod=listComparedFiles(productionDir);
  const draft=listComparedFiles(remodelingDir);
  const keys=[...new Set([...prod.keys(),...draft.keys()])].sort();
  const fileChanges=[], findings=[];
  for (const file of keys) {
    const p=prod.get(file), d=draft.get(file);
    const productionBuffer=p?fs.readFileSync(p):null;
    const remodelingBuffer=d?fs.readFileSync(d):null;
    const productionBlob=productionBuffer?gitBlobSha(productionBuffer):null;
    const remodelingBlob=remodelingBuffer?gitBlobSha(remodelingBuffer):null;
    const classification=!p?'DRAFT_ONLY':!d?'PRODUCTION_ONLY':productionBlob===remodelingBlob?'IDENTICAL':'CHANGED';
    const record={path:file,classification,production_blob_sha:productionBlob,remodeling_blob_sha:remodelingBlob};
    if (classification==='CHANGED' && file.endsWith('.json')) {
      try {
        const a=JSON.parse(productionBuffer.toString('utf8')), b=JSON.parse(remodelingBuffer.toString('utf8'));
        const diffs=compareJsonValues(a,b);
        record.field_diff_count=diffs.length;
        for (const diff of diffs) {
          findings.push({id:stableId(file,diff.pointer,diff.change),classification:'JSON_FIELD_DRIFT',review_status:'REVIEW_CANDIDATE',
            file_path:file,field_path:diff.pointer,change_type:diff.change,
            production:safeValue(diff.production_value),remodeling:safeValue(diff.remodeling_value)});
        }
      } catch(err) {
        record.parse_error='INVALID_JSON';
        findings.push({id:stableId(file,'','INVALID_JSON'),classification:'INVALID_JSON',review_status:'REVIEW_REQUIRED',
          file_path:file,description:String(err.message).slice(0,180)});
      }
    }
    if (classification==='CHANGED' && file.endsWith('.md')) {
      record.production_frontmatter=metadataFor(productionBuffer.toString('utf8'));
      record.remodeling_frontmatter=metadataFor(remodelingBuffer.toString('utf8'));
    }
    fileChanges.push(record);
  }
  const count=(kind)=>fileChanges.filter(x=>x.classification===kind).length;
  return {
    schema_version:'reltroner-statistics-audit.v1',rules_version:RULES_VERSION,
    sources:{production_repository:'Reltroner/reltroner-studio',production_main_sha:productionSha,
      production_deployed_sha:null,production_deployment_status:'UNVERIFIED',
      remodeling_repository:'Reltroner/reltroner-studio-remodeling',remodeling_sha:remodelingSha},
    production_indicators:readIndicators(productionDir),
    summary:{total_compared_paths:fileChanges.length,identical:count('IDENTICAL'),changed:count('CHANGED'),
      production_only:count('PRODUCTION_ONLY'),draft_only:count('DRAFT_ONLY'),json_field_findings:findings.length},
    file_changes:fileChanges,findings
  };
}
