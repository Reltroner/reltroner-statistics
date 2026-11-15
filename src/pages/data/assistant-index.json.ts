import type { APIRoute } from 'astro';
import type { AgentFact, AgentIndex, AgentNarrative, AgentRelation } from '../../domain/assistant.ts';
import { indicatorFormat, indicatorLabel, indicatorUnit } from '../../domain/indicators.ts';
import { formatValue } from '../../lib/format.ts';
import { currentObservations, getComposition, getContext, getCreative } from '../../lib/data.ts';
import { ROUTES } from '../../lib/site.ts';

/**
 * Public build-time evidence index for the assistant. It contains only published artifacts:
 * production Year 0 canon values, the composition artifact, source-grounded narrative entities
 * and their verified or declared relationships. It never contains private creator drafts,
 * candidate relationships as facts, or credentials.
 */
export const GET: APIRoute = () => {
  const ctx = getContext();
  const creative = getCreative();
  const repoOf = (commit: string) => (commit === ctx.production.commit_sha ? 'Reltroner/reltroner-studio' : 'Reltroner/reltroner-studio-remodeling');
  const narrative: AgentNarrative[] = creative.entities.map((e) => ({
    id: e.id, name: e.name, kind: e.kind, summary: e.summary.slice(0, 600), side: e.source_side, canon_status: e.canon_status,
    source: { repository: repoOf(e.commit_sha), commit_sha: e.commit_sha, path: e.source_path, line: e.evidence_line, quote: e.evidence_quote },
  }));
  const relations: AgentRelation[] = creative.relationships
    .filter((r): r is typeof r & { verification: AgentRelation['verification'] } => r.verification !== 'CANDIDATE_HYPOTHESIS')
    .map((r) => ({
      id: r.id, type: r.type, source_id: r.source_id, target_id: r.target_id, verification: r.verification, causal_class: r.causal_class, rationale: r.rationale,
      source: { repository: repoOf(r.commit_sha), commit_sha: r.commit_sha, path: r.source_path, line: r.evidence_line, quote: r.evidence_quote },
    }));
  const candidate_counts: Record<string, number> = {};
  for (const r of creative.relationships) {
    if (r.verification !== 'CANDIDATE_HYPOTHESIS') continue;
    for (const id of [r.source_id, r.target_id]) candidate_counts[id] = (candidate_counts[id] ?? 0) + 1;
  }
  const facts: AgentFact[] = currentObservations()
    .filter((o) => (o.status === 'CANON_OBSERVED' || o.status === 'CANON_DERIVED') && o.value !== null)
    .map((o) => {
      const format = indicatorFormat(o.indicator_id);
      const shown = formatValue(o.value, format);
      return {
        entity_id: o.entity_id, entity: o.entity_name, indicator: o.indicator_id, label: indicatorLabel(o.indicator_id), value: o.value!, unit: o.unit,
        display: format === 'number' || format === 'index' ? `${shown} ${o.unit}` : shown,
        status: o.status as AgentFact['status'],
        source: { repository: o.source.repository, commit_sha: o.source.commit_sha, path: o.source.path, pointer: o.source.pointer },
      };
    });
  const indicators = [...new Set(facts.map((f) => f.indicator))].sort().map((id) => ({ id, label: indicatorLabel(id), unit: indicatorUnit(id) }));
  const composition = getComposition();
  const index: AgentIndex = {
    schema_version: 'reltroner-agent-index.v2',
    production_sha: ctx.production.commit_sha,
    remodeling_sha: composition.sources.remodeling?.commit_sha ?? null,
    composition,
    indicators,
    facts,
    narrative,
    relations,
    candidate_counts,
    routes: ROUTES.map((r) => ({ title: r.title, href: r.path, summary: r.summary })),
  };
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
