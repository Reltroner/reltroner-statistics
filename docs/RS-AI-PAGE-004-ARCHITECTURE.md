# RS-AI-PAGE-004 — Universal page-aware intelligence: architecture

**Base:** `main` at `fc37812b6cad68cfb707fdcdd07d7a0e417825df` (local `main` = `origin/main` = `git ls-remote` = GitHub API = published site, verified before any change).
**Branch:** `feat/rs-ai-page-004-universal-page-awareness`, built in an isolated sibling worktree so the owner's checkout (PR #8 branch with staged files) stayed untouched.
**Scope:** this repository. No change to Studio, Remodeling, canon, DNS, Cloudflare settings, PR #7 or PR #8.

Ratifying this architecture authorizes no source or canon change and no release.

## 1. Problem

A user pasted `https://statistics.reltroner.com/statistics/spatial/` into an AI chat. The chat's browser could not load the page. The connected MCP server could find the page's title and summary, but it had no way to return the page's content, the data behind its charts, or its limits.

Three ways of reaching this site exist, and they are different:

| Mode | What happens | Who controls success |
|---|---|---|
| BROWSE | The AI product's own browser opens the HTML page or a mirror file. | The AI product. This change can only make the files easier to read. |
| REST | A client that can make HTTP calls uses `/api/v1/pages/*`. | The client's HTTP access. |
| MCP | The owner connected `https://statistics.reltroner.com/mcp`; the model calls the page tools. | The owner's connector setup and the model's tool choice. |

A pasted link does not connect MCP. A tool call that succeeds does not fix a browser that failed. This change does not claim either.

## 2. What was built

```
astro build ──► dist/**/*.html ──► (PDF printing, unchanged) ──► scripts/page-mirrors.ts ──► scripts/postbuild.ts
                     │                                              │                          │
                     │  island props = the exact data each          │ writes dist/ai/pages/    │ verifies registry parity,
                     │  component renders from                      │   index.json + _registry/│ mirror links, identity,
                     ▼                                              │   <page>.json / .md      │ orphans; link check covers
           src/engine/page-mirror/html.ts (htmlparser2)             ▼                          │ the new <link rel=alternate>
           src/engine/page-mirror/props.ts (Astro prop decoder)  rs-page-registry.v1           ▼
           src/engine/page-mirror/shapers.ts (per component)     rs-page-context.v1         _headers: /ai/pages/* cache + CORS
           src/engine/page-mirror/markdown.ts
           src/engine/page-mirror/index.ts (census, coverage, size bound, registry chunks)

Pages Functions (one service, unchanged envelope rs-intelligence.v1):
  GET /api/v1/pages/resolve | /pages/context | /pages/section   ──► src/api/pages.ts ◄── MCP tools resolve_statistics_page,
                                                                    │                     read_statistics_page, read_statistics_section
                                                                    ▼
                    src/domain/page-url.ts (offline parse) + registry lookup + env.ASSETS reads of registry-listed files only
```

| Part | Role |
|---|---|
| `src/domain/page-url.ts` | Strict, offline parsing of a pasted URL or path; page id and mirror path rules; the declared link parameters of each page. Shared by the build and the Functions bundle. |
| `src/engine/page-mirror/html.ts` | Reads one built page with **htmlparser2**. Only `<main>`; navigation, scripts, styles and form controls are left out. Headings h1–h4 open sections anchored to the element ids the page already has. |
| `src/engine/page-mirror/props.ts` | Decodes the props Astro serialized on each `<astro-island>`. A unit test round-trips Astro's own serializer. |
| `src/engine/page-mirror/shapers.ts` | One shaper per island component: typed tables with units, denominators, statuses, null policy and pinned sources. |
| `src/engine/page-mirror/ui-defaults.ts` | Default settings that live inside `.tsx` components (impact presets and depth, scatter axes, remodel origin). A test reads the component sources and fails on any difference. No client code changed. |
| `src/engine/page-mirror/index.ts` | Census and exclusions, family and route classification, coverage, the 240 KiB mirror bound, registry chunks of 200, schema validation of every file. |
| `scripts/page-mirrors.ts` | The build step. Reads `dist/` and the pinned artifacts; writes only `dist/ai/pages/`. |
| `src/layouts/BaseLayout.astro` | Two server-rendered `<link rel="alternate">` tags on every indexable page. No script, no request. |
| `src/api/pages.ts`, `http.ts`, `contract.ts`, `mcp.ts`, `discovery.ts` | Three operations in the existing registry; a registry-bound page reader; discovery documents that name the mirrors. |
| `scripts/lib/verify-page-mirrors.ts` | Build fidelity, determinism and workerd checks, run by `npm run verify:runtime`. |

