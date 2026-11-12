import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GitHubClient, GitHubApiError } from '../../src/adapters/github.ts';
import { ObjectCache } from '../../src/adapters/cache.ts';
import { loadGitHubSnapshot } from '../../src/adapters/snapshot.ts';
import { verifyDeployment } from '../../src/adapters/deployment.ts';
import { computeRootTreeSha, gitBlobSha } from '../../src/engine/git-objects.ts';

const enc = new TextEncoder();
const noSleep = async () => {};

function mockFetch(routes: Record<string, () => Response>, log: string[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    log.push(`${init?.method ?? 'GET'} ${url} auth=${(init?.headers as Record<string, string>)?.Authorization ? 'yes' : 'no'}`);
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (!key) return new Response('not found', { status: 404 });
    return routes[key]!();
  }) as typeof fetch;
}

function tmpCache() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-cache-'));
  return { cache: new ObjectCache(dir), dir };
}

test('retries transient 5xx, then succeeds; only GET is issued', async () => {
  let n = 0;
  const log: string[] = [];
  const client = new GitHubClient({ sleep: noSleep, fetchImpl: mockFetch({ '/x': () => (++n < 3 ? new Response('boom', { status: 502 }) : Response.json({ ok: true })) }, log) });
  assert.deepEqual(await client.json('/x'), { ok: true });
  assert.equal(n, 3);
  assert.ok(log.every((l) => l.startsWith('GET ')));
});

test('404 is not retried and surfaces a typed error', async () => {
  let n = 0;
  const client = new GitHubClient({ sleep: noSleep, fetchImpl: (async () => { n++; return new Response('nope', { status: 404 }); }) as typeof fetch });
  await assert.rejects(client.json('/missing'), (e: unknown) => e instanceof GitHubApiError && e.status === 404);
  assert.equal(n, 1);
});

test('exhausted primary rate limit beyond the wait budget fails fast with guidance', async () => {
  const reset = Math.floor(Date.now() / 1000) + 3600;
  const client = new GitHubClient({
    sleep: noSleep, maxRateLimitWaitMs: 1000,
    fetchImpl: (async () => new Response('rate limited', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } })) as typeof fetch,
  });
  await assert.rejects(client.json('/x'), /rate limit exhausted.*GITHUB_TOKEN/);
});

test('token is sent as a header but never appears in errors or logs', async () => {
  const messages: string[] = [];
  const secret = 'ghp_SECRETSECRETSECRET';
  const client = new GitHubClient({ token: secret, sleep: noSleep, maxRetries: 1, log: (m) => messages.push(m), fetchImpl: (async () => new Response('err', { status: 500 })) as typeof fetch });
  const err = await client.json('/x').catch((e: Error) => e);
  assert.ok(err instanceof Error);
  assert.ok(!String(err.message).includes(secret));
  assert.ok(!messages.join('\n').includes(secret));
});

function fakeRepo() {
  const blob = enc.encode('{"a":1}\n');
  const blobSha = gitBlobSha(blob);
  const sub = [{ path: 'x.json', mode: '100644', type: 'blob' as const, sha: blobSha, size: blob.byteLength }];
  const dirSha = computeRootTreeSha(sub);
  const tree = [
    { path: 'data', mode: '040000', type: 'tree' as const, sha: computeRootTreeSha([{ path: 'asthortera', mode: '040000', type: 'tree' as const, sha: dirSha }, ...sub.map((s) => ({ ...s, path: `asthortera/${s.path}` }))]) },
    { path: 'data/asthortera', mode: '040000', type: 'tree' as const, sha: dirSha },
    { path: 'data/asthortera/x.json', mode: '100644', type: 'blob' as const, sha: blobSha, size: blob.byteLength },
  ];
  const treeSha = computeRootTreeSha(tree);
  return { blob, blobSha, tree, treeSha };
}

