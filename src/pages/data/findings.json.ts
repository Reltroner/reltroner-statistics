import type { APIRoute } from 'astro';
import { buildCreativeReportFindings } from '../../export/creative-reports.ts';
import { buildDecisionReportFindings } from '../../export/decision-reports.ts';
import { getAnalytics, getAudit, getCreative, getDecisions, getGraph, getStats } from '../../lib/data.ts';
import { reportContext } from '../../lib/report-context.ts';

/** Public, validated finding evidence for the drift explorer and the browser Unified Report Center. */
export const GET: APIRoute = () => {
  const creative_findings = buildCreativeReportFindings({
    creative: getCreative(),
    stats: getStats(),
    graph: getGraph(),
  });
  const decision_findings = buildDecisionReportFindings({
    decisions: getDecisions(),
    analytics: getAnalytics(),
  });
  return new Response(
    JSON.stringify({
      schema_version: 'reltroner-statistics-findings.v1',
      context: reportContext(),
      findings: getAudit().findings,
      creative_findings,
      decision_findings,
    }),
    {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    },
  );
};