New dependency: `htmlparser2@9.1.0` (devDependency, build time only). Its dependencies were already in the tree; the lockfile gains one package. `ultrahtml` was tried first and rejected: it drops a text node that is directly followed by a comment, which React's `<!-- -->` separators make common.

## 3. One truth

A mirror is never a second description of a page.

- **Text** comes from the built HTML the visitor receives, including what islands render on the server.
- **Chart and table data** comes from the props Astro serialized for each island. Those props are the data the component renders from in the browser. Islands that fetch their data instead (`GraphExplorer`, `ImpactExplorer`, `FindingsExplorer`, `ReportCenter`) are shaped from the same published artifact they fetch.
- **Typed records** on dynamic pages (indicator values) come from the same loaders the page uses (`src/lib/data.ts`).
- **Identity** is read from `artifacts/manifest.json` and `git rev-parse HEAD`, exactly as `postbuild.ts` writes `build-info.json`. Postbuild fails the build if the registry snapshot differs from `build-info.json`.
- **Declared sources:** each page's own "Sources behind this view" commit links are read, and the build fails if one differs from the pinned source commit.

`npm run verify:runtime` compares mirror numbers with `/data/composition.json`, `/data/findings.json`, `/data/assistant-index.json` and `/data/graph.json` (617 values on the current build), and regenerates every mirror to prove byte-identical output.

## 4. Census and coverage

On the current build: **608** HTML files; **607** mirrored; **1** excluded (`/404.html`, `ERROR_PAGE`, noindex). **577** are dynamic: 555 `/drift/[id]/`, 21 `/statistics/indicators/[id]/` and the consolidated report export `/reports/all/[file]`. Exclusion rules: the not-found page, meta-refresh redirects, `noindex` pages, pages without `<main>`. Each exclusion is listed in the registry with its reason.

Coverage is decided per page:

- **FULL:** all server-rendered content of `<main>` is captured, and every island's data and default view are reproduced from published data.
- **PARTIAL:** something the page computes in the browser is not reproduced, or content was cut to the size bound. `coverage.not_captured` says what.
- Interaction a visitor creates in the browser (filters, typed text, session storage) is never part of a page and never lowers or raises coverage. It is listed per component as browser-only.

On the current build: **598 FULL**, **9 PARTIAL**:

| Page | Not reproduced |
|---|---|
| `/calculator/` | The default calculation is set in the browser. Use `calculate_scenario`. |
| `/assistant/` | Answers are produced on request in the browser. |
| `/graph/` | Graph layout and positions. Counts are given, and the graph is readable through `analyze_narrative_impact`. |
| `/creative/explore/` | Graph layout of the entity explorer. Entities and relationship counts are given. |
| `/creative/ideas/` | Suggestions composed in the browser, and private session proposals. |
| `/creative/remodel/`, `/creative/impact/` | Comparison panels and the impact simulation computed in the browser. |
| `/reports/` | Export bundles assembled in the browser. |
| `/reports/all/…all-findings.html` | Finding sections carry their heading, anchor and links. Each finding's full content is in its own page mirror. |

## 5. Visualization families

| Component (pages) | Data in the mirror |
|---|---|
| `SpatialExplorer` (`/statistics/spatial/`) | Surface footprint (share of **national terrestrial land**) and principal home habitat (share of **unique usual residents**) as two separate `PROPOSED` tables; geometry as `INSUFFICIENT_DATA` with null values. No km³ or capacity is derived. |
| `AncestryExplorer` (`/statistics/species/`) | Planetary benchmark, national shares (`CANON_OBSERVED`), residents (`CANON_DERIVED`), nations without shares, remodeling differences (`PROPOSED`). "Not a biological species classification" travels with the data. |
| `DistributionExplorer`, `GdpTreemap`, `CorrelationHeatmap` (`/statistics/`) | Year 0 values by nation, descriptive statistics (`MODEL_ESTIMATE`), GDP shares, correlation matrix. |
| `ScatterExplorer`, `CountryCompare`, `HistoryExplorer`, `ClusterLab`, `DecisionTreeAnalyticsView` | Default scatter points; the default compared pair; sparse historical anchors (never interpolated); cluster labels; supervised tree tasks with their gates. |
| `NarrativeGraphExplorer`, `ConsistencyAuditExplorer`, `StoryRefactorWorkspace`, `IdeationWorkspace`, `CanonRemodelLab`, `DecisionTreeWorkspace` | Entities with status and locator; relationship counts by verification (candidates are review leads); audit findings with `is_defect`; refactoring plans; opportunities (`HYPOTHESIS`); scenarios; decision trees and the default tree's nodes. |
| `FindingExport` (`/drift/[id]/`), `FindingsExplorer` (`/drift/`) | The finding with both pinned sources; all findings in the explorer's default order. |
| `GraphExplorer`, `ImpactExplorer` | Node and edge counts by type, status and side; the default impact traversal, computed with the page's own `traverseImpact` settings. |
| `CalculatorWorkspace`, `AssistantWorkspace`, `ReportCenter` | Modes and allowlisted formulas; nothing (answers are on request); report files. |
| Indicator pages (`/statistics/indicators/[id]/`) | Every Year 0 value with status, side and source pointer. |

