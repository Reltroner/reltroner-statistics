/**
 * RS-DEPLOY-SHA-005 — fail-closed verification of a Statistics Cloudflare Pages publication.
 *
 * Evidence stages are reported separately; none implies the next:
 *   UPLOADED                   Wrangler printed "Deployment complete". Proves an upload, not what any URL serves.
 *   DEPLOYMENT_ARTIFACT_VALID  This run's unique https://<8 hex>.reltroner-statistics.pages.dev URL, taken from
 *                              that Wrangler run's own output, serves the expected build identity.
 *   CUSTOM_DOMAIN_CONVERGED    The canonical origin serves the same identity on N consecutive reads.
 *   (Remote 16-tool REST/MCP acceptance runs afterwards: scripts/verify-remote-mcp.mjs.)
 *
 * A well-formed HTTP 200 that carries another build is PROPAGATING, not final, until a bounded deadline.
 * The identity fields are compared inside ONE response body; observations are never combined.
 * Requests are GETs to allowlisted Statistics origins only. Redirects are refused, never followed.
 * Nothing here purges a cache, rolls back, redeploys, or touches DNS, routes or custom domains.
 */
import { execFile } from 'node:child_process';
import { STATISTICS_PAGES_PROJECT, STATISTICS_PAGES_URL, STATISTICS_PUBLIC_URL } from '../guard-pages-target.ts';

export const BUILD_INFO_PATH = '/build-info.json';
/** Written by scripts/postbuild.ts; both sides of the comparison must carry it. */
export const BUILD_INFO_SCHEMA = 'reltroner-statistics-build.v1';
/** Origins whose /build-info.json counts as the canonical site: the custom domain or the pages.dev bootstrap alias. */
export const CANONICAL_ORIGINS: readonly string[] = Object.freeze([STATISTICS_PUBLIC_URL, STATISTICS_PAGES_URL]);
/** Top-level identity keys, compared exactly as before RS-DEPLOY-SHA-005 (JSON value equality). */
export const IDENTITY_KEYS = Object.freeze(['statistics_commit', 'semantic_digest', 'rules_version', 'sources'] as const);

const SHA1_HEX = /^[a-f0-9]{40}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const RULES_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROJECT_RE = STATISTICS_PAGES_PROJECT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A unique deployment URL of the Statistics project only (not its production alias, not a branch alias). */
const DEPLOYMENT_ORIGIN_RE = new RegExp(`^https://[a-f0-9]{8}\\.${PROJECT_RE}\\.pages\\.dev$`);
/** The same URL inside free text, ending at a terminator so lookalikes (`.pages.dev.evil`, `.pages.dev@evil`) never match. */
const DEPLOYMENT_URL_IN_TEXT_RE = new RegExp(
  `https://[a-f0-9]{8}\\.${PROJECT_RE}\\.pages\\.dev(?=$|[\\s/"'),;\\]\\u001b]|\\.(?:$|\\s))`,
  'gm',
);
const MAX_WRANGLER_LOG_CHARS = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// Policy: every wait is bounded; the worst case stays far inside the 15-minute publish job.
// ---------------------------------------------------------------------------------------------

export interface VerificationPolicy {
  /** Per-request timeout; additionally clamped to the time left before the phase deadline. */
  readonly requestTimeoutMs: number;
  readonly initialIntervalMs: number;
  readonly maxIntervalMs: number;
  readonly backoffFactor: number;
  /** Consecutive matching reads of the canonical origin required before it counts as converged. */
  readonly confirmationsRequired: number;
  readonly confirmationIntervalMs: number;
  readonly deploymentDeadlineMs: number;
  readonly customDomainDeadlineMs: number;
  readonly maxAttemptsPerTarget: number;
  readonly maxBodyBytes: number;
}

export const DEFAULT_POLICY: Readonly<VerificationPolicy> = Object.freeze({
  requestTimeoutMs: 10_000,
  initialIntervalMs: 2_000,
  maxIntervalMs: 10_000,
  backoffFactor: 2,
  confirmationsRequired: 2,
  confirmationIntervalMs: 5_000,
  deploymentDeadlineMs: 60_000,
  customDomainDeadlineMs: 120_000,
  maxAttemptsPerTarget: 30,
  maxBodyBytes: 65_536,
});

/** Hard limits for overrides: two 300 s phases plus two 20 s git reads stay under 11 minutes. */
export const POLICY_LIMITS: Readonly<Record<keyof VerificationPolicy, readonly [number, number]>> = Object.freeze({
  requestTimeoutMs: [1, 30_000],
  initialIntervalMs: [1, 60_000],
  maxIntervalMs: [1, 60_000],
  backoffFactor: [1, 4],
  confirmationsRequired: [1, 5],
  confirmationIntervalMs: [1, 60_000],
  deploymentDeadlineMs: [1, 300_000],
  customDomainDeadlineMs: [1, 300_000],
  maxAttemptsPerTarget: [1, 100],
  maxBodyBytes: [1_024, 1_048_576],
});

