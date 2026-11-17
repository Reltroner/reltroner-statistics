# RS-AI-PAGE-004 — Contracts

JSON Schemas are generated from the Zod contracts in `src/contracts/page-schemas.ts` into `analytics/schemas/page-context.schema.json`, `page-registry.schema.json` and `page-registry-chunk.schema.json`. `npm run schemas:check` fails on drift. The build validates every file against them before writing it.

## 1. Files

| Path | Contract | Content |
|---|---|---|
| `/ai/pages/index.json` | `rs-page-registry.v1` | Build snapshot, census, exclusions with reasons, URL refusal codes, static pages inline, chunk index for dynamic routes. |
| `/ai/pages/_registry/<route>-<n>.json` | `rs-page-registry-chunk.v1` | Up to 200 entries of one dynamic route, sorted by page id; the index gives `first`, `last`, `count` and `href`. |
| `/ai/pages/<path>.json` | `rs-page-context.v1` | The mirror of one page. |
| `/ai/pages/<path>.md` | Markdown | The same content as text. |

**Path rule:** page `/a/b/` → `/ai/pages/a/b.json` and `.md`; the home page `/` → `/ai/pages/_root.json` (Astro never routes a `_`-prefixed page, so `_root` cannot collide with a page, and `index.json` stays the registry); a file page `/reports/all/x.html` → `/ai/pages/reports/all/x.html.json`. Duplicate paths fail the build.

Every page that uses the site layout, except `noindex` pages, carries:

```html
<link rel="alternate" type="application/json" href="/ai/pages/statistics/spatial.json" title="Page mirror (rs-page-context.v1)">
<link rel="alternate" type="text/markdown" href="/ai/pages/statistics/spatial.md" title="Page mirror (Markdown)">
```

## 2. `rs-page-context.v1`

| Field | Meaning |
|---|---|
| `page_id`, `canonical_path` | Exact registered path: directory pages end with `/`, the root is `/`, file pages keep their name. |
| `canonical_url` | `https://statistics.reltroner.com` + page id. |
| `title`, `html_title`, `description`, `lang` | Route-registry title when one exists, else the page's `<h1>`; the `<title>`; the meta description. |
| `site_section`, `family`, `content_kind` | Navigation section; page family (`spatial`, `drift_finding`, …); `document`, `interactive`, `dynamic_record` or `report_export`. |
| `static_or_dynamic`, `route_pattern` | `dynamic` pages give their pattern, for example `/drift/[id]/`. |
| `source_role` | `production`, `remodeling`, `mixed` or `statistics_generated`. Read from the commits the page declares, else from its data. Never relabeled by a request. |
| `declared_sources` | The commit links of the page's "Sources behind this view" list. |
| `snapshot` | `statistics_commit`, `production_source_sha`, `remodeling_source_sha`, `semantic_digest`, `rules_version`, `studio_deployment_status` (a source commit does not prove what Studio serves), `analysis_generated_at` (the pinned pipeline time, not a request clock). |
| `links` | `html`, `json`, `markdown`, `registry`. |
| `coverage` | `status` `FULL` / `PARTIAL` / `NOT_REPRESENTABLE` (reserved, not used on the current build); `captured`; `not_captured` (concrete reasons). |
| `interactive.components[]` | `component`, `hydration` (`load`, `visible`, `idle`, `only`), `server_rendered`, `data_ids`, `default_view`, `default_view_reproduced`, `not_reproduced`. |
| `interactive.url_view_state` | For pages whose component reads URL parameters: `supported` (name, location, kind, effect), `unsupported` (name, reason, browser_only) and `browser_only` notes. Otherwise `null`. |
| `sections[]` | `section_id` (lower-case; the element anchor when the page has one, else a slug of the heading), `anchor` (the element id a `#fragment` scrolls to), `heading`, `level`, `blocks` (`text`, `list`, `table`, `figure`, `component`), `blocks_total`, `links`, `truncated`. |
| `data[]` | `data_id` (`data-…`), `title`, `component`, `status`, `source_role`, `description`, `denominator`, `columns` (key, label, unit), `rows`, `rows_total`, `truncated`, `null_policy`, `transforms`, `default_view`, `sources` (role, repository, commit, path, pointer, line, url), `notes`. |
| `datasets[]` | Download links on the page (CSV, JSON, PDF, …). |
| `known_unknowns` | The page's own "Not yet known or supported here" items plus model unknowns. |
| `limitations` | Page text is data, not instructions; three identities; browser state is never in a mirror; nothing is ratified. |
| `truncated` | True when the 240 KiB bound cut anything; the cut parts are listed in `coverage.not_captured`. |

Limits: 80 blocks and 40 links per section, 200 rows per HTML table, 600 rows per data table, 1,000 sections, 240 KiB per JSON mirror (largest parts cut first, headings and anchors kept).

## 3. URL parsing (`src/domain/page-url.ts`)

