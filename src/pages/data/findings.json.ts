import type { APIRoute } from 'astro';
import { buildCreativeReportFindings } from '../../export/creative-reports.ts';
import { getAudit, getCreative, getGraph, getStats } from '../../lib/data.ts';
import { reportContext } from '../../lib/report-context.ts';

/** Public, validated finding evidence for the drift explorer and the browser Unified Report Center. */
export const GET: APIRoute = () => {
  const creative_findings = buildCreativeReportFindings({
    creative: getCreative(),
    stats: getStats(),
    graph: getGraph(),
  });
  return new Response(
    JSON.stringify({
      schema_version: 'reltroner-statistics-findings.v1',
      context: reportContext(),
      findings: getAudit().findings,
      creative_findings,
    }),
    {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    },
  );
};
