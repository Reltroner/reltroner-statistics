/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R4: the Graph Explorer's view rules choose what to draw and never invent,
 * drop, re-type or re-direct a relationship. Synthetic nodes and edges only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { EdgeStatus, EdgeType, GraphEdge, GraphNode } from '../../src/domain/graph.ts';
import { fitZoom, focusSubgraph, initialFocus } from '../../src/features/graph/graph-view.ts';

const node = (id: string): GraphNode => ({ id, type: 'indicator', label: id, side: 'production', group: null, attrs: {} });
let n = 0;
const edge = (source: string, target: string, type: EdgeType = 'DEFINES', status: EdgeStatus = 'DECLARED'): GraphEdge => ({ id: `E-${++n}`, type, source, target, side: 'both', status, evidence: 'synthetic' });

test('initial focus prefers verified or declared dependency claims, then degree, then id', () => {
  const nodes = ['a', 'b', 'c', 'd', 'hub', 'x', 'y', 'z'].map(node);
  const edges = [
    edge('hub', 'x'), edge('hub', 'y'), edge('hub', 'z'), edge('hub', 'a'),
    edge('b', 'c', 'DEPENDS_ON', 'VERIFIED'), edge('d', 'c', 'DEPENDS_ON', 'DECLARED'),
  ];
  assert.equal(initialFocus(nodes, edges), 'c', 'two dependency claims beat a higher degree');
  const candidateOnly = [edge('hub', 'x'), edge('b', 'c', 'DEPENDS_ON', 'CANDIDATE'), edge('d', 'c', 'MENTIONS')];
  assert.equal(initialFocus(nodes, candidateOnly), 'c', 'a CANDIDATE or MENTIONS edge is no dependency claim; ties fall to degree');
  assert.equal(initialFocus(nodes, [edge('x', 'y'), edge('a', 'b')]), 'a', 'equal degree: smallest id');
  assert.equal(initialFocus(nodes, []), null, 'no visible relationship: no focus');
  assert.equal(initialFocus([...nodes].reverse(), edges), initialFocus(nodes, edges), 'independent of input order');
});

test('focused subgraph is induced: only edges whose endpoints are both kept, direction and identity unchanged', () => {
  const nodes = ['f', 'p', 'q', 'r', 's', 'iso'].map(node);
  const edges = [edge('p', 'f', 'DEPENDS_ON', 'VERIFIED'), edge('f', 'q', 'MENTIONS'), edge('p', 'q', 'REFERENCES'), edge('q', 'r'), edge('r', 's')];
  const one = focusSubgraph(nodes, edges, 'f', 1);
  assert.deepEqual(one.nodes.map((x) => x.id), ['f', 'p', 'q']);
  assert.deepEqual(one.edges.map((e) => e.id), [edges[0]!.id, edges[1]!.id, edges[2]!.id], 'the p→q edge between two neighbours is real and kept');
  for (const e of one.edges) assert.equal(e, edges.find((x) => x.id === e.id), 'same object: nothing re-typed or re-directed');
  const two = focusSubgraph(nodes, edges, 'f', 2);
  assert.deepEqual(two.nodes.map((x) => x.id), ['f', 'p', 'q', 'r']);
  assert.ok(!two.edges.some((e) => e.target === 's'), 'nothing beyond the hop limit');
  const lonely = focusSubgraph(nodes, edges, 'iso', 2);
  assert.deepEqual([lonely.nodes.map((x) => x.id), lonely.edges], [['iso'], []], 'an isolated node gets no edge');
  const pairs = new Set(edges.map((e) => `${e.source}>${e.target}`));
  for (const e of two.edges) assert.ok(pairs.has(`${e.source}>${e.target}`), 'every drawn pair exists in the data');
});

test('fit zoom accounts for padding on both sides and the tighter axis', () => {
  assert.equal(fitZoom({ width: 500, height: 100 }, { width: 600, height: 600 }, 0.1), 600 / 600);
  assert.equal(+fitZoom({ width: 728, height: 457 }, { width: 614, height: 646 }, 0.06).toFixed(3), 0.753);
  assert.equal(fitZoom({ width: 0, height: 0 }, { width: 600, height: 600 }, 0.1), 1);
});

test('graph view module and explorer import no data builder, traversal or propagation code', () => {
  const root = path.join(import.meta.dirname, '..', '..', 'src', 'features', 'graph');
  for (const file of ['graph-view.ts', 'GraphExplorer.tsx']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(src, /graph-builder|traverseImpact|buildAdjacency|PROPAGATION/, file);
  }
});
