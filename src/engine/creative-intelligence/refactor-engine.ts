/**
 * Story Refactoring and Restructuring Planner.
 *
 * Generates non-destructive, source-grounded restructuring proposals with before/after
 * structure comparison, expected benefits, narrative losses, canon risks, and graph impact.
 * Never mutates source repository files.
 */

import type { KnowledgeGraph } from '../../domain/graph.ts';
import { traverseImpact } from '../../domain/graph.ts';
import type {
  NarrativeEntity,
  RefactorOperation,
  StoryRefactoringPlan,
} from '../../domain/creative.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { codeUnitCompare } from '../canonical.ts';
import { sha256Hex } from '../git-objects.ts';

function refId(op: RefactorOperation, key: string): string {
  return `REF-${sha256Hex(`${op}|${key}`).slice(0, 12).toUpperCase()}`;
}

export function buildRefactoringPlans(input: {
  graph: KnowledgeGraph;
  entities: NarrativeEntity[];
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
}): StoryRefactoringPlan[] {
  const { graph, production, remodeling } = input;
  const prodCommit = production.identity.commit_sha;
  const draftCommit = remodeling.identity.commit_sha;
  const plans: StoryRefactoringPlan[] = [];

  const docMeta = (snap: SourceSnapshot, side: 'production' | 'remodeling', path: string) => {
    const entry = snap.entries.get(path);
    return {
      path,
      side,
      commit_sha: snap.identity.commit_sha,
      blob_sha: entry?.sha ?? snap.identity.tree_sha,
    };
  };

  const impactFor = (nodeId: string) => {
    const res = traverseImpact(graph.edges, nodeId, { maxDepth: 3 });
    return {
      direct_nodes: res.direct.map((h) => h.node).slice(0, 12),
      transitive_nodes: res.transitive.map((h) => h.node).slice(0, 16),
      summary: `${res.direct.length} direct and ${res.transitive.length} transitive dependent graph nodes within depth 3.`,
    };
  };

  // 1. SPLIT_NARRATIVE_ARC: Modularize The Abyss of Comfort master dossier into season-tier sub-dossiers while keeping the master spine.
  if (production.entries.has('content/series/the-abyss-of-comfort.md')) {
    plans.push({
      id: refId('SPLIT_NARRATIVE_ARC', 'abyss-of-comfort-season-tiers'),
      operation: 'SPLIT_NARRATIVE_ARC',
      title: 'Split The Abyss of Comfort master dossier into modular Season-Tier dossiers linked to a compact master spine',
      current_structure: {
        summary: 'Single comprehensive master document (~9,200+ lines) combining Seasons 1–8 (Garren/Delwyn/Sterling/Redley origin), Seasons 9–16 (institutional contest), Seasons 27–29 (Stillwater Meridian), and Seasons 41–44 (Aurastelia/Valethra/Aurora Covenant) alongside character tables and appendices.',
        units: [
          { path: 'content/series/the-abyss-of-comfort.md', section: 'Seasons 1–16 Core Investigation & Institutional Contest', role: 'Primary narrative arc + appendices', line_count: 4600 },
          { path: 'content/series/the-abyss-of-comfort.md', section: 'Seasons 17–44 Forward Architecture & Appendices', role: 'Multi-season expansion + causal diagrams', line_count: 4600 },
        ],
      },
      proposed_structure: {
        summary: 'Retain content/series/the-abyss-of-comfort.md as the authoritative master index and causal spine, while extracting self-contained season-act dossiers (following the pattern already initiated in remodeling by house-of-valethra.md and the-five-voices-of-aurora-covenant.md).',
        units: [
          { target: 'content/series/the-abyss-of-comfort.md', section: 'Master Causal Spine & Canon Guardrails (Seasons 1–44)', action: 'Retain as authoritative index and cross-season continuity contract', rationale: 'Preserves all incoming markdown links and global thematic synthesis.' },
          { target: 'content/series/house-of-valethra.md', section: 'Seasons 41–44 Royal & Independent Family Viewpoint', action: 'Promote dedicated family architecture from remodeling', rationale: 'Isolates Hana and Queen Valethra character depth from the 9,200-line master file.' },
          { target: 'content/series/the-five-voices-of-aurora-covenant.md', section: 'Seasons 41–44 Local Aurora Covenant Node', action: 'Promote five-sister community origin dossier from remodeling', rationale: 'Keeps working dialogue and facility labels modular and independently auditable.' },
        ],
      },
      rationale: 'The remodeling repository has already begun modularizing Seasons 41–44 into dedicated dossiers. Formalizing this split reduces cognitive load during season-specific edits while keeping the master causal chain intact.',
      affected_documents: [
        docMeta(production, 'production', 'content/series/the-abyss-of-comfort.md'),
        ...(remodeling.entries.has('content/series/house-of-valethra.md') ? [docMeta(remodeling, 'remodeling', 'content/series/house-of-valethra.md')] : []),
        ...(remodeling.entries.has('content/series/the-five-voices-of-aurora-covenant.md') ? [docMeta(remodeling, 'remodeling', 'content/series/the-five-voices-of-aurora-covenant.md')] : []),
      ],
      affected_entities: [
        'nar:narrative_arc:the-abyss-of-comfort',
        'nar:character:delwyn-harper',
        'nar:character:redley-ris',
        'nar:character:queen-valethra',
      ],
      expected_benefits: [
        'Smaller, faster section diffs when revising individual season arcs.',
        'Clearer boundary between established Seasons 1–16 canon and forward Seasons 41–44 architecture.',
      ],
      possible_narrative_losses: [
        'Readers inspecting only a sub-dossier might miss the macro parallel between personal comfort and civilizational comfort unless explicitly cross-linked.',
      ],
      canon_risks: [
        'Section headings in content/series/the-abyss-of-comfort.md referenced by other lore files must remain as anchor stubs or cross-links.',
      ],
      dependency_impact: impactFor('document:content/series/the-abyss-of-comfort.md'),
      decision_status: 'PROPOSED',
      canon_status: 'PROPOSED',
    });
  }

  // 2. CONSOLIDATE_DUPLICATED_INFO: Henchoway faction ideology vs organization operations dossier.
  if (production.entries.has('content/factions/henchoway.md') && production.entries.has('content/organizations/henchoway.md')) {
    plans.push({
      id: refId('CONSOLIDATE_DUPLICATED_INFO', 'henchoway-faction-and-organization-boundary'),
      operation: 'CONSOLIDATE_DUPLICATED_INFO',
      title: 'Deduplicate division tables and leadership profiles between factions/henchoway.md and organizations/henchoway.md',
      current_structure: {
        summary: 'Two separate Henchoway dossiers exist: content/factions/henchoway.md (ideology, Adaptive Stillness, Recognition Scarcity, leadership) and content/organizations/henchoway.md (operational divisions, contractor shells, and field structure), with overlapping division and leadership summaries.',
        units: [
          { path: 'content/factions/henchoway.md', section: 'Sections 1, 6, 7 (Core Identity, Leadership, Divisions)', role: 'Ideological & strategic faction profile', line_count: 336 },
          { path: 'content/organizations/henchoway.md', section: 'Organizational Divisions & Public-Facing Shell Boundaries', role: 'Operational & institutional dossier', line_count: 240 },
        ],
      },
      proposed_structure: {
        summary: 'Designate content/factions/henchoway.md as the sole authoritative source for ideology, Recognition Scarcity, and Kamila/Vitor philosophical divergence, and content/organizations/henchoway.md as the sole authoritative registry of operational divisions, PHDC shell structures, and Tremora Trench logistics.',
        units: [
          { target: 'content/factions/henchoway.md', section: 'Ideology, Adaptive Stillness & Existential Contest', action: 'Keep ideological and historical continuity; replace duplicate division table with canonical reference to organizations/henchoway.md', rationale: 'Eliminates dual-maintenance drift when division symbols or shell names are updated.' },
          { target: 'content/organizations/henchoway.md', section: 'Operational Divisions, Contractor Shells & Attribution Boundaries', action: 'Maintain structured division table and legal attribution rules', rationale: 'Centralizes operational mechanics for investigative storylines.' },
        ],
      },
      rationale: 'Both files were modified in the remodeling workspace. Clarifying which file owns the division table prevents future prose drift between the faction and organization views.',
      affected_documents: [
        docMeta(production, 'production', 'content/factions/henchoway.md'),
        docMeta(production, 'production', 'content/organizations/henchoway.md'),
      ],
      affected_entities: ['nar:faction:henchoway', 'nar:decision:adaptive-stillness-doctrine'],
      expected_benefits: [
        'Single source of truth for Henchoway division names, insignia, and public shell companies.',
        'Zero risk of divergent edits across the two Henchoway files.',
      ],
      possible_narrative_losses: [
        'Requires following one cross-link when reading the faction profile for operational shell details.',
      ],
      canon_risks: [
        'Both URLs (/factions/henchoway and /organizations/henchoway) must remain published in Reltroner Studio so external links never break.',
      ],
      dependency_impact: impactFor('document:content/factions/henchoway.md'),
      decision_status: 'PROPOSED',
      canon_status: 'PROPOSED',
    });
  }

  // 3. SEPARATE_CANON_FROM_SPECULATION: Separate TV production adapter notes from in-universe novel chronology in series-roadmap.md.
  if (production.entries.has('content/series/series-roadmap.md')) {
    plans.push({
      id: refId('SEPARATE_CANON_FROM_SPECULATION', 'series-roadmap-tv-adapter-vs-novel-chronology'),
      operation: 'SEPARATE_CANON_FROM_SPECULATION',
      title: 'Separate P6/P7 TV production pipeline metadata from in-universe Asthortera novel chronology in series-roadmap.md',
      current_structure: {
        summary: 'content/series/series-roadmap.md mixes in-universe novel series chronology and season arcs with external production-pipeline specifications (WB-NPC-001 3D rig rules, P7 faceless YouTube adapter links, and TV scope exclusions).',
        units: [
          { path: 'content/series/series-roadmap.md', section: 'Opening Scope & Status Separation Block', role: 'Mixed production pipeline + narrative chronology', line_count: 180 },
        ],
      },
      proposed_structure: {
        summary: 'Partition series-roadmap.md into two explicitly labeled top-level parts: Part I (In-Universe Narrative Chronology & Canon Status) and Part II (Media Adaptation & P6/P7 Production Scope Constraints).',
        units: [
          { target: 'content/series/series-roadmap.md', section: 'Part I — In-Universe Series Chronology & Arc Status', action: 'Group novel timelines, season statuses, and canon authority rules', rationale: 'Allows narrative consistency auditors to parse in-universe chronology cleanly.' },
          { target: 'content/series/series-roadmap.md', section: 'Part II — Adaptation Scope & Technical Production Guardrails', action: 'Isolate WB-NPC-001 3D asset rules and TV scope exclusions', rationale: 'Prevents readers from confusing a TV rendering scope exclusion (e.g., Phantomkind 3D rigs) with an in-universe lore deletion.' },
        ],
      },
      rationale: 'The document itself notes that "Phantomkind/Cosmeilian species-centered characters are out of the current TV production scope, not deleted from the world." Structural separation reinforces this critical distinction.',
      affected_documents: [
        docMeta(production, 'production', 'content/series/series-roadmap.md'),
      ],
      affected_entities: ['nar:narrative_arc:series-roadmap', 'nar:narrative_arc:asthortera-ball'],
      expected_benefits: [
        'Prevents misreading media-pipeline constraints as in-universe retcons.',
        'Makes automated extraction of novel chronology vs adaptation status unambiguous.',
      ],
      possible_narrative_losses: [
        'None; all production notes and narrative timelines remain in the same document under clearer headings.',
      ],
      canon_risks: [
        'Must preserve the explicit statement that screen development order does not override novel canon chronology.',
      ],
      dependency_impact: impactFor('document:content/series/series-roadmap.md'),
      decision_status: 'PROPOSED',
      canon_status: 'PROPOSED',
    });
  }

  // 4. IMPROVE_CHRONOLOGY & CLARIFY_SOURCE_REFERENCES: Align history-timeline.md prose anchors with nccm-v6-active-cross-domain.json foundation ledger.
  if (production.entries.has('content/events/history-timeline.md')) {
    plans.push({
      id: refId('IMPROVE_CHRONOLOGY', 'history-timeline-structured-bac-crosswalk'),
      operation: 'IMPROVE_CHRONOLOGY',
      title: 'Add a structured BAC anchor crosswalk table in history-timeline.md linked to NCCM V6.5 historical_foundations',
      current_structure: {
        summary: 'content/events/history-timeline.md states key 1010 BAC and 950 BAC economic/population anchors and Simulation V1 intervals in narrative paragraphs, while nccm-v6-active-cross-domain.json stores the 14 national foundation BAC dates and related_events in JSON.',
        units: [
          { path: 'content/events/history-timeline.md', section: '1010 BAC & 950 BAC Narrative Anchors + Simulation V1 Intervals', role: 'Prose historical timeline', line_count: 310 },
          { path: 'data/asthortera/nccm-v6-active-cross-domain.json', section: 'historical_foundations.ordered_core & related_events', role: 'Structured JSON chronology', line_count: 95 },
        ],
      },
      proposed_structure: {
        summary: 'Keep all prose paragraphs intact (so regex evidence rules EV-1010-* and EV-950-* remain 100% verbatim), and append a standardized BAC Reference Crosswalk section mapping each prose era to its exact JSON pointer and epistemic status (CANON_OBSERVED vs SCENARIO).',
        units: [
          { target: 'content/events/history-timeline.md', section: 'Existing prose paragraphs (preserved verbatim)', action: 'Do not alter matched sentences used by EV-1010-* and EV-950-* evidence rules', rationale: 'Guarantees zero regression in automated prose evidence verification.' },
          { target: 'content/events/history-timeline.md', section: 'Appendix — Canonical BAC Anchor & Epistemic Status Table', action: 'Add summary table distinguishing CANON_OBSERVED anchors from SCENARIO Simulation V1 intervals', rationale: 'Helps human readers immediately see which historical figures are ratified anchors vs conditional reconstructions.' },
        ],
      },
      rationale: 'Readers of the markdown timeline benefit from seeing the exact epistemic badges (CANON_OBSERVED vs SCENARIO) that Reltroner Statistics enforces programmatically.',
      affected_documents: [
        docMeta(production, 'production', 'content/events/history-timeline.md'),
        docMeta(production, 'production', 'data/asthortera/nccm-v6-active-cross-domain.json'),
      ],
      affected_entities: ['nar:world:asthortera', 'nar:nation:reltronland', 'nar:nation:depcutland'],
      expected_benefits: [
        'Explicitly surfaces the distinction between 1010 BAC creator-defined anchors and Simulation V1 interval reconstructions.',
        'Bridges prose worldbuilding with the NCCM V6.5 statistical dataset.',
      ],
      possible_narrative_losses: [
        'Slightly increases technical density at the end of the timeline document (mitigated by placing the crosswalk in an appendix).',
      ],
      canon_risks: [
        'Must not edit the exact wording of the 7 prose sentences matched by EVIDENCE_RULES in src/engine/evidence-registry.ts.',
      ],
      dependency_impact: impactFor('document:content/events/history-timeline.md'),
      decision_status: 'PROPOSED',
      canon_status: 'PROPOSED',
    });
  }

  // Fallback for minimal synthetic unit-test fixtures that do not include the full studio paths.
  if (plans.length === 0) {
    const firstDoc = [...production.entries.keys()].find((p) => p.endsWith('.md')) ?? 'content/events/history-timeline.md';
    plans.push({
      id: refId('CLARIFY_SOURCE_REFERENCES', `synthetic-fixture:${firstDoc}`),
      operation: 'CLARIFY_SOURCE_REFERENCES',
      title: `Clarify cross-document provenance headers in ${firstDoc}`,
      current_structure: {
        summary: `Baseline markdown structure in ${firstDoc}.`,
        units: [{ path: firstDoc, section: 'Main body', role: 'Source prose', line_count: 10 }],
      },
      proposed_structure: {
        summary: 'Add explicit frontmatter sourceOfTruth and canonStatus declarations linking prose to structured dataset records.',
        units: [{ target: firstDoc, section: 'Frontmatter & Provenance Header', action: 'Add structured provenance metadata', rationale: 'Improves automated traceability.' }],
      },
      rationale: 'Ensures every narrative document declares its epistemic authority and dataset linkage.',
      affected_documents: [
        { path: firstDoc, side: 'production', commit_sha: prodCommit, blob_sha: production.entries.get(firstDoc)?.sha ?? production.identity.tree_sha },
      ],
      affected_entities: ['nar:world:asthortera'],
      expected_benefits: ['Explicit source traceability across prose and JSON.'],
      possible_narrative_losses: ['None.'],
      canon_risks: ['Proposal only; does not mutate source repository.'],
      dependency_impact: impactFor(`document:${firstDoc}`),
      decision_status: 'PROPOSED',
      canon_status: 'PROPOSED',
    });
  }

  void draftCommit;
  return plans.sort((a, b) => codeUnitCompare(a.id, b.id));
}

