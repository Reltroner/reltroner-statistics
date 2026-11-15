import type { APIRoute, GetStaticPaths } from 'astro';
import { chartIds, getAnalytics, getChartSvg } from '../../../lib/data.ts';

/** Every generated figure: the analytics charts plus the light and dark composition figures. */
export const getStaticPaths: GetStaticPaths = () => {
  const ids = [...(getAnalytics()?.charts.map((c) => c.id) ?? []), ...chartIds(['species-', 'spatial-'])];
  return [...new Set(ids)].filter((id) => getChartSvg(id) !== null).map((id) => ({ params: { id } }));
};

export const GET: APIRoute = ({ params }) => {
  const svg = getChartSvg(String(params.id));
  if (!svg) return new Response('Not found', { status: 404 });
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
};
