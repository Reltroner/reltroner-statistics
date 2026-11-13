/**
 * Story refactoring and restructuring planner.
 *
 * A plan is produced only when a measured condition holds in the pinned snapshots: a document
 * long enough to split, two documents that share section headings, two section headings of
 * different kinds in one document, or a prose timeline next to a structured one. Line counts,
 * heading lists and dependents are measured, never estimated. Plans are proposals; this module
 * never changes a source repository.
 */

import type { Audit } from '../../domain/finding.ts';
import { DEPENDENCY_STATUSES, traverseImpact, type KnowledgeGraph } from '../../domain/graph.ts';
import type { StatisticsDataset } from '../../domain/observation.ts';
import type { NarrativeEntity, RefactorOperation, StoryRefactoringPlan } from '../../domain/creative.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { codeUnitCompare } from '../canonical.ts';
import { plainText, readLines, relativeLinks } from '../evidence.ts';
import { sha256Hex } from '../git-objects.ts';

/** A document is proposed for splitting from this many lines. */
export const SPLIT_MIN_LINES = 1500;
/** Two documents with the same file name are compared when they share at least this many section headings. */
export const SHARED_HEADINGS_MIN = 3;

function refId(op: RefactorOperation, key: string): string {
  return `REF-${sha256Hex(`${op}|${key}`).slice(0, 12).toUpperCase()}`;
}

/** Heading reduced to its subject: numbering, symbols and the part after a dash are dropped. */
function headingKey(text: string): string {
  return plainText(text).replace(/^[^A-Za-z0-9]+/, '').replace(/^\d+(\.\d+)*\.?\s+/, '').split(/\s+[—–:]\s+/)[0]!.trim().toLowerCase();
}

interface Measured { path: string; lines: number; blob_sha: string; headings: Array<{ level: number; text: string; key: string; line: number }> }

async function measure(snapshot: SourceSnapshot, path: string): Promise<Measured | null> {
  const lines = await readLines(snapshot, path);
  const entry = snapshot.entries.get(path);
  if (!lines || !entry) return null;
  const headings: Measured['headings'] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) fence = !fence;
    const m = fence ? null : /^(#{2,3})\s+(.+)$/.exec(l);
    if (m) headings.push({ level: m[1]!.length, text: plainText(m[2]!), key: headingKey(m[2]!), line: i + 1 });
  });
  return { path, lines: lines.length, blob_sha: entry.sha, headings };
}

