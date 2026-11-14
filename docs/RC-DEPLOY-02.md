# RC-DEPLOY-02 — Local / GitHub SHA Parity and statistics.reltroner.com

**Authorized hostname:** `statistics.reltroner.com`  
**Dedicated Pages project:** `reltroner-statistics`  
**Repository:** `Reltroner/reltroner-statistics` production branch `main`  
**Local workspace:** `C:\Projects\reltroner-statistics`  
**Release model:** Build once in GitHub Actions, publish its verified `dist/` to Pages, compare live `build-info.json` with the exact commit and evidence digest.  
**Status:** Code gates may pass before external Cloudflare configuration is complete; do not confuse build readiness with public deployment.

## Protected infrastructure / immutability

Never modify DNS records, nameservers, Workers routes, deployment projects, origins, SSL or routing for:
- `reltroner.com`, `www.reltroner.com` — Studio
- `lms.reltroner.com` — LMS
- `hrm.reltroner.com` — HRM

Only the single `statistics` hostname is in scope, and its Cloudflare DNS / Pages-domain onboarding happens explicitly **in the Cloudflare UI** by the account owner, not in this repository's CI or API preflight. Do not modify or overwrite a pre-existing `statistics` record without first independently validating its ownership and purpose. Nameservers **must remain unchanged**.

## What 1:1 means

- **Local ↔ GitHub:** tracked working tree clean, local `main` HEAD equals `origin/main`, same source snapshot. Ignored build outputs and dependency caches are not meant to be identical.
- **GitHub ↔ published website:** the live `/build-info.json` on `statistics.reltroner.com` exposes `statistics_commit` equal to the current GitHub `main` SHA plus a versioned analytical `semantic_digest` and pinned production/remodeling source SHAs. Browser output is a compiled static website, not raw Git repository files.
- **Eventual consistency:** on a new push, builds and publication take time. If any CI/deploy gate fails, the previous good deployment remains online until corrected; do not claim instantaneous parity.
- **Authority:** Statistics reads Studio/Remodeling through GitHub API at pinned SHAs. It does not write to those repositories. A new Statistics build may contain updated source observations without changing the underlying Stats code, and manifest SHA identity discloses that explicitly.

## Cloudflare setup — isolated two-stage bootstrap

**Do not attach a custom domain to the wrong Pages project.**

1. In Cloudflare Dashboard → **Workers & Pages**, locate the dedicated `reltroner-statistics` Pages project. If absent, create a **new Direct Upload Pages project** named exactly `reltroner-statistics`. The build is produced by GitHub Actions, not by Cloudflare Pages. Never reuse the Studio/LMS/HRM project. If the dedicated project is Git-connected, ensure its configured repository is `Reltroner/reltroner-statistics` and avoid competing automatic builds; GitHub Actions remains the canonical publisher.
2. In GitHub → `Reltroner/reltroner-statistics` → Settings → Secrets and variables → Actions:
   - Repository **variable** `CLOUDFLARE_PAGES_PROJECT=reltroner-statistics`.
   - Repository **variable** `SITE_URL=https://reltroner-statistics.pages.dev` **for first bootstrap only**.
   - Repository **secret** `CLOUDFLARE_ACCOUNT_ID` matching the Pages project's account.
   - Repository **secret** `CLOUDFLARE_API_TOKEN` with the narrowest viable Pages read/edit permissions for that account; no DNS write permission.
   - GitHub environment `production`, preferably protected by explicit review.