test('snapshot verifies commit pin, recomputes the tree SHA and verifies blobs; cache serves repeat reads', async () => {
  const { blob, blobSha, tree, treeSha } = fakeRepo();
  const sha = 'c'.repeat(40);
  let calls = 0;
  const routes = {
    [`/commits/${sha}`]: () => Response.json({ sha, commit: { tree: { sha: treeSha }, committer: { date: '2026-01-01T00:00:00Z' }, message: 'm' } }),
    [`/git/trees/${treeSha}?recursive=1`]: () => Response.json({ truncated: false, tree }),
    [`/git/blobs/${blobSha}`]: () => { calls++; return new Response(blob); },
  };
  const { cache, dir } = tmpCache();
  try {
    const client = new GitHubClient({ sleep: noSleep, fetchImpl: mockFetch(routes) });
    const s = await loadGitHubSnapshot(client, cache, { side: 'production', sha });
    assert.equal(s.identity.tree_sha, treeSha);
    assert.deepEqual(await s.readBlob(blobSha), blob);
    const s2 = await loadGitHubSnapshot(new GitHubClient({ sleep: noSleep, fetchImpl: mockFetch({}) }), cache, { side: 'production', sha });
    assert.deepEqual(await s2.readBlob(blobSha), blob);
    assert.equal(calls, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('snapshot rejects a commit that does not match the pin, a tampered tree and a tampered blob', async () => {
  const { blobSha, tree, treeSha } = fakeRepo();
  const sha = 'c'.repeat(40);
  const { cache, dir } = tmpCache();
  try {
    const wrongCommit = new GitHubClient({ sleep: noSleep, fetchImpl: mockFetch({ [`/commits/${sha}`]: () => Response.json({ sha: 'd'.repeat(40), commit: { tree: { sha: treeSha } } }) }) });
    await assert.rejects(loadGitHubSnapshot(wrongCommit, cache, { side: 'production', sha }), /Commit SHA mismatch/);
    const badTree = tree.map((e) => (e.type === 'blob' ? { ...e, sha: 'e'.repeat(40) } : e));
    const tamperedTree = new GitHubClient({ sleep: noSleep, fetchImpl: mockFetch({
      [`/commits/${sha}`]: () => Response.json({ sha, commit: { tree: { sha: treeSha } } }),
      [`/git/trees/${treeSha}?recursive=1`]: () => Response.json({ truncated: false, tree: badTree }),
    }) });
    await assert.rejects(loadGitHubSnapshot(tamperedTree, cache, { side: 'production', sha }), /Tree integrity failure/);
    const tamperedBlob = new GitHubClient({ sleep: noSleep, fetchImpl: mockFetch({
      [`/commits/${sha}`]: () => Response.json({ sha, commit: { tree: { sha: treeSha } } }),
      [`/git/trees/${treeSha}?recursive=1`]: () => Response.json({ truncated: false, tree }),
      [`/git/blobs/${blobSha}`]: () => new Response('evil'),
    }) });
    const s = await loadGitHubSnapshot(tamperedBlob, cache, { side: 'production', sha });
    await assert.rejects(s.readBlob(blobSha), /Blob integrity failure/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('cache evicts a corrupted blob and refuses to store mismatched content', () => {
  const { cache, dir } = tmpCache();
  try {
    const bytes = enc.encode('x');
    const sha = gitBlobSha(bytes);
    cache.putBlob(sha, bytes);
    fs.writeFileSync(path.join(dir, 'blobs', sha.slice(0, 2), sha.slice(2)), 'corrupt');
    assert.equal(cache.getBlob(sha), null);
    assert.throws(() => cache.putBlob(sha, enc.encode('y')), /mismatched SHA/);
    assert.throws(() => cache.getJson('../etc', 'x'), /Unsafe cache key/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('deployment records are evidence but never verify; production main is never substituted', async () => {
  const main = 'f'.repeat(40);
  const client = new GitHubClient({ sleep: noSleep, fetchImpl: mockFetch({
    '/deployments?environment=Production&per_page=1': () => Response.json([{ id: 1, sha: 'a'.repeat(40), environment: 'Production', created_at: '2026-10-18T00:00:00Z', creator: { login: 'vercel[bot]' } }]),
    [`/compare/${'a'.repeat(40)}...${main}`]: () => Response.json({ status: 'ahead', ahead_by: 305 }),
  }) });
  const v = await verifyDeployment(client, { productionMainSha: main });
  assert.equal(v.status, 'DEPLOYMENT_UNVERIFIED');
  assert.equal(v.deployed_sha, null);
  assert.ok(v.evidence.every((e) => !e.accepted));
  assert.match(v.evidence[0]!.reason, /305 commits ahead/);
});

test('only a live build identifier verifies deployment', async () => {
  const main = 'f'.repeat(40), live = '1'.repeat(40);
  const client = new GitHubClient({ sleep: noSleep, fetchImpl: mockFetch({ '/deployments?environment=Production&per_page=1': () => Response.json([]) }) });
  const v = await verifyDeployment(client, {
    productionMainSha: main, buildInfoUrl: 'https://example.invalid/build.json',
    fetchImpl: (async () => Response.json({ commit_sha: live })) as typeof fetch,
  });
  assert.equal(v.status, 'DEPLOYMENT_VERIFIED');
  assert.equal(v.deployed_sha, live);
  const insecure = await verifyDeployment(client, { productionMainSha: main, buildInfoUrl: 'http://example.invalid/b.json' });
  assert.equal(insecure.status, 'DEPLOYMENT_UNVERIFIED');
});
