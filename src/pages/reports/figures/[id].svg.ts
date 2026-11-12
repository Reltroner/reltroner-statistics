import type { APIRoute, GetStaticPaths } from 'astro';
import { getAnalytics, getChartSvg } from '../../../lib/data.ts';

export const getStaticPaths: GetStaticPaths = () => (getAnalytics()?.charts ?? []).map((c) => ({ params: { id: c.id } }));

export const GET: APIRoute = ({ params }) => {
  const svg = getChartSvg(String(params.id));
  if (!svg) return new Response('Not found', { status: 404 });
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
