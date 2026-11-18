# RS-DEPLOY-SHA-005 — Acceptance

The status of each Definition-of-Done item, with the evidence behind it. All gates were run in the isolated worktree. Nothing was merged or deployed, and no Cloudflare setting was read with credentials or changed. Background: [Incident](RS-DEPLOY-SHA-005-INCIDENT.md) · [Architecture](RS-DEPLOY-SHA-005-ARCHITECTURE.md)

## Preflight (read-only, before the first edit)

| Item | Value |
|---|---|
| Time | 2026-11-18 about 05:32–05:40 UTC (12:32–12:40 WIB) |
| Agent worktree | `C:\Projects\reltroner-statistics-rs-deploy-sha-005`, branch `fix/rs-deploy-sha-005-custom-domain-convergence`, `HEAD` `92ad608e1d22193120a2fb9a0b42993271797a84`, clean; origin `Reltroner/reltroner-statistics` |
| Local `main`, `origin/main`, GitHub `refs/heads/main` | all `92ad608e1d22193120a2fb9a0b42993271797a84`: **LOCAL_MAIN_1_TO_1_GITHUB: VERIFIED**. Re-checked before committing: unchanged |
| Owner workspace | `C:\Projects\reltroner-statistics` on `feat/rs-creative-quality-003` at `66cf0ba`, with **staged** `.vscode/settings.json` and `public/reltroner-statistics-logo.webp`. Read only through `git --no-optional-locks`; not switched, stashed or modified |
| Owner files (SHA-256) | `settings.json` `5515eb78…cb649f09` (60 B); logo `b1fecd11…8ab868b0` (173,930 B). Equal to the owner's backup copies before the work and unchanged when committing |
| Owner backup | `C:\Projects\_reltroner-owner-backups\rs-deploy-sha-005-20261118-122433-e8b45ad1` exists (the printed repeated-backslash form resolves to the same folder). Read only |

## Definition of done

| Item | Result | Evidence |
|---|---|---|
| Root cause demonstrated | PASS | Publish job logs: verdict 0.78 s after `Deployment complete`, about 1 s step, one request. Test 1 replays the sequence against a transcription of the old loop and reproduces the job's `status`, `url`, `mismatches` and `live_commit` exactly |
| Mismatching HTTP 200s are polled within bounds | PASS | Tests 1–8. Default schedule asserted exactly: 14 reads, waits 2/4/8/10 s, verdict at 114.56 s (virtual clock) |
| Permanent mismatches stay failures | PASS | Tests 3, 4, 9, 10, 12, 13: `TIMED_OUT` or `DEPLOYMENT_ARTIFACT_MISMATCH`, never success |
| Identity and security invariants retained | PASS | Same four identity keys, same JSON equality, one response at a time (tests 9–11). TLS-only allowlisted origins; redirects refused; lookalike URLs refused; bodies, cookies and other headers never logged (tests 14–17, 21–24). `main` re-checked (tests 18–20) |
| Workflows hardened without widening | PASS | Tests 28–33 on the parsed `ci.yml` and `release.yml` |
| 16 MCP tools / 18 REST operations | PASS | workerd: 18 REST operations, 16 MCP tools, 3 page tools (gate 12). Protocol contract tests 9/9 (gate 8). Test 31 pins 13 legacy + 3 page tools |
| No browser-facing change | PASS | All 50 JS/CSS bundles byte-identical to baseline. No file under `src/`, `public/`, `functions/` or `analytics/` changed. See below |
| Local regression gates | PASS | All 13 gates exit 0 on the committed tree `3475a4f` (table below) |
| GitHub PR CI | see the PR | Runs on the PR head. It does not exercise a deployment |
| Owner workspace and files unchanged | PASS | Above |
| Live post-merge acceptance | **PENDING** | Requires an owner-authorized merge (checklist at the end) |

## New tests (33: 27 verifier + 6 workflow contract)

`tests/unit/deployment-verification.test.ts` uses a virtual clock and scripted responses: no network and no sleeps; the whole file runs in about 1.5 s. `tests/unit/publication-workflows.test.ts` parses both workflows. Both files run on Ubuntu and Windows in CI's determinism job.

