/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R4: pure view-state helpers for the Graph Explorer. They choose WHAT to
 * draw from the already-filtered graph; they never create, drop, re-type or re-direct an edge. The focused
 * view is the induced subgraph of one node and its neighbours: every visible edge whose two endpoints are
 * both in that node set, and no other.
 */
import { DEPENDENCY_STATUSES, type GraphEdge, type GraphNode } from '../../domain/graph.ts';

export interface SubGraph { nodes: GraphNode[]; edges: GraphEdge[] }

/**
 * Deterministic starting node: the node with the most dependency claims (DEPENDS_ON with a VERIFIED or
 * DECLARED status), then the most visible relationships, then the smallest id. Only nodes with at least one
 * visible relationship qualify; null means the current filters leave no relationship to show.
 */
export function initialFocus(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): string | null {
  const degree = new Map<string, number>();
  const claims = new Map<string, number>();
  for (const e of edges) {
    for (const id of [e.source, e.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
    if (e.type === 'DEPENDS_ON' && DEPENDENCY_STATUSES.includes(e.status)) for (const id of [e.source, e.target]) claims.set(id, (claims.get(id) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const n of nodes) {
    if (!degree.get(n.id)) continue;
    if (best === null) { best = n.id; continue; }
    const a = [claims.get(n.id) ?? 0, degree.get(n.id) ?? 0];
    const b = [claims.get(best) ?? 0, degree.get(best) ?? 0];
    if (a[0]! > b[0]! || (a[0] === b[0] && (a[1]! > b[1]! || (a[1] === b[1] && n.id < best)))) best = n.id;
  }
  return best;
}

/** The focus node, its neighbours up to `hops` steps over visible edges, and the edges among them. */
export function focusSubgraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[], focus: string, hops: number): SubGraph {
  const keep = new Set<string>([focus]);
  for (let h = 0; h < hops; h++) {
    const frontier = new Set(keep);
    for (const e of edges) {
      if (frontier.has(e.source)) keep.add(e.target);
      if (frontier.has(e.target)) keep.add(e.source);
    }
  }
  return { nodes: nodes.filter((n) => keep.has(n.id)), edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
}

/** The zoom at which a laid-out box fits a canvas with relative padding on each side. */
export function fitZoom(box: { width: number; height: number }, canvas: { width: number; height: number }, padding: number): number {
  if (box.width <= 0 || box.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return 1;
  return Math.min(canvas.width / (box.width * (1 + 2 * padding)), canvas.height / (box.height * (1 + 2 * padding)));
}
