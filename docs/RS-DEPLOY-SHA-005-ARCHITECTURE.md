# RS-DEPLOY-SHA-005 — Architecture: bounded, fail-closed custom-domain convergence

The publication flow now waits for the canonical Statistics origin to serve the exact build, and reports that state, instead of judging the first response it gets. Every identity check that existed before is kept; nothing is relaxed. Background: [Incident](RS-DEPLOY-SHA-005-INCIDENT.md). Evidence: [Acceptance](RS-DEPLOY-SHA-005-ACCEPTANCE.md).

## Evidence stages

Each stage is reported on its own. None implies the next.

| Stage | Evidence | What it does **not** prove |
|---|---|---|
| `UPLOADED` | Wrangler printed `Deployment complete` | what any URL serves |
| `DEPLOYMENT_ARTIFACT_VALID` | this run's unique `https://<8-hex>.reltroner-statistics.pages.dev` serves the expected identity | what `statistics.reltroner.com` serves |
| `CUSTOM_DOMAIN_CONVERGED` | the canonical origin served the expected identity on 2 consecutive reads, 5 s apart | that every Cloudflare edge has converged |
| Remote MCP accepted | `verify-remote-mcp.mjs --profile page-aware-v1` passed on the exact SHA | behaviour of hosted AI clients |

## State machine

```
wrangler pages deploy ──► UPLOADED  ("Deployment complete"; output kept in $RUNNER_TEMP)
   │  capture-pages-deployment-url.ts: exactly one https://<8-hex>.reltroner-statistics.pages.dev
   ├──✗ DEPLOYMENT_URL_UNAVAILABLE   (none, several, or a lookalike: the step fails)
   ▼
verify-deployment.ts
 1 expected identity   dist/build-info.json complete and == --expected-sha ──✗ EXPECTED_IDENTITY_INVALID
 2 GitHub main         == expected SHA ─────────────────────────────────────✗ STALE_DEPLOY_BLOCKED | MAIN_REF_UNRESOLVED
 3 unique deployment   one matching read within 60 s ───────────────────────✗ DEPLOYMENT_ARTIFACT_MISMATCH | UNREACHABLE
   ▼ DEPLOYMENT_ARTIFACT_VALID                                                 | MALFORMED | REDIRECT_REFUSED
 4 canonical origin    PROPAGATING ⟲ (wait 2 → 4 → 8 → 10 s …) until MATCH, MATCH (5 s apart);
                       a mismatch after a match resets the count ───────────✗ TIMED_OUT | UNREACHABLE
   ▼ CUSTOM_DOMAIN_CONVERGED                                                   | MALFORMED | REDIRECT_REFUSED
 5 GitHub main         still == expected SHA ───────────────────────────────✗ STALE_DEPLOY_BLOCKED | MAIN_REF_UNRESOLVED
   ▼ VERIFIED (exit 0)
verify-remote-mcp.mjs --expected-sha <sha> --profile page-aware-v1 ──► 13 legacy + 3 page tools, REST/MCP parity
```

Steps 2, 3 and 5 run only when their flags are given (`--require-current-main`, `--deployment-url`). Both publish workflows give all of them. The legacy one-argument call runs steps 1 and 4.

## How each read is classified

| Response | Outcome | Next |
|---|---|---|
| HTTP 200, complete identity, all fields equal | `MATCH` | canonical: wait 5 s and read again (2 consecutive needed). Unique URL: done |
| HTTP 200, complete identity, any field differs | `PROPAGATING` | canonical: retry with backoff. Unique URL: final `DEPLOYMENT_ARTIFACT_MISMATCH`, because an immutable deployment does not switch to another build |
| HTTP 3xx | `REDIRECT_REFUSED` | final. The redirect is never followed; only the `Location` host is recorded |
| HTTP 200 that is not JSON, is incomplete, has a foreign `schema_version`, or exceeds 64 KiB | `MALFORMED` | final |
| Any other status (404, 5xx, …) | `HTTP_STATUS` | retry with backoff |
| Network error | `NETWORK_ERROR` | retry with backoff |
| Request timeout | `REQUEST_TIMEOUT` | retry with backoff |

**Identity, one response at a time.** A response matches only if `statistics_commit`, `semantic_digest`, `rules_version` and `sources` (the whole object, so `production` and `remodeling` both) are equal to `dist/build-info.json` in that same body. The comparison is JSON value equality, exactly as before. `schema_version` must be `reltroner-statistics-build.v1` on both sides, commits must be 40 lowercase hex, and the digest 64 hex. Fields from different reads are never combined.

