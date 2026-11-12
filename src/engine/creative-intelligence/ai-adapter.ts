/**
 * Optional AI / LLM Integration Adapter with Strict Privacy Boundary.
 *
 * Rules (Section 13):
 * 1. Never require an external LLM API key in static builds, public pages, or CI.
 * 2. Never send private or unreleased creative ideas to an external AI service without
 *    explicit creator configuration, authentication, and data-processing authorization.
 * 3. Every Creative Intelligence workflow must function deterministically using
 *    graph-based retrieval, source-grounded context assembly, and structured rule engines
 *    even when no external AI provider is configured.
 * 4. If an optional AI adapter interface is defined, it must mark availability honestly
 *    and keep all LLM-generated suggestions labeled HYPOTHETICAL / UNRATIFIED.
 */

import type {
  AiAdapterStatus,
  CreativeOpportunity,
  NarrativeEntity,
  NarrativeRelationship,
  RemodelingScenario,
} from '../../domain/creative.ts';

export interface DeterministicIdeationResult {
  query: string;
  epistemic_label: 'HYPOTHETICAL_UNRATIFIED';
  adapter_mode: 'DETERMINISTIC_GRAPH_RETRIEVAL_ONLY';
  matched_entities: Array<{ id: string; name: string; kind: string; canon_status: string; source_path: string }>;
  verified_constraints: string[];
  grounded_hypotheses: Array<{
    title: string;
    premise: string;
    supporting_sources: string[];
    risk_guardrail: string;
  }>;
  privacy_notice: string;
}

export function getAiAdapterStatus(): AiAdapterStatus {
  return {
    available: false,
    mode: 'DETERMINISTIC_GRAPH_RETRIEVAL_ONLY',
    privacy_boundary: 'STRICT_NO_EXTERNAL_TRANSMISSION',
    reason: 'External LLM transmission is disabled by default to protect unreleased Reltroner Studio intellectual property. All ideation, consistency auditing, and impact simulation operate deterministically using local knowledge-graph retrieval and source-grounded rule engines.',
  };
}

/**
 * Generates deterministic, source-grounded brainstorming hypotheses from the local
 * narrative knowledge graph and opportunity registry without calling any external API.
 */
export function generateDeterministicIdeation(input: {
  query: string;
  focusEntityIds?: string[];
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
  opportunities: CreativeOpportunity[];
  scenarios: RemodelingScenario[];
}): DeterministicIdeationResult {
  const { query, focusEntityIds = [], entities, relationships, opportunities, scenarios } = input;
  const qLower = query.toLowerCase();

  // Match entities by explicit selection or query substring
  const matched = entities.filter((e) => {
    if (focusEntityIds.includes(e.id)) return true;
    if (!qLower.trim()) return false;
    return (
      e.name.toLowerCase().includes(qLower) ||
      e.summary.toLowerCase().includes(qLower) ||
      e.original_terminology.some((t) => t.toLowerCase().includes(qLower))
    );
  });

  const activeEntities = matched.length > 0 ? matched.slice(0, 8) : entities.slice(0, 5);
  const activeIds = new Set(activeEntities.map((e) => e.id));

  // Gather verified constraints from relationships and scenarios touching active entities
  const verifiedConstraints: string[] = [];
  for (const rel of relationships) {
    if (activeIds.has(rel.source_id) || activeIds.has(rel.target_id)) {
      if (rel.verification === 'VERIFIED_SOURCE_GROUNDED') {
        verifiedConstraints.push(`[${rel.type}] ${rel.rationale} (${rel.source_path})`);
      }
    }
    if (verifiedConstraints.length >= 6) break;
  }

  for (const scn of scenarios) {
    if (scn.focus_entities.some((id) => activeIds.has(id))) {
      for (const c of scn.potential_contradictions) {
        if (!verifiedConstraints.includes(c)) verifiedConstraints.push(c);
      }
    }
  }

  const groundedHypotheses: DeterministicIdeationResult['grounded_hypotheses'] = [];
  for (const opp of opportunities) {
    if (
      opp.affected_entities.some((id) => activeIds.has(id)) ||
      (qLower.trim() && (opp.title.toLowerCase().includes(qLower) || opp.narrative_question.toLowerCase().includes(qLower)))
    ) {
      for (const alt of opp.possible_alternatives.slice(0, 2)) {
        groundedHypotheses.push({
          title: `${opp.title} — ${alt.label}`,
          premise: `${alt.summary} (${alt.mechanism})`,
          supporting_sources: opp.canon_anchors.map((a) => `${a.path}${a.line ? `:${a.line}` : ''}`),
          risk_guardrail: opp.consistency_risks[0] ?? alt.narrative_tradeoff,
        });
      }
    }
  }

  if (groundedHypotheses.length === 0 && activeEntities.length > 0) {
    const primary = activeEntities[0]!;
    groundedHypotheses.push({
      title: `Institutional & Perspective Stress-Test for ${primary.name}`,
      premise: `Explore how ${primary.name} (${primary.kind}) responds when its primary institutional constraint is tested by an external crisis while preserving its established canon status (${primary.canon_status}).`,
      supporting_sources: [`${primary.source_path}${primary.evidence_line ? `:${primary.evidence_line}` : ''}`],
      risk_guardrail: `Preserve ${primary.name}'s established provenance in ${primary.source_path}; treat all brainstormed outcomes as PROPOSED / SCENARIO until ratified in Reltroner/reltroner-studio.`,
    });
  }

  return {
    query,
    epistemic_label: 'HYPOTHETICAL_UNRATIFIED',
    adapter_mode: 'DETERMINISTIC_GRAPH_RETRIEVAL_ONLY',
    matched_entities: activeEntities.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      canon_status: e.canon_status,
      source_path: e.source_path,
    })),
    verified_constraints: verifiedConstraints.slice(0, 8),
    grounded_hypotheses: groundedHypotheses.slice(0, 6),
    privacy_notice: 'Generated locally via deterministic graph retrieval. Zero bytes transmitted to any external AI provider.',
  };
}

