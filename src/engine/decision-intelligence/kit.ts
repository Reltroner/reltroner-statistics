/**
 * Construction kit for decision trees built by the pipeline. Evidence is resolved against the
 * pinned snapshots; graph links are taken from existing knowledge-graph edges; and `finish`
 * enforces honesty before validation:
 *  - a consequence claimed as source-grounded whose evidence was not found is downgraded to a
 *    narrative hypothesis and says so;
 *  - a consequence claimed as dependency-supported without a declared or verified graph edge is
 *    downgraded the same way;
 *  - a canon constraint whose evidence was not found is dropped.
 * A tree that still fails validateDecisionTree throws, so it can never be published.
 */
import {
  DECISION_RULES_VERSION,
  DECISION_TREE_SCHEMA,
  NON_DEPENDENCY_EDGE_TYPES,
  assertValidDecisionTree,
  type DecisionBranch,
  type DecisionCanonStatus,
  type DecisionConstraint,
  type DecisionEvidence,
  type DecisionFact,
  type DecisionLink,
  type DecisionNode,
  type DecisionTree,
  type EvidenceKind,
  type ModelMetadata,
  type Scalar,
  type TreeType,
} from '../../domain/decision.ts';
import type { Finding } from '../../domain/finding.ts';
import { DEPENDENCY_STATUSES, NARRATIVE_IMPACT_TYPES, traverseImpact, type GraphEdge, type KnowledgeGraph } from '../../domain/graph.ts';
import type { Observation } from '../../domain/observation.ts';
import type { DeploymentStatus } from '../../domain/source.ts';
import type { EpistemicStatus } from '../../domain/status.ts';
import { codeUnitCompare } from '../canonical.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { findPassage } from '../evidence.ts';
import { sha256Hex } from '../git-objects.ts';
import type { QaCheck } from '../qa.ts';

export interface KitContext {
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
  graph: KnowledgeGraph;
  deployment_status: DeploymentStatus;
  /** Timestamp recorded on the trees. Taken from the pinned production commit so the artifact is reproducible. */
  source_timestamp: string;
}

export function treeId(slug: string): string {
  return `DT-${sha256Hex(`decision-tree|${slug}`).slice(0, 12).toUpperCase()}`;
}

const MAX_LINKS_PER_KIND = 6;

export class TreeKit {
  readonly ctx: KitContext;
  readonly evidence = new Map<string, DecisionEvidence>();
  readonly nodes: DecisionNode[] = [];
  readonly branches: DecisionBranch[] = [];
  readonly constraints: DecisionConstraint[] = [];
  readonly links: DecisionLink[] = [];
  readonly facts: Record<string, DecisionFact> = {};
  readonly assumptions: string[] = [];
  readonly #nodeIds: Set<string>;
  readonly #labels: Map<string, string>;

  constructor(ctx: KitContext) {
    this.ctx = ctx;
    this.#nodeIds = new Set(ctx.graph.nodes.map((n) => n.id));
    this.#labels = new Map(ctx.graph.nodes.map((n) => [n.id, n.label]));
  }