export const MAIN_REF_TIMEOUT_MS = 20_000;

export function resolvePolicy(overrides: Partial<VerificationPolicy> = {}): VerificationPolicy {
  const policy: VerificationPolicy = { ...DEFAULT_POLICY, ...overrides };
  for (const key of Object.keys(POLICY_LIMITS) as Array<keyof VerificationPolicy>) {
    const [min, max] = POLICY_LIMITS[key];
    const value = policy[key];
    const integral = key === 'backoffFactor' || Number.isInteger(value);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || !integral) {
      throw new RangeError(`Invalid verification policy ${key}=${String(value)} (allowed ${min}..${max})`);
    }
  }
  if (policy.initialIntervalMs > policy.maxIntervalMs) {
    throw new RangeError('Invalid verification policy: initialIntervalMs exceeds maxIntervalMs');
  }
  return Object.freeze(policy);
}

// ---------------------------------------------------------------------------------------------
// Build identity
// ---------------------------------------------------------------------------------------------

export interface BuildIdentity {
  readonly statistics_commit: string;
  readonly semantic_digest: string;
  readonly rules_version: string;
  readonly sources: { readonly production: string; readonly remodeling: string };
}

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown, pattern: RegExp): value is string => typeof value === 'string' && pattern.test(value);

/** Accepts only a complete Statistics build identity; `null` identity lists every invalid field. */
export function validateBuildIdentity(value: unknown): { identity: BuildIdentity | null; problems: string[] } {
  if (!isObject(value)) return { identity: null, problems: ['not_a_json_object'] };
  const { schema_version: schema, statistics_commit: commit, semantic_digest: digest, rules_version: rules, sources } = value;
  const problems: string[] = [];
  if (schema !== BUILD_INFO_SCHEMA) problems.push('schema_version');
  if (!str(commit, SHA1_HEX)) problems.push('statistics_commit');
  if (!str(digest, SHA256_HEX)) problems.push('semantic_digest');
  if (!str(rules, RULES_VERSION)) problems.push('rules_version');
  const production = isObject(sources) ? sources.production : undefined;
  const remodeling = isObject(sources) ? sources.remodeling : undefined;
  if (!isObject(sources)) problems.push('sources');
  else {
    if (!str(production, SHA1_HEX)) problems.push('sources.production');
    if (!str(remodeling, SHA1_HEX)) problems.push('sources.remodeling');
  }
  if (problems.length > 0) return { identity: null, problems };
  return {
    identity: Object.freeze({
      statistics_commit: commit as string,
      semantic_digest: digest as string,
      rules_version: rules as string,
      sources: Object.freeze({ production: production as string, remodeling: remodeling as string }),
    }),
    problems,
  };
}

/** Legacy key list (unchanged semantics) and field-level detail, both taken from ONE response body. */
export function compareIdentity(expectedRaw: JsonObject, observedRaw: JsonObject): { keys: string[]; fields: string[] } {
  const keys = IDENTITY_KEYS.filter((key) => JSON.stringify(observedRaw[key]) !== JSON.stringify(expectedRaw[key]));
  const fields: string[] = [];
  for (const key of keys) {
    if (key !== 'sources') {
      fields.push(key);
      continue;
    }
    const expected: JsonObject = isObject(expectedRaw.sources) ? expectedRaw.sources : {};
    const observed: JsonObject = isObject(observedRaw.sources) ? observedRaw.sources : {};
    const changed = (['production', 'remodeling'] as const).filter((s) => observed[s] !== expected[s]).map((s) => `sources.${s}`);
    fields.push(...(changed.length > 0 ? changed : ['sources']));
  }
  return { keys: [...keys], fields };
}

// ---------------------------------------------------------------------------------------------
// Origins: TLS only, allowlisted, never derived from a response
// ---------------------------------------------------------------------------------------------

/** `https://statistics.reltroner.com` or the pages.dev bootstrap alias (optional trailing slash), else null. */
export function parseCanonicalOrigin(argument: string): string | null {
  if (!/^https:\/\/[a-z0-9.-]+\/?$/.test(argument)) return null;
  const origin = argument.replace(/\/$/, '');
  return CANONICAL_ORIGINS.includes(origin) ? origin : null;
}

/** A unique `https://<8 hex>.reltroner-statistics.pages.dev` deployment URL (optional trailing slash), else null. */
export function parseDeploymentOrigin(argument: string): string | null {
  const origin = argument.replace(/\/$/, '');
  return DEPLOYMENT_ORIGIN_RE.test(origin) ? origin : null;
}

/** Every distinct eligible Statistics deployment URL in Wrangler's output. */
export function extractDeploymentOrigins(text: string): string[] {
  return [...new Set(text.match(DEPLOYMENT_URL_IN_TEXT_RE) ?? [])].filter((url) => DEPLOYMENT_ORIGIN_RE.test(url));
}

