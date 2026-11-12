/**
 * Minimal, dependency-light SpreadsheetML writer (fflate for the container). Numbers are typed
 * numeric cells, booleans are boolean cells, text is inline text. No <f> formula element is ever
 * written; text that a spreadsheet could interpret as a formula additionally carries quotePrefix.
 */
import { strToU8, zipSync } from 'fflate';
import type { ReportDocument } from './model.ts';
import { CSV_COLUMNS, findingRecord, FORMULA_TRIGGERS } from './render-text.ts';

type Cell = string | number | boolean | null | undefined;
interface Sheet { name: string; rows: Cell[][]; widths: number[]; header: boolean; filter: boolean }

// eslint-disable-next-line no-control-regex
const INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const MAX_CELL = 32_767;
const esc = (s: string) => s.replace(INVALID, '�').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function columnName(i: number): string {
  let n = i + 1, s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function cellXml(v: Cell, ref: string, header: boolean): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${header ? ' s="1"' : ''}><v>${v}</v></c>` : '';
  if (typeof v === 'boolean') return `<c r="${ref}" t="b"${header ? ' s="1"' : ''}><v>${v ? 1 : 0}</v></c>`;
  let text = v.length > MAX_CELL ? `${v.slice(0, MAX_CELL - 12)} [truncated]` : v;
  const style = header ? 1 : FORMULA_TRIGGERS.test(text) ? 2 : text.length > 60 ? 3 : 0;
  text = esc(text);
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(s: Sheet): string {
  const cols = s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cellXml(v, `${columnName(ci)}${ri + 1}`, s.header && ri === 0)).join('')}</row>`).join('');
  const lastCol = columnName(Math.max(0, (s.rows[0]?.length ?? 1) - 1));
  const pane = s.header ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${s.filter && s.rows.length > 1 ? `<autoFilter ref="A1:${lastCol}${s.rows.length}"/>` : ''}</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17498C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" quotePrefix="1" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

export function buildXlsx(sheets: Sheet[], meta: { title: string; created: string }): Uint8Array {
  for (const s of sheets) if (!/^[^[\]:*?/\\]{1,31}$/.test(s.name)) throw new Error(`Invalid sheet name: ${s.name}`);
  const files: Record<string, Uint8Array> = {};
  const put = (p: string, text: string) => { files[p] = strToU8(text); };
  put('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  put('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  put('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(meta.title)}</dc:title><dc:creator>Reltroner Statistics</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${esc(meta.created)}</dcterms:created></cp:coreProperties>`);
  const filterIdx = sheets.findIndex((s) => s.filter && s.rows.length > 1);
  const defined = filterIdx >= 0
    ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${filterIdx}" hidden="1">'${sheets[filterIdx]!.name}'!$A$1:$${columnName(sheets[filterIdx]!.rows[0]!.length - 1)}$${sheets[filterIdx]!.rows.length}</definedName></definedNames>`
    : '';
  put('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined}</workbook>`);
  put('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  put('xl/styles.xml', STYLES);
  sheets.forEach((s, i) => put(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  const mtime = new Date(1980, 0, 1, 12, 0, 0);
  return zipSync(Object.fromEntries(Object.keys(files).sort().map((k) => [k, [files[k]!, { level: 6, mtime }]])));
}

export function renderXlsx(doc: ReportDocument): Uint8Array {
  const c = doc.context;
  const summary: Cell[][] = [
    ['Field', 'Value'],
    ['Report', doc.title],
    ['Generated', c.generated_at],
    ['Rules version', c.rules_version],
    ['Semantic digest', c.semantic_digest],
    ['Production repository', c.production.repository],
    ['Production commit', c.production.commit_sha],
    ['Remodeling repository', c.remodeling.repository],
    ['Remodeling commit', c.remodeling.commit_sha],
    ['Deployment status', c.deployment.status],
    ['Deployed commit', c.deployment.deployed_sha ?? 'not verified'],
    ['Source authority', doc.authority_notice],
    ['Findings', doc.summary.findings],
    ...Object.entries(doc.summary.by_classification).map(([k, v]) => [`Classification ${k}`, v] as Cell[]),
    ...Object.entries(doc.summary.by_priority).map(([k, v]) => [`Priority ${k}`, v] as Cell[]),
    ['Formula safety', 'No formulas are written. Text that could be read as a formula is stored as literal text (quotePrefix).'],
  ];
  const findings: Cell[][] = [[...CSV_COLUMNS]];
  for (const f of doc.findings) {
    const r = findingRecord(f);
    findings.push(CSV_COLUMNS.map((col) => {
      const v = r[col];
      return typeof v === 'number' || typeof v === 'boolean' || v === null || typeof v === 'string' ? v : JSON.stringify(v);
    }));
  }
  const diffs: Cell[][] = [['finding_id', 'line_no', 'kind', 'text']];
  for (const f of doc.findings) f.diff?.excerpt.forEach((l, i) => diffs.push([f.id, i + 1, l.startsWith('+') ? 'added' : l.startsWith('-') ? 'removed' : 'context', l.slice(1)]));
  const widths = CSV_COLUMNS.map((col) => (col === 'title' || col === 'recommendation' || col === 'rule' ? 60 : col.endsWith('_value') ? 28 : col.endsWith('commit') || col.endsWith('blob') ? 42 : 18));
  return buildXlsx([
    { name: 'Summary', rows: summary, widths: [28, 100], header: true, filter: false },
    { name: 'Findings', rows: findings, widths, header: true, filter: true },
    { name: 'Diff excerpts', rows: diffs, widths: [18, 10, 10, 120], header: true, filter: diffs.length > 1 },
  ], { title: doc.title, created: c.generated_at });
}
