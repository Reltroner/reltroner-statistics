import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureSnapshot } from '../../src/adapters/fixture-snapshot.ts';
import { offlineDeployment } from '../../src/adapters/deployment.ts';
import { compareSources, stableFindingId, type SourceSnapshot } from '../../src/engine/comparator.ts';

const A = 'a'.repeat(40), B = 'b'.repeat(40);
const deployment = offlineDeployment('fixture');
const FIXED = '2026-01-01T00:00:00.000Z';

const nccm = (beluftnerArea: number, extra: Record<string, unknown> = {}) => JSON.stringify({
  schema_version: 'NCCM-test',
  countries_14: [
    { name: 'Reltronland', population_billion: 855, sdi: 0.984, canon_status: 'C' },
    { name: 'Beluftner', land_area_million_km2: beluftnerArea, fx: { code: 'BLF' }, canon_status: 'C' },
  ],
  ...extra,
}, null, 2);

function pair() {
  const prod = fixtureSnapshot('production', A, {
    'content/factions/reltronland.md': '---\ntitle: Reltronland\npublished: true\n---\n# History\nFounded 1125 BAC.\n# Economy\nGrowth 4.01%.',
    'content/factions/beluftner.md': '---\ntitle: Beluftner\n---\nSame text',
    'content/blog/old.md': '---\ntitle: Old\n---\nonly in production',
    'content/remodeling/internal.md': 'internal notes',
    'app/page.tsx': 'export default 1',
    'data/asthortera/nccm.json': nccm(88),
    'data/asthortera/same.json': '{"a":1}',
  });
  const draft = fixtureSnapshot('remodeling', B, {
    'content/factions/reltronland.md': '---\ntitle: Reltronland\npublished: true\n---\n# Economy\nGrowth 4.01%.\n# History\nFounded 1125 BAC (ratified).\n# Culture\nNew section.',
    'content/factions/beluftner.md': '---\ntitle: Beluftner\n---\nSame text\n',
    'content/statistics/new-model.md': '---\ntitle: New model\n---\nproposal',
    'content/remodeling/internal.md': 'different internal notes',
    'data/asthortera/nccm.json': nccm(363, { spatial: { planet_land_area_million_km2: 4503 } }),
    'data/asthortera/same.json': '{"a":1}',
  });
  return { prod, draft };
}

test('classifies files by Git blob identity within the strict scope', async () => {
  const { prod, draft } = pair();
  const a = await compareSources(prod, draft, { deployment, generatedAt: FIXED });
  assert.deepEqual(
    { total: a.summary.total_compared_paths, identical: a.summary.identical, changed: a.summary.changed, po: a.summary.production_only, do: a.summary.draft_only },
    { total: 6, identical: 1, changed: 3, po: 1, do: 1 },
  );
  assert.ok(!a.files.some((f) => f.path.startsWith('content/remodeling/') || f.path.startsWith('app/')));
  assert.equal(a.files.find((f) => f.path.endsWith('beluftner.md'))!.content_nature, 'TRAILING_NEWLINE_ONLY');
});

test('Beluftner land-area drift is evidence-backed with provenance, unit, delta and canon status', async () => {
  const { prod, draft } = pair();
  const a = await compareSources(prod, draft, { deployment, generatedAt: FIXED });
  const f = a.findings.find((x) => x.locator === 'countries_14[Beluftner].land_area_million_km2')!;
  assert.equal(f.classification, 'VALUE_DRIFT');
  assert.equal(f.priority, 'P1');
  assert.equal(f.production_canon_status, 'C');
  assert.deepEqual([f.production.value, f.remodeling.value], [88, 363]);
  assert.equal(f.unit, 'million km²');
  assert.deepEqual(f.numeric_delta, { absolute: 275, relative: 3.125 });
  assert.equal(f.provenance.production!.commit_sha, A);
  assert.equal(f.provenance.remodeling!.commit_sha, B);
  assert.equal(f.provenance.production!.blob_sha, prod.entries.get('data/asthortera/nccm.json')!.sha);
  assert.equal(f.id, stableFindingId('FIELD', 'data/asthortera/nccm.json', 'countries_14[Beluftner].land_area_million_km2'));
});

