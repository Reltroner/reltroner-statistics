import type { APIRoute } from 'astro';
import { getComposition } from '../../lib/data.ts';

/** The contract-validated composition artifact: ancestry from production main, Spatial 3D from remodeling main. */
export const GET: APIRoute = () => new Response(JSON.stringify(getComposition()), {
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
