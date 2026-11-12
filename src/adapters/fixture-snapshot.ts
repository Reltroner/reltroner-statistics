/** Deterministic in-memory snapshots for tests. Blob and tree SHAs are computed exactly like Git. */
import type { SnapshotEntry, SourceSnapshot } from '../engine/comparator.ts';
import { computeRootTreeSha, gitBlobSha, type TreeEntry } from '../engine/git-objects.ts';
import { SOURCE_REPOSITORIES, repositorySlug, type SourceSide } from '../domain/source.ts';

export function fixtureSnapshot(side: SourceSide, commitSha: string, files: Record<string, string | Uint8Array>): SourceSnapshot {
  const enc = new TextEncoder();
  const blobs = new Map<string, Uint8Array>();
  const entries: TreeEntry[] = [];
  const dirs = new Set<string>();
  for (const [p, content] of Object.entries(files)) {
    const bytes = typeof content === 'string' ? enc.encode(content) : content;
    const sha = gitBlobSha(bytes);
    blobs.set(sha, bytes);
    entries.push({ path: p, mode: '100644', type: 'blob', sha, size: bytes.byteLength });
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  for (const d of dirs) entries.push({ path: d, mode: '040000', type: 'tree', sha: '' });
  // Fill directory SHAs bottom-up so the listing is a valid Git tree.
  const sorted = [...dirs].sort((a, b) => b.split('/').length - a.split('/').length);
  for (const d of sorted) {
    const prefix = `${d}/`;
    const sub = entries.filter((e) => e.path.startsWith(prefix)).map((e) => ({ ...e, path: e.path.slice(prefix.length) }));
    const tree = entries.find((e) => e.path === d && e.type === 'tree')!;
    tree.sha = computeRootTreeSha(sub);
  }
  const treeSha = computeRootTreeSha(entries);
  const map = new Map<string, SnapshotEntry>(entries.map((e) => [e.path, { sha: e.sha, size: e.size ?? 0, mode: e.mode, type: e.type }]));
  return {
    identity: {
      side,
      role: SOURCE_REPOSITORIES[side].role,
      repository: repositorySlug(side),
      requested_ref: commitSha,
      commit_sha: commitSha,
      tree_sha: treeSha,
      committed_at: '2026-01-01T00:00:00Z',
      headline: 'fixture',
    },
    entries: map,
    async readBlob(sha: string) {
      const b = blobs.get(sha);
      if (!b) throw new Error(`Fixture blob ${sha} not found`);
      return b;
    },
  };
}
