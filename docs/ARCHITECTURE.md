# Architecture — P0 Production-First Source Authority

**Status:** INITIAL ENGINEERING; static dashboard and read-only diff are implemented as a P0 baseline. Full source-meaning QA, multi-format renderers, true deployment verification, and auto-deployment are not certified.

## Immutable input identities

1. `production_deployed_sha`: the verified Cloudflare success deployment SHA; **unknown until verified**.
2. `production_main_sha`: an independently pinned GitHub `reltroner-studio` commit.
3. `remodeling_sha`: an independently pinned GitHub `reltroner-studio-remodeling` commit.
4. `rules_version`: comparator behavior version.

`production_main_sha` and `production_deployed_sha` must not be conflated. P0 defaults to the former and clearly marks deployment status `UNVERIFIED`.

## Data boundaries

- Production source: `Reltroner/reltroner-studio`.
- Draft/modeling source: `Reltroner/reltroner-studio-remodeling`.
- This repository: generated static views, QA output, tooling, not a canon authority.
- Do not edit either input checkout. Paths under `content/remodeling/**` and other internal-only material are excluded from the public projection.
- Compare `content/**/*.md` and `data/asthortera/*.json` only. Do not treat `app/`, `components/`, `lib/`, `tests/` as missing draft content.
- A `DRAFT_ONLY` file is **not** a production defect. A changed model value is a **review candidate**, not proof the production value is wrong.
- Do not promote data from remodeling to production automatically.

## P0R pipeline (GitHub API ingestion)

```text
GitHub API: commit SHA → tree SHA (root tree recomputed and verified) → blob SHAs
        → strict comparison scope registry (rules version)
        → identity by Git blob SHA (no checkout bytes, no OS line-ending influence)
        → blobs fetched only where content is needed, each verified against its SHA
        → structural JSON diff, markdown frontmatter/section diff, format-only detection
        → audit.json with semantic digest + source provenance
        → staged artifacts, swapped in only on success (artifacts.previous = last known good)
```

The Windows workstation previously reported 0 identical files because `core.autocrlf=true` converted production checkouts to CRLF while remodeling's `.gitattributes` kept Markdown LF; hashing checkout bytes therefore never matched. P0R removes filesystem checkouts from the identity path entirely and replaces host-locale `localeCompare` ordering with code-unit ordering. The pinned pair f54f947/1887e5d reproduces 448/393/41/1/13 and 422 JSON field findings on Windows and Ubuntu with an identical semantic digest (tests/baselines/p0r-baseline.json).

## Export contract

Users choose one or more formats from `json`, `csv`, `xlsx`, `txt`, `md`, `html`, `pdf`, and `xml`. **XML has equal status; selecting it is not required.** One finding and one format produces a direct file. Multiple formats or an all-findings request produces ZIP. HTML uses self-contained CSS; PDF must be rendered from the **same HTML**. Manifest and SHA-256 checksums are mandatory for ZIP.

P0 implements **selection validation and planning**, not all exporters. UI export controls must not claim that unimplemented formats are available.

## Event model

Scheduled CI and manual dispatch are an interim polling/discovery mechanism. Per-push automation needs an authenticated `repository_dispatch` event / GitHub App source webhook wiring; no source-repo workflow or credential change is authorized by this bootstrap. Archive/build artifacts must not be represented as a successful Cloudflare production deployment.

## P0 exit checks

- No source writes, no Keycloak/VPS dependencies, no source secrets.
- Same pinned files produce the same semantic diff.
- No leakage of `content/remodeling` paths to the public UI.
- Proper classification of `PRODUCTION_ONLY`, `DRAFT_ONLY`, `IDENTICAL`, `CHANGED`.
- Stable finding identity and deterministic ordering.
- No false deployed-SHA claim.
- No automatic canon editing or publication.