## 6. Link parameters (view state)

Eight components read URL parameters (verified against their sources by a test). A parameter is **supported** only when its effect can be reproduced from published data:

| Page | Supported | Declared but not reproduced |
|---|---|---|
| `/impact/` | `?node=` (graph node; default traversal) | — |
| `/creative/explore/`, `/creative/ideas/` | `?entity=` | ideas: composed suggestions, session proposals |
| `/creative/remodel/`, `/creative/impact/` | `?origin=`, `#<scenario id>` | — |
| `/creative/decisions/` | `?tree=` | branch choices and review notes in session storage |
| `/calculator/` | `#<mode>` | `#handoff-unavailable` (session storage) |
| `/drift/` | — | `q`, `file`, `classification`, `level`, `review_status`, `priority` (browser-side table filters) |
| `/reports/` | — | `id`, `family` (export pre-selection), `selection` (session storage) |

A value that is not published (for example `?node=nar:nation:atlantis`) is reported as `VALUE_NOT_PUBLISHED`, and the default view is described, which is what the component itself does. A parameter no page reads is reported as `UNKNOWN_PARAMETER`. A `#fragment` that is neither a declared state nor a section is reported as `UNKNOWN_SECTION`. Nothing is guessed.

## 7. Performance design

- Mirrors are static assets built once and served from the CDN. No headless browser, crawler, database, model call or background process exists at request time.
- Human pages gain two `<link rel="alternate">` tags only. Browsers do not fetch alternate links. Measured: zero new client JS bytes and zero new requests (see [Regression and performance](RS-AI-PAGE-004-REGRESSION-AND-PERFORMANCE.md)).
- The API reads the 13 KB registry index, at most one registry chunk (≤ 90 KB), and one mirror (≤ 240 KiB). Index and chunks are cached per deployment binding; mirrors are cached in a 64-entry cache that is cleared when full.

## 8. Integration with PR #7 and PR #8

Neither PR is merged, and neither branch was touched.

| File | PR #7 | PR #8 | This PR | Integration |
|---|---|---|---|---|
| `src/api/contract.ts` | — | inputs, limits, descriptions, `MCP_INSTRUCTIONS`, server version 1.1.0 | 3 inputs, 3 operations appended, one `MCP_INSTRUCTIONS` line | Textual conflict in `MCP_INSTRUCTIONS` and the import block. Keep both lines. Set the final server version once (this PR leaves `1.0.0` on purpose). |
| `src/api/service.ts` | — | coverage, explorations, trace sub-ids | `createService(load, readPage?)`, spread of page ops | Different regions; expect a small conflict at the `ops` object opening. |
| `src/api/http.ts`, `mcp.ts` | — | — | page reader | None. |
| `src/api/discovery.ts` | — | research playbook in `/llms.txt` and context | pages section, examples, manifest field | Adjacent edits; keep both. Re-check the `/llms.txt` size test (12,000 characters). |
| `scripts/verify-pages-runtime.ts` | — | coverage and trace checks | page checks | Adjacent edits; keep both. |
| `tests/unit/intelligence-api.test.ts` | — | 3 expectations | tool-count expectations (13 → 13 + 3) | Merge both; the tool list becomes PR #8's 13 tools plus the 3 page tools. |
| `tests/fixtures/rs-ai-api-001-tool-inputs.json` | — | changes `trace_evidence` and `discover_opportunities` inputs (additive) | snapshot of `main`'s 13 inputs | After PR #8 merges, regenerate the snapshot from the merged `main`; PR #8's input changes are additive, so the check then guards the new baseline. |
| `.github/workflows/rs-ai-api-002-protocol.yml`, `scripts/verify-remote-mcp.mjs` | new | — | — | None. PR #7's remote check lists tools; it should accept the three page tools once both are live. |

Suggested order: PR #8, then this PR rebased by its owner with the resolutions above, then rerun all gates. This branch was not tested on top of PR #8.
