/**
 * Typed knowledge graph and bounded impact traversal. Isomorphic: the build pipeline and the
 * browser explorer share this module. MENTIONS is a co-occurrence signal and is never treated as
 * a dependency unless a caller explicitly opts into "mention reach".
 */

export const EDGE_TYPES = Object.freeze(['DEFINES', 'DEPENDS_ON', 'DERIVED_FROM', 'REFERENCES', 'MENTIONS', 'SUPERSEDES', 'PROPOSES_CHANGE_TO'] as const);
export type EdgeType = (typeof EDGE_TYPES)[number];
export const NODE_TYPES = Object.freeze(['entity', 'indicator', 'dataset', 'document', 'observation', 'revision'] as const);
export type NodeType = (typeof NODE_TYPES)[number];
export type GraphSide = 'production' | 'remodeling' | 'both';
export type EdgeStatus = 'DECLARED' | 'VERIFIED' | 'CANDIDATE';

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  side: GraphSide;
  group: string | null;
  attrs: Record<string, string | number | boolean | null>;
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  source: string;
  target: string;
  side: GraphSide;
  status: EdgeStatus;
  evidence: string;
}

export interface KnowledgeGraph {
  schema_version: 'reltroner-statistics-graph.v1';
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: {
    nodes_by_type: Record<string, number>;
    edges_by_type: Record<string, number>;
    edges_by_status: Record<string, number>;
    edges_by_side: Record<string, number>;
  };
}

export const EDGE_DESCRIPTIONS: Readonly<Record<EdgeType, string>> = Object.freeze({
  DEFINES: 'Source assigns or states the target (dataset defines an entity record; document states an observation).',
  DEPENDS_ON: 'Target value enters the formula of the source value. Verified when the QA identity holds numerically.',
  DERIVED_FROM: 'Source was produced from the target (declared lineage such as provenance.previous_source).',
  REFERENCES: 'Source explicitly cites the target (for example a country record’s source document).',
  MENTIONS: 'Target name occurs in the source text. Co-occurrence only, never a dependency.',
  SUPERSEDES: 'Source replaces the target as the current reference.',
  PROPOSES_CHANGE_TO: 'Remodeling content proposes a change to production content. Not adopted canon.',
});

/**
 * How a change propagates along an edge:
 *  forward  — a change to the edge source affects the target (DEFINES)
 *  reverse  — a change to the edge target affects the source (DEPENDS_ON, DERIVED_FROM, REFERENCES, MENTIONS)
 *  none     — no impact propagation (SUPERSEDES, PROPOSES_CHANGE_TO)
 */
export const PROPAGATION: Readonly<Record<EdgeType, 'forward' | 'reverse' | 'none'>> = Object.freeze({
  DEFINES: 'forward',
  DEPENDS_ON: 'reverse',
  DERIVED_FROM: 'reverse',
  REFERENCES: 'reverse',
  MENTIONS: 'reverse',
  SUPERSEDES: 'none',
  PROPOSES_CHANGE_TO: 'none',
});

export const DEFAULT_IMPACT_TYPES: readonly EdgeType[] = Object.freeze(['DEFINES', 'DEPENDS_ON', 'DERIVED_FROM', 'REFERENCES']);

export interface ImpactHit {
  node: string;
  depth: number;
  via: EdgeType;
  edge: string;
  path: string[];
  strength: 'dependency' | 'reference' | 'mention';
}

export interface ImpactResult {
  origin: string;
  direct: ImpactHit[];
  transitive: ImpactHit[];
  truncated: boolean;
  max_depth: number;
}

export function buildAdjacency(edges: readonly GraphEdge[]): Map<string, Array<{ to: string; edge: GraphEdge }>> {
  const adj = new Map<string, Array<{ to: string; edge: GraphEdge }>>();
  const push = (from: string, to: string, edge: GraphEdge) => {
    let list = adj.get(from);
    if (!list) adj.set(from, (list = []));
    list.push({ to, edge });
  };
  for (const e of edges) {
    const p = PROPAGATION[e.type];
    if (p === 'forward') push(e.source, e.target, e);
    else if (p === 'reverse') push(e.target, e.source, e);
  }
  for (const list of adj.values()) list.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : a.edge.id < b.edge.id ? -1 : 1));
  return adj;
}

/**
 * Breadth-first impact traversal with cycle protection and hard bounds. Each impacted node is
 * reported once at its shortest depth together with the path that reached it.
 */
export function traverseImpact(
  edges: readonly GraphEdge[],
  origin: string,
  opts: { types?: readonly EdgeType[]; maxDepth?: number; maxNodes?: number; sides?: readonly GraphSide[] } = {},
): ImpactResult {
  const types = new Set(opts.types ?? DEFAULT_IMPACT_TYPES);
  const sides = new Set(opts.sides ?? ['production', 'both']);
  const maxDepth = Math.max(1, Math.min(opts.maxDepth ?? 4, 8));
  const maxNodes = Math.max(1, Math.min(opts.maxNodes ?? 500, 5000));
  const adj = buildAdjacency(edges.filter((e) => types.has(e.type) && sides.has(e.side)));
  const seen = new Map<string, ImpactHit>();
  let frontier: Array<{ node: string; path: string[] }> = [{ node: origin, path: [origin] }];
  let truncated = false;
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: Array<{ node: string; path: string[] }> = [];
    for (const { node, path } of frontier) {
      for (const { to, edge } of adj.get(node) ?? []) {
        if (to === origin || seen.has(to)) continue;
        if (seen.size >= maxNodes) { truncated = true; break; }
        const strength = edge.type === 'MENTIONS' ? 'mention' : edge.type === 'REFERENCES' ? 'reference' : 'dependency';
        const hit: ImpactHit = { node: to, depth, via: edge.type, edge: edge.id, path: [...path, to], strength };
        seen.set(to, hit);
        next.push({ node: to, path: hit.path });
      }
    }
    frontier = next;
  }
  if (frontier.length && maxDepth >= 1) {
    // Unexplored frontier beyond the depth bound.
    for (const { node } of frontier) if ((adj.get(node) ?? []).some(({ to }) => !seen.has(to) && to !== origin)) truncated = true;
  }
  const all = [...seen.values()].sort((a, b) => a.depth - b.depth || (a.node < b.node ? -1 : 1));
  return { origin, direct: all.filter((h) => h.depth === 1), transitive: all.filter((h) => h.depth > 1), truncated, max_depth: maxDepth };
}
