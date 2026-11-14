import type { APIRoute } from 'astro';
import { getComposition } from '../../lib/data.ts';

/** Public, contract-validated composition: Remodeling (not production), pinned source only. */
export const GET: APIRoute = () => new Response(JSON.stringify(getComposition()), {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