3. On the repository's GitHub Actions tab, manually execute **Analysis release — pipeline, gates, publication** on `main` with `publish_statistics=true`. The read-only preflight must confirm the exact Pages project and **zero custom domains**. This bootstraps the Pages deployment at `https://reltroner-statistics.pages.dev` without DNS changes.
4. In Cloudflare → Workers & Pages → **reltroner-statistics** → **Custom domains** → **Set up a domain** → `statistics.reltroner.com`. Inspect and confirm the change applies only to the `statistics` label. For a zone already managed by Cloudflare, Cloudflare can offer to create the required CNAME automatically. If an existing `statistics` record or Worker route exists, stop and inspect it instead of overwriting. Never change apex, `www`, `lms`, `hrm`, wildcard, MX, or nameserver entries.
5. Confirm Pages custom-domain status **ACTIVE** for exactly `statistics.reltroner.com`. Confirm TLS is valid. The publish guard checks Cloudflare's **GET** projects and custom-domain endpoints and rejects missing, pending, incorrect or extra domains.
6. Change GitHub **repository variable** `SITE_URL=https://statistics.reltroner.com`. Leave `CLOUDFLARE_PAGES_PROJECT` unchanged. A manual `Analysis release` with `publish_statistics=true` performs the initial custom-domain publication. Thereafter a verified `push` to `main` automatically attempts to deploy exactly its successful GitHub Actions site artifact. PR builds never publish.
7. In PowerShell 5.1, on the local workspace, run `.\scripts\sync-main-ff-only.ps1` for a safe fast-forward and `.\scripts\sync-main-ff-only.ps1 -VerifyWebsite` once the custom domain is live. The second command fails if local/GitHub SHA differs from the public site SHA.

Cloudflare documentation: https://developers.cloudflare.com/pages/configuration/custom-domains/ and https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

## CI / security gates

The `Reltroner Statistics — CI` workflow:

1. Runs Node contracts, pinned P0R baseline, and Python analytics on Ubuntu and Windows.
2. Builds a static site with HTML-derived PDFs and validates links, security headers and browser E2E tests.
3. Preserves screenshots and the exact output artifact `site-${{ github.sha }}`.
4. **Only on an eligible main push** with exact Statistics-only repository variables, downloads that same artifact, checks the SHA is still current, and performs a Cloudflare **GET-only** project/domain preflight.
5. Uses Wrangler to upload **only** `dist/` into project `reltroner-statistics`; it cannot invoke Cloudflare DNS/nameserver changes.
6. Fetches `https://statistics.reltroner.com/build-info.json` and requires matching `statistics_commit`, `semantic_digest`, `rules_version`, and pinned source identities.

The manual `Analysis release` workflow remains an explicit recovery/bootstrap path, not a scheduled auto-publisher. Scheduled and repository-dispatch events build without publishing.

## Verification & failure classification

- `LOCAL_MAIN_1_TO_1_GITHUB`: local checked-out HEAD exactly equals fetched `origin/main` and tracked/untracked working tree is clean.
- `BOOTSTRAP_PAGES_VERIFIED`: `pages.dev` publication active, no custom domains yet.
- `CUSTOM_DOMAIN_ACTIVE`: Pages domain list includes **only** `statistics.reltroner.com` as active.
- `STATISTICS_DEPLOYMENT_VERIFIED`: live custom domain returns matching verified build identity.
- `DEPLOYMENT_HELD`: repo variables, tokens, Pages project, domain association, or authorizations incomplete.
- `STALE_DEPLOY_BLOCKED`: a newer main commit superseded the release candidate.
- `SITE_SHA_DRIFT`: published SHA doesn't match GitHub main. Check latest successful GitHub Actions publish, restore credentials, review production environment approvals and re-run the current main release. Never force-push, reset, change unrelated DNS or bypass CI.

**Manual Git synchronization is intentionally conservative:** dirty, diverged or locally ahead branches stop with an explanation instead of overwriting work.

## Final acceptance

Only claim all three surfaces synchronized if these checks independently pass:

1. Local main == origin/main, clean tree.
2. GitHub CI green on the exact production commit.
3. Cloudflare Pages production project identity and the sole Statistics custom domain active.
4. Public `build-info.json` matches main SHA, source SHAs and semantic digest.
5. HTTPS, homepage, `/creative/decisions`, `/statistics/decision-trees`, `/reports`, security headers and responsive UI have been smoke-tested on the custom hostname.
6. Protected Studio/LMS/HRM domains remain operational and unchanged.

No GitHub-only change can perform the Cloudflare account UI setup or synchronize an inaccessible Windows filesystem by itself.
