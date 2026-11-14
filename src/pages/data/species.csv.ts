import type { APIRoute } from 'astro';
import { getComposition } from '../../lib/data.ts';

const quote = (v: string | number) => '"' + String(v).replace(/"/g, '""') + '"';
export const GET: APIRoute = () => {
  const data = getComposition();
  const lines: Array<Array<string | number>> = [
    ['country', 'population_billion', 'primary_ancestry', 'share_pct', 'derived_residents_billion', 'value_status', 'source_commit', 'source_role'],
  ];
  for (const c of data.countries) {
    if (!c.ancestry.length) lines.push([c.name, c.population_billion, '', '', '', 'NOT_ASSIGNED', data.source.commit_sha, 'REMODELING_MAIN']);
    else for (const r of c.ancestry) lines.push([c.name, c.population_billion, r.label, r.pct, r.absolute_billion!, 'CREATOR_RATIFIED_IN_REMODELING', data.source.commit_sha, 'REMODELING_MAIN']);
  }
  return new Response(lines.map((l) => l.map(quote).join(',')).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="reltroner-ancestry-year0.csv"' },
  });
};
