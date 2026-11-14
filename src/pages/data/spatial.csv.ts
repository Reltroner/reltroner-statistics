import type { APIRoute } from 'astro';
import { getComposition } from '../../lib/data.ts';

const q = (v: string | number) => '"' + String(v).replace(/"/g, '""') + '"';
export const GET: APIRoute = () => {
  const d = getComposition();
  const lines: Array<Array<string | number>> = [
    ['country', 'dimension', 'category', 'percentage', 'absolute', 'absolute_unit', 'denominator', 'source_commit', 'source_role'],
  ];
  for (const c of d.countries) {
    for (const r of c.surface) lines.push([c.name, 'TERRESTRIAL_FOOTPRINT', r.label, r.pct, r.area_million_km2 ?? '', 'million_km2', 'national_terrestrial_land_area', d.source.commit_sha, 'REMODELING_MAIN']);
    for (const r of c.habitats) lines.push([c.name, 'PRINCIPAL_HOME_HABITAT', r.label, r.pct, r.absolute_billion ?? '', 'billion_unique_residents', 'national_unique_residents', d.source.commit_sha, 'REMODELING_MAIN']);
  }
  return new Response(lines.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="reltroner-spatial-year0.csv"' },
  });
};
