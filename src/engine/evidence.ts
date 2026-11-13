/**
 * Source-passage evidence. A passage is cited only when a pinned pattern matches the text of a
 * line in a pinned blob, and the quote is the matched text itself. There is no fallback: an
 * unmatched pattern yields null and the caller must drop or downgrade whatever depended on it.
 * `verifyPassage` re-checks a stored citation against the snapshot, so a quote that is not in the
 * cited line of the cited blob can never be published as evidence.
 */
import type { SourceSnapshot } from './comparator.ts';

export interface Passage {
  side: 'production' | 'remodeling';
  repository: string;
  commit_sha: string;
  path: string;
  blob_sha: string;
  line: number;
  quote: string;
}

export const MAX_QUOTE_CHARS = 480;
const decoder = new TextDecoder();
const cache = new WeakMap<SourceSnapshot, Map<string, Promise<string[] | null>>>();

/** Markdown line reduced to its reading text: emphasis, links, images and heading or quote markers removed. */
export function plainText(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/^\s*(?:>+|#{1,6})\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lines of a blob in the snapshot (LF-normalized), or null when the path is absent. Read once per snapshot. */
export function readLines(snapshot: SourceSnapshot, path: string): Promise<string[] | null> {
  let perSnapshot = cache.get(snapshot);
  if (!perSnapshot) cache.set(snapshot, (perSnapshot = new Map()));
  let pending = perSnapshot.get(path);
  if (!pending) {
    const entry = snapshot.entries.get(path);
    pending = entry && entry.type === 'blob'
      ? snapshot.readBlob(entry.sha).then((bytes) => decoder.decode(bytes).replace(/\r\n?/g, '\n').split('\n'))
      : Promise.resolve(null);
    perSnapshot.set(path, pending);
  }
  return pending;
}

function clip(text: string): string {
  if (text.length <= MAX_QUOTE_CHARS) return text;
  const cut = text.slice(0, MAX_QUOTE_CHARS);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), MAX_QUOTE_CHARS - 40))}…`;
}

/**
 * First line whose reading text matches `pattern`. The quote is the matched text (not a
 * paraphrase), so patterns should span the sentence that is meant to be cited.
 */
export async function findPassage(snapshot: SourceSnapshot, path: string, pattern: RegExp): Promise<Passage | null> {
  const lines = await readLines(snapshot, path);
  const entry = snapshot.entries.get(path);
  if (!lines || !entry) return null;
  const re = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(plainText(lines[i]!));
    if (!m || !m[0].trim()) continue;
    return {
      side: snapshot.identity.side,
      repository: snapshot.identity.repository,
      commit_sha: snapshot.identity.commit_sha,
      path,
      blob_sha: entry.sha,
      line: i + 1,
      quote: clip(m[0].trim()),
    };
  }
  return null;
}

export type PassageCheck = 'VERIFIED' | 'SOURCE_MISSING' | 'BLOB_MISMATCH' | 'LINE_OUT_OF_RANGE' | 'QUOTE_NOT_AT_LINE';

/** Re-check a stored citation: same blob, existing line, and the quote occurs in that line's text. */
export async function verifyPassage(
  snapshot: SourceSnapshot,
  ref: { path: string; blob_sha: string | null; line: number | null; quote: string },
): Promise<PassageCheck> {
  const entry = snapshot.entries.get(ref.path);
  const lines = await readLines(snapshot, ref.path);
  if (!entry || !lines) return 'SOURCE_MISSING';
  if (ref.blob_sha !== entry.sha) return 'BLOB_MISMATCH';
  if (ref.line === null) return 'VERIFIED';
  if (!Number.isInteger(ref.line) || ref.line < 1 || ref.line > lines.length) return 'LINE_OUT_OF_RANGE';
  const quote = plainText(ref.quote.replace(/…$/, ''));
  return quote.length > 0 && plainText(lines[ref.line - 1]!).includes(quote) ? 'VERIFIED' : 'QUOTE_NOT_AT_LINE';
}

/** Markdown documents linked from a document with a relative `[text](target.md)` link, resolved against the snapshot. */
export function relativeLinks(path: string, lines: readonly string[]): Array<{ target: string; line: number }> {
  const dir = path.split('/').slice(0, -1);
  const out = new Map<string, number>();
  const re = /\]\(([^)\s]+?\.md)(?:#[^)\s]*)?\)/g;
  lines.forEach((text, i) => {
    for (const m of text.matchAll(re)) {
      const href = m[1]!;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/')) continue;
      const parts = [...dir];
      let ok = true;
      for (const seg of href.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') { if (!parts.length) { ok = false; break; } parts.pop(); } else parts.push(seg);
      }
      const target = parts.join('/');
      if (ok && target !== path && !out.has(target)) out.set(target, i + 1);
    }
  });
  return [...out.entries()].map(([target, line]) => ({ target, line }));
}
