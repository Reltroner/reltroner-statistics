import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compareJsonValues,compareRepositories,isComparedPath} from '../src/comparator.mjs';

const a='a'.repeat(40),b='b'.repeat(40);
test('path policy ignores runtime code, README and internal remodeling',()=>{
  assert.ok(isComparedPath('content/factions/reltronland.md'));
  assert.ok(isComparedPath('data/asthortera/nccm-v6-active-cross-domain.json'));
  for(const p of ['app/page.tsx','components/foo.tsx','content/remodeling/private.md','content/factions/README.md','content/unwritten-ideas.md','data/secret.json','content/../../secret.md']){
    assert.equal(isComparedPath(p),false,p);
  }
});
test('named array members diff by identity and preserve null transitions',()=>{
  const prod={countries_5:[{name:'Krisberia',land_area_million_km2:null},{name:'Mapether',population:1}]};
  const draft={countries_5:[{name:'Mapether',population:1},{name:'Krisberia',land_area_million_km2:75}]};
  const d=compareJsonValues(prod,draft);
  assert.deepEqual(d,[{pointer:'countries_5[Krisberia].land_area_million_km2',change:'UNASSIGNED_TO_ASSIGNED',production_value:null,remodeling_value:75}]);
});
test('read-only scan classifies files and never writes in source roots',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'reltroner-statistics-'));
  try{
    const prod=path.join(tmp,'prod'),draft=path.join(tmp,'draft');
    for(const d of [prod,draft]){
      fs.mkdirSync(path.join(d,'content/factions'),{recursive:true});
      fs.mkdirSync(path.join(d,'data/asthortera'),{recursive:true});
    }
    fs.writeFileSync(path.join(prod,'content/factions/reltronland.md'),'---\npublished: true\n---\nA');
    fs.writeFileSync(path.join(draft,'content/factions/reltronland.md'),'---\npublished: true\n---\nB');
    fs.writeFileSync(path.join(draft,'content/factions/draft.md'),'draft');
    fs.writeFileSync(path.join(prod,'data/asthortera/sample.json'),JSON.stringify({countries_14:[{name:'Beluftner',area:88}]}));
    fs.writeFileSync(path.join(draft,'data/asthortera/sample.json'),JSON.stringify({countries_14:[{name:'Beluftner',area:363}]}));
    const x=compareRepositories({productionDir:prod,remodelingDir:draft,productionSha:a,remodelingSha:b});
    assert.equal(x.summary.changed,2);
    assert.equal(x.summary.draft_only,1);
    assert.equal(x.summary.json_field_findings,1);
    assert.equal(x.findings[0].field_path,'countries_14[Beluftner].area');
    assert.equal(x.sources.production_deployed_sha,null);
    assert.equal(x.sources.production_deployment_status,'UNVERIFIED');
    assert.equal(fs.readFileSync(path.join(prod,'content/factions/reltronland.md'),'utf8').includes('\nA'),true);
    assert.equal(fs.existsSync(path.join(prod,'artifacts')),false);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('SHA validation is mandatory',()=>{
  assert.throws(()=>compareRepositories({productionDir:'.',remodelingDir:'.',productionSha:'not-sha',remodelingSha:b}));
});
