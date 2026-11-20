/**
 * RS-DEPLOY-SHA-005: deterministic regression tests for Statistics deployment verification.
 * A virtual clock and scripted responses replace sleeps and the network. Incident values are replayed as
 * evidence (publish jobs 134146175220 and 134084517750) and are never used as production expectations.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BUILD_INFO_SCHEMA,
  DEFAULT_POLICY,
  MAIN_REF_TIMEOUT_MS,
  POLICY_LIMITS,
  captureDeploymentUrl,
  createFetchTransport,
  extractDeploymentOrigins,
  parseCanonicalOrigin,
  parseDeploymentOrigin,
  parseLsRemoteMain,
  parseVerifyArgs,
  resolvePolicy,
  runVerifyDeploymentCli,
  safeHeaders,
  verifyStatisticsDeployment,
  type AttemptOutcome,
  type ProbeTransport,
  type TargetKind,
  type VerificationResult,
  type VerifyRequest,
} from '../../scripts/lib/statistics-deployment-verification.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CUSTOM_HOST = 'statistics.reltroner.com';
const CANONICAL = `https://${CUSTOM_HOST}`;
const UNIQUE_HOST = '3b64e356.reltroner-statistics.pages.dev';
const UNIQUE = `https://${UNIQUE_HOST}`;

// Replayed incident evidence (RS-DEPLOY-SHA-005 incident record, PR #11; the document itself is kept outside Git).
const NEW_SHA = '92ad608e1d22193120a2fb9a0b42993271797a84';
const OLD_SHA = '1dbca25ff3b8e12b1919038967bbfb23f8a4bfce';
const DIGEST = '4119d30b2c2d7ea14b95fe08c2d53365de966acaeb343a2a772e26d42a28e08d';
const PRODUCTION = 'ad895e6d9184f09281a7cc14ccd7867c47acd29e';
const REMODELING = '33ea8fa5472a723d640f1adbea35f686a65b3e27';
const OTHER_SHA = 'e'.repeat(40);
const OTHER_DIGEST = 'f'.repeat(64);

/** Wrangler 4.161.0 output of the incident deploy step, verbatim. */
const WRANGLER_LOG = [
  '',
  ' ⛅️ wrangler 4.161.0',
  '────────────────────',
  '✨ Compiled Worker successfully',
  'Uploading... (234/2745)',
  'Uploading... (2745/2745)',
  '✨ Success! Uploaded 2511 files (234 already uploaded) (11.46 sec)',
  '',
  '✨ Uploading _headers',
  '✨ Uploading Functions bundle',
  '🌎 Deploying...',
  `✨ Deployment complete! Take a peek over at ${UNIQUE}`,
  '',
].join('\n');

type Json = Record<string, unknown>;

function buildInfo(overrides: Json = {}): Json {
  return {
    schema_version: BUILD_INFO_SCHEMA,
    statistics_commit: NEW_SHA,
    statistics_tree_clean: true,
    semantic_digest: DIGEST,
    rules_version: 'P0R-2.0.0',
    sources: { production: PRODUCTION, remodeling: REMODELING },
    studio_deployment: 'DEPLOYMENT_UNVERIFIED',
    analysis_generated_at: '2026-11-17T15:15:47.606Z',
    ...overrides,
  };
}
const stale = (overrides: Json = {}) => buildInfo({ statistics_commit: OLD_SHA, ...overrides });

type Step =
  | { readonly status: number; readonly json?: unknown; readonly raw?: string; readonly headers?: Record<string, string>; readonly latencyMs?: number; readonly tooLarge?: boolean }
  | { readonly fail: 'timeout' }
  | { readonly fail: 'network'; readonly code?: string };

const ok = (json: unknown, headers: Record<string, string> = {}): Step => ({ status: 200, json, headers });
const httpStatus = (status: number): Step => ({ status });
const timeoutError = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });

interface Harness {
  readonly transport: ProbeTransport;
  readonly clock: { now(): number; sleep(ms: number): Promise<void> };
  readonly calls: Array<{ readonly host: string; readonly url: string; readonly timeoutMs: number; readonly at: number }>;
  readonly sleeps: number[];
  readonly unexpected: string[];
}

/** Scripted responses per host (the last step repeats forever) on a virtual clock. */
function harness(scripts: Record<string, readonly Step[]>, options: { frozenClock?: boolean } = {}): Harness {
  let now = 0;
  const calls: Harness['calls'] = [];
  const sleeps: number[] = [];
  const unexpected: string[] = [];
  const cursor = new Map<string, number>();
  const advance = (ms: number) => { if (!options.frozenClock) now += ms; };
  const transport: ProbeTransport = async (url, { timeoutMs }) => {
    const host = new URL(url).host;
    calls.push({ host, url, timeoutMs, at: now });
    const script = scripts[host];
    if (!script || script.length === 0) {
      unexpected.push(url);
      throw new Error(`unscripted request to ${host}`);
    }
    const index = cursor.get(host) ?? 0;
    cursor.set(host, index + 1);
    const step = script[Math.min(index, script.length - 1)]!;
    if ('fail' in step) {
      if (step.fail === 'timeout') {
        advance(timeoutMs);
        throw timeoutError();
      }
      advance(25);
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: step.code ?? 'ECONNRESET' } });
    }
    const latency = step.latencyMs ?? 40;
    if (latency > timeoutMs) {
      advance(timeoutMs);
      throw timeoutError();
    }
    advance(latency);
    const body = step.status === 200 && !step.tooLarge ? step.raw ?? JSON.stringify(step.json) : null;
    return { status: step.status, headers: new Headers(step.headers ?? {}), body, bodyTooLarge: step.tooLarge === true };
  };
  const clock = { now: () => now, sleep: async (ms: number) => { sleeps.push(ms); advance(ms); } };
  return { transport, clock, calls, sleeps, unexpected };
}

