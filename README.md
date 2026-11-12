# 🌌 Reltroner Statistics

**Production-first statistical observatory and read-only cross-repository drift intelligence for Reltroner Studio.**

Reltroner Statistics is an independent application and engineering repository. It compares the published Studio content with the Studio Remodeling workspace without changing either source.

## Source authority

| Source | Role | Permission |
|---|---|---|
| [Reltroner Studio](https://github.com/Reltroner/reltroner-studio) | Production content and canonical data | Read-only |
| [Reltroner Studio Remodeling](https://github.com/Reltroner/reltroner-studio-remodeling) | Drafts, modeling, proposed revisions | Read-only |
| **Reltroner Statistics** | Comparison, QA, reporting, visualization, exports | Own build artifacts only |

A `reltroner-studio/main` commit **is not** evidence of a successful public deployment. The deployed commit SHA must be verified independently before a report may claim to reflect the live website.

## Product architecture

- **Statistical Observatory:** production-approved indicators and source provenance.
- **Cross-Repository Drift Observatory:** file, structural JSON, and semantic change candidates.
- **Dependency & QA Observatory:** typed dependencies, invariant checks, evidence and remediation suggestions.
- **Forensic Export:** JSON, CSV, XLSX, TXT, MD, HTML+CSS, PDF, and XML as equally selectable formats; XML need not be selected. HTML provides the visual source for PDF.
- **Deployment:** static-first Cloudflare Pages, isolated from `reltroner.com` and Hostinger VPS workloads.

## Engineering status

**P0 INITIAL ENGINEERING.** This repository is not a certified live analytical product. The initial baseline includes a deterministic, read-only comparator, a static dashboard build, automated tests and export planning. Full PDF/XLSX/ZIP production renderers and GraphRAG are subsequent, separately tested phases. Do not mistake example reports or Git `main` data for verified deployment evidence.

## Development

Approved Windows workspace: `C:\Projects\reltroner-statistics`.

Requirements: Node.js 22+, Git, PowerShell 5.1+.

```powershell
cd C:\Projects\reltroner-statistics
npm test
npm run build
npm run preview
```

Source repositories are read **only through the GitHub API** at immutable commit SHAs (Git Trees API for identity, Git Blobs API for content). Nothing is cloned, so operating-system line-ending conversion cannot affect results. Each tree listing is verified by recomputing its root tree SHA, and every blob is verified against its Git blob SHA.

```powershell
$env:GITHUB_TOKEN = (gh auth token)   # process-local; never written to disk
npm run verify:baseline                # P0R gate: pinned pair must reproduce the committed digest
npm run pipeline                       # resolve main of both repositories, pin, analyze
npm run build
```

Or run `./scripts/audit-local.ps1`, which performs the same steps and restores the environment afterwards. See `docs/ARCHITECTURE.md` for source and publication boundaries.

## License

This project follows the custom **Reltroner Studio License**. See [LICENSE.md](LICENSE.md) and the original [Reltroner Studio license](https://github.com/Reltroner/reltroner-studio/blob/main/LICENSE.md). Creative universe names, data, texts and related IP remain protected by the creator's terms.

> "We build realities not to escape the world, but to understand it."
