import type { APIRoute, GetStaticPaths } from 'astro';
import { getAudit } from '../../../lib/data.ts';
import { reportContext } from '../../../lib/report-context.ts';
import { buildReportDocument } from '../../../export/model.ts';
import { MIME, renderFormat } from '../../../export/bundle.ts';
import type { ExportFormat } from '../../../export/plan.ts';
import { ALL_REPORT_STEM } from '../../../lib/site.ts';

const FORMATS = ['json', 'csv', 'xlsx', 'txt', 'md', 'html', 'xml'] as const;

export const getStaticPaths: GetStaticPaths = () => FORMATS.map((ext) => ({ params: { file: `${ALL_REPORT_STEM}.${ext}` }, props: { ext } }));

/** Consolidated report of every finding, rendered at build time by the same renderers the browser uses. */
export const GET: APIRoute = ({ props }) => {
  const ext = (props as { ext: Exclude<ExportFormat, 'pdf'> }).ext;
  const doc = buildReportDocument(reportContext(), getAudit().findings, 'consolidated');
  return new Response(renderFormat(doc, ext) as unknown as BodyInit, { headers: { 'Content-Type': MIME[ext] } });
};