async function verify(
  scripts: Record<string, readonly Step[]>,
  request: Partial<VerifyRequest> = {},
  extra: { resolveMainSha?: () => Promise<string>; frozenClock?: boolean } = {},
) {
  const h = harness(scripts, { frozenClock: extra.frozenClock ?? false });
  const logs: string[] = [];
  const result = await verifyStatisticsDeployment(
    { url: CANONICAL, canonicalOrigin: CANONICAL, expectedRaw: buildInfo(), ...request },
    { transport: h.transport, clock: h.clock, resolveMainSha: extra.resolveMainSha, log: (line) => logs.push(line) },
  );
  return { result, logs, ...h };
}

const outcomes = (result: VerificationResult, target: TargetKind = 'custom_domain'): AttemptOutcome[] =>
  result.history.filter((record) => record.target === target).map((record) => record.outcome);
const legacyFields = (result: VerificationResult) =>
  ({ status: result.status, url: result.url, mismatches: result.mismatches, live_commit: result.live_commit });

/** Invariants every verification run must satisfy, whatever its outcome. */
function assertBounded(result: VerificationResult, h: Harness): void {
  const policy = result.policy;
  assert.deepEqual(h.unexpected, [], 'no request may leave the allowlisted, scripted hosts');
  assert.equal(result.history.length, h.calls.length, 'every request is recorded exactly once');
  for (const call of h.calls) {
    assert.ok(call.timeoutMs >= 1 && call.timeoutMs <= policy.requestTimeoutMs, `request timeout ${call.timeoutMs} out of bounds`);
  }
  for (const ms of h.sleeps) {
    assert.ok(ms > 0 && ms <= Math.max(policy.maxIntervalMs, policy.confirmationIntervalMs), `sleep ${ms} out of bounds`);
  }
  assert.ok(result.custom_domain.attempts <= policy.maxAttemptsPerTarget);
  assert.ok(result.deployment_artifact.attempts <= policy.maxAttemptsPerTarget);
  assert.ok(result.custom_domain.elapsed_ms <= policy.customDomainDeadlineMs, 'custom-domain phase overran its deadline');
  assert.ok(result.deployment_artifact.elapsed_ms <= policy.deploymentDeadlineMs, 'deployment phase overran its deadline');
  const verified = result.status === 'STATISTICS_DEPLOYMENT_VERIFIED';
  assert.equal(verified, result.mismatches.length === 0, 'legacy invariant: verified exactly when mismatches is empty');
  assert.equal(verified, result.reason === 'VERIFIED');
  assert.equal(verified, result.failed_target === null);
}

