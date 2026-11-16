import type { APIRoute } from 'astro';
import { openApi } from '../api/discovery.ts';

/** OpenAPI 3.1 contract of /api/v1, generated from the same schemas the routes validate with. */
export const GET: APIRoute = () => new Response(`${JSON.stringify(openApi(), null, 2)}\n`, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
