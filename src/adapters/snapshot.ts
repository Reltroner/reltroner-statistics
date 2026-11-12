import type { SnapshotEntry, SourceSnapshot } from '../engine/comparator.ts';
import { computeRootTreeSha, gitBlobSha, type TreeEntry } from '../engine/git-objects.ts';
import { SOURCE_REPOSITORIES, SHA_RE, repositorySlug, type SourceSide } from '../domain/source.ts';
import type { ObjectCache } from './cache.ts';
import type { CommitInfo, GitHubClient } from './github.ts';

export interface SnapshotRequest {
  side: SourceSide;
  /** Pinned commit SHA. When absent, `ref` is resolved once and then pinned. */
  sha?: string | undefined;
  ref?: string | undefined;
}

/**
 * Load a pinned source revision through the GitHub API: commit → tree (integrity-verified by
 * recomputing the root tree SHA) → blobs on demand (each verified against its Git blob SHA).
 * Nothing is checked out, so OS line-ending conversion cannot influence identity.
 */
export async function loadGitHubSnapshot(client: GitHubClient, cache: ObjectCache, req: SnapshotRequest): Promise<SourceSnapshot> {
  const repo = SOURCE_REPOSITORIES[req.side];
  const requested = req.sha ?? req.ref ?? 'main';
  if (req.sha !== undefined && !SHA_RE.test(req.sha)) throw new Error(`Pinned ${req.side} SHA must be 40 lowercase hex characters`);
  let commit: CommitInfo | null = req.sha ? cache.getJson<CommitInfo>('commits', `${repo.repo}-${req.sha}`) : null;
  if (!commit) {
    commit = await client.getCommit(repo.owner, repo.repo, requested);
    if (req.sha && commit.sha !== req.sha) throw new Error(`Commit SHA mismatch for ${req.side}: requested ${req.sha}, received ${commit.sha}`);
    if (!SHA_RE.test(commit.sha) || !SHA_RE.test(commit.tree_sha)) throw new Error('GitHub returned an invalid commit identity');
    cache.putJson('commits', `${repo.repo}-${commit.sha}`, commit);
  }
  let entries = cache.getJson<TreeEntry[]>('trees', `${repo.repo}-${commit.tree_sha}`);
  if (!entries || computeRootTreeSafe(entries) !== commit.tree_sha) {
    entries = await client.getTree(repo.owner, repo.repo, commit.tree_sha);
    const computed = computeRootTreeSha(entries);
    if (computed !== commit.tree_sha) throw new Error(`Tree integrity failure for ${req.side}: expected ${commit.tree_sha}, computed ${computed}`);
    cache.putJson('trees', `${repo.repo}-${commit.tree_sha}`, entries);
  }
  const map = new Map<string, SnapshotEntry>();
  for (const e of entries) map.set(e.path, { sha: e.sha, size: e.size ?? 0, mode: e.mode, type: e.type });
  const inflight = new Map<string, Promise<Uint8Array>>();
  return {
    identity: {
      side: req.side,
      role: repo.role,
      repository: repositorySlug(req.side),
      requested_ref: requested,
      commit_sha: commit.sha,
      tree_sha: commit.tree_sha,
      committed_at: commit.committed_at,
      headline: commit.headline,
    },
    entries: map,
    async readBlob(sha: string): Promise<Uint8Array> {
      const cached = cache.getBlob(sha);
      if (cached) return cached;
      let p = inflight.get(sha);
      if (!p) {
        p = client.getBlob(repo.owner, repo.repo, sha).then((bytes) => {
          if (gitBlobSha(bytes) !== sha) throw new Error(`Blob integrity failure for ${sha}`);
          cache.putBlob(sha, bytes);
          return bytes;
        });
        inflight.set(sha, p);
      }
      return p;
    },
  };
}

function computeRootTreeSafe(entries: TreeEntry[]): string | null {
  try {
    return computeRootTreeSha(entries);
  } catch {
    return null;
  }
}

/** Read a blob for a path in a snapshot, or null when the path is absent. */
export async function readPath(snapshot: SourceSnapshot, path: string): Promise<Uint8Array | null> {
  const e = snapshot.entries.get(path);
  if (!e || e.type !== 'blob') return null;
  return snapshot.readBlob(e.sha);
}
