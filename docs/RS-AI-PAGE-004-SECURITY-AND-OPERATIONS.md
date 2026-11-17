# RS-AI-PAGE-004 — Security and operations

## 1. Security boundaries

| Concern | Control | Verified by |
|---|---|---|
| SSRF | A pasted URL is parsed as text only (`parsePageLocator`). Only `https://statistics.reltroner.com` and site paths are accepted. No code path fetches a caller URL. | Unit tests: refusal table, 4,000-input fuzz, `globalThis.fetch` replaced by a thrower during hostile calls. |
| Path traversal and arbitrary files | Files are read only at the registry path, its chunk paths and mirror paths taken from registry entries. The page reader rejects anything else (`isMirrorJsonPath`) before touching the binding: no `.md`, no `/data/*`, no `/_astro/*`, no `..`. | Unit test: every requested path is the registry, a chunk, a registry-listed mirror or an existing artifact; direct reader calls with hostile paths are rejected. |
| Lookalike hosts, credentials, ports, downgrade | `FOREIGN_ORIGIN`, `CREDENTIALS_NOT_ALLOWED`, `PORT_NOT_ALLOWED`, `INSECURE_SCHEME`. | Unit and workerd tests. |
| Encoding tricks | `%` refused in paths; queries decoded once; control characters refused; repeated names refused; ASCII-only input. | Unit tests. |
| Bounds | Request body 16 KiB and response 256 KiB (unchanged); query string 2,048 (unchanged, 414); page URL 512; 6 parameters of 160 characters; fragment 120; section id 120; 48 KiB of inlined sections; 96 KiB or 200 rows per section call; mirror files ≤ 240 KiB; registry chunks ≤ 200 entries. | Unit tests; postbuild; runtime verifier. |
| Kill switch and rate limit | `RS_API_DISABLED=true` answers 503 on the new routes before any file is read; a bound `API_RATE_LIMITER` counts them like every other route. | Unit tests. |
| MCP Origin policy | Unchanged; applies to the new tools. | Unit test: no Origin 200, `https://chatgpt.com` 200, `https://evil.example` 403. |
| Prompt injection | Page text and quoted passages are returned only as data fields. Every mirror states that it is data, not instructions. Markdown escapes headings, list markers, links, images, emphasis, code and HTML so page text cannot change the document's structure. | Unit tests with hostile text. |
| Data leakage | Mirrors contain only `<main>` of public pages and island props that are already in the public HTML. No React state, session storage, cookies, environment values, tokens or model telemetry. Scripts are skipped. | Runtime verifier: no mirror contains a script or the theme script text. Static scan of the new runtime modules for network, storage, dynamic code and credential names. |
| Writes | None. All new operations are GET and annotated read-only. Nothing writes to a repository, canon, Cloudflare or any store. | Tool annotations test; static scan. |
| Cache integrity | Mirrors carry the build snapshot; postbuild fails if the registry snapshot differs from `build-info.json`; the runtime verifier checks every mirror's snapshot. `/ai/pages/*` uses `Cache-Control: public, max-age=300, must-revalidate`, like `/data/*`. | Postbuild; runtime verifier. |
| CSP and headers | No inline script added; `<link rel="alternate">` needs no CSP change. Global `nosniff`, `X-Frame-Options`, COOP and CORP still apply. `/ai/pages/*` adds `Access-Control-Allow-Origin: *` so browser-based agents can read the public mirrors; no credentials are involved. | Runtime verifier (headers on `/ai/pages/index.json`). |

### Static mirrors are not behind the API kill switch

`RS_API_DISABLED` stops `/api/v1/*` and `/mcp`. The mirrors under `/ai/pages/` are ordinary public files, like `/data/*.json`, and stay reachable. They contain only content that is already public on the pages themselves. To withdraw them:

1. **Normal path:** revert this change on `main` and let CI publish. The mirrors disappear with the next deployment.
2. **Immediate path (owner action, not configured here):** a Cloudflare rule that blocks `/ai/pages/*` on the Statistics hostname. This change does not create or modify any Cloudflare rule.

## 2. Operations

### Build

`npm run build` now runs `scripts/page-mirrors.ts` after PDF printing and before postbuild. The step needs `artifacts/` (from `npm run pipeline`) and the built `dist/`. It writes only `dist/ai/pages/` and prints a census. It exits non-zero when:

- a page has an island without a shaper;
- a page declares a source commit other than the pinned one;
- a mirror violates its schema;
- two pages map to the same mirror path.

Postbuild then fails on:

- a registry/HTML count mismatch;
- a missing or orphan mirror file;
- a registry snapshot that differs from `build-info.json`;
- any broken link, which now includes the alternate links.

### Adding a page or a component