/** Faithful transcription of the verifier loop before RS-DEPLOY-SHA-005 (scripts/verify-deployment.ts at 92ad608e). */
async function legacyVerify(transport: ProbeTransport, sleep: (ms: number) => Promise<void>, local: Json) {
  let live: Json | null = null;
  for (let attempt = 0; attempt < 6 && !live; attempt++) {
    try {
      const res = await transport(`${CANONICAL}/build-info.json`, { timeoutMs: 300_000, maxBodyBytes: 1_048_576 });
      if (res.status >= 200 && res.status <= 299) live = JSON.parse(res.body ?? '') as Json;
    } catch { /* propagation delay */ }
    if (!live) await sleep(10_000);
  }
  const observed = live;
  const keys = ['statistics_commit', 'semantic_digest', 'rules_version', 'sources'] as const;
  const mismatches = observed ? keys.filter((k) => JSON.stringify(observed[k]) !== JSON.stringify(local[k])) : ['unreachable'];
  return {
    status: mismatches.length ? 'STATISTICS_DEPLOYMENT_UNVERIFIED' : 'STATISTICS_DEPLOYMENT_VERIFIED',
    url: CANONICAL,
    mismatches,
    live_commit: observed?.statistics_commit ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Root cause and incident replays
// ---------------------------------------------------------------------------------------------

test('root cause: the pre-RS-DEPLOY-SHA-005 loop ended on the first HTTP 200 even when it carried the previous build', async () => {
  const scripts = { [CUSTOM_HOST]: [ok(stale()), ok(buildInfo())] };
  const old = harness(scripts);
  const legacy = await legacyVerify(old.transport, old.clock.sleep, buildInfo());
  // Exactly the verdict publish job 134146175220 printed at 2026-11-17T15:24:19Z, 0.78 s after "Deployment complete".
  assert.deepEqual(legacy, { status: 'STATISTICS_DEPLOYMENT_UNVERIFIED', url: CANONICAL, mismatches: ['statistics_commit'], live_commit: OLD_SHA });
  assert.equal(old.calls.length, 1, 'one request, no retry of a mismatching 200');
  assert.deepEqual(old.sleeps, [], 'no wait at all');

  const { result, logs, ...h } = await verify(scripts);
  assert.equal(result.status, 'STATISTICS_DEPLOYMENT_VERIFIED');
  assert.deepEqual(outcomes(result), ['PROPAGATING', 'MATCH', 'MATCH']);
  const first = result.history[0]!;
  assert.equal(first.http_status, 200);
  assert.equal(first.observed_commit, OLD_SHA);
  assert.equal(first.expected_commit, NEW_SHA);
  assert.deepEqual(first.mismatched_fields, ['statistics_commit']);
  assert.equal(result.custom_domain.state, 'CUSTOM_DOMAIN_CONVERGED');
  assert.match(logs[0] ?? '', /custom_domain #1 .* HTTP 200 PROPAGATING observed=1dbca25ff3b8 expected=92ad608e1d22 mismatched=statistics_commit/);
  assertBounded(result, h);
});

test('replays publish job 134084517750: a whole previous snapshot (commit, digest, source) is PROPAGATING, then converges', async () => {
  const previous = buildInfo({
    statistics_commit: 'fc37812b6cad68cfb707fdcdd07d7a0e417825df',
    semantic_digest: OTHER_DIGEST,
    sources: { production: OTHER_SHA, remodeling: REMODELING },
  });
  const old = harness({ [CUSTOM_HOST]: [ok(previous), ok(buildInfo())] });
  const legacy = await legacyVerify(old.transport, old.clock.sleep, buildInfo());
  assert.deepEqual(legacy.mismatches, ['statistics_commit', 'semantic_digest', 'sources']);

  const { result, ...h } = await verify({ [CUSTOM_HOST]: [ok(previous), ok(previous), ok(buildInfo())] });
  assert.equal(result.reason, 'VERIFIED');
  assert.deepEqual(outcomes(result), ['PROPAGATING', 'PROPAGATING', 'MATCH', 'MATCH']);
  assert.deepEqual(result.history[0]!.mismatched_fields, ['statistics_commit', 'semantic_digest', 'sources.production']);
  assertBounded(result, h);
});

// ---------------------------------------------------------------------------------------------
// Convergence policy
// ---------------------------------------------------------------------------------------------

test('HTTP 200 with the old build forever fails closed at the deadline, never as success', async () => {
  const { result, sleeps, ...h } = await verify({ [CUSTOM_HOST]: [ok(stale())] });
  assert.equal(result.reason, 'TIMED_OUT');
  assert.equal(result.failed_target, 'custom_domain');
  assert.equal(result.custom_domain.state, 'CUSTOM_DOMAIN_NOT_CONVERGED');
  // The legacy fields carry the same verdict the old verifier printed for this state.
  assert.deepEqual(legacyFields(result), { status: 'STATISTICS_DEPLOYMENT_UNVERIFIED', url: CANONICAL, mismatches: ['statistics_commit'], live_commit: OLD_SHA });
  assert.ok(outcomes(result).every((outcome) => outcome === 'PROPAGATING'));
  // Default schedule, exactly: 14 reads, backoff 2/4/8/10 s, finished before the 120 s deadline.
  assert.equal(result.custom_domain.attempts, 14);
  assert.deepEqual(sleeps, [2_000, 4_000, 8_000, ...Array<number>(10).fill(10_000)]);
  assert.equal(result.custom_domain.elapsed_ms, 114_560);
  assertBounded(result, { sleeps, ...h });
});

test('one matching read followed by the old build is not convergence: consecutive confirmation is required', async () => {
  const flap = await verify({ [CUSTOM_HOST]: [ok(buildInfo()), ok(stale()), ok(buildInfo())] });
  assert.equal(flap.result.reason, 'VERIFIED');
  assert.deepEqual(outcomes(flap.result), ['MATCH', 'PROPAGATING', 'MATCH', 'MATCH']);
  assert.equal(flap.result.custom_domain.consecutive_matches, 2);
  assert.equal(flap.sleeps[0], DEFAULT_POLICY.confirmationIntervalMs, 'a first match waits the confirmation interval');
  assertBounded(flap.result, flap);

  const once = await verify({ [CUSTOM_HOST]: [ok(buildInfo()), ok(stale())] });
  assert.equal(once.result.reason, 'TIMED_OUT');
  assert.deepEqual(legacyFields(once.result).mismatches, ['statistics_commit']);
  assert.equal(once.result.live_commit, OLD_SHA);
  assertBounded(once.result, once);

  // A lone match just before the deadline, with no confirming read, stays unverified.
  const late = await verify({ [CUSTOM_HOST]: [...Array<Step>(13).fill(ok(stale())), ok(buildInfo()), { fail: 'timeout' }] });
  assert.equal(late.result.reason, 'TIMED_OUT');
  assert.deepEqual(late.result.mismatches, ['unconfirmed']);
  assert.equal(late.result.custom_domain.consecutive_matches, 0);
  assertBounded(late.result, late);
});

test('404, 5xx, network errors and request timeouts are retried with bounded backoff, then verified', async () => {
  const { result, ...h } = await verify({
    [CUSTOM_HOST]: [httpStatus(404), httpStatus(503), { fail: 'network', code: 'ECONNRESET' }, { fail: 'timeout' }, httpStatus(522), ok(buildInfo())],
  });
  assert.equal(result.reason, 'VERIFIED');
  assert.deepEqual(outcomes(result), ['HTTP_STATUS', 'HTTP_STATUS', 'NETWORK_ERROR', 'REQUEST_TIMEOUT', 'HTTP_STATUS', 'MATCH', 'MATCH']);
  assert.equal(result.history[2]!.detail, 'ECONNRESET');
  assert.equal(result.history[3]!.detail, 'TimeoutError');
  assert.equal(result.history[3]!.duration_ms, DEFAULT_POLICY.requestTimeoutMs);
  assertBounded(result, h);
});

test('persistent request timeouts end UNREACHABLE inside the deadline; every request is individually bounded', async () => {
  const { result, ...h } = await verify({ [CUSTOM_HOST]: [{ fail: 'timeout' }] });
  assert.equal(result.reason, 'UNREACHABLE');
  assert.deepEqual(legacyFields(result), { status: 'STATISTICS_DEPLOYMENT_UNVERIFIED', url: CANONICAL, mismatches: ['unreachable'], live_commit: null });
  assert.ok(outcomes(result).every((outcome) => outcome === 'REQUEST_TIMEOUT'));
  assert.equal(result.custom_domain.attempts, 7);
  assertBounded(result, h);
});

test('a clock that never advances still terminates through the per-target attempt cap', async () => {
  const { result, calls } = await verify({ [CUSTOM_HOST]: [ok(stale())] }, {}, { frozenClock: true });
  assert.equal(result.reason, 'TIMED_OUT');
  assert.equal(calls.length, DEFAULT_POLICY.maxAttemptsPerTarget);
});

test('identical inputs give identical attempts, waits, diagnostics and progress lines', async () => {
  const scenario = () => verify(
    { [UNIQUE_HOST]: [httpStatus(404), ok(buildInfo())], [CUSTOM_HOST]: [ok(stale()), httpStatus(503), ok(stale()), ok(buildInfo())] },
    { deploymentOrigin: UNIQUE },
  );
  const a = await scenario();
  const b = await scenario();
  assert.equal(a.result.reason, 'VERIFIED');
  assert.deepEqual(a.result, b.result);
  assert.deepEqual(a.sleeps, b.sleeps);
  assert.deepEqual(a.logs, b.logs);
  assertBounded(a.result, a);
});

// ---------------------------------------------------------------------------------------------
// Identity: every field, one response
// ---------------------------------------------------------------------------------------------

test('the expected SHA with a wrong digest, rules version or source SHA is refused until every field matches', async () => {
  const cases: Array<[string, Json, string[], string[]]> = [
    ['semantic_digest', { semantic_digest: OTHER_DIGEST }, ['semantic_digest'], ['semantic_digest']],
    ['rules_version', { rules_version: 'P0R-1.9.0' }, ['rules_version'], ['rules_version']],
    ['sources.production', { sources: { production: OTHER_SHA, remodeling: REMODELING } }, ['sources'], ['sources.production']],
    ['sources.remodeling', { sources: { production: PRODUCTION, remodeling: OTHER_SHA } }, ['sources'], ['sources.remodeling']],
  ];
  for (const [label, overrides, keys, fields] of cases) {
    const wrong = buildInfo(overrides);
    const forever = await verify({ [CUSTOM_HOST]: [ok(wrong)] });
    assert.equal(forever.result.reason, 'TIMED_OUT', label);
    assert.deepEqual(forever.result.mismatches, keys, label);
    assert.deepEqual(forever.result.custom_domain.last_observed?.mismatched_fields, fields, label);
    assert.equal(forever.result.live_commit, NEW_SHA, `${label}: a matching commit alone is not accepted`);
    assert.ok(outcomes(forever.result).every((outcome) => outcome === 'PROPAGATING'), label);
    assertBounded(forever.result, forever);

    const healed = await verify({ [CUSTOM_HOST]: [ok(wrong), ok(wrong), ok(buildInfo())] });
    assert.equal(healed.result.reason, 'VERIFIED', label);
    assert.deepEqual(outcomes(healed.result), ['PROPAGATING', 'PROPAGATING', 'MATCH', 'MATCH'], label);
  }
});

test('fields observed in different responses are never combined into a match', async () => {
  const rightCommit = buildInfo({ semantic_digest: OTHER_DIGEST });
  const rightDigest = stale();
  const rightSources = buildInfo({ statistics_commit: OLD_SHA, rules_version: 'P0R-1.9.0' });
  const rotation = Array.from({ length: 15 }, (_, i) => ok([rightCommit, rightDigest, rightSources][i % 3]));
  const { result, ...h } = await verify({ [CUSTOM_HOST]: rotation });
  assert.equal(result.reason, 'TIMED_OUT');
  assert.ok(!outcomes(result).includes('MATCH'), 'no single response matched, so nothing may verify');
  assertBounded(result, h);
});

test('the expected identity comes only from a complete local artifact for the commit being published', async () => {
  const otherCommit = await verify({ [CUSTOM_HOST]: [ok(buildInfo())] }, { expectedSha: OTHER_SHA });
  assert.equal(otherCommit.result.reason, 'EXPECTED_IDENTITY_INVALID');
  assert.deepEqual(otherCommit.result.mismatches, ['expected_identity']);
  assert.equal(otherCommit.calls.length, 0, 'nothing is fetched for an artifact of another commit');

  const unreadable = await verify({ [CUSTOM_HOST]: [ok(buildInfo())] }, { expectedRaw: undefined, expectedReadError: 'ENOENT' });
  assert.equal(unreadable.result.reason, 'EXPECTED_IDENTITY_INVALID');
  assert.equal(unreadable.calls.length, 0);

  // Latent fail-open in the old verifier: a build without a commit compared null === null as "verified".
  const nullBuild = buildInfo({ statistics_commit: null });
  const old = harness({ [CUSTOM_HOST]: [ok(nullBuild)] });
  assert.equal((await legacyVerify(old.transport, old.clock.sleep, nullBuild)).status, 'STATISTICS_DEPLOYMENT_VERIFIED');
  const closed = await verify({ [CUSTOM_HOST]: [ok(nullBuild)] }, { expectedRaw: nullBuild });
  assert.equal(closed.result.reason, 'EXPECTED_IDENTITY_INVALID');
  assert.equal(closed.calls.length, 0);
  assert.match(closed.result.detail ?? '', /statistics_commit/);
});

// ---------------------------------------------------------------------------------------------
// Unique deployment URL (artifact evidence) versus the custom domain
// ---------------------------------------------------------------------------------------------

test('a valid unique deployment URL never substitutes for the custom domain', async () => {
  const staleDomain = await verify({ [UNIQUE_HOST]: [ok(buildInfo())], [CUSTOM_HOST]: [ok(stale())] }, { deploymentOrigin: UNIQUE });
  assert.equal(staleDomain.result.reason, 'TIMED_OUT');
  assert.equal(staleDomain.result.failed_target, 'custom_domain');
  assert.equal(staleDomain.result.deployment_artifact.state, 'DEPLOYMENT_ARTIFACT_VALID');
  assert.equal(staleDomain.result.custom_domain.state, 'CUSTOM_DOMAIN_NOT_CONVERGED');
  assert.equal(staleDomain.calls[0]!.host, UNIQUE_HOST, 'artifact evidence is read first');
  assertBounded(staleDomain.result, staleDomain);

  const converges = await verify(
    { [UNIQUE_HOST]: [httpStatus(404), ok(buildInfo())], [CUSTOM_HOST]: [ok(stale()), ok(buildInfo())] },
    { deploymentOrigin: UNIQUE },
  );
  assert.equal(converges.result.reason, 'VERIFIED');
  assert.equal(converges.result.deployment_artifact.state, 'DEPLOYMENT_ARTIFACT_VALID');
  assert.equal(converges.result.custom_domain.state, 'CUSTOM_DOMAIN_CONVERGED');
  assert.deepEqual(outcomes(converges.result, 'deployment_artifact'), ['HTTP_STATUS', 'MATCH']);
  assert.deepEqual(outcomes(converges.result), ['PROPAGATING', 'MATCH', 'MATCH']);
  assertBounded(converges.result, converges);
});

test('a correct custom domain cannot hide a wrong unique deployment artifact', async () => {
  const wrong = await verify({ [UNIQUE_HOST]: [ok(stale())], [CUSTOM_HOST]: [ok(buildInfo())] }, { deploymentOrigin: UNIQUE });
  assert.equal(wrong.result.reason, 'DEPLOYMENT_ARTIFACT_MISMATCH');
  assert.equal(wrong.result.failed_target, 'deployment_artifact');
  assert.equal(wrong.result.deployment_artifact.state, 'DEPLOYMENT_ARTIFACT_INVALID');
  assert.equal(wrong.result.deployment_artifact.observed_commit, OLD_SHA);
  assert.equal(wrong.result.custom_domain.state, 'NOT_CHECKED');
  assert.deepEqual(legacyFields(wrong.result), { status: 'STATISTICS_DEPLOYMENT_UNVERIFIED', url: CANONICAL, mismatches: ['deployment_artifact'], live_commit: null });
  assert.equal(wrong.calls.length, 1, 'an immutable deployment URL does not propagate: another build there is final');
  assertBounded(wrong.result, wrong);

  const gone = await verify({ [UNIQUE_HOST]: [httpStatus(404)], [CUSTOM_HOST]: [ok(buildInfo())] }, { deploymentOrigin: UNIQUE });
  assert.equal(gone.result.reason, 'UNREACHABLE');
  assert.equal(gone.result.deployment_artifact.state, 'DEPLOYMENT_ARTIFACT_UNVERIFIED');
  assert.ok(gone.calls.every((call) => call.host === UNIQUE_HOST), 'custom domain is not consulted without artifact evidence');
  assertBounded(gone.result, gone);
});

// ---------------------------------------------------------------------------------------------
// Malformed responses, redirects and origins: fail safely, no outbound fetch beyond the allowlist
// ---------------------------------------------------------------------------------------------

test('wrong JSON shape, invalid JSON, HTML and oversized bodies fail closed immediately', async () => {
  const bodies: Array<[string, Step, string]> = [
    ['html', { status: 200, raw: '<!doctype html><title>Not build info</title>' }, 'INVALID_JSON'],
    ['truncated', { status: 200, raw: '{"statistics_commit":' }, 'INVALID_JSON'],
    ['array', ok([buildInfo()]), 'INVALID_SHAPE:not_a_json_object'],
    ['null commit', ok(buildInfo({ statistics_commit: null })), 'INVALID_SHAPE:statistics_commit'],
    ['short digest', ok(buildInfo({ semantic_digest: 'abc' })), 'INVALID_SHAPE:semantic_digest'],
    ['missing sources', ok(buildInfo({ sources: undefined })), 'INVALID_SHAPE:sources'],
    ['foreign schema', ok(buildInfo({ schema_version: 'another-project-build.v1' })), 'INVALID_SHAPE:schema_version'],
    ['oversized', { status: 200, tooLarge: true }, 'BODY_TOO_LARGE'],
  ];
  for (const [label, step, detail] of bodies) {
    const { result, ...h } = await verify({ [CUSTOM_HOST]: [step, ok(buildInfo())] });
    assert.equal(result.reason, 'MALFORMED', label);
    assert.equal(result.history.length, 1, `${label}: terminal, never retried into a later success`);
    assert.equal(result.history[0]!.detail, detail, label);
    assert.deepEqual(result.mismatches, ['unreachable'], label);
    assertBounded(result, h);
  }
});

test('redirects are refused and never followed: no request reaches the Location host', async () => {
  const cases: Array<[string, string]> = [
    ['https://evil.example/build-info.json?token=abc', 'evil.example'],
    ['//evil.example/x', 'evil.example'],
    ['/build-info.json', CUSTOM_HOST],
    ['https://statistics.reltroner.com.evil.example/', 'statistics.reltroner.com.evil.example'],
  ];
  for (const [location, host] of cases) {
    const { result, ...h } = await verify({ [CUSTOM_HOST]: [{ status: 302, headers: { location } }, ok(buildInfo())] });
    assert.equal(result.reason, 'REDIRECT_REFUSED', location);
    assert.equal(h.calls.length, 1, location);
    assert.equal(result.history[0]!.headers.location_host, host, location);
    assert.ok(!JSON.stringify(result).includes('token=abc'), 'only the redirect host is recorded');
    assertBounded(result, h);
  }
});

test('only TLS Statistics origins and unique Statistics deployment URLs are accepted', () => {
  assert.equal(parseCanonicalOrigin('https://statistics.reltroner.com'), CANONICAL);
  assert.equal(parseCanonicalOrigin('https://statistics.reltroner.com/'), CANONICAL);
  assert.equal(parseCanonicalOrigin('https://reltroner-statistics.pages.dev'), 'https://reltroner-statistics.pages.dev');
  for (const bad of [
    'http://statistics.reltroner.com', 'https://statistics.reltroner.com:443', 'https://statistics.reltroner.com:8443',
    'https://statistics.reltroner.com/build-info.json', 'https://statistics.reltroner.com?x=1', 'https://statistics.reltroner.com#x',
    'https://statistics.reltroner.com.evil.example', 'https://statistics.reltroner.com@evil.example', 'https://user@statistics.reltroner.com',
    'https://Statistics.Reltroner.com', 'https://reltroner.com', 'https://www.reltroner.com', 'https://lms.reltroner.com',
    'https://hrm.reltroner.com', 'https://stats.reltroner.com', UNIQUE, 'https://evil.example', '', 'statistics.reltroner.com',
  ]) {
    assert.equal(parseCanonicalOrigin(bad), null, bad);
  }
  assert.equal(parseDeploymentOrigin(UNIQUE), UNIQUE);
  assert.equal(parseDeploymentOrigin(`${UNIQUE}/`), UNIQUE);
  for (const bad of [
    'https://reltroner-statistics.pages.dev', 'https://main.reltroner-statistics.pages.dev', 'http://3b64e356.reltroner-statistics.pages.dev',
    'https://3B64E356.reltroner-statistics.pages.dev', 'https://3b64e35.reltroner-statistics.pages.dev', 'https://3b64e3566.reltroner-statistics.pages.dev',
    'https://3b64e356.reltroner-studio-cf.pages.dev', 'https://3b64e356.lms-fe.pages.dev', 'https://3b64e356.reltroner-statistics.pages.dev.evil.example',
    'https://3b64e356.reltroner-statistics.pages.dev:443', 'https://3b64e356.reltroner-statistics.pages.dev/build-info.json',
    'https://x@3b64e356.reltroner-statistics.pages.dev', CANONICAL, '',
  ]) {
    assert.equal(parseDeploymentOrigin(bad), null, bad);
  }
});

test('deployment URL capture takes exactly one URL from this run and ignores lookalikes and other projects', () => {
  assert.deepEqual(extractDeploymentOrigins(WRANGLER_LOG), [UNIQUE]);
  assert.deepEqual(extractDeploymentOrigins(`${WRANGLER_LOG}\nsee ${UNIQUE}/ and ${UNIQUE}.\n`), [UNIQUE], 'one URL repeated is one URL');
  for (const text of [
    'https://3b64e356.reltroner-statistics.pages.dev.evil.example',
    'https://3b64e356.reltroner-statistics.pages.dev@evil.example',
    'https://3b64e356.reltroner-statistics.pages.devx',
    'https://3b64e356.reltroner-statistics.pages.dev-x.example',
    'https://3b64e356.reltroner-statistics.pages.dev:8443',
    'https://3b64e356.reltroner-studio-cf.pages.dev',
    'https://main.reltroner-statistics.pages.dev',
    'https://reltroner-statistics.pages.dev',
    'http://3b64e356.reltroner-statistics.pages.dev',
    'https://3B64E356.reltroner-statistics.pages.dev',
    'https://x3b64e356.reltroner-statistics.pages.dev',
  ]) {
    assert.deepEqual(extractDeploymentOrigins(text), [], text);
  }
  const captured = captureDeploymentUrl(['wrangler.log'], () => WRANGLER_LOG);
  assert.deepEqual(captured, { exitCode: 0, stdout: `deployment_url=${UNIQUE}\n`, stderr: '' });
  const two = captureDeploymentUrl(['wrangler.log'], () => `${WRANGLER_LOG}\nhttps://c7f9987c.reltroner-statistics.pages.dev\n`);
  assert.equal(two.exitCode, 1);
  assert.equal(two.stdout, '', 'nothing reaches GITHUB_OUTPUT when capture fails');
  assert.match(two.stderr, /found 2/);
  assert.equal(captureDeploymentUrl(['wrangler.log'], () => 'Uploading... (2745/2745)\n').exitCode, 1);
  assert.equal(captureDeploymentUrl(['wrangler.log'], () => { throw new Error('ENOENT'); }).exitCode, 1);
  assert.equal(captureDeploymentUrl(['wrangler.log'], () => 'x'.repeat(8 * 1024 * 1024 + 1)).exitCode, 1);
  assert.equal(captureDeploymentUrl([], () => WRANGLER_LOG).exitCode, 2);
  assert.equal(captureDeploymentUrl(['a', 'b'], () => WRANGLER_LOG).exitCode, 2);
});

// ---------------------------------------------------------------------------------------------
// GitHub main: a newer main means the candidate is stale, whatever the site serves
// ---------------------------------------------------------------------------------------------

test('main advanced since the candidate build: STALE_DEPLOY_BLOCKED before any site request', async () => {
  const { result, calls } = await verify(
    { [CUSTOM_HOST]: [ok(buildInfo())] },
    { expectedSha: NEW_SHA, requireCurrentMain: true },
    { resolveMainSha: async () => OTHER_SHA },
  );
  assert.equal(result.reason, 'STALE_DEPLOY_BLOCKED');
  assert.equal(result.main_ref.state, 'MAIN_ADVANCED');
  assert.equal(result.main_ref.before, OTHER_SHA);
  assert.deepEqual(result.mismatches, ['main_ref']);
  assert.equal(calls.length, 0);
});

test('main advancing while the custom domain converges is STALE_DEPLOY_BLOCKED, not accepted under the old SHA', async () => {
  const answers = [NEW_SHA, OTHER_SHA];
  const raced = await verify(
    { [CUSTOM_HOST]: [ok(stale()), ok(buildInfo())] },
    { expectedSha: NEW_SHA, requireCurrentMain: true },
    { resolveMainSha: async () => answers.shift() ?? OTHER_SHA },
  );
  assert.equal(raced.result.reason, 'STALE_DEPLOY_BLOCKED');
  assert.equal(raced.result.status, 'STATISTICS_DEPLOYMENT_UNVERIFIED');
  assert.equal(raced.result.custom_domain.state, 'CUSTOM_DOMAIN_CONVERGED');
  assert.deepEqual([raced.result.main_ref.before, raced.result.main_ref.after], [NEW_SHA, OTHER_SHA]);
  assertBounded(raced.result, raced);

  const unresolved = await verify(
    { [CUSTOM_HOST]: [ok(buildInfo())] },
    { expectedSha: NEW_SHA, requireCurrentMain: true },
    { resolveMainSha: async () => { throw new Error('network down'); } },
  );
  assert.equal(unresolved.result.reason, 'MAIN_REF_UNRESOLVED');
  assert.equal(unresolved.result.main_ref.state, 'UNRESOLVED');
  assert.equal(unresolved.calls.length, 0);

  const missingResolver = await verify({ [CUSTOM_HOST]: [ok(buildInfo())] }, { expectedSha: NEW_SHA, requireCurrentMain: true });
  assert.equal(missingResolver.result.reason, 'MAIN_REF_UNRESOLVED', 'no resolver is no evidence');

  const current = await verify(
    { [UNIQUE_HOST]: [ok(buildInfo())], [CUSTOM_HOST]: [ok(stale()), ok(buildInfo())] },
    { expectedSha: NEW_SHA, requireCurrentMain: true, deploymentOrigin: UNIQUE },
    { resolveMainSha: async () => NEW_SHA },
  );
  assert.equal(current.result.reason, 'VERIFIED');
  assert.equal(current.result.main_ref.state, 'MAIN_EQUALS_EXPECTED');
  assert.deepEqual([current.result.main_ref.before, current.result.main_ref.after], [NEW_SHA, NEW_SHA]);
  assert.equal(current.result.deployment_artifact.state, 'DEPLOYMENT_ARTIFACT_VALID');
  assert.equal(current.result.custom_domain.state, 'CUSTOM_DOMAIN_CONVERGED');
  assertBounded(current.result, current);
});

test('git ls-remote output for main is parsed strictly', () => {
  assert.equal(parseLsRemoteMain(`${NEW_SHA}\trefs/heads/main\n`), NEW_SHA);
  assert.equal(parseLsRemoteMain(`${NEW_SHA}\trefs/heads/main\r\n`), NEW_SHA);
  for (const bad of ['', `${NEW_SHA}\trefs/heads/main-old\n`, `${NEW_SHA.slice(1)}\trefs/heads/main\n`, `${NEW_SHA.toUpperCase()}\trefs/heads/main\n`,
    `${NEW_SHA}\trefs/heads/main\n${OTHER_SHA}\trefs/heads/main\n`, `${NEW_SHA} refs/heads/main\n`]) {
    assert.throws(() => parseLsRemoteMain(bad), /unexpected git ls-remote output/, JSON.stringify(bad));
  }
});

// ---------------------------------------------------------------------------------------------
// Transport, diagnostics and redaction
// ---------------------------------------------------------------------------------------------

test('fetch transport: GET only, no-cache directive, manual redirects, abort signal', async () => {
  const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), init });
    return new Response(null, { status: 302, headers: { location: 'https://evil.example/' } });
  }) as typeof fetch;
  const response = await createFetchTransport(fakeFetch)(`${CANONICAL}/build-info.json`, { timeoutMs: 1_000, maxBodyBytes: 4_096 });
  assert.equal(response.status, 302);
  assert.equal(response.body, null);
  assert.equal(seen.length, 1, 'the redirect is returned, not followed');
  const init = seen[0]!.init!;
  assert.equal(seen[0]!.url, `${CANONICAL}/build-info.json`);
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'manual');
  assert.equal(new Headers(init.headers).get('cache-control'), 'no-cache');
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.body, undefined);
});