  #snap(side: 'production' | 'remodeling'): SourceSnapshot {
    return side === 'production' ? this.ctx.production : this.ctx.remodeling;
  }

  #put(e: DecisionEvidence): string {
    if (this.evidence.has(e.id)) throw new Error(`Evidence ${e.id} registered twice`);
    this.evidence.set(e.id, e);
    return e.id;
  }

  #base(side: 'production' | 'remodeling', path: string): Pick<DecisionEvidence, 'side' | 'repository' | 'commit_sha' | 'path' | 'blob_sha'> {
    const snap = this.#snap(side);
    return { side, repository: snap.identity.repository, commit_sha: snap.identity.commit_sha, path, blob_sha: snap.entries.get(path)?.sha ?? null };
  }

  /** A sentence of a pinned document. VERIFIED when the pattern matches; NOT_FOUND or SOURCE_MISSING otherwise. */
  async passage(id: string, path: string, pattern: RegExp, opts: { side?: 'production' | 'remodeling'; canon_status?: EpistemicStatus; note?: string } = {}): Promise<string> {
    const side = opts.side ?? 'production';
    const snap = this.#snap(side);
    const canon_status = opts.canon_status ?? (side === 'production' ? 'CANON_OBSERVED' : 'PROPOSED');
    const hit = snap.entries.has(path) ? await findPassage(snap, path, pattern) : null;
    return this.#put({
      id, kind: 'SOURCE_PASSAGE', ...this.#base(side, path), status: hit ? 'VERIFIED' : snap.entries.has(path) ? 'NOT_FOUND' : 'SOURCE_MISSING',
      line: hit?.line ?? null, quote: hit?.quote ?? '', canon_status, note: opts.note ?? null,
    });
  }

  /** A value of the observations dataset, cited by pointer (never by line). */
  dataset(id: string, o: Observation | null, label: string): string {
    const side = o?.source.role === 'REMODELING_MAIN' ? 'remodeling' : 'production';
    if (!o) return this.#put({ id, kind: 'DATASET_VALUE', ...this.#base('production', '(dataset value unavailable)'), status: 'NOT_FOUND', line: null, quote: '', canon_status: 'INSUFFICIENT_DATA', note: `${label}: no assigned value in the dataset.` });
    return this.#put({
      id, kind: 'DATASET_VALUE', ...this.#base(side, o.source.path), status: o.value === null ? 'NOT_FOUND' : 'VERIFIED', line: null,
      quote: o.value === null ? '' : `${o.source.pointer ?? o.indicator_id} = ${o.value} ${o.unit}`, canon_status: o.status, note: `${label} (${o.period.label}).`,
    });
  }

  /** The result of a deterministic QA identity on one side. */
  qa(id: string, check: QaCheck | undefined, side: 'production' | 'remodeling', path: string): string {
    return this.#put({
      id, kind: 'QA_IDENTITY', ...this.#base(side, path), status: check && this.#snap(side).entries.has(path) ? 'VERIFIED' : 'NOT_FOUND', line: null,
      quote: check ? `${check.id}: ${check.result}. ${check.formula}` : '', canon_status: side === 'production' ? 'CANON_DERIVED' : 'PROPOSED', note: check ? check.title : 'QA identity not available.',
    });
  }

  /** A drift finding of the audit (production value against remodeling value). */
  finding(id: string, f: Finding | null | undefined): string {
    const show = (v: Finding['production']) => (v.present ? JSON.stringify(v.value) : '(absent)');
    return this.#put({
      id, kind: 'AUDIT_FINDING', ...this.#base('remodeling', f?.file_path ?? '(no drift finding)'), status: f && this.ctx.remodeling.entries.has(f.file_path) ? 'VERIFIED' : 'NOT_FOUND', line: null,
      quote: f ? `${f.id}: ${f.locator || f.file_path}: production ${show(f.production)}, remodeling ${show(f.remodeling)}` : '', canon_status: 'PROPOSED',
      note: f ? 'Drift finding: the remodeling side is a proposal.' : 'No drift finding.',
    });
  }

  /** A measurement taken from a pinned blob or from the knowledge graph (line count, link count, file state). */
  measure(id: string, path: string, statement: string, side: 'production' | 'remodeling' = 'production', kind: EvidenceKind = 'GRAPH_MEASURE'): string {
    const exists = this.#snap(side).entries.has(path);
    return this.#put({ id, kind, ...this.#base(side, path), status: exists ? 'VERIFIED' : 'SOURCE_MISSING', line: null, quote: exists ? statement : '', canon_status: side === 'production' ? 'CANON_DERIVED' : 'PROPOSED', note: 'Measured by the pipeline from the pinned snapshot.' });
  }

  verified(...ids: string[]): boolean {
    return ids.length > 0 && ids.every((id) => this.evidence.get(id)?.status === 'VERIFIED');
  }

  fact(key: string, value: Scalar, extra: Partial<Omit<DecisionFact, 'value'>> = {}): void {
    this.facts[key] = { state: value === null ? (extra.state ?? 'NULL') : 'ASSIGNED', value, unit: null, period: null, canon_status: null, source: '', evidence_ids: [], ...extra };
  }

  node(n: DecisionNode): string {
    this.nodes.push(n);
    return n.id;
  }

  branch(id: string, from: string, to: string, label: string, extra: Partial<DecisionBranch> = {}): void {
    this.branches.push({ id, from, to, label, when: null, guard: null, rationale: '', evidence_ids: [], assumptions: [], uncertainty: 'SPECULATIVE', outcome_class: null, review_requirements: [], ...extra });
  }

  constraint(id: string, statement: string, evidence_ids: string[], binding: DecisionConstraint['binding'] = 'CANON_CONSTRAINT'): void {
    this.constraints.push({ id, statement, binding, evidence_ids });
  }

  #link(node_id: string, kind: DecisionLink['kind'], target_id: string, edge: GraphEdge | null, detail: string): void {
    if (!this.#nodeIds.has(target_id)) return;
    const id = `L-${sha256Hex(`${node_id}|${kind}|${target_id}|${edge?.id ?? ''}`).slice(0, 10).toUpperCase()}`;
    if (this.links.some((l) => l.id === id)) return;
    this.links.push({ id, node_id, kind, target_id, target_label: this.#labels.get(target_id) ?? target_id, edge_id: edge?.id ?? null, edge_type: edge?.type ?? null, edge_status: edge?.status ?? null, detail });
  }

  /**
   * Connect a tree node to the knowledge graph.
   *  dependentsOf: graph nodes whose declared or verified dependents become VERIFIED_DEPENDENCY links;
   *  candidatesOf: graph nodes whose co-occurrence or candidate edges become CANDIDATE_IMPACT links;
   *  speculativeOn: graph nodes a hypothesis would touch, with no supporting edge;
   *  evidenceOf:   evidence ids whose source documents become EVIDENCE_REFERENCE links.
   * Returns the number of verified dependency links added.
   */
  connect(nodeId: string, spec: { dependentsOf?: string[]; candidatesOf?: string[]; speculativeOn?: string[]; evidenceOf?: string[] }): number {
    const edges = this.ctx.graph.edges;
    const byId = new Map(edges.map((e) => [e.id, e]));
    let verified = 0;
    for (const origin of spec.dependentsOf ?? []) {
      if (!this.#nodeIds.has(origin)) continue;
      const res = traverseImpact(edges, origin, { types: NARRATIVE_IMPACT_TYPES, sides: ['production', 'both', 'remodeling'], statuses: DEPENDENCY_STATUSES, maxDepth: 1 });
      const hits = res.direct.filter((h) => !NON_DEPENDENCY_EDGE_TYPES.includes(h.via));
      for (const h of hits.slice(0, MAX_LINKS_PER_KIND)) {
        const edge = byId.get(h.edge)!;
        this.#link(nodeId, 'VERIFIED_DEPENDENCY', h.node, edge, `${h.via} (${edge.status}): a change to ${this.#labels.get(origin) ?? origin} affects this node. ${hits.length} direct dependent${hits.length === 1 ? '' : 's'} in total. ${edge.evidence}`);
        verified++;
      }
    }
    for (const origin of spec.candidatesOf ?? []) {
      const incident = edges.filter((e) => (e.source === origin || e.target === origin) && (e.status === 'CANDIDATE' || e.type === 'MENTIONS' || e.type === 'CAUSES_CANDIDATE' || e.type === 'THEMATICALLY_RELATED'))
        .sort((a, b) => codeUnitCompare(a.id, b.id));
      for (const e of incident.slice(0, MAX_LINKS_PER_KIND)) {
        this.#link(nodeId, 'CANDIDATE_IMPACT', e.source === origin ? e.target : e.source, e, `${e.type} (${e.status}): a co-occurrence or candidate link, not a dependency. ${incident.length} such link${incident.length === 1 ? '' : 's'} in total.`);
      }
    }
    for (const target of spec.speculativeOn ?? []) this.#link(nodeId, 'SPECULATIVE_OUTCOME', target, null, 'Hypothetical effect. No graph edge supports it.');
    for (const id of spec.evidenceOf ?? []) {
      const e = this.evidence.get(id);
      if (!e || e.status !== 'VERIFIED') continue;
      const type = e.path.endsWith('.json') ? 'dataset' : 'document';
      const target = [`${type}:${e.path}`, `${type}~draft:${e.path}`].find((t) => this.#nodeIds.has(t));
      if (target) this.#link(nodeId, 'EVIDENCE_REFERENCE', target, null, `Source of ${id}${e.line ? ` (line ${e.line})` : ''}.`);
    }
    return verified;
  }

  /** Assemble, apply the honesty rules, validate and return the tree. */
  finish(meta: {
    slug: string; type: TreeType; purposes?: TreeType[]; title: string; description: string; question: string; paths: string[]; canon_status: DecisionCanonStatus; root: string;
    model_metadata?: ModelMetadata | null;
  }): DecisionTree {
    const evidence = [...this.evidence.values()].sort((a, b) => codeUnitCompare(a.id, b.id));
    const ok = (ids: readonly string[]) => ids.length > 0 && ids.every((id) => {
      const e = this.evidence.get(id);
      return e?.status === 'VERIFIED' && e.side === 'production' && (e.canon_status === 'CANON_OBSERVED' || e.canon_status === 'CANON_DERIVED');
    });
    const nodes = this.nodes.map((n) => {
      if (n.type !== 'OUTCOME' || !n.consequences) return n;
      const hasDependency = this.links.some((l) => l.node_id === n.id && l.kind === 'VERIFIED_DEPENDENCY');
      const consequences = n.consequences.map((c) => {
        if (c.basis === 'VERIFIED_SOURCE_GROUNDED' && !ok(c.evidence_ids)) return { ...c, basis: 'NARRATIVE_HYPOTHESIS' as const, text: `${c.text} (Its evidence is not verified canonical production evidence in the pinned source, so this is treated as a hypothesis.)` };
        if (c.basis === 'DEPENDENCY_SUPPORTED' && !hasDependency) return { ...c, basis: 'NARRATIVE_HYPOTHESIS' as const, text: `${c.text} (No declared or verified dependency supports this in the pinned graph, so it is treated as a hypothesis.)` };
        return c;
      });
      return { ...n, consequences, outcome_class: consequences[0]?.basis ?? n.outcome_class };
    });
    const leafClass = new Map(nodes.filter((n) => n.type === 'OUTCOME').map((n) => [n.id, n.outcome_class ?? null]));
    const tree: DecisionTree = {
      schema_version: DECISION_TREE_SCHEMA,
      tree_id: treeId(meta.slug),
      tree_type: meta.type,
      purposes: meta.purposes ?? [meta.type],
      strict: true,
      title: meta.title,
      description: meta.description,
      question: meta.question,
      source_context: {
        production: { repository: this.ctx.production.identity.repository, commit_sha: this.ctx.production.identity.commit_sha },
        remodeling: { repository: this.ctx.remodeling.identity.repository, commit_sha: this.ctx.remodeling.identity.commit_sha },
        deployment_status: this.ctx.deployment_status,
        paths: [...new Set(meta.paths)].sort(codeUnitCompare),
      },
      production_source_sha: this.ctx.production.identity.commit_sha,
      remodeling_source_sha: this.ctx.remodeling.identity.commit_sha,
      rules_version: DECISION_RULES_VERSION,
      root_node_id: meta.root,
      nodes,
      branches: this.branches.map((b) => (b.outcome_class && leafClass.has(b.to) ? { ...b, outcome_class: leafClass.get(b.to) ?? null } : b)),
      constraints: this.constraints.filter((c) => c.binding !== 'CANON_CONSTRAINT' || ok(c.evidence_ids)),
      assumptions: this.assumptions,
      outcomes: nodes.filter((n) => n.type === 'OUTCOME' || n.type === 'INSUFFICIENT_DATA').map((n) => n.id).sort(),
      evidence,
      links: [...this.links].sort((a, b) => codeUnitCompare(a.id, b.id)),
      facts: Object.fromEntries(Object.entries(this.facts).sort(([a], [b]) => codeUnitCompare(a, b))),
      creator_review_status: 'PROPOSED',
      canon_status: meta.canon_status,
      model_metadata: meta.model_metadata ?? null,
      created_at: this.ctx.source_timestamp,
      updated_at: this.ctx.source_timestamp,
    };
    assertValidDecisionTree(tree);
    return tree;
  }
}
