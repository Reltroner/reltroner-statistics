import type { APIRoute } from 'astro';
import { llmsTxt } from '../api/discovery.ts';
import { coverage } from '../lib/ai-coverage.ts';

/** Human-readable AI discovery. Reading it is browsing; it does not connect or run any tool. */
export const GET: APIRoute = () => new Response(llmsTxt(coverage()), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
