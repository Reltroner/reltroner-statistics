import type { APIRoute } from 'astro';
import { csvCell } from '../../export/render-text.ts';
import { getComposition } from '../../lib/data.ts';

/** Primary ancestry, one row per entity × category. Units are in the column names; unassigned rows stay unassigned. */
export const GET: APIRoute = () => {
  const data = getComposition();
  const src = data.sources.production;
  const head = ['entity_id', 'entity', 'entity_kind', 'cohort', 'population_billion', 'ancestry_key', 'ancestry_label', 'share_pct', 'residents_billion',
    'share_status', 'residents_status', 'residents_formula', 'source_role', 'source_repository', 'source_commit', 'source_blob', 'source_path', 'source_pointer'];
  const rows: unknown[][] = [];
  const base = (pointer: string) => ['PRODUCTION_MAIN', src.repository, src.commit_sha, src.blob_sha, src.path, pointer];
  for (const r of data.ancestry.planet.rows) {
    rows.push(['planet:asthortera', 'Asthortera (representative benchmark)', 'planet', 'PLANET', data.ancestry.planet.population_billion, r.key, r.label, r.pct, r.absolute_billion,
      'CANON_OBSERVED', 'CANON_DERIVED', `share × planetary population; ${data.ancestry.planet.headcount_source}`, ...base(data.ancestry.planet.pointer)]);
  }
  for (const c of data.ancestry.countries) {
    if (c.status !== 'ASSIGNED') {
      rows.push([c.id, c.name, 'country', c.cohort, c.population_billion, null, null, null, null, 'NOT_ASSIGNED', 'NOT_ASSIGNED', null, ...base(`${c.pointer}.ancestry_primary_pct`)]);
      continue;
    }
    for (const r of c.rows) rows.push([c.id, c.name, 'country', c.cohort, c.population_billion, r.key, r.label, r.pct, r.absolute_billion, 'CANON_OBSERVED', 'CANON_DERIVED', data.ancestry.absolute_formula, ...base(`${c.pointer}.ancestry_primary_pct`)]);
  }
  rows.push(['aggregate:deferred-18', `${data.ancestry.coverage.residual_states} deferred states (one aggregate)`, 'aggregate_residual', 'DEFERRED_18_AGGREGATE', data.ancestry.coverage.residual_population_billion,
    null, null, null, null, 'NOT_ASSIGNED', 'NOT_ASSIGNED', null, ...base('aggregate_remaining_18')]);
  const body = [head.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
  return new Response(`﻿${body}\r\n`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="reltroner-primary-ancestry_${src.commit_sha.slice(0, 12)}.csv"` },
  });
};
