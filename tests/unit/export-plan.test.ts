import test from 'node:test';
import assert from 'node:assert/strict';
import {makeExportPlan, EXPORT_FORMATS} from '../../src/export/plan.ts';

const p = 'a'.repeat(40), r = 'b'.repeat(40);
const base = {scope:'single', audit_id:'AUDIT-001', production_sha:p, remodeling_sha:r, finding_ids:['CRD-SPATIAL-001']};
const ids = ['CRD-SPATIAL-001','CRD-MODEL-002'];
test('all eight formats are first-class choices', () => {
  assert.equal(EXPORT_FORMATS.length,8);
  for (const format of EXPORT_FORMATS) {
    const plan=makeExportPlan({...base,formats:[format]},ids);
    assert.equal(plan.delivery,'direct');
    assert.equal(plan.filename,`CRD-SPATIAL-001.${format}`);
  }
});
test('subset uses ZIP with manifest and checksum', () => {
  const x=makeExportPlan({...base,formats:['pdf','html','md']},ids);
  assert.deepEqual(x.formats,['html','md','pdf']);
  assert.equal(x.delivery,'zip');
  assert.equal(x.requires_manifest,true);
  assert.equal(x.requires_checksums,true);
});
test('bulk always bundles even with one format', () => {
  const x=makeExportPlan({...base,scope:'all',finding_ids:[],formats:['csv']},ids);
  assert.equal(x.delivery,'zip');
  assert.deepEqual(x.finding_ids,[...ids].sort());
});
test('XML not required for any other format',()=>{
  const x=makeExportPlan({...base,formats:['json','pdf']},ids);
  assert.ok(!x.formats.includes('xml'));
});
test('rejects invalid formats, duplicates, identities and scope',()=>{
  for (const formats of [[],['exe'],['json','json']]) assert.throws(()=>makeExportPlan({...base,formats},ids));
  assert.throws(()=>makeExportPlan({...base,formats:['json'],production_sha:'abc'},ids));
  assert.throws(()=>makeExportPlan({...base,formats:['json'],finding_ids:['NOT-IN-SET']},ids));
  assert.throws(()=>makeExportPlan({...base,formats:['json'],scope:'all'},ids));
});
