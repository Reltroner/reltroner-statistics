import type { Audit } from '../domain/finding.ts';
import type { StatisticsDataset } from '../domain/observation.ts';
import type { EdgeStatus, EdgeType, GraphEdge, GraphNode, GraphSide, KnowledgeGraph, NodeType } from '../domain/graph.ts';
import type { NarrativeEntityKind } from '../domain/creative.ts';
import { INDICATORS, indicatorLabel } from '../domain/indicators.ts';
import type { QaCheck } from './qa.ts';
import type { SourceSnapshot } from './comparator.ts';
import { codeUnitCompare } from './canonical.ts';
import { sha256Hex } from './git-objects.ts';
import { isComparedPath } from './scope.ts';
import { parseFrontmatter } from './markdown.ts';
import { relativeLinks } from './evidence.ts';
import { NCCM_DATASET_PATH } from './observations.ts';
import { extractNarrativeKnowledge } from './creative-intelligence/extractor.ts';

const decoder = new TextDecoder();

export const PLANET_DERIVED_INDICATORS = Object.freeze([
  { id: 'planet.population', label: 'Planetary population' },
  { id: 'planet.sdi', label: 'Planetary SDI' },
  { id: 'planet.real_gdp_growth', label: 'Planetary real GDP growth' },
  { id: 'planet.tfr', label: 'Planetary TFR' },
  { id: 'planet.gdp_usd', label: 'Planetary nominal GDP' },
]);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface GraphInputs {
  audit: Audit;
  stats: StatisticsDataset;
  qa: QaCheck[];
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
  concurrency?: number;
}

