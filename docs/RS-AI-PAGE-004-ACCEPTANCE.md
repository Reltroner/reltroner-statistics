# RS-AI-PAGE-004 — Acceptance

Status of each gate of the brief, with the evidence behind it. Locally executable gates were run; provider-hosted gates were not, and they stay PENDING until the owner supplies native client logs.

## Preflight (G0)

| Item | Value |
|---|---|
| Time (WIB) | 2026-11-17 18:09:48 |
| Original workspace | `C:\Projects\reltroner-statistics` on `feat/rs-creative-quality-003` at `66cf0ba`, with **staged** `.vscode/settings.json` and `public/reltroner-statistics-logo.webp`. Not switched, not stashed, not modified. |
| `git fetch --no-tags origin main` | exit 0 |
| Local `main`, `origin/main`, `ls-remote`, GitHub API | all `fc37812b6cad68cfb707fdcdd07d7a0e417825df`: **LOCAL_MAIN_1_TO_1_GITHUB: VERIFIED** |
| Published `build-info.json` | `fc37812…`, tree clean; production `ad895e6…`, remodeling `0c80fdb…`; Studio `DEPLOYMENT_UNVERIFIED` |
| PR #7 | open draft, `25d5ec8eb6e11e424d7d9ce8c9da3ab02f41951c`, not merged, not touched |
| PR #8 | open draft, `66cf0bafa9c62b0eafcdb2c7947f67ecbde24d53`, not merged, not touched |
| Isolation | sibling worktree `C:\Projects\reltroner-statistics-rs-ai-page-004`, branch `feat/rs-ai-page-004-universal-page-awareness`, created with `--no-track` at `fc37812`. No ref was forced. |

## Gates

| Gate | Result | Evidence |
|---|---|---|
| G0 Git | PASS | Above. |
| G1 Coverage | PASS | 608 built HTML pages: 607 in the registry with JSON and Markdown mirrors, 1 excluded with its reason (`/404.html`). Postbuild and the runtime verifier both check parity. |
| G2 Exact URL | PASS | Slash variants normalize to one id. Foreign, look-alike, `http`, credentialed, port, traversal, encoded and Unicode inputs are refused with stable codes (unit table and 4,000-input fuzz; workerd spot checks). Unknown pages answer 404 with no substitute, including case variants. |
| G3 Semantic fidelity | PASS (local) | Headings, text, tables and island data come from the build. 617 mirror values equal the published data files (spatial, ancestry, findings, indicator values, graph counts, formulas). Client-computed content that is not reproduced is marked PARTIAL with the reason (9 pages). |
| G4 Evidence fidelity | PASS | Every mirror carries the build snapshot (checked for all 607). Declared source commits must equal the pinned ones. Production and remodeling stay separate (spatial `PROPOSED`, ancestry `CANON_OBSERVED`). Nulls stay null with a stated null policy. |
| G5 REST/MCP | PASS | The three page operations run in workerd over REST and through the official MCP client, with byte-identical results. The 13 original tools keep their names, order and input schemas (snapshot from `main`). 15 → 18 REST operations, 13 → 16 MCP tools. |
| G6 Non-functional | PASS, with the cost stated | 0 new client JS bytes; 0 new browser requests; existing API p50 within run-to-run noise; build +1.9 to +6.0 s; `dist` +12.6 MB. See [Regression and performance](RS-AI-PAGE-004-REGRESSION-AND-PERFORMANCE.md). |
| G7 Full regression | Local: see the final gate run below. GitHub CI: see the PR. | |
| G8 Client fidelity | PENDING | Not run: no signed-in ChatGPT, Claude or Gemini session was available. Browser-only access was not tested either. Prepared tests are in [Security and operations](RS-AI-PAGE-004-SECURITY-AND-OPERATIONS.md) §4. |
| G9 Creator control | PASS | No change to canon, Studio or Remodeling. No write tool. H1/H2/H3 remain HYPOTHESIS / UNRATIFIED. |
| G10 Delivery | Draft PR, no merge, no deployment | See the PR. |

## Local gate runs (isolated worktree, Windows PowerShell 5.1 host)

**Run 1** (uncommitted tree, 2026-11-17 12:10–12:25 UTC): gates 1–11 exit 0. Gate 12 (`npm run test:e2e`): 440 passed, 1 skipped, **1 failed**. The failure was an existing route test that hard-coded 13 MCP tools in `/ai/manifest.json`. The test now asserts the 13 original names unchanged plus exactly the three page tools, and that OpenAPI lists the page routes. The skipped test is the existing mobile-menu test, which is skipped on the desktop project by design.

**Run 2** (final): recorded below after it completes.

## What "PASS" does not mean

- It does not mean `statistics.reltroner.com` serves the mirrors or the tools. Nothing was deployed.
- It does not mean a hosted AI product can open the site in its browser.
- It does not mean any model will choose the page tools when given a link.