export interface CommandOutcome {
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

/** Turns one Wrangler log into exactly one `deployment_url=...` step-output line, or fails closed. */
export function captureDeploymentUrl(argv: readonly string[], readText: (file: string) => string): CommandOutcome {
  const file = argv[0];
  if (argv.length !== 1 || !file) {
    return { exitCode: 2, stdout: '', stderr: 'Usage: capture-pages-deployment-url.ts <wrangler-output-file>\n' };
  }
  let text: string;
  try {
    text = readText(file);
  } catch {
    return { exitCode: 1, stdout: '', stderr: 'DEPLOYMENT_URL_UNAVAILABLE: the Wrangler output file could not be read\n' };
  }
  if (text.length > MAX_WRANGLER_LOG_CHARS) {
    return { exitCode: 1, stdout: '', stderr: 'DEPLOYMENT_URL_UNAVAILABLE: the Wrangler output file is unexpectedly large\n' };
  }
  const found = extractDeploymentOrigins(text);
  if (found.length !== 1) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `DEPLOYMENT_URL_UNAVAILABLE: expected exactly one https://<8-hex>.${STATISTICS_PAGES_PROJECT}.pages.dev URL in this run's Wrangler output, found ${found.length}\n`,
    };
  }
  return { exitCode: 0, stdout: `deployment_url=${found[0]}\n`, stderr: '' };
}

// ---------------------------------------------------------------------------------------------
// Transport and clock (injected; tests use a virtual clock and scripted responses)
// ---------------------------------------------------------------------------------------------

export interface HeaderReader {
  get(name: string): string | null;
}

export interface ProbeResponse {
  readonly status: number;
  readonly headers: HeaderReader;
  /** Body of an HTTP 200, read up to the byte limit; null for any other status or an oversized body. */
  readonly body: string | null;
  readonly bodyTooLarge: boolean;
}

export type ProbeTransport = (
  url: string,
  options: { readonly timeoutMs: number; readonly maxBodyBytes: number },
) => Promise<ProbeResponse>;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = Object.freeze({
  now: () => performance.now(),
  sleep: (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }),
});

async function readBounded(response: Response, maxBytes: number): Promise<{ text: string | null; tooLarge: boolean }> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return { text: null, tooLarge: true };
  }
  if (!response.body) return { text: '', tooLarge: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { text: null, tooLarge: true };
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), tooLarge: false };
}

/**
 * GET with `Cache-Control: no-cache` (a request directive only: it does not guarantee that every Cloudflare
 * cache layer is bypassed), `redirect: 'manual'` (a redirect is reported, never followed) and an abort timeout.
 */
export function createFetchTransport(fetchImpl: typeof fetch = fetch): ProbeTransport {
  return async (url, { timeoutMs, maxBodyBytes }) => {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      return { status: response.status, headers: response.headers, body: null, bodyTooLarge: false };
    }
    const read = await readBounded(response, maxBodyBytes);
    return { status: response.status, headers: response.headers, body: read.text, bodyTooLarge: read.tooLarge };
  };
}

/** Exact `<sha>\trefs/heads/main` from `git ls-remote`, or throws. */
export function parseLsRemoteMain(stdout: string): string {
  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
  const match = lines.length === 1 ? /^([a-f0-9]{40})\trefs\/heads\/main$/.exec(lines[0] ?? '') : null;
  if (!match?.[1]) throw new Error('unexpected git ls-remote output for refs/heads/main');
  return match[1];
}

