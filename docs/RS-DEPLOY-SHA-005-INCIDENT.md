# RS-DEPLOY-SHA-005 — Incident: custom-domain verification failed after a successful Pages deployment

**Status:** RECOVERED_AFTER_INITIAL_VERIFIER_FAILURE. The custom domain serves `92ad608` today, but the original publish job stays failed: it never verified the release, and the 16-tool MCP acceptance never ran for that job.
**Scope:** the Statistics publication flow only (`reltroner-statistics` Pages project, `statistics.reltroner.com`). Studio, Studio Remodeling, DNS, name servers and custom-domain bindings were not touched during the investigation or the fix.
**Fix:** [Architecture](RS-DEPLOY-SHA-005-ARCHITECTURE.md) · [Acceptance](RS-DEPLOY-SHA-005-ACCEPTANCE.md)

## What happened

On 2026-11-17 the `main` push for PR #10 (`92ad608e1d22193120a2fb9a0b42993271797a84`) built and uploaded cleanly. Wrangler reported `Deployment complete` with the unique URL `https://3b64e356.reltroner-statistics.pages.dev`. Less than one second later, `scripts/verify-deployment.ts` read `https://statistics.reltroner.com/build-info.json` once. The domain returned HTTP 200 with the previous release's identity (`1dbca25…`), and the verifier failed the job immediately. The remote MCP acceptance step was skipped. The domain later served `92ad608` without any further action.

## Timeline (UTC; WIB = UTC+7)

