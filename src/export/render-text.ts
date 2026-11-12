/** JSON, CSV, TXT, Markdown and XML renderers for the canonical report document. Isomorphic. */
import type { Finding } from '../domain/finding.ts';
import { displayValue, pinnedUrl, typeLabel, type ReportDocument } from './model.ts';

export function renderJson(doc: ReportDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ---------------------------------------------------------------- CSV (RFC 4180 + formula guard)
export const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/** Untrusted text that a spreadsheet could evaluate gets a leading apostrophe; numbers stay numeric. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  if (FORMULA_TRIGGERS.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export const CSV_COLUMNS = [
  'id', 'level', 'classification', 'change_type', 'review_status', 'priority', 'title', 'file_path', 'locator', 'entity', 'field', 'unit',
  'production_present', 'production_type', 'production_value', 'remodeling_present', 'remodeling_type', 'remodeling_value',
  'delta_absolute', 'delta_relative', 'production_canon_status', 'content_nature', 'rule', 'recommendation',
  'production_repository', 'production_commit', 'production_blob', 'production_line', 'remodeling_repository', 'remodeling_commit', 'remodeling_blob', 'remodeling_line',
] as const;

function sideRaw(f: Finding, side: 'production' | 'remodeling'): unknown {
  const v = f[side];
  if (!v.present) return null;
  return typeof v.value === 'number' || typeof v.value === 'boolean' ? v.value : displayValue(v);
}

export function findingRecord(f: Finding): Record<(typeof CSV_COLUMNS)[number], unknown> {
  return {
    id: f.id, level: f.level, classification: f.classification, change_type: f.change_type, review_status: f.review_status, priority: f.priority,
    title: f.title, file_path: f.file_path, locator: f.locator, entity: f.entity?.name ?? null, field: f.field, unit: f.unit,
    production_present: f.production.present, production_type: typeLabel(f.production), production_value: sideRaw(f, 'production'),
    remodeling_present: f.remodeling.present, remodeling_type: typeLabel(f.remodeling), remodeling_value: sideRaw(f, 'remodeling'),
    delta_absolute: f.numeric_delta?.absolute ?? null, delta_relative: f.numeric_delta?.relative ?? null,
    production_canon_status: f.production_canon_status, content_nature: f.content_nature, rule: f.rule, recommendation: f.recommendation,
    production_repository: f.provenance.production?.repository ?? null, production_commit: f.provenance.production?.commit_sha ?? null,
    production_blob: f.provenance.production?.blob_sha ?? null, production_line: f.provenance.production?.line ?? null,
    remodeling_repository: f.provenance.remodeling?.repository ?? null, remodeling_commit: f.provenance.remodeling?.commit_sha ?? null,
    remodeling_blob: f.provenance.remodeling?.blob_sha ?? null, remodeling_line: f.provenance.remodeling?.line ?? null,
  };
}

export function renderCsv(doc: ReportDocument): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const f of doc.findings) {
    const r = findingRecord(f);
    lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------- TXT
function wrap(text: string, width = 96, indent = '    '): string {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (line && (line + ' ' + word).length > width) { out.push(indent + line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    out.push(indent + line);
  }
  return out.join('\n');
}

export function renderTxt(doc: ReportDocument): string {
  const c = doc.context;
  const rule = '='.repeat(100);
  const parts = [
    rule, `RELTRONER STATISTICS — ${doc.title.toUpperCase()}`, rule,
    `Generated:            ${c.generated_at}`,
    `Rules version:        ${c.rules_version}`,
    `Semantic digest:      ${c.semantic_digest}`,
    `Production main:      ${c.production.repository}@${c.production.commit_sha} (tree ${c.production.tree_sha})`,
    `Remodeling main:      ${c.remodeling.repository}@${c.remodeling.commit_sha} (tree ${c.remodeling.tree_sha})`,
    `Deployment:           ${c.deployment.status}${c.deployment.deployed_sha ? ` ${c.deployment.deployed_sha}` : ''}`,
    '', 'SOURCE AUTHORITY', wrap(doc.authority_notice), '',
    `SUMMARY: ${doc.summary.findings} finding(s)`,
    ...Object.entries(doc.summary.by_classification).map(([k, v]) => `    ${k.padEnd(28)} ${v}`),
    ...Object.entries(doc.summary.by_priority).map(([k, v]) => `    priority ${k.padEnd(19)} ${v}`),
    '',
  ];
  for (const f of doc.findings) {
    parts.push('-'.repeat(100), `${f.id}  [${f.priority}] ${f.classification} / ${f.change_type} / ${f.review_status}`, wrap(f.title, 96, '  '), '');
    parts.push(`  File:        ${f.file_path}`, `  Locator:     ${f.locator || '(whole file)'}`);
    if (f.entity) parts.push(`  Entity:      ${f.entity.name} (${f.entity.kind})`);
    if (f.unit) parts.push(`  Unit:        ${f.unit} (inferred from field name)`);
    parts.push(`  Production:  ${displayValue(f.production)}  [${typeLabel(f.production)}]`, `  Remodeling:  ${displayValue(f.remodeling)}  [${typeLabel(f.remodeling)}]`);
    if (f.numeric_delta) parts.push(`  Delta:       ${f.numeric_delta.absolute}${f.numeric_delta.relative !== null ? ` (${(f.numeric_delta.relative * 100).toFixed(2)}%)` : ''}`);
    if (f.production_canon_status) parts.push(`  Canon:       ${f.production_canon_status}`);
    if (f.diff) parts.push(`  Line diff:   +${f.diff.added_lines} / -${f.diff.removed_lines}${f.diff.truncated ? ' (excerpt truncated)' : ''}`, ...f.diff.excerpt.map((l) => `      ${l}`));
    parts.push(`  Rule:        ${f.rule}`, '  Recommendation:', wrap(f.recommendation, 92, '    '));
    for (const side of ['production', 'remodeling'] as const) {
      const p = f.provenance[side];
      if (p) parts.push(`  ${side === 'production' ? 'Production ' : 'Remodeling '} source: ${pinnedUrl(p.repository, p.commit_sha, p.path, p.line)} (blob ${p.blob_sha})`);
    }
    parts.push('');
  }
  parts.push(rule, 'End of report. Findings are review candidates; nothing here changes canon.', '');
  return parts.join('\n');
}

// ---------------------------------------------------------------- Markdown
function mdEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').replace(/([*_`[\]<>#])/g, '\\$1');
}
function mdCode(s: string): string {
  const flat = s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
  const ticks = (flat.match(/`+/g) ?? []).reduce((m, t) => Math.max(m, t.length), 0) + 1;
  const fence = '`'.repeat(ticks);
  return `${fence}${ticks > 1 ? ' ' : ''}${flat}${ticks > 1 ? ' ' : ''}${fence}`;
}

export function renderMarkdown(doc: ReportDocument): string {
  const c = doc.context;
  const out = [
    `# ${mdEscape(doc.title)}`, '',
    '| Source | Identity |', '| --- | --- |',
    `| Production main | ${mdCode(`${c.production.repository}@${c.production.commit_sha}`)} |`,
    `| Remodeling main | ${mdCode(`${c.remodeling.repository}@${c.remodeling.commit_sha}`)} |`,
    `| Deployment | ${mdCode(c.deployment.status)} |`,
    `| Rules version | ${mdCode(c.rules_version)} |`,
    `| Semantic digest | ${mdCode(c.semantic_digest)} |`,
    `| Generated | ${mdCode(c.generated_at)} |`, '',
    `> ${mdEscape(doc.authority_notice)}`, '',
    `## Summary — ${doc.summary.findings} finding(s)`, '',
    '| Classification | Count |', '| --- | ---: |',
    ...Object.entries(doc.summary.by_classification).map(([k, v]) => `| ${k} | ${v} |`), '',
  ];
  for (const f of doc.findings) {
    out.push(`## ${f.id} — ${mdEscape(f.title)}`, '',
      `**${f.priority}** · \`${f.classification}\` · \`${f.change_type}\` · \`${f.review_status}\``, '',
      '| Attribute | Production | Remodeling |', '| --- | --- | --- |',
      `| Value | ${mdCode(displayValue(f.production))} | ${mdCode(displayValue(f.remodeling))} |`,
      `| Type | ${typeLabel(f.production)} | ${typeLabel(f.remodeling)} |`,
      `| Source | ${f.provenance.production ? `[${f.provenance.production.commit_sha.slice(0, 12)}](${pinnedUrl(f.provenance.production.repository, f.provenance.production.commit_sha, f.file_path, f.provenance.production.line)})` : '—'} | ${f.provenance.remodeling ? `[${f.provenance.remodeling.commit_sha.slice(0, 12)}](${pinnedUrl(f.provenance.remodeling.repository, f.provenance.remodeling.commit_sha, f.file_path, f.provenance.remodeling.line)})` : '—'} |`,
      '',
      `- **File:** ${mdCode(f.file_path)}`,
      `- **Locator:** ${f.locator ? mdCode(f.locator) : '(whole file)'}`,
      ...(f.entity ? [`- **Entity:** ${mdEscape(f.entity.name)} (${f.entity.kind})`] : []),
      ...(f.unit ? [`- **Unit:** ${mdEscape(f.unit)} (inferred from field name)`] : []),
      ...(f.numeric_delta ? [`- **Delta:** ${f.numeric_delta.absolute}${f.numeric_delta.relative !== null ? ` (${(f.numeric_delta.relative * 100).toFixed(2)}%)` : ''}`] : []),
      ...(f.production_canon_status ? [`- **Production canon status:** ${mdCode(f.production_canon_status)}`] : []),
      `- **Rule:** ${mdEscape(f.rule)}`,
      `- **Recommendation:** ${mdEscape(f.recommendation)}`, '');
    if (f.diff && f.diff.excerpt.length) {
      const body = f.diff.excerpt.join('\n');
      const fence = '`'.repeat(Math.max(3, ...(body.match(/`+/g) ?? []).map((t) => t.length + 1)));
      out.push(`${fence}diff`, body, fence, '');
    }
  }
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------- XML (schema: analytics/schemas/report.xsd)
export const XML_NAMESPACE = 'https://reltroner-statistics.invalid/schema/report/v1';
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export function xmlEscape(s: string): string {
  return s.replace(XML_INVALID, '�').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xmlSide(tag: string, f: Finding, side: 'production' | 'remodeling'): string {
  const v = f[side];
  const p = f.provenance[side];
  const attrs = `present="${v.present}" type="${xmlEscape(typeLabel(v))}"`;
  const value = v.present ? `<value${v.value === null ? ' null="true"' : ''}>${v.value === null ? '' : xmlEscape(typeof v.value === 'string' ? v.value : JSON.stringify(v.value))}</value>` : '';
  const prov = p ? `<source repository="${xmlEscape(p.repository)}" commit="${p.commit_sha}" path="${xmlEscape(p.path)}"${p.blob_sha ? ` blob="${p.blob_sha}"` : ''}${p.line ? ` line="${p.line}"` : ''}/>` : '';
  return `<${tag} ${attrs}>${value}${prov}</${tag}>`;
}

export function renderXml(doc: ReportDocument): string {
  const c = doc.context;
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<report xmlns="${XML_NAMESPACE}" schemaVersion="${doc.schema_version}" layout="${doc.layout}">`,
    `  <title>${xmlEscape(doc.title)}</title>`,
    `  <context generatedAt="${xmlEscape(c.generated_at)}" rulesVersion="${xmlEscape(c.rules_version)}" semanticDigest="${c.semantic_digest}">`,
    `    <production repository="${xmlEscape(c.production.repository)}" commit="${c.production.commit_sha}" tree="${c.production.tree_sha}"/>`,
    `    <remodeling repository="${xmlEscape(c.remodeling.repository)}" commit="${c.remodeling.commit_sha}" tree="${c.remodeling.tree_sha}"/>`,
    `    <deployment status="${xmlEscape(c.deployment.status)}"${c.deployment.deployed_sha ? ` sha="${c.deployment.deployed_sha}"` : ''}>${xmlEscape(c.deployment.summary)}</deployment>`,
    '  </context>',
    `  <authorityNotice>${xmlEscape(doc.authority_notice)}</authorityNotice>`,
    `  <findings count="${doc.findings.length}">`,
  ];
  for (const f of doc.findings) {
    out.push(
      `    <finding id="${f.id}" level="${f.level}" classification="${f.classification}" changeType="${f.change_type}" reviewStatus="${f.review_status}" priority="${f.priority}">`,
      `      <title>${xmlEscape(f.title)}</title>`,
      `      <file path="${xmlEscape(f.file_path)}" kind="${f.file_kind}"/>`,
      `      <locator>${xmlEscape(f.locator)}</locator>`,
      ...(f.entity ? [`      <entity kind="${f.entity.kind}">${xmlEscape(f.entity.name)}</entity>`] : []),
      ...(f.unit ? [`      <unit source="FIELD_NAME_CONVENTION">${xmlEscape(f.unit)}</unit>`] : []),
      `      ${xmlSide('production', f, 'production')}`,
      `      ${xmlSide('remodeling', f, 'remodeling')}`,
      ...(f.numeric_delta ? [`      <delta absolute="${f.numeric_delta.absolute}"${f.numeric_delta.relative !== null ? ` relative="${f.numeric_delta.relative}"` : ''}/>`] : []),
      ...(f.production_canon_status ? [`      <canonStatus>${xmlEscape(f.production_canon_status)}</canonStatus>`] : []),
      ...(f.diff ? [`      <diff added="${f.diff.added_lines}" removed="${f.diff.removed_lines}" truncated="${f.diff.truncated}">${f.diff.excerpt.map((l) => `<line>${xmlEscape(l)}</line>`).join('')}</diff>`] : []),
      `      <rule>${xmlEscape(f.rule)}</rule>`,
      `      <recommendation>${xmlEscape(f.recommendation)}</recommendation>`,
      '    </finding>',
    );
  }
  out.push('  </findings>', '</report>', '');
  return out.join('\n');
}
