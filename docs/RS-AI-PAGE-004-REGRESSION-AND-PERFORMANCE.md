# RS-AI-PAGE-004 — Regression and performance

All measurements were taken on one Windows 11 machine (Node 22.23.1, Microsoft Edge 157 for PDFs and browser runs, `wrangler@4.161.0` `pages dev` for workerd), with the same commands and the **same source input**.

- **Before:** unmodified `main` `fc37812`.
- **After:** this branch.
- **Pinned sources for both:** production `ad895e6d9184f09281a7cc14ccd7867c47acd29e` and remodeling `0c80fdb05f5f338241c58663b87a01aa0e1748b2`; the semantic digest `a24ccb3c5e58…` is identical in every run.
- **PDF cache:** emptied before each timed build.
- **Scripts and raw results:** git-ignored evidence files (`.local/rs-ai-page-004/`), not part of the change.

## 1. Human pages are unchanged

| Check | Result |
|---|---|
| Client JS | **0 new bytes.** The 48 JS files (3,258,578 bytes) and 2 CSS files under `/_astro/` are byte-identical, same names and hashes. |
| HTML | Built twice from the same artifacts, with `main`'s layout and with the new one: **all 608 HTML files are byte-identical once the two `<link rel="alternate">` tags are removed.** The tags appear on 606 pages (not on `404.html` or the export file). |
| Other emitted files | All 193 non-HTML files of the Astro build (scripts, styles, data, discovery documents) are byte-identical in the same comparison. |
| Browser requests on load (Edge, `networkidle`) | Identical before and after. `/` 5 requests, 4,552 script bytes. `/statistics/spatial/` 15 and 260,831. `/calculator/` 21 and 1,116,758. `/creative/ideas/` 20 and 406,919. `/drift/CRD-005E9A13F293/` 14 and 231,472. No request to `/ai/pages/`. |
| Browser suite | `tests/e2e/page-mirrors.spec.ts` passes on all four viewports. The full suite result is in [Acceptance](RS-AI-PAGE-004-ACCEPTANCE.md). |

One CSS change was found and removed during the work. Tailwind's automatic source detection scans every non-ignored file, Markdown included. A code comment, and later a sentence in this document, contained the bare name of a Tailwind box-shadow utility. Tailwind added that class to an existing rule (+8 bytes). After rewording both, the stylesheet is identical to the one `statistics.reltroner.com` serves for `main` (SHA-256 `a2c99b2d…`). Anyone editing these documents should avoid bare utility class names, or rerun the stylesheet comparison.

## 2. Build output and time

| Measure | Before | After | Change |
|---|---:|---:|---:|
| Files in `dist/` | 1,419 | 2,638 | +1,219 (607 JSON + 607 Markdown mirrors, 1 registry, 4 chunks) |
| Bytes in `dist/` | 135,982,449 | 148,595,929 | +12,613,480 (+9.3%) |
| `/ai/pages/` bytes | — | 12,442,552 | 1,219 files; registry index 13,042 bytes; chunks ≤ 90 KB; largest mirror 207,508 bytes (the report export) |
| HTML bytes | 35,161,195 | 35,311,958 | +150,763 (the alternate links) |
| HTML pages | 608 | 608 | 0 |
| PDFs | 615 | 615 | 0 |
| `npm run build` | 54.2 s | 56.1 s and 60.2 s (two runs) | +1.9 to +6.0 s; the mirror step itself took about 6 s |

The mirror step adds about 6 s and 12.6 MB per build. That is material for disk and upload, and small next to the 80 MB of PDFs. No budget was agreed in advance; the number is reported, not hidden.

## 3. API latency in workerd

Local `wrangler pages dev`, loopback. For each route: one first call after start, 5 warm-ups, then 60 timed calls (MCP: 40). There was one baseline pass and two passes after the change.

| Route | p50 before | p50 after (two passes) | p95 before | p95 after (two passes) | Response bytes |
|---|---:|---:|---:|---:|---|
| `GET /api/v1/manifest` | 15.76 | 15.57 / 15.56 | 23.63 | 25.53 / 25.41 | 6,405 → 7,989 (lists 18 operations and the page mirror entry) |
| `GET /api/v1/search?q=Reltronland` | 15.33 | 15.63 / 16.67 | 21.08 | 20.18 / 53.72 | unchanged |
| `GET /api/v1/statistics?…` | 15.27 | 15.39 / 15.14 | 22.33 | 23.94 / 23.65 | unchanged |
| `GET /api/v1/evidence?…` | 13.66 | 16.07 / 15.62 | 18.19 | 24.99 / 20.18 | unchanged |
| `GET /api/v1/graph?…` | 13.96 | 15.66 / 15.76 | 23.82 | 45.00 / 21.50 | unchanged |
| `GET /api/v1/drift?limit=5` | 14.72 | 15.61 / 15.59 | 19.85 | 25.55 / 21.14 | unchanged |
| `POST /api/v1/calculator` | 15.20 | 15.50 / 15.61 | 19.77 | 21.05 / 23.10 | unchanged |
| `POST /api/v1/research/context` | 28.72 | 28.28 / 26.79 | 32.73 | 33.66 / 34.30 | unchanged |
| Static `/statistics/spatial/` | 26.88 | 29.44 / 29.96 | 33.32 | 39.50 / 37.59 | +241 (alternate links) |
| Static `/data/assistant-index.json` (file unchanged) | 27.93 | 30.91 / 31.39 | 58.29 | 44.30 / 43.31 | unchanged |
| MCP `query_statistics` | 13.60 | 15.90 / 13.81 | 29.35 | 29.21 / 25.46 | unchanged |

All times are in milliseconds.

**Reading:** p50 of existing routes moved between −1.9 and +3.5 ms. The largest move, +3.2 ms, is on a static file this change does not touch. p95 varies more between the two after-passes (`search` 20.2 vs 53.7 ms) than between before and after. These are run-to-run noise on this machine. With a single baseline pass, the claim is limited to "no systematic regression observed", not "zero".

New routes:

| Route | p50 | p95 | Bytes |
|---|---:|---:|---:|
| `GET /api/v1/pages/resolve` (spatial URL) | 15.47 / 15.30 | 23.16 / 23.54 | 2,652 |
| `GET /api/v1/pages/context` (spatial) | 15.15 / 15.52 | 22.02 / 26.19 | 27,500 |
| `GET /api/v1/pages/section` (habitat table) | 14.96 / 15.33 | 22.60 / 23.43 | 24,183 |
| Static `/ai/pages/statistics/spatial.json` | 26.97 / 18.64 | 33.80 / 33.04 | 84,508 |
| MCP `read_statistics_page` | 16.50 / 15.51 | 30.21 / 25.30 | — |

These are local workerd numbers. Production latency on Cloudflare will differ.

## 4. Regression coverage

| Area | How it is guarded |
|---|---|
| The 13 original MCP tools | Names, order and input JSON Schemas compared with a snapshot generated from `main` (`tests/fixtures/rs-ai-api-001-tool-inputs.json`). The workerd check confirms the names and order. |
| Existing REST and MCP behavior | The existing `intelligence-api` tests run unchanged, apart from the tool list, which grows from 13 to 13 + 3. |
| Calculator | `855 × 1.01^100 = 2312.6158241554067`, `SCENARIO`, unchanged (existing tests and the workerd check). |
| Export formats and PDFs | Built and validated by postbuild as before (615 PDFs, checksums). |
| Accessibility, viewports and themes | The existing Playwright suite, unchanged. |
| Determinism | Unit test (same input in any file order gives byte-identical output). The runtime verifier regenerates every mirror from the build and compares the tree hash. |
