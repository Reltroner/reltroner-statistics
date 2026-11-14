import type { APIRoute, GetStaticPaths } from 'astro';
import { getAnalytics, getChartSvg, getComposition } from '../../../lib/data.ts';

const globals = [
  'species-planet', 'species-stacked-percent', 'species-stacked-billions',
  'spatial-surface-percent', 'spatial-surface-area',
  'spatial-habitat-percent', 'spatial-habitat-residents',
];

export const getStaticPaths: GetStaticPaths = () => {
  const data = getComposition();
  const country = data.countries.flatMap((c) => {
    const slug = c.id.split(':')[1]!;
    return [
      ...(c.ancestry_status === 'ASSIGNED' ? ['species-country-' + slug] : []),
      ...(c.surface_status === 'ASSIGNED' ? ['spatial-surface-' + slug] : []),
      ...(c.habitat_status === 'ASSIGNED' ? ['spatial-habitat-' + slug] : []),
    ];
  });
  const ids = [...(getAnalytics()?.charts.map((c) => c.id) ?? []), ...globals, ...country];
  return [...new Set(ids)].filter((id) => getChartSvg(id) !== null).map((id) => ({ params: { id } }));
};

export const GET: APIRoute = ({ params }) => {
  const svg = getChartSvg(String(params.id));
  if (!svg) return new Response('Not found', { status: 404 });
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