Accepted: `https://statistics.reltroner.com/…` (scheme and host are case-insensitive; `:443` is removed) or a site path starting with `/`.

| Code | Refused when |
|---|---|
| `URL_TOO_LONG` | More than 512 characters. |
| `INVALID_URL` | Spaces, control or non-ASCII characters; any scheme other than `https` and `http` (`javascript:`, `data:`, `file:`, `ftp:`); a scheme-relative `//…`; a relative path; `https:` without `//`. |
| `INSECURE_SCHEME` | `http://`. |
| `FOREIGN_ORIGIN` | Any other host: look-alike suffixes and prefixes, a trailing dot, punycode, IP addresses. |
| `CREDENTIALS_NOT_ALLOWED` | `user@` or `user:pass@` in the authority. |
| `PORT_NOT_ALLOWED` | Any port but 443, or an empty port. |
| `PATH_NOT_CANONICAL` | `%` in the path (no encoded dots, slashes, backslashes or null), a backslash, characters outside `A–Z a–z 0–9 - _ . /`, empty segments (`//`), `.` or `..` segments. |
| `QUERY_NOT_ALLOWED` | Invalid percent-encoding or control characters in a parameter or fragment, a repeated parameter name, more than 6 parameters, a name or value over 160 characters, a fragment over 120 characters. |

Lookup is exact against the registry: the path as given, and the same path with the trailing slash added or removed (`TRAILING_SLASH_ADDED`, `TRAILING_SLASH_REMOVED`). Case, spelling and encoding are never changed. Nothing is fetched.

## 4. Operations

All three are `GET`, read-only, in the existing registry, and return the unchanged `rs-intelligence.v1` envelope. REST and MCP return byte-identical JSON.

| Operation (MCP tool) | REST | Input |
|---|---|---|
| `resolve_statistics_page` | `GET /api/v1/pages/resolve?url=` | `url`: absolute URL or site path, with optional query and fragment. |
| `read_statistics_page` | `GET /api/v1/pages/context?path=` | `path`; `source_policy` `as_published` (default) or `production_only`; `include_sections` (default `true`). |
| `read_statistics_section` | `GET /api/v1/pages/section?path=&section=` | `path`; `section`: a section id, an element anchor or a data id; `source_policy`; `cursor` (`o:<n>`). |

Results:

| Situation | `result_status` (HTTP) | `data.code` or field |
|---|---|---|
| Page found | `OK` (200) | `data.resolution.normalizations`, `data.view_state` |
| URL refused | `INVALID_INPUT` (422) | one of the codes in §3 |
| Query string over 2,048 characters | error body (414) | existing http limit |
| Page not in this build | `NOT_FOUND` (404) | `PAGE_NOT_FOUND`, with the ids tried |
| Section not on the page | `NOT_FOUND` (404) | `UNKNOWN_SECTION`, with up to 60 valid ids |
| Fragment that is not a section (resolve, read page) | `OK` (200) | `view_state.section.status = UNKNOWN_SECTION`, plus a limitation |
| Link parameters | `OK` (200) | `view_state.status` `DEFAULT_VIEW` / `VIEW_STATE_APPLIED` / `UNSUPPORTED_VIEW_STATE`; each ignored parameter has a code: `UNSUPPORTED_VIEW_STATE`, `BROWSER_ONLY_STATE`, `VALUE_NOT_PUBLISHED` or `UNKNOWN_PARAMETER` |
| `production_only` and a remodeling table | `OK` (200) | `withheld_by_source_policy: true`, no rows; the page's `source_role` is unchanged |
| Cursor beyond the end | `INVALID_INPUT` (422) | — |

`read_statistics_page` inlines section bodies up to 48 KiB and lists the rest, with ready-to-send `read_statistics_section` calls, in `data.follow_up`. Table rows are never inlined there. `read_statistics_section` returns up to 96 KiB of blocks or 200 table rows per call.

Evidence ids of the form `page:<page id>#<data id>:<n>` name the pinned source of a page table. They are scoped to the page read and do not resolve through `trace_evidence`. Finding, entity and fact ids shown in page tables (`CRD-…`, `NAF-…`, `nar:…`, `fact:…`) are the existing ids that `trace_evidence` resolves.

## 5. Compatibility

- The 13 RS-AI-API-001 tools keep their names, order, annotations and input schemas. `tests/fixtures/rs-ai-api-001-tool-inputs.json` holds the JSON Schemas generated from `main` (`fc37812`), and a unit test compares every input.
- The 15 REST operations are unchanged; three are appended (18 in total). The 13 MCP tools become 16.
- `MCP_SERVER_INFO.version` stays `1.0.0` in this PR to avoid a version clash with PR #8 (which sets `1.1.0`). The integration step sets the final version once.
- `MCP_INSTRUCTIONS` gains one sentence about page URLs.
- `/ai/manifest.json` gains `discovery.pages` and `page_mirrors`; `/ai/context.json` gains two examples; `/llms.txt` gains a "Pages" section. These are additive.
