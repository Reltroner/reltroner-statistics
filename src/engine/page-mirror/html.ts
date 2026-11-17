/**
 * Build-time reading of one built HTML page with a real HTML parser (htmlparser2, which also
 * decodes character references). Only <main> is read: site header, footer, navigation, scripts,
 * styles and form controls are left out. Headings h1–h4 open sections, anchored to the element ids
 * the page already has. Islands are recorded with the props Astro serialized for them, which are
 * exactly the data the browser renders from.
 */
import { parseDocument } from 'htmlparser2';
import type { PageBlock, PageSection } from '../../contracts/page-schemas.ts';
import { slugify } from '../../domain/page-url.ts';
import { reviveAstroProps } from './props.ts';

export const EXTRACT_LIMITS = Object.freeze({
  TEXT_CHARS: 2000,
  BLOCKS_PER_SECTION: 80,
  LINKS_PER_SECTION: 40,
  TABLE_ROWS: 200,
  LIST_ITEMS: 120,
  SECTIONS: 1000,
});

export interface Island {
  uid: string;
  component: string;
  hydration: string;
  /** False for client:only islands: the server sends no content for them. */
  server_rendered: boolean;
  props: Record<string, unknown>;
}
export interface DeclaredSource { role: 'production' | 'remodeling'; repository: string; commit_sha: string | null }
export interface ExtractedPage {
  html_title: string;
  description: string;
  lang: string | null;
  noindex: boolean;
  refresh: string | null;
  h1: string | null;
  sections: PageSection[];
  islands: Island[];
  declared_sources: DeclaredSource[];
  /** Download and data links of the page (CSV, JSON, PDF, ...). */
  datasets: Array<{ text: string; href: string; kind: string }>;
  /** Items of the page's own "Not yet known or supported here" list. */
  stated_limits: string[];
  has_main: boolean;
}

/** The subset of the domhandler node shape this module reads. */
interface DomNode { type: string; name?: string; data?: string; attribs?: Record<string, string>; children?: DomNode[] }

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'nav', 'button', 'select', 'option', 'input', 'textarea', 'label', 'svg', 'canvas', 'iframe', 'object', 'dialog', 'head']);
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'dd', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'ul', 'astro-island', 'astro-slot', 'astro-static-slot']);
const HEADING = /^h([1-4])$/;
const DATA_FILE = /\.(csv|json|pdf|xlsx|xml|md|txt|zip|xsd|svg)$/i;

