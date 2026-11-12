import type { APIRoute } from 'astro';
import { getGraph } from '../../lib/data.ts';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(getGraph()), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
