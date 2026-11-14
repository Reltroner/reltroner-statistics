import type { APIRoute } from 'astro';
import type { AgentIndex, AgentNarrative } from '../../domain/assistant.ts';
import { indicatorLabel } from '../../domain/indicators.ts';
import { currentObservations, getComposition, getContext, getCreative } from '../../lib/data.ts';
import { ROUTES } from '../../lib/site.ts';

/** Public build-time evidence index. Never includes private creator session drafts or external credentials. */
export const GET: APIRoute = () => {
  const ctx = getContext();
  const creative = getCreative();
  const narrative: AgentNarrative[] = creative.entities.map((e) => ({
    id: e.id, name: e.name, kind: e.kind, summary: e.summary.slice(0, 600),
    side: e.source_side, canon_status: e.canon_status,
    source: {
      repository: e.commit_sha === ctx.production.commit_sha ? 'Reltroner/reltroner-studio' : 'Reltroner/reltroner-studio-remodeling',
      commit_sha: e.commit_sha,
      path: e.source_path,
      line: e.evidence_line,
    },
  }));
  const index: AgentIndex = {
    schema_version: 'reltroner-agent-index.v1',
    production_sha: ctx.production.commit_sha,
    composition: getComposition(),
    facts: currentObservations()
      .filter((o) => (o.status === 'CANON_OBSERVED' || o.status === 'CANON_DERIVED') && o.value !== null)
      .map((o) => ({
        entity: o.entity_name, indicator: o.indicator_id, label: indicatorLabel(o.indicator_id), value: o.value!,
        unit: o.unit, status: o.status,
        source: { repository: o.source.repository, commit_sha: o.source.commit_sha, path: o.source.path, pointer: o.source.pointer },
      })),
    narrative,
    routes: ROUTES.map((r) => ({ title: r.title, href: r.path, summary: r.summary })),
  };
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