test('fetch transport: bodies are bounded by declared length and by streamed size', async () => {
  const url = `${CANONICAL}/build-info.json`;
  const big = 'x'.repeat(5_000);
  const declared = createFetchTransport((async () => new Response(big, { status: 200, headers: { 'content-length': String(big.length) } })) as typeof fetch);
  assert.equal((await declared(url, { timeoutMs: 1_000, maxBodyBytes: 4_096 })).bodyTooLarge, true);
  const streamed = createFetchTransport((async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(big)); controller.close(); },
  }), { status: 200 })) as typeof fetch);
  const cut = await streamed(url, { timeoutMs: 1_000, maxBodyBytes: 4_096 });
  assert.equal(cut.bodyTooLarge, true);
  assert.equal(cut.body, null);
  const small = createFetchTransport((async () => Response.json(buildInfo())) as typeof fetch);
  const read = await small(url, { timeoutMs: 1_000, maxBodyBytes: 4_096 });
  assert.deepEqual(JSON.parse(read.body ?? 'null'), buildInfo());
  const notFound = createFetchTransport((async () => new Response('secret body', { status: 404 })) as typeof fetch);
  assert.equal((await notFound(url, { timeoutMs: 1_000, maxBodyBytes: 4_096 })).body, null, 'non-200 bodies are not read');
});