test('remodeling-only content is a proposal, never a production defect', async () => {
  const { prod, draft } = pair();
  const a = await compareSources(prod, draft, { deployment, generatedAt: FIXED });
  const draftOnly = a.findings.find((x) => x.file_path === 'content/statistics/new-model.md')!;
  assert.equal(draftOnly.classification, 'DRAFT_ONLY');
  assert.equal(draftOnly.review_status, 'PROPOSAL');
  assert.equal(draftOnly.priority, 'P3');
  const added = a.findings.filter((x) => x.change_type === 'ADDED');
  assert.ok(added.length > 0 && added.every((x) => x.review_status === 'PROPOSAL' && x.classification === 'SCHEMA_DRIFT'));
  const prodOnly = a.findings.find((x) => x.file_path === 'content/blog/old.md')!;
  assert.equal(prodOnly.classification, 'PRODUCTION_ONLY');
  assert.equal(prodOnly.review_status, 'REVIEW_CANDIDATE');
});

test('markdown sections compare by heading path; reordering sections is not a change', async () => {
  const { prod, draft } = pair();
  const a = await compareSources(prod, draft, { deployment, generatedAt: FIXED });
  const sections = a.findings.filter((x) => x.level === 'SECTION' && x.file_path.endsWith('reltronland.md'));
  assert.deepEqual(sections.map((s) => [s.locator, s.change_type]).sort(), [['Culture', 'SECTION_ADDED'], ['History', 'SECTION_CHANGED']]);
  const hist = sections.find((s) => s.locator === 'History')!;
  assert.equal(hist.classification, 'SEMANTIC_REVIEW_CANDIDATE');
  assert.deepEqual([hist.diff!.added_lines, hist.diff!.removed_lines], [1, 1]);
  assert.equal(hist.provenance.production!.line, 5);
});

test('format-only change produces one informational file finding and no semantic findings', async () => {
  const { prod, draft } = pair();
  const a = await compareSources(prod, draft, { deployment, generatedAt: FIXED });
  const fs = a.findings.filter((x) => x.file_path.endsWith('beluftner.md'));
  assert.equal(fs.length, 1);
  assert.equal(fs[0]!.change_type, 'FORMAT_ONLY');
  assert.equal(fs[0]!.review_status, 'INFORMATIONAL');
});

test('repeated runs and listing order produce an identical semantic digest', async () => {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const { prod, draft } = pair();
    const reversed: SourceSnapshot = { ...prod, entries: new Map([...prod.entries].reverse()) };
    runs.push(await compareSources(i === 2 ? reversed : prod, draft, { deployment, generatedAt: `2026-0${i + 1}-01T00:00:00Z`, concurrency: i + 1 }));
  }
  assert.equal(new Set(runs.map((r) => r.semantic_digest)).size, 1);
  assert.deepEqual(runs[0]!.findings.map((f) => f.id), runs[2]!.findings.map((f) => f.id));
});

test('fixture digest is a cross-platform constant (Windows and Ubuntu must agree)', async () => {
  const { prod, draft } = pair();
  const a = await compareSources(prod, draft, { deployment, generatedAt: FIXED });
  assert.equal(a.semantic_digest, '1081ceed3d19e9ce2bc11f45d9fd7f885e88e09d376bb9df53fd62b6903b9ff4');
});

test('a blob whose bytes do not match its SHA aborts the comparison', async () => {
  const { prod, draft } = pair();
  const corrupt: SourceSnapshot = { ...prod, readBlob: async () => new TextEncoder().encode('tampered') };
  await assert.rejects(compareSources(corrupt, draft, { deployment, generatedAt: FIXED }), /Blob integrity failure/);
});

test('invalid JSON is reported as a P1 invalid-source finding instead of crashing', async () => {
  const prod = fixtureSnapshot('production', A, { 'data/asthortera/x.json': '{"a":1}' });
  const draft = fixtureSnapshot('remodeling', B, { 'data/asthortera/x.json': '{"a":' });
  const a = await compareSources(prod, draft, { deployment, generatedAt: FIXED });
  const f = a.findings[0]!;
  assert.equal(f.change_type, 'INVALID_SOURCE');
  assert.equal(f.priority, 'P1');
  assert.equal(a.files[0]!.analysis, 'INVALID_SOURCE');
});

test('text value changes are semantic review candidates; token changes are value drift', async () => {
  const prod = fixtureSnapshot('production', A, { 'data/asthortera/x.json': JSON.stringify({ items: [{ name: 'K', fx: 'KRB', note: 'old wording here' }] }) });
  const draft = fixtureSnapshot('remodeling', B, { 'data/asthortera/x.json': JSON.stringify({ items: [{ name: 'K', fx: 'KRF', note: 'new wording here' }] }) });
  const a = await compareSources(prod, draft, { deployment, generatedAt: FIXED });
  const byField = Object.fromEntries(a.findings.filter((f) => f.level === 'FIELD').map((f) => [f.field, f.classification]));
  assert.deepEqual(byField, { fx: 'VALUE_DRIFT', note: 'SEMANTIC_REVIEW_CANDIDATE' });
});
