# RC-DEPLOY-01 — Production Readiness & Visual Acceptance

> **Historical acceptance record.** RC-DEPLOY-02 now authorizes exactly `statistics.reltroner.com` on the dedicated Statistics Pages project. Its safe two-stage bootstrap, hostname guard and automatic main-SHA deployment are specified in [RC-DEPLOY-02](RC-DEPLOY-02.md). RC-DEPLOY-01's earlier blanket custom-domain prohibition applies only to its historical release policy, not the newly approved Statistics-only hostname.


**Scope:** Reltroner Statistics only. This is an isolation and release acceptance gate, not permission to change any Reltroner DNS record or nameserver.

## Protected services — no changes authorized

- `reltroner.com` / `www.reltroner.com` (Studio)
- `lms.reltroner.com` (Learning)
- `hrm.reltroner.com` (HRM)
- Their Cloudflare zones, DNS records, nameservers, Workers routes, TLS settings, origin configuration and deployments.

This repository never deploys to those hosts or their Pages projects.

## Release strategy: DNS-free Pages

The **only** permitted publication target under RC-DEPLOY-01 is an existing, dedicated Cloudflare Pages project named `reltroner-statistics`, served at **`https://reltroner-statistics.pages.dev`**.

No custom domains, including a proposed `stats.reltroner.com`, are permitted in this release. Do not add DNS records, change nameservers, create new zone routes, or attach custom domains.

Cloudflare Pages provides a `*.pages.dev` address without requiring a custom domain. A future statistics subdomain would require a separate, explicitly authorized change.

### Required configuration (not stored in this repository)

- GitHub repository variable `CLOUDFLARE_PAGES_PROJECT=reltroner-statistics`.
- GitHub repository variable `SITE_URL=https://reltroner-statistics.pages.dev`.
- GitHub secret `CLOUDFLARE_ACCOUNT_ID`.
- GitHub secret `CLOUDFLARE_API_TOKEN`, scoped to the dedicated Pages project/account as narrowly as possible; no DNS write permission.
- GitHub `production` environment with appropriate approval protections.
- The Pages project must already exist and have **zero custom domains**. No automatic project creation is performed here.

### Automation boundaries

The `Analysis release` workflow may execute its read-only analysis/build gates on schedule or source dispatch. **Publication is always disabled for those events.** Publishing requires all of the following:

1. Manual `workflow_dispatch` on `main` with `publish_statistics=true`.
2. Both repository variables exactly match the Statistics-only values above.
3. A read-only Cloudflare API preflight confirms the actual project identity and **zero** attached custom domains.
4. Existing release gates pass; GitHub environment approval and credentials are available.
5. Wrangler deploys only `dist/` to `reltroner-statistics`.
6. The deployed `/build-info.json` matches the local build identity and pinned source SHAs.

Any mismatch fails closed. The preflight uses **GET requests only**. It never calls Cloudflare DNS/nameserver/domain mutation endpoints.

## Quality acceptance evidence

The current CI validates the pinned P0R baseline on Ubuntu and Windows, Python analytics on both platforms, typed contracts, source-backed analysis, PDF generation, static links, CSP/security headers, and Playwright UI tests.

RC-DEPLOY-01 also captures screenshots of the overview, statistics, supervised decision trees, creative decisions, narrative audit and reports at the four Playwright viewport profiles in both light and dark themes. The files are uploaded as the `statistics-visual-acceptance-<SHA>` GitHub Actions artifact.

**Screenshots are review evidence, not automatic human visual approval.** The Product Owner must visually inspect the artifact for hierarchy, text clipping, color contrast, responsive navigation, graph legibility, chart presentation and missing images before production acceptance is declared.

## Status vocabulary

- `BUILD_VERIFIED`: CI, test and static output gates pass.
- `VISUAL_EVIDENCE_CAPTURED`: screenshots exist and CI test passed; human review may still be pending.
- `DEPLOYMENT_HELD`: project/credentials/manual authorization absent, or guard refuses target.
- `STATISTICS_DEPLOYMENT_VERIFIED`: Statistics Pages URL serves the exact build identity.
- `VISUAL_ACCEPTED`: Product Owner has reviewed the screenshots/live rendering.

Do not label a build or CI artifact a live deployment.

## Rollback and audit

Pages publishes immutable deployment versions. If a verified Statistics-only deployment needs rollback, use the Statistics Pages project exclusively; never rollback Studio, LMS or HRM. Record the Statistics commit SHA, source SHAs, artifact digest, deployed `pages.dev` URL and release workflow run ID. A rollback is an external Pages action and is not automatically authorized by this readiness gate.
