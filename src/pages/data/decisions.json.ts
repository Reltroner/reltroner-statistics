import type { APIRoute } from 'astro';
import { getDecisions } from '../../lib/data.ts';

/** Public, validated Decision Intelligence artifact (never contains private local review notes). */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(getDecisions()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

