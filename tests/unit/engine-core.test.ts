import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, codeUnitCompare } from '../../src/engine/canonical.ts';
import { computeRootTreeSha, gitBlobSha } from '../../src/engine/git-objects.ts';
import { compareJsonValues, normalizeJson, resolvePointer } from '../../src/engine/json-diff.ts';
import { isComparedPath } from '../../src/engine/scope.ts';
import { diffLines } from '../../src/engine/line-diff.ts';
import { parseFrontmatter, splitSections, textChangeNature } from '../../src/engine/markdown.ts';
import { inferUnit } from '../../src/engine/units.ts';

const enc = new TextEncoder();

test('Git blob identity matches git hash-object known answers', () => {
  assert.equal(gitBlobSha(enc.encode('')), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(gitBlobSha(enc.encode('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.equal(gitBlobSha(enc.encode('hello\r\n')), 'ef0493b275aa2080237f676d2ef6559246f56636');
});

test('CRLF checkout bytes never equal the LF blob identity (root cause of the Windows 0-identical report)', () => {
  const lf = enc.encode('---\ntitle: X\n---\nBody\n');
  const crlf = enc.encode('---\r\ntitle: X\r\n---\r\nBody\r\n');
  assert.notEqual(gitBlobSha(lf), gitBlobSha(crlf));
});

test('root tree SHA reconstruction matches a real GitHub tree (reltroner-studio@f54f947 data/asthortera)', () => {
  const entries = [
    { path: 'kalgered-remodeling-candidate-v1.json', mode: '100644', type: 'blob' as const, sha: 'fc09eea865f0666f59d1f8d7edba44dbf1ee0322' },
    { path: 'national-cross-domain-audit-2026-10-30.json', mode: '100644', type: 'blob' as const, sha: 'f7dd4ecbdf0cc7a4e7cba29702d788db0d8801af' },
    { path: 'nccm-baseline-v2.json', mode: '100644', type: 'blob' as const, sha: 'a881794503efcef115b11ea11a59a19de80a45de' },
    { path: 'nccm-v3-14-country-comparative-model.json', mode: '100644', type: 'blob' as const, sha: 'f14476555bb7bbdcb4431ca4d21b49f08f32ae77' },
    { path: 'nccm-v6-active-cross-domain.json', mode: '100644', type: 'blob' as const, sha: '0e0c7ac82904691549e614f2492a50014fb1928e' },
  ];
  assert.equal(computeRootTreeSha(entries), '4630abb4a2c17b84175abe03c070f04eaeab7f3c');
  assert.equal(computeRootTreeSha([]), '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  // Reordering the listing must not matter; tampering must.
  assert.equal(computeRootTreeSha([...entries].reverse()), '4630abb4a2c17b84175abe03c070f04eaeab7f3c');
  const tampered = entries.map((e, i) => (i === 0 ? { ...e, sha: 'a'.repeat(40) } : e));
  assert.notEqual(computeRootTreeSha(tampered), '4630abb4a2c17b84175abe03c070f04eaeab7f3c');
});

test('nested tree listing with an inconsistent subtree SHA is rejected', () => {
  const entries = [
    { path: 'a', mode: '040000', type: 'tree' as const, sha: 'b'.repeat(40) },
    { path: 'a/x.md', mode: '100644', type: 'blob' as const, sha: 'ce013625030ba8dba906f756967f9e9ca394464a' },
  ];
  assert.throws(() => computeRootTreeSha(entries), /Tree integrity failure/);
});

test('path policy ignores runtime code, README and internal remodeling (P0 behavior preserved)', () => {
  assert.ok(isComparedPath('content/factions/reltronland.md'));
  assert.ok(isComparedPath('data/asthortera/nccm-v6-active-cross-domain.json'));
  for (const p of ['app/page.tsx', 'components/foo.tsx', 'content/remodeling/private.md', 'content/factions/README.md',
    'content/unwritten-ideas.md', 'data/secret.json', 'content/../../secret.md', 'data/asthortera/x/y.json', 'content/factions/./a.md']) {
    assert.equal(isComparedPath(p), false, p);
  }
});

test('named array members diff by identity and preserve null transitions (P0 behavior preserved)', () => {
  const prod = { countries_5: [{ name: 'Krisberia', land_area_million_km2: null }, { name: 'Mapether', population: 1 }] };
  const draft = { countries_5: [{ name: 'Mapether', population: 1 }, { name: 'Krisberia', land_area_million_km2: 75 }] };
  assert.deepEqual(compareJsonValues(prod, draft), [
    { pointer: 'countries_5[Krisberia].land_area_million_km2', change: 'UNASSIGNED_TO_ASSIGNED', production_value: null, remodeling_value: 75 },
  ]);
});

test('reordered named array produces no finding; null is not zero; missing is not null', () => {
  assert.deepEqual(compareJsonValues({ c: [{ name: 'A', v: 1 }, { name: 'B', v: 2 }] }, { c: [{ name: 'B', v: 2 }, { name: 'A', v: 1 }] }), []);
  assert.deepEqual(compareJsonValues({ v: null }, { v: 0 }), [{ pointer: 'v', change: 'UNASSIGNED_TO_ASSIGNED', production_value: null, remodeling_value: 0 }]);
  assert.deepEqual(compareJsonValues({ v: 0 }, { v: null }), [{ pointer: 'v', change: 'ASSIGNED_TO_UNASSIGNED', production_value: 0, remodeling_value: null }]);
  assert.deepEqual(compareJsonValues({}, { v: null }), [{ pointer: 'v', change: 'ADDED', remodeling_value: null }]);
  assert.deepEqual(compareJsonValues({ v: '1' }, { v: 1 }), [{ pointer: 'v', change: 'TYPE_CHANGED', production_value: '1', remodeling_value: 1 }]);
});

test('new structured subtrees expand into field-level evidence (P0 behavior preserved)', () => {
  assert.deepEqual(compareJsonValues({ planet: {} }, { planet: { spatial: { area: 100, unit: 'km2' } } }), [
    { pointer: 'planet.spatial.area', change: 'ADDED', remodeling_value: 100 },
    { pointer: 'planet.spatial.unit', change: 'ADDED', remodeling_value: 'km2' },
  ]);
});

test('ordering is code-unit based, never host-locale based', () => {
  const keys = ['b', 'B', 'a', 'Ä', 'A', '_z', '10', '9'];
  assert.deepEqual([...keys].sort(codeUnitCompare), ['10', '9', 'A', 'B', '_z', 'a', 'b', 'Ä']);
  const d = compareJsonValues({}, { b: 1, B: 2, a: 3, 'Ä': 4 });
  assert.deepEqual(d.map((x) => x.pointer), ['B', 'a', 'b', 'Ä']);
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: null }] }), '{"a":[2,{"c":null,"d":1}],"b":1}');
});