**The expected identity is never taken from a server.** It comes from `dist/build-info.json`, the artifact downloaded for this exact `github.sha`, and it must be complete and equal to `--expected-sha` before any request is made.

## Final reason

| `reason` | Meaning | Exit |
|---|---|---|
| `VERIFIED` | all requested stages passed | 0 |
| `TIMED_OUT` | the canonical origin served a build identity, but never the expected one on consecutive reads, before its deadline | 1 |
| `UNREACHABLE` | no build identity could be read before the deadline | 1 |
| `MALFORMED` | a 200 that is not a Statistics build identity | 1 |
| `REDIRECT_REFUSED` | the build identity URL redirected | 1 |
| `DEPLOYMENT_ARTIFACT_MISMATCH` | the unique deployment URL serves another build | 1 |
| `STALE_DEPLOY_BLOCKED` | GitHub `main` differs from the expected SHA, before or after convergence | 1 |
| `MAIN_REF_UNRESOLVED` | `main` could not be read, which counts as no evidence | 1 |
| `EXPECTED_IDENTITY_INVALID` | `dist/build-info.json` is unreadable, incomplete or from another commit | 1 |
| usage error | invalid arguments: nothing is read or fetched | 2 |

## Bounds and time budget

| Policy | Default | Hard limit for overrides |
|---|---|---|
| Per-request timeout (also clamped to the time left in the phase) | 10 s | 30 s |
| Backoff between non-matching reads | 2 s, doubling, max 10 s | 60 s |
| Consecutive matches required on the canonical origin | 2, 5 s apart | 1–5 |
| Unique-deployment phase deadline | 60 s | 300 s |
| Canonical phase deadline | 120 s | 300 s |
| Attempts per target | 30 | 100 |
| Response body | 64 KiB | 1 MiB |
| `git ls-remote` for `main` (×2) | 20 s each | fixed |

The loop never sleeps into a deadline that leaves no room for another read. The attempt cap ends it even if the clock does not advance.

- Worst case with defaults: 60 + 120 + 2×20 = 220 s.
- Worst case with maximal overrides: 640 s.
- Both fit within the publish job's 15 minutes. In the incident run, the job had used about 42 s before verification.
- Permanently stale domain: 14 reads (waits 2, 4, 8, then 10 s ×10), verdict at about 115 s.
- Persistent timeouts: 7 reads, verdict at about 114 s.
- Converged domain: about 6 s. The read-only production run on 2026-11-18 took 7.1 s including both `main` reads.

The workflows cannot change these values; the CLI has no policy flags.

## Output contract

stdout is one JSON object. The first four fields keep their names, types and meaning:

- `status`: `STATISTICS_DEPLOYMENT_VERIFIED` or `STATISTICS_DEPLOYMENT_UNVERIFIED`.
- `url`: the argument as given.
- `mismatches`: empty exactly when verified. Otherwise it holds the identity keys of the canonical origin's last well-formed response, or one token naming what could not be verified: `unreachable`, `unconfirmed`, `deployment_artifact`, `main_ref` or `expected_identity`.
- `live_commit`: the canonical origin's last observed commit, or `null`.

Additive fields: `reason`, `failed_target`, `detail`, `expected_sha`, `expected`, `deployment_artifact {state, host, attempts, elapsed_ms, observed_commit}`, `custom_domain {state, host, attempts, confirmations_required, consecutive_matches, elapsed_ms, last_observed}`, `main_ref {state, before, after}`, `policy`, `elapsed_ms`, `history[]`, `limitations[]`.

Each `history` entry records:

- `target`, `attempt`, `host`
- `elapsed_ms` (request start, from the beginning of verification) and `duration_ms`
- `outcome` and `http_status`
- `expected_commit` and `observed_commit`
- `mismatched_fields` (for example `sources.production`)
- `detail`: an error code, a malformed-shape field list, or the redirect host
- `headers`, from an allowlist only: `cache-control`, `cf-cache-status`, `age`, `etag`, `last-modified`, `date`, `cf-ray`, `content-type`, and `location_host` for redirects

Response bodies, cookies and other headers are never recorded. Header values are stripped to printable ASCII, so no value can start a new log line.

stderr carries one progress line per read, for example:

