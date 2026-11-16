import type { APIRoute } from 'astro';
import { aiManifest } from '../../api/discovery.ts';
import { coverage } from '../../lib/ai-coverage.ts';

/** AI discovery manifest: entry points, tools, policies and coverage of this build. Also read by /api/v1/manifest. */
export const GET: APIRoute = () => new Response(`${JSON.stringify(aiManifest(coverage()), null, 2)}\n`, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
