import type { APIRoute } from 'astro';
import { csvCell } from '../../export/render-text.ts';
import { getComposition } from '../../lib/data.ts';

/** Spatial 3D composition, one row per nation × dimension × category, with the denominator of each row. */
export const GET: APIRoute = () => {
  const data = getComposition();
  const src = data.sources.remodeling;
  const head = ['entity_id', 'entity', 'cohort', 'dimension', 'category_key', 'category_label', 'share_pct', 'denominator', 'denominator_value', 'denominator_unit',
    'derived_value', 'derived_unit', 'status', 'authority', 'source_repository', 'source_commit', 'source_blob', 'source_path', 'source_pointer'];
  const rows: unknown[][] = [];
  if (src) {
    const base = (pointer: string) => ['PROPOSED', data.spatial.authority, src.repository, src.commit_sha, src.blob_sha, src.path, pointer];
    for (const c of data.spatial.countries) {
      const ptr = `${c.pointer}.spatial_3d_canon`;
      if (c.surface_status !== 'ASSIGNED') rows.push([c.id, c.name, c.cohort, 'surface_footprint', null, null, null, 'national terrestrial land area', c.land_area_million_km2, 'million km²', null, null, 'NOT_ASSIGNED', data.spatial.authority, src.repository, src.commit_sha, src.blob_sha, src.path, ptr]);
      for (const r of c.surface) rows.push([c.id, c.name, c.cohort, 'surface_footprint', r.key, r.label, r.pct, 'national terrestrial land area', c.land_area_million_km2, 'million km²', r.area_million_km2, 'million km²', ...base(`${ptr}.land_surface_pct.${r.key}`)]);
      if (c.habitat_status !== 'ASSIGNED') rows.push([c.id, c.name, c.cohort, 'principal_home_habitat', null, null, null, 'unique usual residents', c.population_billion, 'billion residents', null, null, 'NOT_ASSIGNED', data.spatial.authority, src.repository, src.commit_sha, src.blob_sha, src.path, ptr]);
      for (const r of c.habitats) rows.push([c.id, c.name, c.cohort, 'principal_home_habitat', r.key, r.label, r.pct, 'unique usual residents', c.population_billion, 'billion residents', r.absolute_billion, 'billion residents', ...base(`${ptr}.principal_habitat_pct.${r.key}`)]);
      for (const g of c.geometry) rows.push([c.id, c.name, c.cohort, 'geometry', g.key, g.label, null, null, null, null, null, null, g.status, data.spatial.authority, src.repository, src.commit_sha, src.blob_sha, src.path, `${ptr}.${g.key}`]);
    }
  }
  const body = [head.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
  return new Response(`﻿${body}\r\n`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="reltroner-spatial-3d${src ? `_${src.commit_sha.slice(0, 12)}` : ''}.csv"` },
  });
};