export async function buildRefactoringPlans(input: {
  graph: KnowledgeGraph;
  entities: NarrativeEntity[];
  audit: Audit;
  stats: StatisticsDataset;
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
}): Promise<StoryRefactoringPlan[]> {
  const { graph, entities, audit, stats, production, remodeling } = input;
  const plans: StoryRefactoringPlan[] = [];
  const doc = (snap: SourceSnapshot, m: Measured) => ({ path: m.path, side: snap.identity.side, commit_sha: snap.identity.commit_sha, blob_sha: m.blob_sha });
  const entityIds = (paths: string[]) => [...new Set(entities.filter((e) => paths.includes(e.source_path)).map((e) => e.id))].sort(codeUnitCompare);
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const impactFor = (path: string) => {
    const id = `document:${path}`;
    if (!nodeIds.has(id)) return { direct_nodes: [], transitive_nodes: [], summary: 'The document has no node in the knowledge graph, so no dependents are recorded.' };
    const res = traverseImpact(graph.edges, id, { maxDepth: 3, statuses: DEPENDENCY_STATUSES });
    return {
      direct_nodes: res.direct.map((h) => h.node).slice(0, 12),
      transitive_nodes: res.transitive.map((h) => h.node).slice(0, 16),
      summary: `${res.direct.length} direct and ${res.transitive.length} transitive dependents over declared or verified edges within depth 3${res.truncated ? ' (bounded)' : ''}.`,
    };
  };
  const linking = (path: string) => graph.edges.filter((e) => e.type === 'REFERENCES' && e.target === `document:${path}` && e.source.startsWith('document') && e.status === 'VERIFIED').length;

  // 1. Split a long series document. Triggered by measured length only.
  const seriesFiles = audit.files.filter((f) => f.kind === 'markdown' && f.path.startsWith('content/series/'));
  const draftSeries: Measured[] = [];
  for (const f of seriesFiles.filter((x) => x.classification === 'DRAFT_ONLY')) { const m = await measure(remodeling, f.path); if (m) draftSeries.push(m); }
  for (const f of seriesFiles.filter((x) => x.classification !== 'DRAFT_ONLY')) {
    const m = await measure(production, f.path);
    if (!m || m.lines < SPLIT_MIN_LINES) continue;
    const sections = m.headings.filter((h) => h.level === 2);
    const incoming = linking(m.path);
    plans.push({
      id: refId('SPLIT_NARRATIVE_ARC', m.path),
      operation: 'SPLIT_NARRATIVE_ARC',
      title: `Split ${m.path.split('/').pop()} (${m.lines} lines) into linked documents`,
      current_structure: {
        summary: `${m.path} is one document of ${m.lines} lines with ${sections.length} second-level sections.`,
        units: [{ path: m.path, section: 'Whole document', role: `${sections.length} second-level sections`, line_count: m.lines }],
      },
      proposed_structure: {
        summary: 'Keep the document as the index and continuity reference, and move self-contained groups of sections into linked documents.',
        units: [
          { target: m.path, section: 'Index and continuity sections', action: 'Retain', rationale: 'Existing links to this path keep resolving.' },
          { target: 'New documents; names are a creator decision', section: 'Self-contained groups of sections', action: 'Extract and link from the index', rationale: `${sections.length} second-level sections are currently edited in one ${m.lines}-line file.` },
          ...draftSeries.map((d) => ({ target: d.path, section: `Remodeling-only document (${d.lines} lines)`, action: 'Already separate in remodeling; promotion is a creator decision', rationale: 'Shows the same structure applied in the remodeling repository. A proposal, not production canon.' })),
        ],
      },
      rationale: `Measured length: ${m.lines} lines, at or above the ${SPLIT_MIN_LINES}-line threshold used here for a split proposal.`,
      affected_documents: [doc(production, m), ...draftSeries.map((d) => doc(remodeling, d))],
      affected_entities: entityIds([m.path, ...draftSeries.map((d) => d.path)]),
      expected_benefits: ['Smaller diffs for each edit.', 'Sections can be reviewed independently.'],
      possible_narrative_losses: ['Parallels across sections are harder to see unless the documents link to each other.'],
      canon_risks: [`${incoming} document${incoming === 1 ? '' : 's'} link to this file with a verified Markdown link; those links and their anchors must keep resolving.`],
      dependency_impact: impactFor(m.path),
      decision_status: 'PROPOSED',
      canon_status: 'PROPOSED',
    });
  }

  // 2. Two production documents with the same file name that share section headings.
  const byStem = new Map<string, string[]>();
  for (const f of audit.files) {
    if (f.kind !== 'markdown' || f.classification === 'DRAFT_ONLY' || !f.path.startsWith('content/')) continue;
    const stem = f.path.split('/').pop()!;
    byStem.set(stem, [...(byStem.get(stem) ?? []), f.path]);
  }
  for (const [stem, paths] of [...byStem.entries()].sort(([a], [b]) => codeUnitCompare(a, b))) {
    if (paths.length !== 2) continue;
    const [a, b] = await Promise.all(paths.sort(codeUnitCompare).map((p) => measure(production, p)));
    if (!a || !b) continue;
    const keysB = new Set(b.headings.map((h) => h.key));
    const shared = [...new Set(a.headings.map((h) => h.key).filter((k) => k && keysB.has(k)))].sort(codeUnitCompare);
    if (shared.length < SHARED_HEADINGS_MIN) continue;
    const crossLink = relativeLinks(a.path, (await readLines(production, a.path)) ?? []).some((l) => l.target === b.path);
    plans.push({
      id: refId('CONSOLIDATE_DUPLICATED_INFO', `${a.path}|${b.path}`),
      operation: 'CONSOLIDATE_DUPLICATED_INFO',
      title: `Assign one owner to the ${shared.length} section subjects shared by ${a.path} and ${b.path}`,
      current_structure: {
        summary: `Both documents are named ${stem} and carry sections on the same ${shared.length} subjects: ${shared.join(', ')}.${crossLink ? ` ${a.path} links to ${b.path}.` : ''}`,
        units: [
          { path: a.path, section: 'Whole document', role: `${a.headings.length} section headings`, line_count: a.lines },
          { path: b.path, section: 'Whole document', role: `${b.headings.length} section headings`, line_count: b.lines },
        ],
      },
      proposed_structure: {
        summary: 'For each shared subject, keep the full text in one document and a short reference in the other.',
        units: [
          { target: a.path, section: shared.join(', '), action: 'Decide per subject whether this document owns it', rationale: 'A subject described in two places can drift apart when only one is edited.' },
          { target: b.path, section: shared.join(', '), action: 'Keep a reference where the other document owns the subject', rationale: 'Both paths stay published; only the duplicated detail moves.' },
        ],
      },
      rationale: `Measured overlap: ${shared.length} shared section subjects, at or above the threshold of ${SHARED_HEADINGS_MIN}. Whether the two treatments are intentional is a creator decision.`,
      affected_documents: [doc(production, a), doc(production, b)],
      affected_entities: entityIds([a.path, b.path]),
      expected_benefits: ['One place to edit each shared subject.'],
      possible_narrative_losses: ['A reader of one document follows a link for the detail kept in the other.', 'The two documents may describe the same subject from deliberately different angles; consolidation would lose that.'],
      canon_risks: ['Both documents must stay published at their current paths so existing links keep resolving.'],
      dependency_impact: impactFor(a.path),
      decision_status: 'PROPOSED',
      canon_status: 'PROPOSED',
    });
  }

  // 3. A series roadmap that carries a screen-program section next to the in-world chronology.
  const roadmapPath = 'content/series/series-roadmap.md';
  const roadmap = await measure(production, roadmapPath);
  if (roadmap) {
    const screen = roadmap.headings.find((h) => /screen-program/i.test(h.text));
    const chronology = roadmap.headings.find((h) => /canonical order|chronolog/i.test(h.text));
    if (screen && chronology) {
      plans.push({
        id: refId('SEPARATE_CANON_FROM_SPECULATION', roadmapPath),
        operation: 'SEPARATE_CANON_FROM_SPECULATION',
        title: `Label the screen-program section and the in-world chronology of ${roadmapPath.split('/').pop()} as separate parts`,
        current_structure: {
          summary: `${roadmapPath} (${roadmap.lines} lines) contains the section “${screen.text}” at line ${screen.line} and the section “${chronology.text}” at line ${chronology.line}.`,
          units: [{ path: roadmapPath, section: 'Whole document', role: `${roadmap.headings.filter((h) => h.level === 2).length} second-level sections`, line_count: roadmap.lines }],
        },
        proposed_structure: {
          summary: 'Group the sections under two labeled parts without changing their text.',
          units: [
            { target: roadmapPath, section: `Part for in-world chronology (contains “${chronology.text}”)`, action: 'Group existing sections', rationale: 'Readers and tools can find the in-world order without reading production notes.' },
            { target: roadmapPath, section: `Part for screen production (contains “${screen.text}”)`, action: 'Group existing sections', rationale: 'A production-scope note cannot be mistaken for an in-world statement.' },
          ],
        },
        rationale: 'The two quoted section headings are of different kinds: one concerns a screen program, the other the in-world order of the series.',
        affected_documents: [doc(production, roadmap)],
        affected_entities: entityIds([roadmapPath]),
        expected_benefits: ['The kind of each statement is visible from its part heading.'],
        possible_narrative_losses: ['None expected; no text is removed.'],
        canon_risks: ['Section headings that other documents link to must keep their anchors.'],
        dependency_impact: impactFor(roadmapPath),
        decision_status: 'PROPOSED',
        canon_status: 'PROPOSED',
      });
    }
  }

  // 4. A prose timeline next to the structured dataset: cross-reference without rewording matched sentences.
  const timelinePath = 'content/events/history-timeline.md';
  const timeline = await measure(production, timelinePath);
  const dataset = await measure(production, stats.dataset_path);
  const matched = stats.evidence_checks.filter((c) => c.path === timelinePath && c.status === 'VERIFIED');
  if (timeline && dataset && matched.length) {
    plans.push({
      id: refId('IMPROVE_CHRONOLOGY', timelinePath),
      operation: 'IMPROVE_CHRONOLOGY',
      title: `Add a cross-reference table between ${timelinePath.split('/').pop()} and the structured dataset`,
      current_structure: {
        summary: `${timelinePath} (${timeline.lines} lines) states dated values in prose; ${matched.length} of its sentences are matched by evidence rules of this observatory. ${stats.dataset_path} holds ${stats.timeline.length} dated records.`,
        units: [
          { path: timelinePath, section: 'Whole document', role: `Prose timeline; ${matched.length} sentences matched by evidence rules`, line_count: timeline.lines },
          { path: stats.dataset_path, section: 'Whole document', role: `${stats.timeline.length} dated records`, line_count: dataset.lines },
        ],
      },
      proposed_structure: {
        summary: 'Leave the prose as it is and add a table that lists each dated statement with its dataset record, where one exists.',
        units: [
          { target: timelinePath, section: 'Existing prose', action: 'Keep verbatim', rationale: `${matched.length} sentences are matched word for word by evidence rules; rewording them would break the match.` },
          { target: timelinePath, section: 'New appendix: dated statements and dataset records', action: 'Add', rationale: 'A reader can see which dates are also recorded in the dataset and which exist only in prose.' },
        ],
      },
      rationale: 'The same history is recorded in prose and in the dataset. A cross-reference makes agreement and gaps visible without changing either.',
      affected_documents: [doc(production, timeline), doc(production, dataset)],
      affected_entities: entityIds([timelinePath]),
      expected_benefits: ['Agreement between prose and dataset becomes checkable at a glance.'],
      possible_narrative_losses: ['The document gains a technical appendix.'],
      canon_risks: [`Do not reword the ${matched.length} matched sentences (rules: ${matched.map((c) => c.rule_id).join(', ')}).`],
      dependency_impact: impactFor(timelinePath),
      decision_status: 'PROPOSED',
      canon_status: 'PROPOSED',
    });
  }

  return plans.sort((a, b) => codeUnitCompare(a.id, b.id));
}