test('fetch transport: an aborted fetch surfaces as REQUEST_TIMEOUT and is retried within bounds', async () => {
  // Like a real socket, the pending request holds the event loop open until the abort timer fires.
  const hanging = ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const socket = setTimeout(() => undefined, 60_000);
    init?.signal?.addEventListener('abort', () => {
      clearTimeout(socket);
      reject(init.signal?.reason);
    }, { once: true });
  })) as typeof fetch;
  const transport = createFetchTransport(hanging);
  await assert.rejects(
    transport(`${CANONICAL}/build-info.json`, { timeoutMs: 5, maxBodyBytes: 1_024 }),
    (error: unknown) => (error as Error).name === 'TimeoutError',
  );
  const clock = harness({}).clock;
  const result = await verifyStatisticsDeployment(
    { url: CANONICAL, canonicalOrigin: CANONICAL, expectedRaw: buildInfo(), policy: { requestTimeoutMs: 5, initialIntervalMs: 1_000, maxIntervalMs: 1_000, customDomainDeadlineMs: 4_000 } },
    { transport, clock },
  );
  assert.equal(result.reason, 'UNREACHABLE');
  assert.equal(result.custom_domain.attempts, 4);
  assert.ok(result.history.every((record) => record.outcome === 'REQUEST_TIMEOUT' && record.detail === 'TimeoutError'));
});