```
[verify-deployment] custom_domain #1 +0.0s statistics.reltroner.com HTTP 200 PROPAGATING observed=1dbca25ff3b8 expected=92ad608e1d22 mismatched=statistics_commit cf-cache-status=DYNAMIC
```

## Trust boundaries

| Input | Source | Validation |
|---|---|---|
| Canonical origin | CLI argument | exactly `https://statistics.reltroner.com` or `https://reltroner-statistics.pages.dev` (optional trailing slash); no `http`, port, path, query or credentials |
| Unique deployment URL | this run's Wrangler output, via a step output and `env` | `^https://[a-f0-9]{8}\.reltroner-statistics\.pages\.dev$`. Production and branch aliases, other projects and lookalikes are refused. Exactly one distinct match is required in the log. It is never written into a shell command through `${{ }}` |
| Expected identity | `dist/build-info.json` of the artifact for `github.sha` | complete; equal to `--expected-sha` |
| GitHub `main` | `git ls-remote --exit-code origin refs/heads/main` (the checkout's own credentials, `GIT_TERMINAL_PROMPT=0`) | exactly one `<40-hex>\trefs/heads/main` line; git's stderr is never logged |

Requests: `GET` only, `redirect: 'manual'`, `Cache-Control: no-cache`, and an abort timeout. `no-cache` is a request directive; it does not guarantee that every Cloudflare cache layer is bypassed, so cache-busted URLs are never used as evidence.

## Workflow changes (identical in both publication paths)

The `ci.yml` `publish_statistics` job (main push) and the `release.yml` `publish` job (explicit dispatch):

1. The deploy step runs with `shell: bash`, which adds pipefail, and tees Wrangler's output to `$RUNNER_TEMP/wrangler-pages-deploy.log`. Project, branch, commit and Wrangler version are unchanged.
2. A new step, **Capture this run's unique Statistics deployment URL** (`id: pages_deployment`), runs `scripts/capture-pages-deployment-url.ts` and appends `deployment_url=…` to `$GITHUB_OUTPUT`, or fails.
3. The verify step passes `EXPECTED_SHA`, `DEPLOYMENT_URL` (and `SITE_URL` in `release.yml`) through `env` and calls `node scripts/verify-deployment.ts <origin> --expected-sha "$EXPECTED_SHA" --deployment-url "$DEPLOYMENT_URL" --require-current-main`.
4. Unchanged: the job conditions; `statistics-production` concurrency with `cancel-in-progress: false`; the 15-minute timeout; the `production` environment; the stale-main step before the upload; the credentials check; the GET-only project/custom-domain guard; and the final `verify-remote-mcp.mjs --expected-sha "${{ github.sha }}" --profile page-aware-v1` step.

`tests/unit/publication-workflows.test.ts` asserts all of the above on the parsed workflows.

## What it never does

It never purges a cache, rolls back, redeploys, deletes a deployment, or calls the Cloudflare API, DNS, routes or custom domains. It never follows a redirect or fetches any host outside the allowlist. It never rewrites the expected values from what a server reports, and never accepts a one-off match when confirmation is required. If verification fails, the deployment Wrangler created stays as Cloudflare left it. A failed verdict means "not verified", not "rolled back".

## Limitations

- Convergence is observed from the runner's network location only.
- Remote MCP acceptance reads `build-info.json` once more. An edge that flaps after the confirmed reads would fail that step: it fails closed, it is not hidden.
- `verify-remote-mcp.mjs` and `scripts/guard-pages-target.ts` are unchanged.

## Files

| File | Change |
|---|---|
| `scripts/lib/statistics-deployment-verification.ts` | new: identity validation, origin and deployment-URL validation, Wrangler URL extraction, fetch transport, virtual-clock-ready state machine, CLI contract |
| `scripts/verify-deployment.ts` | now a thin CLI over the library; same one-argument usage and exit codes |
| `scripts/capture-pages-deployment-url.ts` | new: Wrangler output → one validated `deployment_url=` line |
| `.github/workflows/ci.yml`, `.github/workflows/release.yml` | publish jobs: tee, capture, verifier flags (above) |
| `tests/unit/deployment-verification.test.ts` | new: 27 deterministic tests |
| `tests/unit/publication-workflows.test.ts` | new: 6 workflow contract tests |
| `docs/RS-DEPLOY-SHA-005-*.md`, `docs/RC-DEPLOY-02.md` | incident, architecture, acceptance; release-gate pointer |
