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

To analyze two **already cloned** read-only snapshots:

```powershell
node scripts/analyze.mjs --production-dir C:\Path\To\ProductionSnapshot --remodeling-dir C:\Path\To\RemodelingSnapshot --production-sha <40-hex-sha> --remodeling-sha <40-hex-sha>
npm run build
```

The comparator never writes into either source snapshot. `dist/` contains public-safe projections only. For a full local read-only analysis, run `./scripts/audit-local.ps1` from PowerShell, then `npm run preview` and open http://127.0.0.1:4173. See `docs/ARCHITECTURE.md` for source and publication boundaries.

## License

This project follows the custom **Reltroner Studio License**. See [LICENSE.md](LICENSE.md) and the original [Reltroner Studio license](https://github.com/Reltroner/reltroner-studio/blob/main/LICENSE.md). Creative universe names, data, texts and related IP remain protected by the creator's terms.

> "We build realities not to escape the world, but to understand it."