test('diagnostics keep allowlisted cache and redirect headers only, and never echo bodies or secrets', async () => {
  const url = `${CANONICAL}/build-info.json`;
  const safe = safeHeaders(new Headers({
    'cf-cache-status': 'HIT', age: '17', etag: '"abc"', 'cache-control': 'public, max-age=0, must-revalidate',
    'set-cookie': 'session=SECRET', 'x-api-key': 'SECRET', server: 'cloudflare',
  }), 200, url);
  assert.deepEqual(Object.keys(safe).sort(), ['age', 'cache-control', 'cf-cache-status', 'etag']);
  const injected = safeHeaders({ get: (name: string) => (name === 'etag' ? '"a"\u001b[31m\r\n::error::x' : null) }, 200, url);
  assert.equal(injected.etag, '"a"[31m::error::x', 'control characters cannot start a new log line');

  const marker = 'SECRET-TOKEN-SHOULD-NOT-LEAK';
  const { result, logs } = await verify({
    [CUSTOM_HOST]: [ok(buildInfo({ leak: marker }), { 'set-cookie': marker }), { status: 200, raw: `<html>${marker}</html>` }],
  });
  assert.equal(result.reason, 'MALFORMED');
  assert.ok(!JSON.stringify(result).includes(marker), 'no body or cookie content in the result');
  assert.ok(logs.every((line) => !line.includes(marker) && line.startsWith('[verify-deployment] ') && !/[\r\n]/.test(line)));
});