export async function buildKnowledgeGraph(input: GraphInputs): Promise<KnowledgeGraph> {
  const { audit, stats, qa, production, remodeling } = input;
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const addNode = (n: GraphNode) => { if (!nodes.has(n.id)) nodes.set(n.id, n); };
  const addEdge = (type: EdgeType, source: string, target: string, side: GraphSide, status: EdgeStatus, evidence: string) => {
    if (!nodes.has(source) || !nodes.has(target) || source === target) return;
    const id = `E-${sha256Hex(`${type}|${source}|${target}|${side}`).slice(0, 12).toUpperCase()}`;
    if (!edges.has(id)) edges.set(id, { id, type, source, target, side, status, evidence: evidence.slice(0, 400) });
  };

  // Revisions and lineage.
  for (const [side, s] of [['production', production], ['remodeling', remodeling]] as const) {
    addNode({ id: `revision:${side}`, type: 'revision', label: `${s.identity.repository.split('/')[1]} @ ${s.identity.commit_sha.slice(0, 7)}`, side, group: 'revision',
      attrs: { commit_sha: s.identity.commit_sha, tree_sha: s.identity.tree_sha, role: s.identity.role, committed_at: s.identity.committed_at } });
  }
  addEdge('PROPOSES_CHANGE_TO', 'revision:remodeling', 'revision:production', 'remodeling', 'DECLARED',
    `${audit.summary.changed} changed (${audit.summary.changed_by_nature.CONTENT ?? 0} with content changes), ${audit.summary.draft_only} remodeling-only, ${audit.summary.production_only} production-only files in scope.`);

  // Entities.
  for (const e of stats.entities) {
    addNode({ id: `entity:${e.id}`, type: 'entity', label: e.name, side: 'production', group: e.cohort,
      attrs: { kind: e.kind, cohort: e.cohort, canon_status: e.canon_status, represents_states: e.represents_states, foundation_bac: e.foundation_bac, specialization: e.specialization } });
  }
  // Indicators (national and planetary derived).
  const present = new Set(stats.observations.map((o) => o.indicator_id));
  for (const ind of INDICATORS) {
    if (!present.has(ind.id)) continue;
    addNode({ id: `indicator:${ind.id}`, type: 'indicator', label: ind.label, side: 'production', group: ind.group, attrs: { unit: ind.unit, derivation: ind.derivation, formula: ind.formula ?? null } });
  }
  for (const p of PLANET_DERIVED_INDICATORS) addNode({ id: `indicator:${p.id}`, type: 'indicator', label: p.label, side: 'production', group: 'Planet', attrs: { unit: null, derivation: 'DERIVED', formula: null } });

  // Files: datasets and documents, per side.
  const fileById = new Map(audit.files.map((f) => [f.path, f]));
  const docIds = new Map<string, { prod: string | null; draft: string | null }>();
  for (const f of audit.files) {
    const type = f.kind === 'json' ? 'dataset' : 'document';
    const contentChanged = f.classification === 'CHANGED' && f.content_nature === 'CONTENT';
    const label = f.title && f.kind === 'markdown' ? f.title : f.path.split('/').pop()!;
    const group = f.path.split('/')[1] ?? null;
    const base = { group, attrs: { path: f.path, classification: f.classification, content_nature: f.content_nature, findings: f.finding_count } };
    if (f.classification === 'DRAFT_ONLY') {
      addNode({ id: `${type}:${f.path}`, type, label, side: 'remodeling', ...base });
      docIds.set(f.path, { prod: null, draft: `${type}:${f.path}` });
    } else {
      addNode({ id: `${type}:${f.path}`, type, label, side: f.classification === 'PRODUCTION_ONLY' ? 'production' : contentChanged ? 'production' : 'both', ...base });
      if (contentChanged) {
        addNode({ id: `${type}~draft:${f.path}`, type, label: `${label} (remodeling)`, side: 'remodeling', ...base });
        addEdge('PROPOSES_CHANGE_TO', `${type}~draft:${f.path}`, `${type}:${f.path}`, 'remodeling', 'DECLARED',
          `Blob ${f.remodeling_blob_sha?.slice(0, 10)} vs ${f.production_blob_sha?.slice(0, 10)}; ${f.finding_count - 1} semantic findings.`);
        docIds.set(f.path, { prod: `${type}:${f.path}`, draft: `${type}~draft:${f.path}` });
      } else {
        const id = `${type}:${f.path}`;
        docIds.set(f.path, { prod: id, draft: f.classification === 'PRODUCTION_ONLY' ? null : id });
      }
    }
  }

  // Dataset DEFINES entities and indicators (production NCCM).
  const datasetId = `dataset:${NCCM_DATASET_PATH}`;
  for (const e of stats.entities) addEdge('DEFINES', datasetId, `entity:${e.id}`, 'production', 'DECLARED', `${NCCM_DATASET_PATH} carries the ${e.name} record (canon ${e.canon_status ?? 'unlabeled'}).`);
  for (const ind of INDICATORS) if (present.has(ind.id)) addEdge('DEFINES', datasetId, `indicator:${ind.id}`, 'production', 'DECLARED', `${NCCM_DATASET_PATH} assigns ${ind.label} (${ind.fields.PROFILED_14.join(' / ')}).`);
  for (const p of PLANET_DERIVED_INDICATORS) addEdge('DEFINES', datasetId, `indicator:${p.id}`, 'production', 'DECLARED', `${NCCM_DATASET_PATH} states ${p.label}.`);

  // Entity REFERENCES its declared source document.
  for (const e of stats.entities) {
    if (e.source_document && docIds.get(e.source_document)?.prod) {
      addEdge('REFERENCES', `entity:${e.id}`, docIds.get(e.source_document)!.prod!, 'production', 'DECLARED', `Record member "source": "${e.source_document}".`);
    }
  }

  // Calculation dependencies verified by QA identities.
  for (const q of qa) {
    if (!q.validates) continue;
    const status: EdgeStatus = q.result === 'PASS' ? 'VERIFIED' : 'CANDIDATE';
    for (const input of q.validates.inputs) {
      addEdge('DEPENDS_ON', `indicator:${q.validates.target}`, `indicator:${input}`, 'production', status, `${q.id} ${q.result}: ${q.formula}`);
    }
  }

  // Dataset lineage from production provenance members.
  const prodDoc = await readJson(production, NCCM_DATASET_PATH);
  const prov = prodDoc && typeof prodDoc.provenance === 'object' && prodDoc.provenance ? (prodDoc.provenance as Record<string, unknown>) : {};
  const declaredParents = new Set<string>();
  for (const key of ['previous_source', 'previous_14_source']) {
    const p = prov[key];
    if (typeof p === 'string' && fileById.has(p)) {
      declaredParents.add(p);
      addEdge('DERIVED_FROM', datasetId, `dataset:${p}`, 'production', 'DECLARED', `provenance.${key} = "${p}"`);
    }
  }
  const supersedes = prodDoc && typeof prodDoc.canon_ratification === 'object' && prodDoc.canon_ratification
    ? (prodDoc.canon_ratification as Record<string, unknown>).supersedes : null;
  if (typeof supersedes === 'string') {
    for (const f of audit.files) {
      if (f.kind !== 'json' || f.path === NCCM_DATASET_PATH || f.classification === 'DRAFT_ONLY') continue;
      const v = /-v(\d+)\b/i.exec(f.path.split('/').pop()!);
      if (!v || !new RegExp(`\\bV${v[1]}\\b`).test(supersedes)) continue;
      addEdge('SUPERSEDES', datasetId, `dataset:${f.path}`, 'production', declaredParents.has(f.path) ? 'DECLARED' : 'CANDIDATE',
        `canon_ratification.supersedes mentions V${v[1]}: "${supersedes.slice(0, 160)}"${declaredParents.has(f.path) ? '; also the declared previous source' : '; version-token match only'}.`);
    }
  }

  // Remodeling dataset PROPOSES_CHANGE_TO entities with value or schema drift.
  const draftDataset = `dataset~draft:${NCCM_DATASET_PATH}`;
  if (nodes.has(draftDataset)) {
    const byEntity = new Map<string, string[]>();
    for (const f of audit.findings) {
      if (f.file_path !== NCCM_DATASET_PATH || f.level !== 'FIELD' || f.entity?.kind !== 'country') continue;
      const list = byEntity.get(f.entity.name) ?? [];
      list.push(`${f.id} ${f.field}`);
      byEntity.set(f.entity.name, list);
    }
    for (const [name, list] of byEntity) {
      const ent = stats.entities.find((e) => e.name === name);
      if (ent) addEdge('PROPOSES_CHANGE_TO', draftDataset, `entity:${ent.id}`, 'remodeling', 'DECLARED', `${list.length} field findings: ${list.slice(0, 4).join('; ')}${list.length > 4 ? '…' : ''}`);
    }
  }

  // Historical observations stated in prose.
  for (const o of stats.observations.filter((x) => x.evidence)) {
    const id = `observation:${o.id}`;
    addNode({ id, type: 'observation', label: `${indicatorLabel(o.indicator_id)} · ${o.period.label}`, side: 'production', group: o.status,
      attrs: { value: o.value, unit: o.unit, status: o.status, entity: o.entity_name, rule: o.evidence!.rule_id } });
    const doc = docIds.get(o.source.path)?.prod;
    if (doc) addEdge('DEFINES', doc, id, 'production', 'DECLARED', `${o.evidence!.rule_id} line ${o.source.line}: “${o.evidence!.quote.slice(0, 200)}”`);
    addEdge('REFERENCES', id, `entity:${o.entity_id}`, 'production', 'DECLARED', `Observation of ${o.entity_name}.`);
    if (nodes.has(`indicator:${o.indicator_id}`)) addEdge('REFERENCES', id, `indicator:${o.indicator_id}`, 'production', 'DECLARED', `Measures ${indicatorLabel(o.indicator_id)}.`);
  }

  // Document MENTIONS countries (word-boundary, case-sensitive). The planet name is excluded:
  // it occurs in nearly every document and carries no dependency signal.
  const countries = stats.entities.filter((e) => e.kind === 'country');
  const patterns = countries.map((e) => ({ e, re: new RegExp(`(?<![A-Za-z])${escapeRe(e.name)}(?![A-Za-z])`, 'g') }));
  const scan = async (s: SourceSnapshot, path: string) => {
    const entry = s.entries.get(path);
    if (!entry) return null;
    const text = decoder.decode(await s.readBlob(entry.sha)).replace(/\r\n?/g, '\n');
    const hits: Array<{ entity: string; count: number; line: number }> = [];
    for (const { e, re } of patterns) {
      re.lastIndex = 0;
      let count = 0, first = -1, m: RegExpExecArray | null;
      while ((m = re.exec(text))) { if (first < 0) first = m.index; count++; }
      if (count) hits.push({ entity: e.id, count, line: text.slice(0, first).split('\n').length });
    }
    return { hits, title: documentTitle(text), links: relativeLinks(path, text.split('\n')) };
  };
  const relabel = (id: string | null, title: string | null | undefined, suffix = '') => {
    const n = id ? nodes.get(id) : undefined;
    if (n && title) nodes.set(n.id, { ...n, label: `${title.slice(0, 120)}${suffix}` });
  };
  const mdFiles = audit.files.filter((f) => f.kind === 'markdown' && isComparedPath(f.path));
  const tasks: Array<() => Promise<void>> = [];
  const mentionCount = new Map<string, number>();
  const docLinks: Array<{ from: string | null; links: Array<{ target: string; line: number }>; draft: boolean }> = [];
  for (const f of mdFiles) {
    tasks.push(async () => {
      const ids = docIds.get(f.path)!;
      const [ph, dh] = await Promise.all([
        ids.prod ? scan(production, f.path) : Promise.resolve(null),
        ids.draft && ids.draft !== ids.prod ? scan(remodeling, f.path) : Promise.resolve(null),
      ]);
      relabel(ids.prod, ph?.title);
      if (ids.draft && ids.draft !== ids.prod) relabel(ids.draft, dh?.title, ids.prod ? ' (remodeling)' : '');
      for (const h of ph?.hits ?? []) {
        const side: GraphSide = ids.draft === ids.prod ? 'both' : 'production';
        addEdge('MENTIONS', ids.prod!, `entity:${h.entity}`, side, 'DECLARED', `${h.count} occurrence(s); first at line ${h.line}.`);
        mentionCount.set(ids.prod!, (mentionCount.get(ids.prod!) ?? 0) + h.count);
      }
      for (const h of dh?.hits ?? []) {
        addEdge('MENTIONS', ids.draft!, `entity:${h.entity}`, 'remodeling', 'DECLARED', `${h.count} occurrence(s) in remodeling; first at line ${h.line}.`);
        mentionCount.set(ids.draft!, (mentionCount.get(ids.draft!) ?? 0) + h.count);
      }
      docLinks.push({ from: ids.prod, links: ph?.links ?? [], draft: false }, { from: ids.draft !== ids.prod ? ids.draft : null, links: dh?.links ?? [], draft: true });
    });
  }
  let i = 0;
  await Promise.all(Array.from({ length: input.concurrency ?? 8 }, async () => { while (i < tasks.length) await tasks[i++]!(); }));

  // Document REFERENCES document: a relative Markdown link whose target exists in the same
  // snapshot. Verified by resolution, so a change to the target can break or outdate the source.
  for (const { from, links, draft } of docLinks) {
    if (!from) continue;
    for (const l of links) {
      const target = draft ? (docIds.get(l.target)?.draft ?? null) : (docIds.get(l.target)?.prod ?? null);
      if (target && (draft ? remodeling : production).entries.has(l.target)) {
        addEdge('REFERENCES', from, target, draft ? 'remodeling' : nodes.get(from)?.side === 'both' && nodes.get(target)?.side === 'both' ? 'both' : 'production', 'VERIFIED', `Markdown link at line ${l.line} resolves to ${l.target}.`);
      }
    }
  }

  // Narrative Systems Layer: add source-grounded narrative entities and typed narrative relationships.
  const mapNarrativeKindToNodeType = (k: NarrativeEntityKind): NodeType => {
    switch (k) {
      case 'character': return 'character';
      case 'faction': return 'faction';
      case 'organization':
      case 'institution':
      case 'government': return 'organization';
      case 'historical_event':
      case 'treaty':
      case 'decision':
      case 'consequence': return 'event';
      case 'location':
      case 'world': return 'location';
      case 'technology': return 'technology';
      case 'law':
      case 'constraint': return 'law';
      case 'principle': return 'principle';
      case 'philosophy':
      case 'motivation':
      case 'viewpoint': return 'philosophy';
      case 'narrative_arc': return 'narrative_arc';
      case 'theme': return 'theme';
      case 'conflict': return 'conflict';
      case 'nation':
      case 'civilization': return 'entity';
    }
  };

  const narrative = await extractNarrativeKnowledge({ audit, stats, production, remodeling });
  for (const ne of narrative.entities) {
    const nodeType = mapNarrativeKindToNodeType(ne.kind);
    addNode({
      id: ne.id,
      type: nodeType,
      label: ne.name,
      side: ne.source_side,
      group: ne.kind,
      attrs: {
        narrative_kind: ne.kind,
        canon_status: ne.canon_status,
        extraction_confidence: ne.extraction_confidence,
        source_path: ne.source_path,
        commit_sha: ne.commit_sha,
        blob_sha: ne.blob_sha,
        historical_bac: ne.historical_bac?.label ?? null,
        editorial_updated_at: ne.editorial_updated_at,
      },
    });
    const docNodeId = ne.source_side === 'remodeling' ? docIds.get(ne.source_path)?.draft : docIds.get(ne.source_path)?.prod;
    if (docNodeId && docNodeId.startsWith('document:')) {
      addEdge(
        'DEFINES',
        docNodeId,
        ne.id,
        ne.source_side,
        ne.extraction_confidence === 'CANDIDATE_INFERENCE' ? 'CANDIDATE' : 'DECLARED',
        `${ne.source_path}${ne.evidence_line ? `:${ne.evidence_line}` : ''}: ${ne.evidence_quote.slice(0, 180)}`,
      );
    }
  }
  for (const nr of narrative.relationships) {
    const edgeStatus: EdgeStatus =
      nr.verification === 'VERIFIED_SOURCE_GROUNDED'
        ? 'VERIFIED'
        : nr.verification === 'DECLARED_PROVENANCE'
          ? 'DECLARED'
          : 'CANDIDATE';
    addEdge(
      nr.type as EdgeType,
      nr.source_id,
      nr.target_id,
      nr.source_side,
      edgeStatus,
      `${nr.rationale} [${nr.source_path}${nr.evidence_line ? `:${nr.evidence_line}` : ''}]`,
    );
  }

  // Keep documents that participate in at least one edge; isolated documents add no information.
  const connected = new Set<string>();
  for (const e of edges.values()) { connected.add(e.source); connected.add(e.target); }
  const finalNodes = [...nodes.values()]
    .filter((n) => (n.type !== 'document' && n.type !== 'dataset') || connected.has(n.id))
    .map((n) => (n.type === 'document' ? { ...n, attrs: { ...n.attrs, mention_count: mentionCount.get(n.id) ?? 0 } } : n))
    .sort((a, b) => codeUnitCompare(a.id, b.id));
  const kept = new Set(finalNodes.map((n) => n.id));
  const finalEdges = [...edges.values()].filter((e) => kept.has(e.source) && kept.has(e.target)).sort((a, b) => codeUnitCompare(a.id, b.id));
  const tally = <T,>(items: T[], key: (t: T) => string) => {
    const o: Record<string, number> = {};
    for (const it of items) o[key(it)] = (o[key(it)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(o).sort(([a], [b]) => codeUnitCompare(a, b)));
  };
  return {
    schema_version: 'reltroner-statistics-graph.v1',
    nodes: finalNodes,
    edges: finalEdges,
    summary: {
      nodes_by_type: tally(finalNodes, (n) => n.type),
      edges_by_type: tally(finalEdges, (e) => e.type),
      edges_by_status: tally(finalEdges, (e) => e.status),
      edges_by_side: tally(finalEdges, (e) => e.side),
    },
  };
}

async function readJson(s: SourceSnapshot, path: string): Promise<Record<string, unknown> | null> {
  const e = s.entries.get(path);
  if (!e) return null;
  try {
    return JSON.parse(decoder.decode(await s.readBlob(e.sha))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function documentTitle(text: string): string | null {
  const fm = parseFrontmatter(text);
  return fm.ok && fm.value && typeof fm.value.title === 'string' ? fm.value.title : null;
}