/** Collapses whitespace, and the spaces that element boundaries leave before closing punctuation. */
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/ ([.,;:!?)\]])/g, '$1').replace(/([([]) /g, '$1').trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const isElement = (n: DomNode) => n.type === 'tag' || n.type === 'script' || n.type === 'style';
const attr = (n: DomNode, name: string): string | null => n.attribs?.[name] ?? null;
const hidden = (n: DomNode) => attr(n, 'hidden') !== null || attr(n, 'aria-hidden') === 'true';

/**
 * Visible text of a node. Element boundaries become spaces, so "<span>4,412</span><span>billion</span>"
 * reads "4,412 billion" rather than merging words; whitespace is collapsed afterwards.
 */
function textOf(n: DomNode): string {
  if (n.type === 'text') return n.data ?? '';
  if (!isElement(n) || SKIP.has(n.name!) || hidden(n)) return '';
  if (n.name === 'br') return ' ';
  if (n.name === 'wbr') return '';
  if (n.name === 'img') return ` ${attr(n, 'alt') ?? ''} `;
  return ` ${(n.children ?? []).map(textOf).join('')} `;
}
function find(n: DomNode, test: (e: DomNode) => boolean): DomNode | null {
  if (isElement(n) && test(n)) return n;
  for (const c of n.children ?? []) { const hit = find(c, test); if (hit) return hit; }
  return null;
}
function findAll(n: DomNode, test: (e: DomNode) => boolean, out: DomNode[] = []): DomNode[] {
  if (isElement(n) && test(n)) out.push(n);
  for (const c of n.children ?? []) findAll(c, test, out);
  return out;
}
const elementChildren = (n: DomNode) => (n.children ?? []).filter(isElement);

function tableBlock(t: DomNode): PageBlock {
  const caption = find(t, (e) => e.name === 'caption');
  const rows = findAll(t, (e) => e.name === 'tr');
  const cells = (tr: DomNode) => elementChildren(tr).filter((c) => c.name === 'td' || c.name === 'th').map((c) => clip(norm(textOf(c)), 400));
  const head = rows.find((r) => elementChildren(r).some((c) => c.name === 'th') && !elementChildren(r).some((c) => c.name === 'td'));
  const body = rows.filter((r) => r !== head).map(cells).filter((r) => r.some((c) => c));
  return { type: 'table', caption: caption ? norm(textOf(caption)) : null, columns: head ? cells(head) : [], rows: body.slice(0, EXTRACT_LIMITS.TABLE_ROWS), rows_total: body.length, truncated: body.length > EXTRACT_LIMITS.TABLE_ROWS };
}
function listBlock(l: DomNode): PageBlock {
  const items: string[] = [];
  if (l.name === 'dl') {
    let term = '';
    for (const c of elementChildren(l)) {
      if (c.name === 'dt') term = norm(textOf(c));
      if (c.name === 'dd') items.push(clip(term ? `${term}: ${norm(textOf(c))}` : norm(textOf(c)), 600));
    }
  } else {
    for (const c of elementChildren(l)) if (c.name === 'li' && !hidden(c)) { const t = norm(textOf(c)); if (t) items.push(clip(t, 600)); }
  }
  return { type: 'list', ordered: l.name === 'ol', items: items.slice(0, EXTRACT_LIMITS.LIST_ITEMS) };
}

/** Reads one built page. `relativePath` is only used for messages. */
export function extractPage(html: string, relativePath: string): ExtractedPage {
  const doc = parseDocument(html, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }) as unknown as DomNode;
  const head = find(doc, (e) => e.name === 'head');
  const htmlEl = find(doc, (e) => e.name === 'html');
  const meta = (name: string) => { const m = head ? find(head, (e) => e.name === 'meta' && attr(e, 'name') === name) : null; return m ? attr(m, 'content') : null; };
  const titleEl = head ? find(head, (e) => e.name === 'title') : null;
  const refreshEl = head ? find(head, (e) => e.name === 'meta' && (attr(e, 'http-equiv') ?? '').toLowerCase() === 'refresh') : null;
  const main = find(doc, (e) => e.name === 'main');
  const limitsBox = main ? find(main, (e) => e.name === 'details' && elementChildren(e).some((c) => c.name === 'summary' && norm(textOf(c)) === 'Not yet known or supported here')) : null;
  const stated_limits = limitsBox ? findAll(limitsBox, (e) => e.name === 'li').map((li) => norm(textOf(li))).filter(Boolean) : [];

  const sections: PageSection[] = [];
  const islands: Island[] = [];
  const datasets: ExtractedPage['datasets'] = [];
  const declared: DeclaredSource[] = [];
  const usedIds = new Set<string>();
  let h1: string | null = null;
  const newSection = (heading: string, level: number, anchor: string | null): PageSection => {
    const base = anchor && /^[a-z0-9][a-z0-9-]*$/.test(anchor.toLowerCase()) ? anchor.toLowerCase() : slugify(heading);
    let id = base;
    for (let i = 2; usedIds.has(id); i++) id = `${base}-${i}`;
    usedIds.add(id);
    const s: PageSection = { section_id: id, anchor, heading, level, blocks: [], blocks_total: 0, links: [], truncated: false };
    sections.push(s);
    return s;
  };
  // Content before the first heading (an eyebrow line) opens the first real section.
  let leading: PageSection | null = { section_id: '', anchor: null, heading: '', level: 1, blocks: [], blocks_total: 0, links: [], truncated: false };
  let current: PageSection = leading;
  let buffer = '';
  const push = (b: PageBlock) => {
    current.blocks_total++;
    if (current.blocks.length < EXTRACT_LIMITS.BLOCKS_PER_SECTION) current.blocks.push(b); else current.truncated = true;
  };
  const flush = () => { const t = norm(buffer); buffer = ''; if (t) push({ type: 'text', text: clip(t, EXTRACT_LIMITS.TEXT_CHARS) }); };
  const recordLink = (n: DomNode) => {
    const href = attr(n, 'href');
    const label = norm(textOf(n));
    if (href && (href.startsWith('/') || href.startsWith('https://')) && current.links.length < EXTRACT_LIMITS.LINKS_PER_SECTION && !current.links.some((l) => l.href === href)) current.links.push({ text: clip(label, 160), href });
    if (href && href.startsWith('/') && DATA_FILE.test(href.split('?')[0]!) && !datasets.some((d) => d.href === href)) datasets.push({ text: clip(label, 160), href, kind: href.split('?')[0]!.split('.').pop()!.toLowerCase() });
  };
  const open = (heading: string, level: number, anchor: string | null) => {
    const s = newSection(heading, level, anchor);
    if (leading) { s.blocks.push(...leading.blocks); s.blocks_total += leading.blocks_total; s.links.push(...leading.links); leading = null; }
    current = s;
  };

  const walk = (n: DomNode, parentSectionId: string | null): void => {
    if (n.type === 'text') { buffer += n.data ?? ''; return; }
    if (!isElement(n) || hidden(n)) return;
    const name = n.name!;
    if (name === 'ul' && attr(n, 'aria-label') === 'Sources behind this view') {
      for (const a of findAll(n, (e) => e.name === 'a')) {
        const m = /^https:\/\/github\.com\/(Reltroner\/reltroner-studio(-remodeling)?)\/commit\/([0-9a-f]{40})$/.exec(attr(a, 'href') ?? '');
        if (m) declared.push({ role: m[2] ? 'remodeling' : 'production', repository: m[1]!, commit_sha: m[3]! });
      }
    }
    if (name === 'br') { buffer += ' '; return; }
    if (name === 'wbr') return;
    if (SKIP.has(name)) return;
    const heading = HEADING.exec(name);
    if (heading) {
      flush();
      const h = norm(textOf(n));
      if (name === 'h1' && h1 === null && h) h1 = clip(h, 200);
      if (h && sections.length < EXTRACT_LIMITS.SECTIONS) open(clip(h, 200), Number(heading[1]), attr(n, 'id') ?? parentSectionId);
      else if (h) push({ type: 'text', text: h });
      return;
    }
    if (name === 'a') recordLink(n);
    if (name === 'table') { flush(); push(tableBlock(n)); for (const a of findAll(n, (e) => e.name === 'a')) recordLink(a); return; }
    if (name === 'ul' || name === 'ol' || name === 'dl') { flush(); const b = listBlock(n); if (b.type === 'list' && b.items.length) push(b); for (const a of findAll(n, (e) => e.name === 'a')) recordLink(a); return; }
    if (name === 'img') { flush(); const alt = attr(n, 'alt') ?? ''; if (alt) push({ type: 'figure', alt: clip(alt, 400), src: attr(n, 'src') }); return; }
    if (name === 'astro-island') {
      flush();
      const opts = JSON.parse(attr(n, 'opts') ?? '{}') as { name?: string };
      const island: Island = {
        uid: attr(n, 'uid') ?? '',
        component: opts.name ?? attr(n, 'component-export') ?? 'unknown',
        hydration: attr(n, 'client') ?? 'unknown',
        server_rendered: attr(n, 'client') !== 'only',
        props: reviveAstroProps(attr(n, 'props') ?? '{}', `${relativePath} <${opts.name ?? 'island'}>`),
      };
      islands.push(island);
      push({ type: 'component', component: island.component, hydration: island.hydration, server_rendered: island.server_rendered, data_ids: [] });
      if (island.server_rendered) for (const c of n.children ?? []) walk(c, null);
      flush();
      return;
    }
    const block = BLOCK.has(name);
    if (block) flush(); else buffer += ' ';
    const sectionId = name === 'section' ? attr(n, 'id') ?? attr(n, 'aria-labelledby') : null;
    for (const c of n.children ?? []) walk(c, name === 'section' ? sectionId : block ? null : parentSectionId);
    if (block) flush(); else buffer += ' ';
  };
  if (main) for (const c of main.children ?? []) walk(c, null);
  flush();
  if (leading !== null) {
    const l: PageSection = leading;
    if (l.blocks.length || l.links.length) { const s = newSection('Page', 1, null); s.blocks = l.blocks; s.blocks_total = l.blocks_total; s.links = l.links; sections.unshift(sections.pop()!); }
  }
  return {
    html_title: titleEl ? norm(textOf(titleEl)) : '',
    description: meta('description') ?? '',
    lang: htmlEl ? attr(htmlEl, 'lang') : null,
    noindex: /\bnoindex\b/i.test(meta('robots') ?? ''),
    refresh: refreshEl ? attr(refreshEl, 'content') : null,
    h1,
    sections,
    islands,
    declared_sources: declared.filter((d, i) => declared.findIndex((x) => x.repository === d.repository && x.commit_sha === d.commit_sha) === i),
    datasets: datasets.filter((d) => d.kind !== 'svg'),
    stated_limits,
    has_main: main !== null,
  };
}