test('policy overrides are bounded so the worst case stays inside the 15-minute publish job', () => {
  assert.deepEqual(resolvePolicy(), DEFAULT_POLICY);
  for (const bad of [
    { customDomainDeadlineMs: 0 }, { customDomainDeadlineMs: 300_001 }, { requestTimeoutMs: 30_001 }, { confirmationsRequired: 0 },
    { maxAttemptsPerTarget: 101 }, { initialIntervalMs: 20_000, maxIntervalMs: 10_000 }, { requestTimeoutMs: Number.NaN }, { requestTimeoutMs: 1.5 },
  ]) {
    assert.throws(() => resolvePolicy(bad), RangeError, JSON.stringify(bad));
  }
  const worst = POLICY_LIMITS.deploymentDeadlineMs[1] + POLICY_LIMITS.customDomainDeadlineMs[1] + 2 * MAIN_REF_TIMEOUT_MS;
  assert.ok(worst < 15 * 60_000, 'even maximal overrides finish inside the publish job timeout');
  assert.equal(DEFAULT_POLICY.deploymentDeadlineMs + DEFAULT_POLICY.customDomainDeadlineMs + 2 * MAIN_REF_TIMEOUT_MS, 220_000);
});

// ---------------------------------------------------------------------------------------------
// CLI: backwards compatible, Node 22 ESM + TypeScript
// ---------------------------------------------------------------------------------------------

