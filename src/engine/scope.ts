/**
 * Comparison scope registry. A strict allow-list: runtime code (`app/`, `components/`, `lib/`),
 * README files and internal remodeling notes (`content/remodeling/**`) are never compared or published.
 *
 * Changing anything here that alters which paths are compared or how they are classified
 * requires a RULES_VERSION bump and a refreshed baseline in tests/baselines/.
 */

export const RULES_VERSION = 'P0R-2.0.0';
export const SCOPE_ID = 'studio-public-content-v1';
export const MAX_BLOB_BYTES = 3 * 1024 * 1024;

export const CONTENT_COLLECTIONS = Object.freeze([
  'blog', 'characters', 'cultures', 'events', 'factions', 'items', 'laws', 'music', 'myths',
  'organizations', 'philosophies', 'places', 'principles', 'research', 'series', 'statistics',
  'technologies', 'video',
] as const);
const COLLECTION_SET: ReadonlySet<string> = new Set(CONTENT_COLLECTIONS);

/** Regular files only. Symlinks (120000) and submodules (160000) are excluded. */
export const ALLOWED_MODES: ReadonlySet<string> = new Set(['100644', '100755']);

export function isSafeRelativePath(path: string): boolean {
  if (typeof path !== 'string' || !path || path.length > 512) return false;
  if (path.includes('\\') || path.includes('\0') || path.startsWith('/')) return false;
  const parts = path.split('/');
  return !parts.some((p) => !p || p === '.' || p === '..');
}

export function isComparedPath(relativePath: string): boolean {
  const p = relativePath.replaceAll('\\', '/');
  if (!isSafeRelativePath(p)) return false;
  const parts = p.split('/');
  if (parts[0] === 'content') {
    return parts.length >= 3 && COLLECTION_SET.has(parts[1] ?? '') && p.endsWith('.md') && !p.endsWith('/README.md');
  }
  if (parts[0] === 'data' && parts[1] === 'asthortera') return parts.length === 3 && p.endsWith('.json');
  return false;
}

export function scopeDescription() {
  return {
    scope_id: SCOPE_ID,
    rules_version: RULES_VERSION,
    include: [
      `content/{${CONTENT_COLLECTIONS.join(',')}}/**/*.md (excluding README.md)`,
      'data/asthortera/*.json',
    ],
    exclude: ['content/remodeling/**', 'app/**', 'components/**', 'lib/**', 'symlinks', 'submodules'],
    max_blob_bytes: MAX_BLOB_BYTES,
  };
}
