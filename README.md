# 🌌 Reltroner Statistics

**Civilizational Data & Creative Systems Intelligence Observatory** for the Asthortera universe: production-canon statistics, read-only cross-repository drift forensics, an evidence-backed knowledge & narrative systems graph, creative consistency auditing, story refactoring & canon remodeling labs, and eight-format reporting. Every value carries its source repository, commit, file and field.

## Source authority

| Source | Role | Access |
|---|---|---|
| Verified live deployment of Reltroner Studio | What is actually live | Verified only from a live build identifier; currently **`DEPLOYMENT_UNVERIFIED`** |
| [Reltroner/reltroner-studio](https://github.com/Reltroner/reltroner-studio) `main` | Production source candidate, authoritative for statistics | Read-only, GitHub API |
| [Reltroner/reltroner-studio-remodeling](https://github.com/Reltroner/reltroner-studio-remodeling) `main` | Drafts and proposals, comparison only | Read-only, GitHub API |
| **Reltroner Statistics** (this repository) | Analysis, QA, visualization, exports | Owns only its own build output |

Production main is never presented as the deployed commit. Remodeling values are always labeled `PROPOSED`. Nothing here writes to either Studio repository.

## How it works

```text
GitHub API (read-only, pinned SHAs)
  commit → tree (root tree SHA recomputed) → blobs (each verified against its Git blob SHA)
    → comparator (rules P0R-2.0.0): file identity, JSON field diff, markdown section diff
    → observations (NCCM V6.5 canon + evidence-verified prose anchors), 13 QA identities
    → typed knowledge & narrative graph (DEFINES, DEPENDS_ON, DERIVED_FROM, REFERENCES, MENTIONS, SUPERSEDES, PROPOSES_CHANGE_TO + 11 narrative relation types)
    → creative intelligence engine (entity extraction, 12-category consistency audit, opportunity ranking, story refactoring plans, canon remodeling scenarios & Reltronland/Depcutland case study)
    → Python analytics (descriptive, correlation, K-Means/DBSCAN/PCA, robust outliers, history coverage)
    → contract validation (Zod ⇄ JSON Schema) → artifacts/ (previous run kept in artifacts.previous/)
  → Astro static site (React islands across /statistics, /analysis, /drift, /graph, /creative, /reports, /methodology) → PDFs printed from the HTML reports → CSP headers, link validation
```

- **Determinism.** The pinned pair `f54f947…`/`1887e5d…` yields 448 compared paths (393 identical, 41 changed, 1 production-only, 13 remodeling-only), 422 JSON field findings and semantic digest `8f3ddad3…`, identical on Windows and Ubuntu (CI verifies both).
- **Statuses.** `CANON_OBSERVED`, `CANON_DERIVED`, `MODEL_ESTIMATE`, `SCENARIO`, `PROPOSED`, `ARCHIVED`, `INSUFFICIENT_DATA`. Null is never zero; nothing is interpolated.
- **Exports.** JSON, CSV, XLSX, TXT, Markdown, HTML, PDF and XML are equally selectable. One finding in one format downloads directly; anything else is a ZIP with `MANIFEST.json` and `SHA256SUMS.txt`. The PDF is printed from the same HTML; XML validates against `analytics/schemas/report.xsd`.

## Layout

| Path | Contents |
|---|---|
| `src/domain/` | Source identities, statuses, calendar (BAC), indicators, observation, knowledge graph, and creative intelligence domain models; impact traversal & proposal lifecycle |
| `src/engine/` | Comparator, JSON/markdown diff, evidence rules, QA identities, graph builder, and `creative-intelligence/` (narrative extraction, 12-category audit, opportunity ranking, story refactoring, canon remodeling, deterministic AI boundary) |
| `src/adapters/` | GitHub client, verified object cache, snapshot loader, deployment verification |
| `src/contracts/` | Zod contracts (generate `analytics/schemas/*.schema.json`) |
| `src/export/` | Report model, creative report adapter, eight renderers, XLSX writer, deterministic ZIP bundler |
| `src/pages`, `src/components`, `src/features`, `src/layouts`, `src/styles`, `src/lib` | Astro site, React islands, design tokens |
| `analytics/python/` | `reltroner_analytics` package, `pyproject.toml`, hash-pinned `requirements.lock`, tests |
| `scripts/` | Pipeline, baseline gate, build, PDF printing, post-build hardening, preview server |
| `tests/unit`, `tests/e2e` | Node unit tests, Playwright browser tests |

## Development (Windows PowerShell)

Requirements: Node.js ≥ 22.22, Python ≥ 3.12, Git; Microsoft Edge or Playwright Chromium for PDFs and browser tests.

```powershell
cd C:\Projects\reltroner-statistics
npm ci
python -m venv .venv; .\.venv\Scripts\python -m pip install --require-hashes -r analytics\python\requirements.lock
$env:GITHUB_TOKEN = (gh auth token)   # process-local, never written to disk
npm run verify:baseline                # determinism gate for the pinned pair
npm run pipeline                       # read both sources at their current main, pinned at resolution
npm run build                          # site + PDFs + headers + link validation
npm test; npm run test:py; npm run test:e2e
npm run preview                        # http://127.0.0.1:4173 with production headers
```

`./scripts/audit-local.ps1` runs the gate, pipeline, tests and build in one step.

## Publication

The deployment target is the **dedicated Cloudflare Pages** project `reltroner-statistics`, with its separately authorized public hostname **`https://statistics.reltroner.com`**. No Studio, LMS, HRM, apex, `www`, or nameserver changes are part of this repository's deployment. The CI workflow builds the exact GitHub `main` SHA, validates contracts, Python analytics, browsers, static links and PDF exports, then *only after the external Cloudflare project and active custom domain are configured* automatically publishes that successful CI artifact to Statistics Pages and checks the live `/build-info.json` commit/digest identity. An initial DNS-free `pages.dev` bootstrap and manual release are also available. Missing Pages credentials, custom-domain association, or GitHub production environment approvals intentionally block publication. **Do not interpret passing CI as confirmation of a live deployment.** See [RC-DEPLOY-02 — Local/GitHub/Statistics-domain parity](docs/RC-DEPLOY-02.md) for the isolated setup, fail-closed guard, synchronization CLI and live verification.

## License

Custom **Reltroner Statistics License**; see [LICENSE.md](LICENSE.md) and the original [Reltroner Studio license](https://github.com/Reltroner/reltroner-studio/blob/main/LICENSE.md). Creative universe names, data, texts and related IP remain protected by the creator's terms.

All content in this repository is **© 2026 by Rei Reltroner**.  
Unauthorized reproduction or plagiarism of **Reltronland**, **Asthortera**, or any affiliated fictional entities is strictly prohibited.

---

📝 License: [Reltroner Studio Legal Declaration (IPFS)](https://bafybeib3wnhcrc4e3lg2f7wdiew3hrpwumdigsa5ltm3v5ap23l7apszv4.ipfs.w3s.link/reltroner-studio-legal-declaration.pdf), [Reltroner Studio Legal Declaration (ArDrive)](https://app.ardrive.io/#/file/021c69cf-e79c-4f7b-8106-4094a98e04bb/view)

![License](https://img.shields.io/badge/license-Custom-red)

---

> "We build realities not to escape the world, but to understand it."