1. **Root cause:** the old loop ended on the first stale HTTP 200; the new verifier converges on the same sequence.
2. **Replay of job 134084517750:** a whole previous snapshot (commit, digest and source) is `PROPAGATING`.
3. **Old build forever:** `TIMED_OUT` with the exact default schedule.
4. **Confirmation:**
   - match, then old, then match, match → `VERIFIED`;
   - a lone match followed by the old build → `TIMED_OUT`;
   - a lone match at the deadline → `unconfirmed`.
5. 404 / 503 / network error / timeout / 522, then a match → `VERIFIED`.
6. Persistent timeouts → `UNREACHABLE` within the deadline.
7. A frozen clock still stops at the attempt cap.
8. Determinism: identical inputs give identical results, waits and progress lines.
9. Wrong digest, rules version or production/remodeling source with the right commit: refused until every field matches.
10. Fields from different responses are never combined.
11. The expected identity must come from a complete artifact for `--expected-sha`. This also closes the old `null === null` pass.
12. A valid unique URL never substitutes for the custom domain.
13. A correct custom domain cannot hide a wrong unique artifact, and an unreachable unique URL fails.
14. HTML, truncated JSON, an array, a null commit, a short digest, missing sources, a foreign schema and an oversized body → `MALFORMED`, with one read and no retry.
15. Redirects (absolute, protocol-relative, relative, lookalike) → `REDIRECT_REFUSED`; the `Location` host is never contacted.
16. Origin and deployment-URL allowlists: 19 bad origins and 14 bad deployment URLs refused.
17. Wrangler URL capture: exactly one URL; 11 lookalike or foreign forms refused.
18. `main` advanced before verification → `STALE_DEPLOY_BLOCKED`, with no site request.
19. `main` advanced during convergence → `STALE_DEPLOY_BLOCKED`; an unreadable `main` → `MAIN_REF_UNRESOLVED`.
20. Strict `git ls-remote` parsing.
21. Fetch transport: `GET`, `Cache-Control: no-cache`, `redirect: 'manual'`, an abort signal, no body.
22. Body limits, by declared length and by streamed size; non-200 bodies are not read.
23. A real aborted fetch (`AbortSignal.timeout`) → `REQUEST_TIMEOUT`, retried within bounds.
24. Header allowlist, control-character stripping, and no body or cookie content in results or logs.
25. Policy overrides bounded: the worst case is 640 s, inside the 15-minute job.
26. One-argument CLI: same argument, leading fields `status, url, mismatches, live_commit`, exit 0/1/2; arguments are checked before any read.
27. The real CLIs run as Node 22 ESM TypeScript and reject bad input before any network access.
28. Read-only permissions and the `statistics-production` group (`cancel-in-progress: false`) in both paths.
29. The stale-main check and the GET-only guard precede the single Wrangler upload, which runs with pipefail.
30. Capture → verify through `env` only; no `${{ }}` in the verifier command.
31. The strict 16-tool `page-aware-v1` acceptance stays last, after convergence; 18 operations and 16 tools pinned.
32. No purge, rollback, deployment or project command, and no direct Cloudflare API call, in any workflow.
33. No site page, function or public file references the release tooling.

**Mutation checks.** Each mutation was applied, the tests run, and the file restored and re-hashed:

| Mutation | Result |
|---|---|
| none | 33 pass |
| custom domain stops on the first stale 200 (the incident defect) | 11 fail |
| one confirmation instead of two | 7 fail |
| `semantic_digest` dropped from the comparison | 3 fail |
| `ci.yml` reverted | 2 fail |
| `release.yml` reverted | 2 fail |
| `redirect: 'follow'` | 1 fail |

## Local gate runs (Windows 11, Node v22.23.1, npm 10.9.8)

**Baseline:** unmodified `92ad608`, 2026-11-18 05:48–05:59 UTC. **Final:** committed tree `3475a4f`, clean, 06:14–06:25 UTC. Both runs used the same isolated worktree, with the GitHub token passed only to `verify:baseline` and `pipeline`.

