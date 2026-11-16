# RS-AI-API-001 — Acceptance & Verification Record

- **Feature:** Static-First Intelligence API (`/llms.txt`, `/ai/*`, `/openapi.json`, `/api/v1/*`) + Stateless MCP Gateway (`/mcp`)
- **Base `main` SHA:** `54708b04d8a675d065ea30a18798877d057d4982`
- **Pinned Production Source (`Reltroner/reltroner-studio`):** `ad895e6d9184f09281a7cc14ccd7867c47acd29e`
- **Pinned Remodeling Source (`Reltroner/reltroner-studio-remodeling`):** `2c970f4c51ef14e610a554ec4127d5bc25cefa9c`
- **Semantic Digest (`P0R-2.0.0`):** `d1d034fcaf03d221992c646d4e9114d04122e70364a152147288c9ab77fef082`
- **Studio Live Deployment Status:** `DEPLOYMENT_UNVERIFIED`

## 1. Requirement & Gate Checklist

| Requirement | Implementation & Verification Evidence | Status |
|---|---|---|
| Discovery (`/llms.txt`, `/ai/manifest.json`, `/ai/context.json`, `/openapi.json`) | Generated from `OPERATIONS` in `src/api/discovery.ts`; verified in `postbuild.ts`, `intelligence-api.test.ts`, `verify-pages-runtime.ts`, and `routes.spec.ts` | PASS |
| REST API (`/api/v1/*`, 15 operations) | `src/api/contract.ts`, `src/api/service.ts`, `src/api/http.ts`, `functions/api/v1/[[path]].ts`; verified in unit tests and `wrangler pages dev` | PASS |
| Stateless MCP Gateway (`/mcp`, 13 read-only tools) | `@modelcontextprotocol/server` `2.4.0` (`McpServer` + `createMcpHandler` stateless mode) in `src/api/mcp.ts` and `functions/mcp.ts`; verified with `@modelcontextprotocol/client` over loopback TCP and Cloudflare `workerd` (`wrangler@4.161.0 pages dev dist`) | PASS |
| Calculator Parity (`CALC-01`–`CALC-07`) | Calls `evaluate()` in `src/domain/calculator.ts` directly; byte-identical results across direct engine, `POST /api/v1/calculator`, `POST /api/v1/calculator/compare`, and MCP `calculate_scenario` / `compare_scenarios` | PASS |
| Creative, Graph & Decision Parity | Preserves `INTENTIONAL_AMBIGUITY` vs `is_defect`, `PROPOSED` remodeling labels, `MENTIONS` non-dependency rule, candidate link counting, and `evaluateDecisionTree()` unknown/choice disclosures | PASS |
| Multi-Domain Research Context Pack | `POST /api/v1/research/context` & `build_research_context`: deterministic ranking, `source_policy` filtering, `max_evidence_items` budget, `PASSAGES_ARE_DATA` prompt-injection containment | PASS |
| Security & Resource Boundaries | Strict Zod schemas, `16 KB` request cap, `256 KB` response cap, `originAllowed` on `/mcp`, `RS_API_DISABLED` kill switch, optional `API_RATE_LIMITER` (`429`), zero outbound `fetch`, `/api/assistant` fail-closed `503` preserved | PASS |

## 2. Executed Verification Commands

- `npm run verify:baseline` — `BASELINE_VERIFIED` (`P0R-2.0.0`, `448` paths, `481` findings, digest `8f3ddad3f264130aa35ccf1a7d8202f5deed13fcbf943a590d7c2702694ea7d5`)
- `npm run schemas:check` — Exit `0`
- `npm run typecheck` — `astro check` (`0` errors, `0` warnings, `0` hints)
- `npm test` — `114` unit tests (`114` passed, `0` failed, `0` skipped)
- `npm run test:py` — `24` Python tests passed
- `npm run pipeline` — `ARTIFACTS_GENERATED_NOT_DEPLOYED` (`12/12` steps `COMPLETED`, `130` files)
- `npm run build` — `STATIC_BUILD_VERIFIED_NOT_DEPLOYED` (`558` HTML pages, `4` AI discovery files, `565` PDFs, `_headers`, `build-info.json`)
- `npm run verify:runtime` (`node scripts/verify-pages-runtime.ts`) — `WRANGLER_PAGES_RUNTIME_VERIFIED` (`wrangler 4.161.0`, `15` REST operations, `13` MCP tools in `workerd`)
- `npm run test:e2e` — Playwright suite across `desktop-1440`, `laptop-1024`, `tablet-768`, `mobile-375`

## 3. Residual Limitations & Owner-Only Controls

- Pasting `https://statistics.reltroner.com/` into a chat window does not automatically attach MCP tools; users must configure `https://statistics.reltroner.com/mcp` in a supported MCP client or use `/openapi.json` / `/llms.txt`.
- Optional Cloudflare rate-limiter binding (`API_RATE_LIMITER`) and kill switch (`RS_API_DISABLED`) are owner-configurable in the Cloudflare Pages dashboard without DNS or code changes.
- Hosted ChatGPT/Claude/Gemini account UI connector setup requires the user's own signed-in account; local & production HTTP/MCP protocol verification is performed with `@modelcontextprotocol/client` (`StreamableHTTPClientTransport`).