test('the one-argument CLI keeps its contract: same argument, same leading fields, exit codes 0/1/2', async () => {
  let reads = 0;
  const run = (argv: string[], h: Harness) => runVerifyDeploymentCli(argv, {
    readExpected: () => { reads += 1; return buildInfo(); },
    transport: h.transport,
    clock: h.clock,
  });
  const verified = await run([CANONICAL], harness({ [CUSTOM_HOST]: [ok(stale()), ok(buildInfo())] }));
  assert.equal(verified.exitCode, 0);
  assert.equal(verified.stderr, '');
  assert.ok(verified.stdout.endsWith('}\n'));
  const parsed = JSON.parse(verified.stdout) as Json;
  assert.deepEqual(Object.keys(parsed).slice(0, 4), ['status', 'url', 'mismatches', 'live_commit']);
  assert.deepEqual(
    { status: parsed.status, url: parsed.url, mismatches: parsed.mismatches, live_commit: parsed.live_commit },
    { status: 'STATISTICS_DEPLOYMENT_VERIFIED', url: CANONICAL, mismatches: [], live_commit: NEW_SHA },
  );
  for (const key of ['reason', 'failed_target', 'expected', 'deployment_artifact', 'custom_domain', 'main_ref', 'policy', 'history', 'limitations']) {
    assert.ok(Object.hasOwn(parsed, key), `additive field ${key}`);
  }
  assert.equal((JSON.parse((await run([`${CANONICAL}/`], harness({ [CUSTOM_HOST]: [ok(buildInfo())] }))).stdout) as Json).url, `${CANONICAL}/`);
  assert.equal((await run(['https://reltroner-statistics.pages.dev'], harness({ 'reltroner-statistics.pages.dev': [ok(buildInfo())] }))).exitCode, 0);
  assert.equal((await run([CANONICAL], harness({ [CUSTOM_HOST]: [ok(stale())] }))).exitCode, 1);

  const readsBefore = reads;
  for (const argv of [
    [], ['http://statistics.reltroner.com'], ['https://evil.example'], [CANONICAL, '--bogus'], [CANONICAL, '--require-current-main'],
    [CANONICAL, '--expected-sha', 'abc'], [CANONICAL, '--expected-sha'], [CANONICAL, '--expected-sha', NEW_SHA, '--expected-sha', NEW_SHA],
    [CANONICAL, '--deployment-url', 'https://3b64e356.reltroner-studio-cf.pages.dev'], [CANONICAL, '--deployment-url', ''],
  ]) {
    const h = harness({});
    const usage = await run(argv, h);
    assert.equal(usage.exitCode, 2, argv.join(' '));
    assert.equal(usage.stdout, '', argv.join(' '));
    assert.match(usage.stderr, /Usage: verify-deployment\.ts/);
    assert.equal(h.calls.length, 0);
  }
  assert.equal(reads, readsBefore, 'arguments are validated before dist/build-info.json is read');

  const missing = await runVerifyDeploymentCli([CANONICAL], {
    readExpected: () => { throw Object.assign(new Error('no such file'), { code: 'ENOENT' }); },
    transport: harness({}).transport,
    clock: harness({}).clock,
  });
  assert.equal(missing.exitCode, 1);
  assert.equal((JSON.parse(missing.stdout) as Json).reason, 'EXPECTED_IDENTITY_INVALID');

  const full = parseVerifyArgs([CANONICAL, '--expected-sha', NEW_SHA, '--deployment-url', UNIQUE, '--require-current-main']);
  assert.deepEqual(full, { ok: true, url: CANONICAL, canonicalOrigin: CANONICAL, expectedSha: NEW_SHA, deploymentOrigin: UNIQUE, requireCurrentMain: true });
});

test('the real CLIs run as Node 22 ESM TypeScript and reject bad input before any network access', () => {
  const verifyCli = path.join(ROOT, 'scripts', 'verify-deployment.ts');
  for (const args of [[], ['http://statistics.reltroner.com'], ['https://statistics.reltroner.com.evil.example'], [CANONICAL, '--require-current-main']]) {
    const run = spawnSync(process.execPath, [verifyCli, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    assert.equal(run.status, 2, `${args.join(' ')}: ${run.stderr}`);
    assert.equal(run.stdout, '');
    assert.match(run.stderr, /Usage: verify-deployment\.ts/);
  }

  const captureCli = path.join(ROOT, 'scripts', 'capture-pages-deployment-url.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-deploy-sha-005-'));
  try {
    const file = (name: string, text: string) => {
      const target = path.join(dir, name);
      fs.writeFileSync(target, text);
      return target;
    };
    const capture = (...args: string[]) => spawnSync(process.execPath, [captureCli, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    const good = capture(file('good.log', WRANGLER_LOG));
    assert.equal(good.status, 0, good.stderr);
    assert.equal(good.stdout, `deployment_url=${UNIQUE}\n`);
    const lookalike = capture(file('lookalike.log', `Take a peek over at ${UNIQUE}.evil.example\n`));
    assert.equal(lookalike.status, 1);
    assert.equal(lookalike.stdout, '');
    assert.equal(capture().status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
