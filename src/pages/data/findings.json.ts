import type { APIRoute } from 'astro';
import { getAudit } from '../../lib/data.ts';
import { reportContext } from '../../lib/report-context.ts';

/** Public, validated finding evidence for the drift explorer and the browser Report Center. */
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ schema_version: 'reltroner-statistics-findings.v1', context: reportContext(), findings: getAudit().findings }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
