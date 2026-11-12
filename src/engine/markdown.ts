import { parse as parseYaml } from 'yaml';
import type { ContentChangeNature } from '../domain/status.ts';

export function toLf(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function stripTrailing(text: string): string {
  return toLf(text).split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '');
}

/** Nature of a byte-level change between two text blobs. */
export function textChangeNature(a: string, b: string): ContentChangeNature {
  if (a === b) return 'CONTENT';
  const la = toLf(a), lb = toLf(b);
  if (la === lb) return 'LINE_ENDINGS_ONLY';
  if (la.replace(/\n+$/, '') === lb.replace(/\n+$/, '')) return 'TRAILING_NEWLINE_ONLY';
  if (stripTrailing(a) === stripTrailing(b)) return 'WHITESPACE_ONLY';
  return 'CONTENT';
}

export interface SplitMarkdown {
  frontmatter: string | null;
  body: string;
  bodyStartLine: number;
}

export function splitFrontmatter(text: string): SplitMarkdown {
  const lf = toLf(text);
  if (!lf.startsWith('---\n')) return { frontmatter: null, body: lf, bodyStartLine: 1 };
  const lines = lf.split('\n');
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---' || lines[i] === '...') {
      return { frontmatter: lines.slice(1, i).join('\n'), body: lines.slice(i + 1).join('\n'), bodyStartLine: i + 2 };
    }
  }
  return { frontmatter: null, body: lf, bodyStartLine: 1 };
}

export type FrontmatterResult = { ok: true; value: Record<string, unknown> | null } | { ok: false; error: string };

export function parseFrontmatter(text: string): FrontmatterResult {
  const { frontmatter } = splitFrontmatter(text);
  if (frontmatter === null) return { ok: true, value: null };
  try {
    const value = parseYaml(frontmatter, { schema: 'core', uniqueKeys: true, maxAliasCount: 64, prettyErrors: false });
    if (value === null || value === undefined) return { ok: true, value: {} };
    if (typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Frontmatter is not a mapping' };
    return { ok: true, value: JSON.parse(JSON.stringify(value)) as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: String((err as Error).message).slice(0, 200) };
  }
}

export interface Section {
  key: string;
  heading: string | null;
  level: number;
  start_line: number;
  lines: string[];
}

const HEADING_RE = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE_RE = /^[ ]{0,3}(`{3,}|~{3,})/;

/**
 * Split a markdown body into sections. A section owns the lines from its heading to the next
 * heading of any level, so a change is attributed to the deepest enclosing heading. Section keys
 * are heading paths ("Economy › Growth"); repeated paths receive an occurrence suffix.
 */
export function splitSections(text: string): Section[] {
  const { body, bodyStartLine } = splitFrontmatter(text);
  const lines = body.split('\n');
  const sections: Section[] = [];
  const stack: Array<{ level: number; title: string }> = [];
  const seen = new Map<string, number>();
  let current: Section = { key: '(preamble)', heading: null, level: 0, start_line: bodyStartLine, lines: [] };
  let fence: string | null = null;
  lines.forEach((line, idx) => {
    const f = FENCE_RE.exec(line);
    if (f) {
      const marker = f[1]!;
      if (fence === null) fence = marker[0]!.repeat(marker.length);
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    }
    const h = fence === null && !f ? HEADING_RE.exec(line) : null;
    if (!h) { current.lines.push(line); return; }
    sections.push(current);
    const level = h[1]!.length;
    const title = h[2]!.replace(/\s+/g, ' ').trim();
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ level, title });
    const path = stack.map((s) => s.title).join(' › ');
    const n = (seen.get(path) ?? 0) + 1;
    seen.set(path, n);
    current = { key: n === 1 ? path : `${path} (${n})`, heading: title, level, start_line: bodyStartLine + idx, lines: [line] };
  });
  sections.push(current);
  return sections.filter((s) => s.heading !== null || s.lines.some((l) => l.trim()));
}

export function normalizedSectionLines(s: Section): string[] {
  const out = s.lines.map((l) => l.replace(/[ \t]+$/, ''));
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

export function excerpt(lines: readonly string[], maxChars = 600): string {
  const text = lines.join('\n').trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}