| Time | Event | Source |
|---|---|---|
| 2026-11-17 13:49:05.378 | Run 44094544189 (`5b54738`, PR #8): `Deployment complete`, unique URL `e8ea1d48` | publish job 134084517750 log |
| 13:49:05.705 | Verifier, +0.33 s: `UNVERIFIED`, mismatches `statistics_commit, semantic_digest, sources`, live `fc37812…` (the whole previous snapshot) | same |
| 14:47:49.239 | Run 44104975078 (`1dbca25`, PR #9): `Deployment complete`, unique URL `c7f9987c` | publish job 134121634306 log |
| 14:47:50.438 | Verifier, +1.20 s: `VERIFIED`. The job then failed in MCP acceptance (the `include_sections` default), which PR #10 fixed | same |
| 15:23:51.715 | Run 44111759840 (`92ad608`, PR #10): GET-only guard `ISOLATED_STATISTICS_PAGES_VERIFIED`, 0 DNS and 0 name-server mutations | publish job 134146175220 log |
| 15:24:12.049 | Wrangler: `Success! Uploaded 2511 files (234 already uploaded)` | same |
| 15:24:18.420 | Wrangler: `Deployment complete! Take a peek over at https://3b64e356.reltroner-statistics.pages.dev` | same |
| 15:24:18.566 | Verify step starts | same |
| 15:24:19.197 | Verifier, +0.78 s after `Deployment complete`: `STATISTICS_DEPLOYMENT_UNVERIFIED`, mismatches `["statistics_commit"]`, `live_commit` `1dbca25…`. The step took about 1 s with one request and no retry. MCP acceptance skipped | same |
| later on 2026-11-17 | Owner: MCP `get_statistics_manifest` returns `92ad608…`, production `ad895e6d…`, remodeling `33ea8fa5…`, digest `4119d30b…` | owner report |
| 2026-11-18 05:36:44 | Read-only probe: the custom domain, `3b64e356…pages.dev` and the production alias all serve `92ad608` with the same ETag `"3378b8458558620cbcfb08194d3d39fe"`. The custom domain answers `cf-cache-status: DYNAMIC` and `Cache-Control: public, max-age=0, must-revalidate`, with no `Age` header and no redirect | this investigation |
| 2026-11-18 06:10:07 | The new verifier, read-only against production: unique deployment valid, custom domain confirmed on 2 of 2 reads, `main` equal to `92ad608` before and after: `VERIFIED` | this investigation |

## The same race in every custom-domain publication so far

All 8 `main` pushes that published to the custom domain since RC-DEPLOY-02, measured from Wrangler's `Deployment complete` to the verifier's printed verdict (which includes Node start-up and the single request):

| Run | Commit | Gap | Verdict | Live commit seen |
|---|---|---|---|---|
| 43596389515 | `f1c42cd` | 0.58 s | VERIFIED | new |
| 43678746193 | `a00a07f` | 0.44 s | VERIFIED | new |
| 43709537762 | `4f81f1a` | 0.61 s | VERIFIED | new |
| 43720463014 | `54708b0` | 0.57 s | VERIFIED | new |
| 43882166165 | `fc37812` | 0.76 s | VERIFIED | new |
| 44094544189 | `5b54738` | 0.33 s | **UNVERIFIED** | previous (`fc37812`) |
| 44104975078 | `1dbca25` | 1.20 s | VERIFIED | new |
| 44111759840 | `92ad608` | 0.78 s | **UNVERIFIED** | previous (`1dbca25`) |

Two of eight first reads came back stale. Elapsed time alone does not predict the result: 0.76 s passed and 0.78 s failed.

## Proven

1. **The upload succeeded.** Wrangler uploaded every file, created the deployment and printed its unique URL. The GET-only guard confirmed the exact Statistics project and its sole active custom domain.
2. **The verifier had a logic defect.** Its loop, `for (let attempt = 0; attempt < 6 && !live; attempt++)`, ended at the first HTTP 200 whatever that response contained. A stale but valid response was therefore a final verdict, and the 10-second retries only ever applied to unreachable responses. The ~1 s step duration in the log confirms that one request was made and no wait happened. `tests/unit/deployment-verification.test.ts` replays the sequence against a faithful transcription of the old loop and reproduces the job's output field for field.
3. **The stale response was a whole earlier snapshot, not a mixture.** For `92ad608` only `statistics_commit` differed, because PR #10 changed no data. For `5b54738` commit, digest and sources all belonged to the previous release.
4. **The custom domain converged later** (owner's MCP read; the probe and the verifier run above).
5. **The unique deployment URL serves the `92ad608` artifact** (read on 2026-11-18).

## Not proven (hypotheses, in order of fit)

- **A. Short propagation after `Deployment complete`.** Cloudflare Pages may take a short, variable time to serve a new production deployment from the edge that answered the runner. The timing table, the whole-snapshot staleness and the later convergence all fit. It is unproven: no response headers were captured at the time, and Cloudflare's internal propagation cannot be observed from the job.
- **B. A zone cache served an old object.** This is weakened but not excluded. Today the canonical response is `cf-cache-status: DYNAMIC` with `max-age=0, must-revalidate`, but the headers of the historical stale response are unknown.
- **C. Routing to the wrong project or a stale route.** No evidence supports it. The guard confirmed the right project and its sole active domain, the stale content was this project's previous deployment, and the domain converged with no configuration change.
- **Unknown:** the actual propagation duration (bounded only by the later observations), and whether every Cloudflare edge had converged at any given moment.

## Root cause

The verifier treated a successful but mismatched HTTP 200 as final, so it never waited for the canonical domain to switch to the new deployment. The eventual consistency between Wrangler's completion and what the custom domain serves (hypothesis A, duration unknown) exposed this. It did not cause the failure on its own.

**Secondary finding.** The old comparison used `JSON.stringify` on both sides without checking the format of the expected values. If a build had been produced without a commit (`statistics_commit: null`) and a site served the same, `null === null` would have counted as verified. This fail-open is now closed: the expected identity must be complete before any request is made.

## Impact

- No outage. The previous release kept serving until the switch, and `92ad608` became live without being verified.
- For `92ad608` and `5b54738`, the CI verification and (for `92ad608`) the strict 16-tool REST/MCP acceptance never ran against the published release. The owner's single MCP manifest read shows convergence. It is not the full acceptance.

## Remediation in this change

- The verifier keeps polling through mismatching HTTP 200 responses until a bounded deadline. It requires two consecutive matching reads of the canonical domain, and on timeout it fails closed with the last observed identity and the full history. See [Architecture](RS-DEPLOY-SHA-005-ARCHITECTURE.md).
- This run's unique deployment URL is now captured from Wrangler's own output and verified separately as artifact evidence. The custom domain must still pass on its own.
- `main` is re-read before and after convergence, so a newer commit makes the job `STALE_DEPLOY_BLOCKED`.
- No cache purge, rollback, redeploy, DNS or route change happens anywhere, automatically or otherwise.

## Still open

`LIVE_POST_MERGE_ACCEPTANCE` is pending the owner's merge. Only a real publication from `main` with this change can show convergence, verified on the exact custom domain, followed by the 16-tool live acceptance.
