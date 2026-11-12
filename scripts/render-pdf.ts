#!/usr/bin/env node
/**
 * Print PDFs from the HTML report renderer with headless Chromium: one per finding (including
 * Creative Intelligence & Statistical Summary report items) plus the consolidated report of all
 * drift findings. There is no separate PDF template; the bytes printed are exactly renderHtml(document).
 * Output: dist/reports/pdf/*.pdf and index.json with SHA-256s.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AuditSchema, CreativeArtifactSchema, GraphSchema, StatisticsDatasetSchema } from '../src/contracts/schemas.ts';
import type { CreativeArtifact } from '../src/domain/creative.ts';
import type { Audit } from '../src/domain/finding.ts';
import type { KnowledgeGraph } from '../src/domain/graph.ts';
import type { StatisticsDataset } from '../src/domain/observation.ts';
import { buildCreativeReportFindings } from '../src/export/creative-reports.ts';
import { buildReportDocument, type ReportContext } from '../src/export/model.ts';
import { renderHtml, htmlEscape } from '../src/export/render-html.ts';
import { launchChromium } from './lib/browser.ts';
import { ROOT } from './lib/context.ts';

const audit = AuditSchema.parse(JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', 'audit.json'), 'utf8'))) as unknown as Audit;
const creativePath = path.join(ROOT, 'artifacts', 'creative.json');
const creative = fs.existsSync(creativePath)
  ? (CreativeArtifactSchema.parse(JSON.parse(fs.readFileSync(creativePath, 'utf8'))) as unknown as CreativeArtifact)
  : null;
const statsPath = path.join(ROOT, 'artifacts', 'observations.json');
const stats = fs.existsSync(statsPath)
  ? (StatisticsDatasetSchema.parse(JSON.parse(fs.readFileSync(statsPath, 'utf8'))) as unknown as StatisticsDataset)
  : undefined;
const graphPath = path.join(ROOT, 'artifacts', 'graph.json');
const graph = fs.existsSync(graphPath)
  ? (GraphSchema.parse(JSON.parse(fs.readFileSync(graphPath, 'utf8'))) as unknown as KnowledgeGraph)
  : undefined;

const outDir = path.join(ROOT, 'dist', 'reports', 'pdf');
const cacheDir = path.join(ROOT, '.cache', 'pdf');
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('Run the Astro build before rendering PDFs');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });
const only = process.argv.includes('--sample') ? 3 : Infinity;

const context: ReportContext = {
  generated_at: audit.generated_at, rules_version: audit.rules_version, semantic_digest: audit.semantic_digest,
  production: { repository: audit.sources.production.repository, commit_sha: audit.sources.production.commit_sha, tree_sha: audit.sources.production.tree_sha },
  remodeling: { repository: audit.sources.remodeling.repository, commit_sha: audit.sources.remodeling.commit_sha, tree_sha: audit.sources.remodeling.tree_sha },
  deployment: { status: audit.deployment.status, deployed_sha: audit.deployment.deployed_sha, summary: audit.deployment.summary },
};

const footer = (label: string) => `<div style="width:100%;font:7.5px Segoe UI,Arial,sans-serif;color:#56677f;padding:0 14mm;display:flex;justify-content:space-between">
<span>Reltroner Statistics · ${htmlEscape(label)} · production ${context.production.commit_sha.slice(0, 12)} · remodeling ${context.remodeling.commit_sha.slice(0, 12)} · ${htmlEscape(context.deployment.status)}</span>
<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

const creativeFindings = creative ? buildCreativeReportFindings({ creative, stats, graph }) : [];
const allIndividualFindings = [...audit.findings.slice(0, only), ...(only === Infinity ? creativeFindings : [])];

const jobs: Array<{ key: string; file: string; html: string; label: string }> = allIndividualFindings.map((f) => ({
  key: f.id, file: `${f.id}.pdf`, label: f.id, html: renderHtml(buildReportDocument(context, [f], 'single')),
}));
jobs.push({ key: 'ALL', file: 'all-findings.pdf', label: `all ${audit.findings.length} findings`, html: renderHtml(buildReportDocument(context, audit.findings, 'consolidated')) });

const { browser, engine } = await launchChromium();
const engineFile = path.join(cacheDir, 'engine.txt');
const cachedEngine = fs.existsSync(engineFile) ? fs.readFileSync(engineFile, 'utf8').trim() : null;
const allowCache = cachedEngine === engine && !process.argv.includes('--no-cache');

const started = Date.now();
let cacheHits = 0;
let renderedCount = 0;
const files: Record<string, { path: string; bytes: number; sha256: string; html_sha256: string }> = {};
try {
  const ctx = await browser.newContext({ javaScriptEnabled: false, offline: true });
  let next = 0;
  const concurrency = Math.max(1, Math.min(Number(process.env.PDF_CONCURRENCY || 4), 8));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    const page = await ctx.newPage();
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const htmlSha = createHash('sha256').update(job.html).digest('hex');
      const cachePath = path.join(cacheDir, `${htmlSha}.pdf`);
      let pdf: Buffer;
      if (allowCache && fs.existsSync(cachePath)) {
        pdf = fs.readFileSync(cachePath);
        cacheHits++;
      } else {
        await page.setContent(job.html, { waitUntil: 'load' });
        pdf = Buffer.from(await page.pdf({
          format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true, outline: job.key === 'ALL',
          displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer(job.label),
          margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
        }));
        fs.writeFileSync(cachePath, pdf);
        renderedCount++;
      }
      fs.writeFileSync(path.join(outDir, job.file), pdf);
      files[job.key] = {
        path: `/reports/pdf/${job.file}`, bytes: pdf.byteLength,
        sha256: createHash('sha256').update(pdf).digest('hex'), html_sha256: htmlSha,
      };
    }
    await page.close();
  }));
  fs.writeFileSync(engineFile, engine);
} finally {
  await browser.close();
}
const ordered = Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
fs.writeFileSync(path.join(outDir, 'index.json'), `${JSON.stringify({
  schema_version: 'reltroner-statistics-pdf-index.v1',
  source: 'Printed by headless Chromium from renderHtml(); html_sha256 identifies the exact HTML each PDF was printed from.',
  engine, semantic_digest: context.semantic_digest, rules_version: context.rules_version, files: ordered,
}, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: 'PDF_RENDERED', engine, count: jobs.length, rendered: renderedCount, cached: cacheHits, seconds: Math.round((Date.now() - started) / 1000) })}\n`);
