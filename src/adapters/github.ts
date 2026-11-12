/**
 * Read-only GitHub REST client. Only GET requests are issued. Tokens are read from the
 * environment by the caller and never logged, cached or written to artifacts.
 */
import type { TreeEntry } from '../engine/git-objects.ts';

export class GitHubApiError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(status: number, path: string, message: string) {
    super(`GitHub API ${status} for ${path}: ${message}`);
    this.status = status;
    this.path = path;
  }
}

export interface GitHubClientOptions {
  token?: string | undefined;
  fetchImpl?: typeof fetch;
  concurrency?: number;
  maxRetries?: number;
  maxRateLimitWaitMs?: number;
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

export interface CommitInfo {
  sha: string;
  tree_sha: string;
  committed_at: string | null;
  headline: string | null;
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;
const SAFE_REF = /^[A-Za-z0-9._\/-]{1,200}$/;

class Semaphore {
  #available: number;
  #queue: Array<() => void> = [];
  constructor(n: number) {
    this.#available = Math.max(1, n);
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#available > 0) this.#available--;
    else await new Promise<void>((resolve) => this.#queue.push(resolve));
    try {
      return await fn();
    } finally {
      const next = this.#queue.shift();
      if (next) next();
      else this.#available++;
    }
  }
}

export class GitHubClient {
  #token: string | undefined;
  #fetch: typeof fetch;
  #sem: Semaphore;
  #maxRetries: number;
  #maxWait: number;
  #base: string;
  #sleep: (ms: number) => Promise<void>;
  #log: (message: string) => void;
  requests = 0;

  constructor(opts: GitHubClientOptions = {}) {
    this.#token = opts.token || undefined;
    this.#fetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.#sem = new Semaphore(opts.concurrency ?? 6);
    this.#maxRetries = opts.maxRetries ?? 5;
    this.#maxWait = opts.maxRateLimitWaitMs ?? 120_000;
    this.#base = opts.baseUrl ?? 'https://api.github.com';
    this.#sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.#log = opts.log ?? (() => {});
  }

  get authenticated(): boolean {
    return !!this.#token;
  }

  async #request(path: string, accept: string): Promise<Response> {
    return this.#sem.run(async () => {
      let attempt = 0;
      for (;;) {
        let res: Response | null = null;
        let networkError: unknown = null;
        try {
          this.requests++;
          res = await this.#fetch(`${this.#base}${path}`, {
            method: 'GET',
            headers: {
              Accept: accept,
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'reltroner-statistics-readonly-pipeline',
              ...(this.#token ? { Authorization: `Bearer ${this.#token}` } : {}),
            },
          });
        } catch (err) {
          networkError = err;
        }
        if (res && res.ok) return res;
        if (res && res.status === 304) return res;
        const retryable = networkError !== null || (res !== null && (res.status >= 500 || res.status === 429 || res.status === 403));
        if (!retryable || attempt >= this.#maxRetries) {
          const body = res ? (await res.text().catch(() => '')).slice(0, 300) : String(networkError);
          throw new GitHubApiError(res?.status ?? 0, path, body || 'request failed');
        }
        let waitMs = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 200);
        if (res) {
          const retryAfter = Number(res.headers.get('retry-after'));
          const remaining = res.headers.get('x-ratelimit-remaining');
          const reset = Number(res.headers.get('x-ratelimit-reset'));
          if (Number.isFinite(retryAfter) && retryAfter > 0) waitMs = retryAfter * 1000;
          else if (remaining === '0' && Number.isFinite(reset)) {
            waitMs = Math.max(1000, reset * 1000 - Date.now() + 1000);
            if (waitMs > this.#maxWait) {
              throw new GitHubApiError(res.status, path, `rate limit exhausted until ${new Date(reset * 1000).toISOString()}${this.#token ? '' : ' (unauthenticated; set GITHUB_TOKEN)'}`);
            }
          } else if (res.status === 403) {
            const body = (await res.text().catch(() => '')).slice(0, 300);
            if (!/rate limit|abuse|secondary/i.test(body)) throw new GitHubApiError(403, path, body || 'forbidden');
          }
        }
        this.#log(`retry ${attempt + 1}/${this.#maxRetries} for ${path} in ${waitMs}ms (${res?.status ?? 'network error'})`);
        await this.#sleep(waitMs);
        attempt++;
      }
    });
  }

  async json<T>(path: string): Promise<T> {
    const res = await this.#request(path, 'application/vnd.github+json');
    return (await res.json()) as T;
  }

  async raw(path: string): Promise<Uint8Array> {
    const res = await this.#request(path, 'application/vnd.github.raw+json');
    return new Uint8Array(await res.arrayBuffer());
  }

  static repoPath(owner: string, repo: string): string {
    if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo)) throw new Error('Unsafe repository identifier');
    return `/repos/${owner}/${repo}`;
  }

  async getCommit(owner: string, repo: string, ref: string): Promise<CommitInfo> {
    if (!SAFE_REF.test(ref) || ref.includes('..')) throw new Error('Unsafe Git ref');
    const c = await this.json<{
      sha: string;
      commit: { tree: { sha: string }; committer?: { date?: string } | null; message?: string };
    }>(`${GitHubClient.repoPath(owner, repo)}/commits/${encodeURIComponent(ref)}`);
    return {
      sha: c.sha,
      tree_sha: c.commit.tree.sha,
      committed_at: c.commit.committer?.date ?? null,
      headline: (c.commit.message ?? '').split('\n')[0]?.slice(0, 200) ?? null,
    };
  }

  async getTree(owner: string, repo: string, treeSha: string): Promise<TreeEntry[]> {
    const base = GitHubClient.repoPath(owner, repo);
    const t = await this.json<{ truncated: boolean; tree: TreeEntry[] }>(`${base}/git/trees/${treeSha}?recursive=1`);
    if (!t.truncated) return t.tree.map(({ path, mode, type, sha, size }) => ({ path, mode, type, sha, ...(size !== undefined ? { size } : {}) }));
    // Truncated listing: walk directory objects one level at a time.
    const out: TreeEntry[] = [];
    const walk = async (sha: string, prefix: string): Promise<void> => {
      const level = await this.json<{ tree: TreeEntry[] }>(`${base}/git/trees/${sha}`);
      for (const e of level.tree) {
        const path = prefix ? `${prefix}/${e.path}` : e.path;
        out.push({ path, mode: e.mode, type: e.type, sha: e.sha, ...(e.size !== undefined ? { size: e.size } : {}) });
        if (e.type === 'tree') await walk(e.sha, path);
      }
    };
    await walk(treeSha, '');
    return out;
  }

  async getBlob(owner: string, repo: string, blobSha: string): Promise<Uint8Array> {
    if (!/^[0-9a-f]{40}$/.test(blobSha)) throw new Error('Invalid blob SHA');
    return this.raw(`${GitHubClient.repoPath(owner, repo)}/git/blobs/${blobSha}`);
  }
}
