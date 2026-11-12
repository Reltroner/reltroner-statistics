import type { APIRoute } from 'astro';
import { getCreative } from '../../lib/data.ts';

/** Public, validated Creative Intelligence & Narrative Systems artifact (never contains private session drafts). */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(getCreative()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