| # | Command | Baseline | Final |
|---|---|---|---|
| 1 | `node --version` | 0 | 0 |
| 2 | `npm --version` | 0 | 0 |
| 3 | `npm ci` | 0 (32.9 s) | 0 (31.1 s) |
| 4 | `npm run verify:baseline` | 0 | 0 |
| 5 | `npm run schemas:check` | 0 | 0 |
| 6 | `npm run typecheck` | 0: 226 files, 0 errors, 0 warnings | 0: 230 files, 0 errors, 0 warnings |
| 7 | `npm test` | 0: 147 passed | 0: **180 passed** (147 + 33 new), 0 failed |
| 8 | `node --test tests/protocol/mcp-contract-profile.test.mjs` | 0: 9/9 | 0: 9/9 |
| 9 | `npm run test:py` | 0: 24 passed | 0: 24 passed |
| 10 | `npm run pipeline` | 0: production `ad895e6d`, remodeling `33ea8fa5`, digest `4119d30b…` | 0: same sources, same digest (no source drift between the runs) |
| 11 | `npm run build` | 0: 635 pages, 642 PDFs, 37,629 links, 2,746 files | 0: 635 pages, 642 PDFs, 37,629 links, 2,746 files; `build-info.json` `3475a4f`, tree clean |
| 12 | `npm run verify:runtime` | 0: 18 REST operations, 16 MCP tools, 3 page tools, 634 mirrors (625 FULL / 9 PARTIAL), 617 values compared | 0: identical counts |
| 13 | `npm run test:e2e` | 0: 441 passed, 1 skipped (5.7 min) | 0: 441 passed, 1 skipped (6.7 min) |

The skipped E2E test is the existing mobile-menu test, which is skipped on the desktop project by design. Durations were within run-to-run variance on one machine, apart from the pipeline (35 s versus 64 s, a warm object cache) and E2E (+60 s with the same tests and byte-identical bundles, so attributed to machine load, not to the change).

## Non-functional evidence

- **Browser payload:** the `dist/_astro` JS and CSS are **byte-identical** to baseline: 50 files, 3,258,578 JS bytes and 71,551 CSS bytes, every SHA-256 equal.
- **Built HTML:** 635 pages in both builds. 586 pages differ in bytes, and they are exactly the pages that embed the pipeline's `generated_at` (`2026-11-18T05:50:43.200Z` versus `06:16:08.184Z`), directly or through Astro island uids hashed from those props. The other 49 pages are byte-identical. No site or runtime input changed between the two commits.
- **Verifier cost:** release tooling only; it ships nothing to browsers (test 33). Converged path: about 6–7 s (production read on 2026-11-18: 7.1 s). Failure path: at most 220 s with defaults.

## Live read-only evidence (2026-11-18)

| Check | Result |
|---|---|
| `GET https://statistics.reltroner.com/build-info.json` (05:36:44 UTC) | 200; `92ad608…`, digest `4119d30b…`, production `ad895e6d…`, remodeling `33ea8fa5…`; ETag `"3378b8458558620cbcfb08194d3d39fe"`; `cf-cache-status: DYNAMIC`; `Cache-Control: public, max-age=0, must-revalidate`; no `Age`; no redirect |
| `GET https://3b64e356.reltroner-statistics.pages.dev/build-info.json` | 200; same identity and ETag; `x-robots-tag: noindex` |
| `GET https://reltroner-statistics.pages.dev/build-info.json` | 200; same identity and ETag |
| `GET https://statistics.reltroner.com/api/v1/manifest` | snapshot `92ad608…`, same digest and sources; 18 operations, 16 marked `mcp_tool` |
| New verifier, one argument (06:10:00 UTC) | `VERIFIED`, 2/2 matches, 5.8 s, exit 0 |
| New verifier, CI form with `--deployment-url https://3b64e356…` `--expected-sha 92ad608…` `--require-current-main` (06:10:07 UTC) | `DEPLOYMENT_ARTIFACT_VALID` (1 read), `CUSTOM_DOMAIN_CONVERGED` (2/2), `main` `92ad608` before and after, `VERIFIED`, 7.1 s, exit 0 |

The incident deployment therefore converged later: **RECOVERED_AFTER_INITIAL_VERIFIER_FAILURE**. This is not a pass of the original job.

## Runbook: persistent mismatch after a publication

Start from the verifier's JSON in the failed job, using `reason`, `failed_target`, `custom_domain.last_observed` and `history[]`. Look in particular at `cf-cache-status`, `age`, `etag` and `cf-ray` for each read. Everything below is read-only unless it says *owner decision*.

