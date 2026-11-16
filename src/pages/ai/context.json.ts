import type { APIRoute } from 'astro';
import { aiContext } from '../../api/discovery.ts';
import { coverage } from '../../lib/ai-coverage.ts';

/** Short public capability overview for AI clients, with real example calls. */
export const GET: APIRoute = () => new Response(`${JSON.stringify(aiContext(coverage()), null, 2)}\n`, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