test('duplicate identity keys fall back to positional comparison', () => {
  const n = normalizeJson([{ name: 'A' }, { name: 'A' }]);
  assert.ok(Array.isArray(n));
  assert.deepEqual(resolvePointer(normalizeJson({ c: [{ name: 'X', v: 3 }] }), 'c[X].v'), { present: true, value: 3 });
  assert.deepEqual(resolvePointer(normalizeJson({ c: [{ name: 'X', v: 3 }] }), 'c[Y].v'), { present: false });
});

test('text change nature distinguishes format-only from content changes', () => {
  assert.equal(textChangeNature('a\nb', 'a\nb\n'), 'TRAILING_NEWLINE_ONLY');
  assert.equal(textChangeNature('a\r\nb\r\n', 'a\nb\n'), 'LINE_ENDINGS_ONLY');
  assert.equal(textChangeNature('a  \nb', 'a\nb'), 'WHITESPACE_ONLY');
  assert.equal(textChangeNature('a\nb', 'a\nc'), 'CONTENT');
});

test('markdown sections use heading paths, ignore fenced headings and disambiguate duplicates', () => {
  const md = '---\ntitle: T\n---\nIntro\n# A\ntext\n```\n# not a heading\n```\n## B\nx\n## B\ny\n# C\n';
  const s = splitSections(md);
  assert.deepEqual(s.map((x) => x.key), ['(preamble)', 'A', 'A › B', 'A › B (2)', 'C']);
  assert.equal(s[1]!.lines.join('\n').includes('# not a heading'), true);
  assert.equal(s[0]!.start_line, 4);
});

test('frontmatter is parsed as YAML 1.2 core schema without coercing dates', () => {
  const r = parseFrontmatter('---\ntitle: "X"\ndate: 2025-03-29\npublished: true\n---\nbody');
  assert.deepEqual(r, { ok: true, value: { title: 'X', date: '2025-03-29', published: true } });
  assert.equal(parseFrontmatter('---\na: [\n---\n').ok, false);
  assert.deepEqual(parseFrontmatter('no frontmatter'), { ok: true, value: null });
});

test('line diff reports counts and a bounded excerpt', () => {
  const d = diffLines(['a', 'b', 'c'], ['a', 'x', 'c', 'd']);
  assert.equal(d.added, 2);
  assert.equal(d.removed, 1);
  assert.ok(d.excerpt.includes('-b') && d.excerpt.includes('+x') && d.excerpt.includes('+d'));
  const big = diffLines(Array.from({ length: 50 }, (_, i) => `a${i}`), Array.from({ length: 50 }, (_, i) => `b${i}`), { maxEdits: 10 });
  assert.equal(big.budget_exceeded, true);
  assert.equal(big.added, 50);
});

test('units are inferred from field naming conventions only', () => {
  assert.equal(inferUnit('countries_14[Beluftner].land_area_million_km2'), 'million km²');
  assert.equal(inferUnit('planet.population_billion'), 'billion');
  assert.equal(inferUnit('real_gdp_growth'), 'ratio');
  assert.equal(inferUnit('sdi'), 'index (0–1)');
  assert.equal(inferUnit('foo'), null);
});