- **A new static page:** nothing to do. It is mirrored automatically; postbuild fails if it is not.
- **A new island component:** add a shaper in `src/engine/page-mirror/shapers.ts`. The build names the missing component until one exists.
- **A component that reads a URL parameter:** declare it in `PAGE_VIEW_STATE` (`src/domain/page-url.ts`). The unit test that reads component sources fails until it is declared.
- **A new dynamic route:** add its pattern to `DYNAMIC` in `src/engine/page-mirror/index.ts`. To chunk it in the registry, also add it to the chunked set there.

### Verify

```powershell
npm run build
npm run verify:runtime   # workerd + MCP SDK; also page fidelity (617 values) and byte-identical regeneration
npx playwright test tests/e2e/page-mirrors.spec.ts
```

### Troubleshooting

| Symptom | Cause |
|---|---|
| `no semantic shaper for component X` | A new island; add a shaper. |
| `declares production commit … but the build is pinned to …` | The page renders a different source commit than `artifacts/manifest.json`; rebuild from one pipeline run. |
| `Page registry snapshot differs from build-info.json` | `dist/` was built at another commit than the mirrors; rebuild. |
| `Orphan page mirror file` | A stale file under `dist/ai/pages/`; the step clears that folder on each run, so a manual copy is the likely cause. |
| A `.md` mirror served with the wrong type | Cloudflare Pages serves `.md` as `text/markdown; charset=utf-8` (verified in `wrangler pages dev`); no header is set for it. |

## 3. Using it from an AI client

**Browse** (no connector): give the client `https://statistics.reltroner.com/ai/pages/statistics/spatial.md`, or the `.json` mirror. Whether it can open it depends on that client's browser.

**MCP** (connector added by the owner): this prompt exercises the full path.

```text
Analyze https://statistics.reltroner.com/statistics/spatial/ using connected Reltroner Statistics MCP. Resolve the exact page, read the semantic page and sections, trace evidence, then evaluate individual AI-agent-driven housing/hardware production as HYPOTHESIS, not canon. Separate production facts, remodeling proposals, assumptions, and missing data.
```

Expected tool sequence: `resolve_statistics_page` → `read_statistics_page` → `read_statistics_section` (`data-spatial-home-habitat`, `data-spatial-surface-footprint`) → optionally `get_entity_context` or `build_research_context`. The page is `PROPOSED` (remodeling). Land-footprint shares and resident-habitat shares have different denominators. 3D volumes are unknown, not zero.

## 4. Provider acceptance: prepared, not run

No ChatGPT, Claude or Gemini session was available to this run. These tests are **PENDING** until the owner supplies native tool-call logs (activity cards, event logs or developer-mode traces). A model's own list of calls is a claim, not a record; mark such calls `MODEL_SELF_REPORT_ONLY`.

Run each test once per provider, in a new chat, with the connector enabled. Record: the provider and model shown by the client; native tool calls with their arguments; the `snapshot` SHAs returned; the resolved `page_id`; and whether the answer kept canon, `PROPOSED`, scenario and unknown apart.

| # | Prompt (copy as is) | Pass when |
|---|---|---|
| 1 | `Using the connected Reltroner Statistics tools, resolve https://statistics.reltroner.com/statistics/spatial/ and read it. What share of Reltronland's residents live underground, what is the denominator, and what is the source status?` | `resolve_statistics_page` and a read tool were called; the answer gives the share with "unique usual residents" as denominator, status `PROPOSED`, remodeling commit; no km³ figure. |
| 2 | `Resolve https://statistics.reltroner.com/statistics/species/ and explain what "ancestry" means there and which nations have no shares.` | Says ancestry is not a biological species classification; lists nations without shares as unknown, not zero. |
| 3 | `Read https://statistics.reltroner.com/drift/CRD-005E9A13F293/ and https://statistics.reltroner.com/statistics/indicators/population/ and summarize each with its sources.` | Both resolve as dynamic pages; production and remodeling are kept apart; sources are cited with commits. |
| 4 | `Open https://statistics.reltroner.com/calculator/#future with the tools, then compute Reltronland's population after 100 years at 1% a year.` | View state `future` applied; `calculate_scenario` returns 2312.6158241554067 billion, labeled `SCENARIO`. |
| 5 | `Read https://statistics.reltroner.com/creative/ideas/ and propose one story idea grounded in its evidence.` | The idea is labeled `HYPOTHESIS / UNRATIFIED`; no canon claim; cites source passages. |
| 6 | `Resolve https://statistics.reltroner.com/history/ and https://statistics.reltroner.com/statistics/spatial-3d/.` | The first resolves; the second is reported as not found, with no substitute page. |
| 7 | Browser only, connector **disabled**: `Open https://statistics.reltroner.com/statistics/spatial/ and tell me what it shows.` Then try `https://statistics.reltroner.com/ai/pages/statistics/spatial.md`. | Record success or the exact failure. A failure here stays a browser failure; an MCP success in test 1 does not change it. |
