/**
 * Self-contained, branded HTML report (embedded CSS, no external requests). This is the single
 * visual template: the PDF is printed from exactly this HTML by headless Chromium.
 */
import type { Finding } from '../domain/finding.ts';
import { displayValue, pinnedUrl, typeLabel, type ReportDocument } from './model.ts';

export function htmlEscape(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const CSS = `
@page { size: A4; margin: 16mm 14mm 18mm; }
:root { --ink:#0e1a30; --ink2:#3b4b66; --ink3:#56677f; --line:#d6e0ee; --soft:#f4f7fb; --prod:#2a78d6; --draft:#c4511f; --accent:#1559e0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: var(--ink); background: #fff; font: 10.5pt/1.55 "Segoe UI", Inter, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif; }
main { max-width: 820px; margin: 0 auto; padding: 28px 24px 40px; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--ink); }
.brand b { letter-spacing: .16em; font-size: 9.5pt; }
.brand span { letter-spacing: .26em; font-size: 7.5pt; color: #0e7f95; font-weight: 700; }
h1 { font-size: 20pt; line-height: 1.2; margin: 18px 0 6px; letter-spacing: -.02em; }
h2 { font-size: 13pt; margin: 22px 0 8px; }
h3 { font-size: 11.5pt; margin: 0; }
.muted { color: var(--ink3); }
.meta { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 9pt; }
.meta th { text-align: left; color: var(--ink3); font-weight: 400; padding: 4px 10px 4px 0; white-space: nowrap; vertical-align: top; width: 1%; }
.meta td { padding: 4px 0; }
code, .mono { font-family: "Cascadia Code", Consolas, "SFMono-Regular", monospace; font-size: 8.6pt; overflow-wrap: anywhere; }
.notice { border: 1px solid var(--line); border-left: 4px solid var(--accent); background: var(--soft); padding: 10px 12px; border-radius: 6px; font-size: 9.2pt; color: var(--ink2); }
.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 4px; }
.summary div { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; }
.summary b { display: block; font-size: 14pt; }
.summary span { font-size: 8pt; color: var(--ink3); }
.finding { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin: 14px 0; break-inside: avoid; page-break-inside: avoid; }
.fhead { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; justify-content: space-between; }
.fid { font-family: "Cascadia Code", Consolas, monospace; font-weight: 400; font-size: 9.5pt; color: var(--accent); }
.badges { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 10px; }
.badge { border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; font-size: 7.6pt; font-weight: 700; letter-spacing: .03em; color: var(--ink2); }
.badge.p1 { border-color: #b91c1c; color: #b91c1c; }
.cmp { width: 100%; border-collapse: collapse; font-size: 9.2pt; margin: 6px 0 10px; table-layout: fixed; }
.cmp th, .cmp td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.cmp thead th { font-size: 8pt; color: var(--ink2); background: var(--soft); }
.cmp thead th.prod { border-top: 3px solid var(--prod); }
.cmp thead th.draft { border-top: 3px solid var(--draft); }
.cmp td.num { font-variant-numeric: tabular-nums; }
.cmp th.k { width: 22%; font-weight: 400; color: var(--ink3); background: #fff; }
dl.kv { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; margin: 6px 0; font-size: 9pt; }
dl.kv dt { color: var(--ink3); }
dl.kv dd { margin: 0; overflow-wrap: anywhere; }
pre.diff { background: var(--soft); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; font-size: 8pt; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; margin: 8px 0; }
pre.diff .add { background: #e6f4ea; display: block; }
pre.diff .del { background: #fdecea; display: block; }
.rec { margin-top: 8px; font-size: 9.3pt; }
a { color: var(--accent); text-decoration: none; }
footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 8pt; color: var(--ink3); }
@media screen and (max-width: 640px) { .summary { grid-template-columns: repeat(2, 1fr); } main { padding: 18px 14px; } }
`;

const LOGO = '<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.5" fill="none" stroke="#1559e0" stroke-width="1.6"/><ellipse cx="16" cy="16" rx="12.5" ry="5" fill="none" stroke="#0e7f95" stroke-width="1.2" transform="rotate(-24 16 16)"/><circle cx="16" cy="16" r="3.2" fill="#1559e0"/><circle cx="26.2" cy="11.4" r="1.9" fill="#0e7f95"/></svg>';

function sideCell(f: Finding, side: 'production' | 'remodeling'): string {
  const v = f[side];
  const cls = typeof v.value === 'number' ? ' class="num"' : '';
  return `<td${cls}>${htmlEscape(displayValue(v))}</td>`;
}

function provenanceRow(f: Finding, side: 'production' | 'remodeling'): string {
  const p = f.provenance[side];
  if (!p) return `<td class="muted">Not present in ${side}</td>`;
  const url = pinnedUrl(p.repository, p.commit_sha, p.path, p.line);
  return `<td><a href="${htmlEscape(url)}"><code>${htmlEscape(p.repository)}@${p.commit_sha.slice(0, 12)}</code></a><br><code>${htmlEscape(p.path)}${p.line ? `:${p.line}` : ''}</code>${p.blob_sha ? `<br><span class="muted">blob <code>${p.blob_sha}</code></span>` : ''}</td>`;
}

function renderFinding(f: Finding): string {
  const delta = f.numeric_delta
    ? `${f.numeric_delta.absolute > 0 ? '+' : ''}${f.numeric_delta.absolute}${f.numeric_delta.relative !== null ? ` (${f.numeric_delta.relative > 0 ? '+' : ''}${(f.numeric_delta.relative * 100).toFixed(2)}%)` : ''}`
    : null;
  const diff = f.diff && f.diff.excerpt.length
    ? `<pre class="diff">${f.diff.excerpt.map((l) => `<span class="${l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}">${htmlEscape(l)}</span>`).join('\n')}</pre>`
    : '';
  return `<section class="finding" id="${f.id}">
  <div class="fhead"><span class="fid">${f.id}</span><span class="muted">${htmlEscape(f.file_path)}</span></div>
  <h3>${htmlEscape(f.title)}</h3>
  <div class="badges"><span class="badge${f.priority === 'P1' ? ' p1' : ''}">${f.priority}</span><span class="badge">${f.classification}</span><span class="badge">${f.change_type}</span><span class="badge">${f.review_status}</span><span class="badge">${f.level}</span></div>
  <table class="cmp">
    <thead><tr><th class="k"></th><th class="prod">Production main (authoritative)</th><th class="draft">Remodeling main (proposal)</th></tr></thead>
    <tbody>
      <tr><th class="k">Value</th>${sideCell(f, 'production')}${sideCell(f, 'remodeling')}</tr>
      <tr><th class="k">Type</th><td>${htmlEscape(typeLabel(f.production))}</td><td>${htmlEscape(typeLabel(f.remodeling))}</td></tr>
      <tr><th class="k">Source</th>${provenanceRow(f, 'production')}${provenanceRow(f, 'remodeling')}</tr>
    </tbody>
  </table>
  <dl class="kv">
    <dt>Locator</dt><dd><code>${htmlEscape(f.locator || '(whole file)')}</code></dd>
    ${f.entity ? `<dt>Entity</dt><dd>${htmlEscape(f.entity.name)} (${htmlEscape(f.entity.kind)})</dd>` : ''}
    ${f.unit ? `<dt>Unit</dt><dd>${htmlEscape(f.unit)} <span class="muted">(inferred from field name)</span></dd>` : ''}
    ${delta ? `<dt>Delta</dt><dd>${htmlEscape(delta)}</dd>` : ''}
    ${f.production_canon_status ? `<dt>Production canon</dt><dd><code>${htmlEscape(f.production_canon_status)}</code></dd>` : ''}
    ${f.content_nature ? `<dt>Change nature</dt><dd>${htmlEscape(f.content_nature)}</dd>` : ''}
    ${f.diff ? `<dt>Line diff</dt><dd>+${f.diff.added_lines} / −${f.diff.removed_lines}${f.diff.truncated ? ' (excerpt truncated)' : ''}</dd>` : ''}
    <dt>Rule</dt><dd>${htmlEscape(f.rule)}</dd>
  </dl>
  ${diff}
  <p class="rec"><b>Recommendation.</b> ${htmlEscape(f.recommendation)}</p>
</section>`;
}

export function renderHtml(doc: ReportDocument): string {
  const c = doc.context;
  const s = doc.summary;
  const count = (k: string) => s.by_classification[k] ?? 0;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Reltroner Statistics ${htmlEscape(c.rules_version)}">
<meta name="reltroner:semantic-digest" content="${c.semantic_digest}">
<title>${htmlEscape(doc.title)} · Reltroner Statistics</title>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="brand">${LOGO}<div><b>RELTRONER</b><br><span>STATISTICS</span></div></div>
<h1>${htmlEscape(doc.title)}</h1>
<p class="muted">Forensic source-drift report · generated ${htmlEscape(c.generated_at)}</p>
<table class="meta">
  <tr><th>Production main</th><td><code>${htmlEscape(c.production.repository)}@${c.production.commit_sha}</code> <span class="muted">tree ${c.production.tree_sha.slice(0, 12)}</span></td></tr>
  <tr><th>Remodeling main</th><td><code>${htmlEscape(c.remodeling.repository)}@${c.remodeling.commit_sha}</code> <span class="muted">tree ${c.remodeling.tree_sha.slice(0, 12)}</span></td></tr>
  <tr><th>Live deployment</th><td><b>${htmlEscape(c.deployment.status)}</b>${c.deployment.deployed_sha ? ` <code>${c.deployment.deployed_sha}</code>` : ''} <span class="muted">— ${htmlEscape(c.deployment.summary)}</span></td></tr>
  <tr><th>Rules version</th><td><code>${htmlEscape(c.rules_version)}</code></td></tr>
  <tr><th>Semantic digest</th><td><code>${c.semantic_digest}</code></td></tr>
</table>
<p class="notice"><b>Source authority.</b> ${htmlEscape(doc.authority_notice)}</p>
<h2>Summary</h2>
<div class="summary">
  <div><b>${s.findings}</b><span>findings in this report</span></div>
  <div><b>${count('VALUE_DRIFT')}</b><span>value drift</span></div>
  <div><b>${count('SCHEMA_DRIFT')}</b><span>schema drift</span></div>
  <div><b>${count('SEMANTIC_REVIEW_CANDIDATE')}</b><span>semantic review candidates</span></div>
</div>
<p class="muted">Priority: ${Object.entries(s.by_priority).map(([k, v]) => `${htmlEscape(k)} ${v}`).join(' · ')} · Review: ${Object.entries(s.by_review_status).map(([k, v]) => `${htmlEscape(k)} ${v}`).join(' · ')}</p>
<h2>${doc.layout === 'single' ? 'Finding' : 'Findings'}</h2>
${doc.findings.map(renderFinding).join('\n')}
<footer>Reltroner Statistics · read-only analysis of pinned Git commits. Findings are review candidates and never change canon. © Raidan — Reltroner Statistics License.</footer>
</main>
</body>
</html>
`;
}