/** Reads GitHub main through the checkout's own `origin` (as the existing stale-deploy steps do). */
export function createGitMainResolver(cwd: string): () => Promise<string> {
  return () => new Promise<string>((resolve, reject) => {
    execFile(
      'git',
      ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'],
      { cwd, timeout: MAIN_REF_TIMEOUT_MS, maxBuffer: 64 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (error, stdout) => {
        // git's stderr is deliberately not propagated: remote URLs and credential helpers stay out of logs.
        if (error) {
          reject(new Error('git ls-remote origin refs/heads/main failed'));
          return;
        }
        try {
          resolve(parseLsRemoteMain(String(stdout)));
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Diagnostics (redacted): identity fields and allowlisted cache/redirect headers, never a body
// ---------------------------------------------------------------------------------------------

export const SAFE_HEADER_NAMES = Object.freeze(
  ['cache-control', 'cf-cache-status', 'age', 'etag', 'last-modified', 'date', 'cf-ray', 'content-type'] as const,
);
export type SafeHeaders = Partial<Record<(typeof SAFE_HEADER_NAMES)[number] | 'location_host', string>>;

const printable = (value: string, max: number) => value.replace(/[^\x20-\x7e]/g, '').slice(0, max);

export function safeHeaders(headers: HeaderReader, status: number, requestUrl: string): SafeHeaders {
  const out: SafeHeaders = {};
  for (const name of SAFE_HEADER_NAMES) {
    const value = headers.get(name);
    if (value) out[name] = printable(value, 160);
  }
  if (status >= 300 && status <= 399) {
    const location = headers.get('location');
    let host = 'none';
    if (location) {
      try {
        host = printable(new URL(location, requestUrl).host, 253) || 'none';
      } catch {
        host = 'unparseable';
      }
    }
    out.location_host = host;
  }
  return out;
}

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** A system error code (ECONNRESET, ENOTFOUND, UND_ERR_...) or the error name; DOMException's numeric legacy code is ignored. */
function errorCode(error: unknown): string {
  const e = error as { name?: unknown; code?: unknown; cause?: { code?: unknown; name?: unknown } } | null;
  const text = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);
  const code = text(e?.cause?.code) ?? text(e?.code) ?? text(e?.cause?.name) ?? text(e?.name) ?? 'Error';
  return printable(code, 64) || 'Error';
}

// ---------------------------------------------------------------------------------------------
// Convergence state machine
// ---------------------------------------------------------------------------------------------

export type TargetKind = 'deployment_artifact' | 'custom_domain';
/** One read. PROPAGATING = a well-formed build identity that is not (yet) the expected one. */
export type AttemptOutcome =
  | 'MATCH'
  | 'PROPAGATING'
  | 'HTTP_STATUS'
  | 'NETWORK_ERROR'
  | 'REQUEST_TIMEOUT'
  | 'MALFORMED'
  | 'REDIRECT_REFUSED';
export type VerificationReason =
  | 'VERIFIED'
  | 'TIMED_OUT'
  | 'UNREACHABLE'
  | 'MALFORMED'
  | 'REDIRECT_REFUSED'
  | 'DEPLOYMENT_ARTIFACT_MISMATCH'
  | 'STALE_DEPLOY_BLOCKED'
  | 'MAIN_REF_UNRESOLVED'
  | 'EXPECTED_IDENTITY_INVALID';
export type FailedTarget = TargetKind | 'main_ref' | 'expected_identity';
export type DeploymentArtifactState =
  | 'NOT_REQUESTED'
  | 'NOT_CHECKED'
  | 'DEPLOYMENT_ARTIFACT_VALID'
  | 'DEPLOYMENT_ARTIFACT_INVALID'
  | 'DEPLOYMENT_ARTIFACT_UNVERIFIED';
export type CustomDomainState = 'NOT_CHECKED' | 'CUSTOM_DOMAIN_CONVERGED' | 'CUSTOM_DOMAIN_NOT_CONVERGED';
export type MainRefState = 'NOT_REQUESTED' | 'NOT_CHECKED' | 'MAIN_EQUALS_EXPECTED' | 'MAIN_ADVANCED' | 'UNRESOLVED';

export interface AttemptRecord {
  readonly target: TargetKind;
  readonly attempt: number;
  readonly host: string;
  /** Offset of the request from the start of verification. */
  readonly elapsed_ms: number;
  readonly duration_ms: number;
  readonly outcome: AttemptOutcome;
  readonly http_status: number | null;
  readonly expected_commit: string;
  readonly observed_commit: string | null;
  readonly mismatched_fields: readonly string[];
  readonly detail: string | null;
  readonly headers: SafeHeaders;
}

export interface ObservedIdentity extends BuildIdentity {
  readonly mismatched_fields: readonly string[];
}

export interface VerificationResult {
  // Backwards-compatible fields (same names, types and meaning as before RS-DEPLOY-SHA-005).
  readonly status: 'STATISTICS_DEPLOYMENT_VERIFIED' | 'STATISTICS_DEPLOYMENT_UNVERIFIED';
  readonly url: string;
  readonly mismatches: readonly string[];
  readonly live_commit: string | null;
  // Additive diagnostics.
  readonly reason: VerificationReason;
  readonly failed_target: FailedTarget | null;
  readonly detail: string | null;
  readonly expected_sha: string | null;
  readonly expected: BuildIdentity | null;
  readonly deployment_artifact: {
    readonly state: DeploymentArtifactState;
    readonly host: string | null;
    readonly attempts: number;
    readonly elapsed_ms: number;
    readonly observed_commit: string | null;
  };
  readonly custom_domain: {
    readonly state: CustomDomainState;
    readonly host: string;
    readonly attempts: number;
    readonly confirmations_required: number;
    readonly consecutive_matches: number;
    readonly elapsed_ms: number;
    readonly last_observed: ObservedIdentity | null;
  };
  readonly main_ref: { readonly state: MainRefState; readonly before: string | null; readonly after: string | null };
  readonly policy: VerificationPolicy;
  readonly elapsed_ms: number;
  readonly history: readonly AttemptRecord[];
  readonly limitations: readonly string[];
}

export const LIMITATIONS: readonly string[] = Object.freeze([
  'Convergence is observed from this runner\'s network location only; it does not prove that every Cloudflare edge serves the release.',
  'A unique deployment URL proves what was uploaded, not what the canonical origin serves.',
  'Cache-Control: no-cache is a request directive; it does not guarantee that every Cloudflare cache layer is bypassed.',
]);

export interface VerifyRequest {
  /** The origin argument as given, echoed in `url` exactly as before. */
  readonly url: string;
  readonly canonicalOrigin: string;
  /** Parsed dist/build-info.json of the artifact being published. */
  readonly expectedRaw: unknown;
  readonly expectedReadError?: string | null;
  readonly expectedSha?: string | null;
  readonly deploymentOrigin?: string | null;
  readonly requireCurrentMain?: boolean;
  readonly policy?: Partial<VerificationPolicy>;
}

export interface VerifyDeps {
  readonly transport: ProbeTransport;
  readonly clock: Clock;
  readonly resolveMainSha?: (() => Promise<string>) | undefined;
  readonly log?: ((line: string) => void) | undefined;
}

interface Observation {
  readonly identity: BuildIdentity;
  readonly keys: readonly string[];
  readonly fields: readonly string[];
}

interface Context {
  readonly transport: ProbeTransport;
  readonly clock: Clock;
  readonly policy: VerificationPolicy;
  readonly expected: BuildIdentity;
  readonly expectedRaw: JsonObject;
  readonly startedAt: number;
  readonly history: AttemptRecord[];
  readonly log: ((line: string) => void) | undefined;
}

interface TargetPlan {
  readonly kind: TargetKind;
  readonly origin: string;
  readonly deadlineMs: number;
  readonly confirmations: number;
  /** An immutable unique deployment URL never "propagates" to another build: a different identity is final. */
  readonly staleIsTerminal: boolean;
}

interface TargetOutcome {
  readonly verified: boolean;
  readonly reason: VerificationReason;
  readonly attempts: number;
  readonly consecutiveMatches: number;
  readonly elapsedMs: number;
  readonly lastObserved: Observation | null;
}

export function formatProgress(record: AttemptRecord): string {
  const short = (sha: string | null) => (sha ? sha.slice(0, 12) : '-');
  const parts = [
    `[verify-deployment] ${record.target} #${record.attempt}`,
    `+${(record.elapsed_ms / 1000).toFixed(1)}s`,
    record.host,
    record.http_status === null ? 'no-response' : `HTTP ${record.http_status}`,
    record.outcome,
    `observed=${short(record.observed_commit)}`,
    `expected=${short(record.expected_commit)}`,
  ];
  if (record.mismatched_fields.length > 0) parts.push(`mismatched=${record.mismatched_fields.join(',')}`);
  if (record.detail) parts.push(`detail=${record.detail}`);
  for (const name of ['cf-cache-status', 'age'] as const) {
    const value = record.headers[name];
    if (value) parts.push(`${name}=${value}`);
  }
  return parts.join(' ');
}

async function probeOnce(
  ctx: Context,
  plan: TargetPlan,
  attempt: number,
  timeoutMs: number,
): Promise<{ record: AttemptRecord; observed: Observation | null }> {
  const url = `${plan.origin}${BUILD_INFO_PATH}`;
  const started = ctx.clock.now();
  const record = (fields: Pick<AttemptRecord, 'outcome' | 'http_status' | 'observed_commit' | 'mismatched_fields' | 'detail' | 'headers'>): AttemptRecord => ({
    target: plan.kind,
    attempt,
    host: new URL(plan.origin).host,
    elapsed_ms: Math.round(started - ctx.startedAt),
    duration_ms: Math.round(ctx.clock.now() - started),
    expected_commit: ctx.expected.statistics_commit,
    ...fields,
  });
  const none = { observed_commit: null, mismatched_fields: [] };

  let response: ProbeResponse;
  try {
    response = await ctx.transport(url, { timeoutMs, maxBodyBytes: ctx.policy.maxBodyBytes });
  } catch (error) {
    const outcome = isTimeout(error) ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR';
    return { record: record({ outcome, http_status: null, ...none, detail: errorCode(error), headers: {} }), observed: null };
  }
  const status = response.status;
  const headers = safeHeaders(response.headers, status, url);
  if (status >= 300 && status <= 399) {
    const detail = `location_host=${headers.location_host ?? 'none'}`;
    return { record: record({ outcome: 'REDIRECT_REFUSED', http_status: status, ...none, detail, headers }), observed: null };
  }
  if (status !== 200) {
    return { record: record({ outcome: 'HTTP_STATUS', http_status: status, ...none, detail: null, headers }), observed: null };
  }
  const malformed = (detail: string) => ({ record: record({ outcome: 'MALFORMED', http_status: status, ...none, detail, headers }), observed: null });
  if (response.bodyTooLarge || response.body === null) return malformed('BODY_TOO_LARGE');
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return malformed('INVALID_JSON');
  }
  const { identity, problems } = validateBuildIdentity(parsed);
  if (!identity) return malformed(`INVALID_SHAPE:${problems.join(',')}`);
  const { keys, fields } = compareIdentity(ctx.expectedRaw, parsed as JsonObject);
  return {
    record: record({
      outcome: keys.length === 0 ? 'MATCH' : 'PROPAGATING',
      http_status: status,
      observed_commit: identity.statistics_commit,
      mismatched_fields: fields,
      detail: null,
      headers,
    }),
    observed: { identity, keys, fields },
  };
}

async function pollTarget(ctx: Context, plan: TargetPlan): Promise<TargetOutcome> {
  const { clock, policy } = ctx;
  const phaseStart = clock.now();
  let attempts = 0;
  let consecutive = 0;
  let interval = policy.initialIntervalMs;
  let lastObserved: Observation | null = null;
  const finish = (verified: boolean, reason: VerificationReason): TargetOutcome => ({
    verified,
    reason,
    attempts,
    consecutiveMatches: consecutive,
    elapsedMs: Math.round(clock.now() - phaseStart),
    lastObserved,
  });
  // TIMED_OUT: a build identity was read but never confirmed as the expected one. UNREACHABLE: none was read.
  const exhausted = () => finish(false, lastObserved ? 'TIMED_OUT' : 'UNREACHABLE');
  const backoff = () => {
    const wait = interval;
    interval = Math.min(policy.maxIntervalMs, Math.round(interval * policy.backoffFactor));
    return wait;
  };

  for (;;) {
    const remaining = plan.deadlineMs - (clock.now() - phaseStart);
    if (attempts >= policy.maxAttemptsPerTarget || remaining <= 0) return exhausted();
    attempts += 1;
    const timeoutMs = Math.max(1, Math.min(policy.requestTimeoutMs, Math.floor(remaining)));
    const { record, observed } = await probeOnce(ctx, plan, attempts, timeoutMs);
    ctx.history.push(record);
    ctx.log?.(formatProgress(record));
    if (observed) lastObserved = observed;

    let wait: number;
    switch (record.outcome) {
      case 'MATCH':
        consecutive += 1;
        if (consecutive >= plan.confirmations) return finish(true, 'VERIFIED');
        wait = policy.confirmationIntervalMs;
        break;
      case 'PROPAGATING':
        consecutive = 0;
        if (plan.staleIsTerminal) return finish(false, 'DEPLOYMENT_ARTIFACT_MISMATCH');
        wait = backoff();
        break;
      case 'MALFORMED':
      case 'REDIRECT_REFUSED':
        consecutive = 0;
        return finish(false, record.outcome);
      default:
        // HTTP_STATUS, NETWORK_ERROR, REQUEST_TIMEOUT: transient until the deadline says otherwise.
        consecutive = 0;
        wait = backoff();
    }
    // Do not sleep into a deadline that leaves no room for another read.
    if (attempts >= policy.maxAttemptsPerTarget || clock.now() - phaseStart + wait >= plan.deadlineMs) return exhausted();
    await clock.sleep(wait);
  }
}

async function readMain(resolve: (() => Promise<string>) | undefined): Promise<{ sha: string | null; error: string | null }> {
  if (!resolve) return { sha: null, error: 'no GitHub main resolver configured' };
  try {
    const sha = await resolve();
    return SHA1_HEX.test(sha) ? { sha, error: null } : { sha: null, error: 'GitHub main resolved to an invalid SHA' };
  } catch (error) {
    return { sha: null, error: printable(error instanceof Error ? error.message : 'GitHub main unavailable', 160) };
  }
}

export async function verifyStatisticsDeployment(request: VerifyRequest, deps: VerifyDeps): Promise<VerificationResult> {
  const policy = resolvePolicy(request.policy);
  const { clock } = deps;
  const startedAt = clock.now();
  const history: AttemptRecord[] = [];
  const expectedSha = request.expectedSha ?? null;
  const deployment = {
    state: (request.deploymentOrigin ? 'NOT_CHECKED' : 'NOT_REQUESTED') as DeploymentArtifactState,
    host: request.deploymentOrigin ? new URL(request.deploymentOrigin).host : null,
    attempts: 0,
    elapsed_ms: 0,
    observed_commit: null as string | null,
  };
  const custom = {
    state: 'NOT_CHECKED' as CustomDomainState,
    host: new URL(request.canonicalOrigin).host,
    attempts: 0,
    confirmations_required: policy.confirmationsRequired,
    consecutive_matches: 0,
    elapsed_ms: 0,
    last_observed: null as ObservedIdentity | null,
  };
  const main = { state: (request.requireCurrentMain ? 'NOT_CHECKED' : 'NOT_REQUESTED') as MainRefState, before: null as string | null, after: null as string | null };
  let customObserved: Observation | null = null;

  const finish = (reason: VerificationReason, failedTarget: FailedTarget | null, detail: string | null, expected: BuildIdentity | null): VerificationResult => {
    // Legacy `mismatches`: empty only when verified; identity key names of the canonical origin's last
    // well-formed response; otherwise one token naming what could not be verified.
    let mismatches: string[];
    if (reason === 'VERIFIED') mismatches = [];
    else if (failedTarget === 'expected_identity' || failedTarget === 'main_ref' || failedTarget === 'deployment_artifact') mismatches = [failedTarget];
    else if (customObserved) mismatches = customObserved.keys.length > 0 ? [...customObserved.keys] : ['unconfirmed'];
    else mismatches = ['unreachable'];
    return {
      status: reason === 'VERIFIED' ? 'STATISTICS_DEPLOYMENT_VERIFIED' : 'STATISTICS_DEPLOYMENT_UNVERIFIED',
      url: request.url,
      mismatches,
      live_commit: customObserved?.identity.statistics_commit ?? null,
      reason,
      failed_target: failedTarget,
      detail,
      expected_sha: expectedSha,
      expected,
      deployment_artifact: { ...deployment },
      custom_domain: { ...custom },
      main_ref: { ...main },
      policy,
      elapsed_ms: Math.round(clock.now() - startedAt),
      history,
      limitations: LIMITATIONS,
    };
  };

  // 1. The expected identity comes from the artifact being published, never from what a server reports.
  if (request.expectedReadError) {
    return finish('EXPECTED_IDENTITY_INVALID', 'expected_identity', `dist/build-info.json unreadable (${request.expectedReadError})`, null);
  }
  const { identity: expected, problems } = validateBuildIdentity(request.expectedRaw);
  if (!expected) {
    return finish('EXPECTED_IDENTITY_INVALID', 'expected_identity', `dist/build-info.json is not a complete build identity: ${problems.join(',')}`, null);
  }
  if (expectedSha && expected.statistics_commit !== expectedSha) {
    return finish('EXPECTED_IDENTITY_INVALID', 'expected_identity', 'dist/build-info.json was built from a different commit than --expected-sha', expected);
  }

  // 2. A newer main means this candidate is no longer the release, whatever the site serves.
  if (request.requireCurrentMain) {
    const before = await readMain(expectedSha ? deps.resolveMainSha : undefined);
    main.before = before.sha;
    if (!before.sha) {
      main.state = 'UNRESOLVED';
      return finish('MAIN_REF_UNRESOLVED', 'main_ref', before.error, expected);
    }
    if (before.sha !== expectedSha) {
      main.state = 'MAIN_ADVANCED';
      return finish('STALE_DEPLOY_BLOCKED', 'main_ref', 'GitHub main no longer equals the commit being verified', expected);
    }
    main.state = 'MAIN_EQUALS_EXPECTED';
  }

  const ctx: Context = {
    transport: deps.transport,
    clock,
    policy,
    expected,
    expectedRaw: request.expectedRaw as JsonObject,
    startedAt,
    history,
    log: deps.log,
  };

  // 3. Release-artifact evidence: this run's unique deployment URL (optional; never a substitute for step 4).
  if (request.deploymentOrigin) {
    const outcome = await pollTarget(ctx, {
      kind: 'deployment_artifact',
      origin: request.deploymentOrigin,
      deadlineMs: policy.deploymentDeadlineMs,
      confirmations: 1,
      staleIsTerminal: true,
    });
    deployment.attempts = outcome.attempts;
    deployment.elapsed_ms = outcome.elapsedMs;
    deployment.observed_commit = outcome.lastObserved?.identity.statistics_commit ?? null;
    if (!outcome.verified) {
      deployment.state = outcome.reason === 'UNREACHABLE' ? 'DEPLOYMENT_ARTIFACT_UNVERIFIED' : 'DEPLOYMENT_ARTIFACT_INVALID';
      return finish(outcome.reason, 'deployment_artifact', 'the unique deployment URL did not serve the expected build identity', expected);
    }
    deployment.state = 'DEPLOYMENT_ARTIFACT_VALID';
  }

  // 4. The canonical origin itself must converge and be confirmed.
  const outcome = await pollTarget(ctx, {
    kind: 'custom_domain',
    origin: request.canonicalOrigin,
    deadlineMs: policy.customDomainDeadlineMs,
    confirmations: policy.confirmationsRequired,
    staleIsTerminal: false,
  });
  custom.attempts = outcome.attempts;
  custom.consecutive_matches = outcome.consecutiveMatches;
  custom.elapsed_ms = outcome.elapsedMs;
  customObserved = outcome.lastObserved;
  custom.last_observed = outcome.lastObserved
    ? Object.freeze({ ...outcome.lastObserved.identity, mismatched_fields: outcome.lastObserved.fields })
    : null;
  if (!outcome.verified) {
    custom.state = 'CUSTOM_DOMAIN_NOT_CONVERGED';
    const detail = outcome.reason === 'TIMED_OUT'
      ? `the canonical origin did not serve the expected build identity on ${policy.confirmationsRequired} consecutive reads within ${policy.customDomainDeadlineMs} ms`
      : 'the canonical origin did not serve a build identity that could be verified';
    return finish(outcome.reason, 'custom_domain', detail, expected);
  }
  custom.state = 'CUSTOM_DOMAIN_CONVERGED';

  // 5. Main must still be this commit once the site serves it.
  if (request.requireCurrentMain) {
    const after = await readMain(deps.resolveMainSha);
    main.after = after.sha;
    if (!after.sha) {
      main.state = 'UNRESOLVED';
      return finish('MAIN_REF_UNRESOLVED', 'main_ref', after.error, expected);
    }
    if (after.sha !== expectedSha) {
      main.state = 'MAIN_ADVANCED';
      return finish('STALE_DEPLOY_BLOCKED', 'main_ref', 'GitHub main advanced while the deployment converged', expected);
    }
  }
  return finish('VERIFIED', null, null, expected);
}

// ---------------------------------------------------------------------------------------------
// CLI contract (scripts/verify-deployment.ts is a thin wrapper around this)
// ---------------------------------------------------------------------------------------------

export const VERIFY_USAGE =
  'Usage: verify-deployment.ts https://statistics.reltroner.com|https://reltroner-statistics.pages.dev'
  + ' [--expected-sha <40-hex>] [--deployment-url https://<8-hex>.reltroner-statistics.pages.dev] [--require-current-main]\n';

export type VerifyArgs =
  | { readonly ok: true; readonly url: string; readonly canonicalOrigin: string; readonly expectedSha: string | null; readonly deploymentOrigin: string | null; readonly requireCurrentMain: boolean }
  | { readonly ok: false; readonly error: string };

export function parseVerifyArgs(argv: readonly string[]): VerifyArgs {
  const [url, ...rest] = argv;
  if (!url) return { ok: false, error: 'missing origin' };
  const canonicalOrigin = parseCanonicalOrigin(url);
  if (!canonicalOrigin) {
    return { ok: false, error: `origin must be exactly ${CANONICAL_ORIGINS.join(' or ')} (HTTPS, no path, port or credentials)` };
  }
  let expectedSha: string | null = null;
  let deploymentOrigin: string | null = null;
  let requireCurrentMain = false;
  const seen = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i] ?? '';
    if (seen.has(flag)) return { ok: false, error: `duplicate argument ${flag}` };
    seen.add(flag);
    if (flag === '--require-current-main') {
      requireCurrentMain = true;
      continue;
    }
    if (flag !== '--expected-sha' && flag !== '--deployment-url') return { ok: false, error: `unsupported argument ${flag}` };
    const value = rest[++i];
    if (value === undefined || value.startsWith('--')) return { ok: false, error: `missing value for ${flag}` };
    if (flag === '--expected-sha') {
      if (!SHA1_HEX.test(value)) return { ok: false, error: '--expected-sha must be a full lowercase 40-hex commit' };
      expectedSha = value;
    } else {
      deploymentOrigin = parseDeploymentOrigin(value);
      if (!deploymentOrigin) {
        return { ok: false, error: `--deployment-url must be a unique https://<8-hex>.${STATISTICS_PAGES_PROJECT}.pages.dev deployment URL` };
      }
    }
  }
  if (requireCurrentMain && !expectedSha) return { ok: false, error: '--require-current-main requires --expected-sha' };
  return { ok: true, url, canonicalOrigin, expectedSha, deploymentOrigin, requireCurrentMain };
}

export interface CliDeps extends VerifyDeps {
  /** Returns the parsed dist/build-info.json; throws when it is missing or unparseable. */
  readonly readExpected: () => unknown;
  readonly policy?: Partial<VerificationPolicy>;
}

/** Exit 0 verified, 1 unverified (any reason), 2 usage error — as before. Arguments are checked before any read or request. */
export async function runVerifyDeploymentCli(argv: readonly string[], deps: CliDeps): Promise<CommandOutcome> {
  const args = parseVerifyArgs(argv);
  if (!args.ok) return { exitCode: 2, stdout: '', stderr: `${args.error}\n${VERIFY_USAGE}` };
  let expectedRaw: unknown;
  let expectedReadError: string | null = null;
  try {
    expectedRaw = deps.readExpected();
  } catch (error) {
    expectedReadError = errorCode(error);
  }
  const result = await verifyStatisticsDeployment({
    url: args.url,
    canonicalOrigin: args.canonicalOrigin,
    expectedRaw,
    expectedReadError,
    expectedSha: args.expectedSha,
    deploymentOrigin: args.deploymentOrigin,
    requireCurrentMain: args.requireCurrentMain,
    policy: deps.policy ?? {},
  }, deps);
  return { exitCode: result.status === 'STATISTICS_DEPLOYMENT_VERIFIED' ? 0 : 1, stdout: `${JSON.stringify(result, null, 2)}\n`, stderr: '' };
}