| `reason` | What it means | What to do |
|---|---|---|
| `TIMED_OUT`, last observed = the previous release | The domain kept serving the previous deployment for the whole window | Compare `curl -sS -D - https://statistics.reltroner.com/build-info.json` with the run's unique URL from the capture step. If the unique URL is right and the domain is still old after several minutes, check Workers & Pages → `reltroner-statistics` → Deployments (is the new deployment the production one?) and Custom domains (is it ACTIVE?). *Owner decision:* re-run the failed publish job, which re-uploads the same artifact if `main` has not moved, or dispatch `Analysis release` with `publish_statistics=true`. A cache purge or a route change is never automated and needs separate approval |
| `TIMED_OUT`, same commit but another digest or source | Two publications of the same commit with different source snapshots (CI push and a release dispatch) were close together | Find the run that published last. Re-run the authoritative one (*owner decision*) |
| `DEPLOYMENT_ARTIFACT_MISMATCH` | The unique URL serves a different build | Stop. Inspect that run's Wrangler output and the downloaded artifact. Do not re-run blindly |
| `MALFORMED` or `REDIRECT_REFUSED` | The domain does not serve a Statistics build identity, or redirects | Inspect the custom-domain binding, redirect rules and page rules in the Cloudflare UI (read-only). Never change DNS from CI |
| `UNREACHABLE` | No build identity could be read | Check Cloudflare status and name resolution, then re-run once the site is reachable |
| `STALE_DEPLOY_BLOCKED` | A newer `main` exists | Nothing to do: the newer commit's own run publishes and verifies |
| `MAIN_REF_UNRESOLVED` | GitHub could not be read | Re-run the job |
| `EXPECTED_IDENTITY_INVALID` | The downloaded artifact is not this commit's complete build | Inspect the `site-<sha>` artifact of the site job |

A failed verification never rolls anything back. The deployment Wrangler created stays as Cloudflare left it; the verdict means "not verified". Never force-push, reset, bypass the verifier, or change DNS or name servers to make a check pass.

## Release risks

1. **Longer success path.** A successful verification now takes at least one confirmation interval (about 6–7 s instead of under 1 s), and a failure can take up to about 3.7 minutes. Both stay inside the 15-minute publish job.
2. **Wrangler output format.** If Wrangler stopped printing a unique `https://<8-hex>.reltroner-statistics.pages.dev` URL, the capture step would fail closed after an upload that succeeded. Wrangler is pinned at 4.161.0 and the tests document the exact output; re-check the pattern when upgrading.
3. **GitHub availability.** An outage while `main` is read gives `MAIN_REF_UNRESOLVED`, which fails closed. Re-run the job.
4. **Slow propagation.** If the domain takes longer than 120 s to serve the release, the result is `TIMED_OUT` and the job goes red even though the site may converge later. This is fail-closed by design, and the history shows what was served.
5. **Edge flapping after confirmation.** Remote MCP acceptance reads `build-info.json` again. A flap there fails closed and stays visible.
6. **Strict origin allowlist.** The verifier accepts only `https://statistics.reltroner.com` and `https://reltroner-statistics.pages.dev`. Unique deployment URLs go through `--deployment-url`.
7. **Pre-existing behaviour, unchanged.** `ci.yml`'s workflow-level `cancel-in-progress: true` can cancel a superseded `main` run in the middle of publishing. The newer run's verification is the authority.

## Post-merge acceptance (owner)

Run this only after an owner-authorized merge to `main`:

1. In the `main` push run, the job **Publish verified main SHA to Statistics custom domain** shows:
   - the capture step writing `deployment_url=https://<8-hex>.reltroner-statistics.pages.dev`;
   - the verify step printing progress lines, then JSON with `reason: VERIFIED`, `deployment_artifact.state: DEPLOYMENT_ARTIFACT_VALID`, `custom_domain.state: CUSTOM_DOMAIN_CONVERGED` and `main_ref.state: MAIN_EQUALS_EXPECTED`;
   - `verify-remote-mcp.mjs` printing `status: PASS` with profile `page-aware-v1`: 13 legacy and 3 page tools, REST/MCP parity, source policies and negative cases.
2. Independently, `https://statistics.reltroner.com/build-info.json` returns the merge commit's SHA, and the digest and source SHAs of that run's `site-<sha>` artifact.
3. Only then record `LIVE_POST_MERGE_ACCEPTANCE: PASS`.

## What "PASS" here does not mean

- It does not mean a release was published or accepted live. Nothing was merged or deployed.
- The PR CI run does not exercise a Cloudflare deployment: the publish job runs only on a `main` push.
- Observing convergence from one runner does not prove that every Cloudflare edge serves the release.
