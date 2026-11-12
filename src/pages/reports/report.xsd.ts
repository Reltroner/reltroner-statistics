import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

export const GET: APIRoute = () =>
  new Response(fs.readFileSync(path.join(process.cwd(), 'analytics', 'schemas', 'report.xsd'), 'utf8'), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
