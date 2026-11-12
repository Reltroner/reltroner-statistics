# Architecture

Single repository, single workspace, modular static application. No backend, database or long-running service.

## Source identities

1. `deployment` — the commit serving the live Studio site. Verified only when the live site publishes a build identifier (`STUDIO_BUILD_INFO_URL`). GitHub deployment records are reported as evidence and never accepted. Current status: `DEPLOYMENT_UNVERIFIED`.
2. `production` — `Reltroner/reltroner-studio` at a pinned commit; authoritative for every statistic.
3. `remodeling` — `Reltroner/reltroner-studio-remodeling` at a pinned commit; proposals for comparison only.
4. `rules_version` — comparator behavior (`P0R-2.0.0`).

## Ingestion and determinism (P0R)

Sources are read only through the GitHub API: commit → tree → blobs. The root tree SHA is recomputed from the listing and every blob is hashed and compared with its Git blob SHA, both on fetch and on cache read. The cache (`.cache/github`) is content-addressed and therefore never stale.

Earlier, a Windows workstation reported 0 identical files where CI found 393: `core.autocrlf=true` converted production checkouts to CRLF while remodeling's `.gitattributes` kept Markdown LF, and identity was computed from checkout bytes. Checkouts are no longer part of the identity path, and all ordering uses code-unit comparison instead of host-locale `localeCompare`. `tests/baselines/p0r-baseline.json` pins the expected counts and semantic digest; CI verifies it on Ubuntu and Windows.

## Module boundaries

- `src/domain` is pure TypeScript (no Node, React or Astro). `graph.ts` traversal is shared with the browser.
- `src/engine` depends on domain only; `src/adapters` performs I/O.
- `src/export` is isomorphic: the build and the browser Report Center use the same renderers.
- Pages read validated artifacts at build time (`src/lib/data.ts`); islands receive compact props or fetch `/data/*.json`.
- Python reads `observations.json`, validates it against the generated JSON Schema, and emits `analytics.json` plus SVG figures validated the same way.

## Pipeline

`scripts/pipeline.ts`: ingest → deployment evidence → compare → observations (JSON canon + evidence rules) → QA identities (both sources) → knowledge graph → Python analytics → contract validation → atomic swap of `artifacts/` (previous output kept in `artifacts.previous/`). Any failure leaves the last good artifacts untouched.

## Build

`scripts/build.ts`: verify artifact checksums → Astro static build (518 pages) → PDFs printed by Chromium from `renderHtml()` → `postbuild.ts` (CSP with inline-script hashes, security and cache headers in `_headers`, `build-info.json`, route/PDF/link validation).

## Epistemic rules

- Remodeling-only content is a proposal, never a production defect.
- Text differences are review candidates; only QA identities can establish a deterministic contradiction.
- The deferred-18 residual is one aggregate entity and never enters cross-country statistics.
- Prose values exist only while their exact sentence is present in the pinned production text.
- Historical series are never interpolated; insufficient coverage is reported as `INSUFFICIENT_DATA`.
- `MENTIONS` is co-occurrence and never a dependency; unverifiable links are `CANDIDATE`.

## Event model

Scheduled runs (every six hours), manual dispatch with optional pinned SHAs, and `repository_dispatch` (`reltroner-source-changed`) trigger the release workflow. Source repositories do not yet send that dispatch; wiring it requires a token in those repositories, which is outside this repository's authority. Publication is gated on every check and verified against the live `build-info.json`; a CI artifact is never reported as a deployment.
