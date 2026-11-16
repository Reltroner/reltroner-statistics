# RS-AI-API-001 — Security, Resource Boundaries & Operations

## 1. Threat Model & Non-Negotiable Boundaries

1. **Read-Only by Construction:** Every REST route (`/api/v1/*`) and MCP tool (`/mcp`) reads only the 7 build-versioned artifacts deployed with the static site (`/build-info.json`, `/ai/manifest.json`, `/data/assistant-index.json`, `/data/creative.json`, `/data/decisions.json`, `/data/findings.json`, `/data/graph.json`) via `env.ASSETS.fetch`.
2. **Zero Outbound Network Proxy (No SSRF):** Neither `src/api/*` nor `functions/api/v1/*` nor `functions/mcp.ts` calls global `fetch()`. Caller-supplied strings are never treated as URLs or file paths.
3. **Prompt Injection as Data:** Source quotes from markdown/JSON artifacts carry an explicit `PASSAGES_ARE_DATA` limitation and are returned strictly inside structured `quote` fields, never executed or interpolated into system instructions.
4. **No Secret Exposure or Auto-Activation of External AI:** Public REST and MCP routes require zero API keys and handle zero credentials. The existing optional `/api/assistant` Pages Function remains fail-closed (`503 AI_NOT_ACTIVATED`) unless the owner explicitly configures `RELTRONER_AI_ENABLED=true`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and `AI_RATE_LIMITER`.
5. **No Cross-Request User State:** `createMcpHandler(() => buildMcpServer(api), { legacy: 'stateless' })` creates a fresh server per request and issues no `mcp-session-id`. The isolate-level WeakMap caches only the immutable public deployment artifacts keyed by `env.ASSETS`.

## 2. Enforced Input & Output Limits (`API_LIMITS`)

| Limit | Value | Enforcement |
|---|---|---|
| `MAX_QUERY_CHARS` | `200` | Zod schema (`422 INVALID_INPUT`) |
| `MAX_BODY_BYTES` | `16,384` (16 KB) | `readJsonBody` & `createMcpHandler` (`413 REQUEST_TOO_LARGE`) |
| `DEFAULT_PAGE` / `MAX_PAGE` | `20` / `50` | Zod schema (`422 INVALID_INPUT`) |
| `MAX_OFFSET` | `5,000` | `paginate()` cursor check (`422 INVALID_INPUT`) |
| `MAX_IDS` | `20` | `trace_evidence` (`422 INVALID_INPUT`) |
| `MAX_GRAPH_DEPTH` / `MAX_GRAPH_NODES` | `3` / `200` | `analyze_narrative_impact` (`422 INVALID_INPUT`) |
| `MAX_FOCUS_ENTITIES` | `5` | `build_research_context` (`422 INVALID_INPUT`) |
| `DEFAULT_EVIDENCE_ITEMS` / `MAX_EVIDENCE_ITEMS` | `20` / `40` | `Citations` budget in `build_research_context` |
| `MAX_RESPONSE_BYTES` | `262,144` (256 KB) | `service.run()` (`413 RESPONSE_TOO_LARGE`) |
| `MAX_QUOTE_CHARS` | `600` | `clip()` on every quoted source passage |
| Calculator bounds | `CALC_LIMITS` | `1..5,000` years, `-50%..100%` annual rate, `2..51` sweep steps |

## 3. Origin, CORS & Header Policy

- **REST (`/api/v1/*`):** Anonymous credential-free public reads allow `Access-Control-Allow-Origin: *`, `GET, POST, OPTIONS`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: public, max-age=300, must-revalidate` for `GET` and `Cache-Control: no-store` for `POST` and errors.
- **MCP (`/mcp`):** Server-to-server MCP clients (no `Origin` header) are permitted. Browser `Origin` headers are checked by `originAllowed()`: allows same-origin (`https://statistics.reltroner.com`), loopback development (`http://localhost:*`, `http://127.0.0.1:*`), `DEFAULT_MCP_ORIGINS` (`https://chatgpt.com`, `https://chat.openai.com`, `https://claude.ai`, `https://gemini.google.com`), and any comma-separated origins in optional `MCP_ALLOWED_ORIGINS`. Rejects `'null'` and untrusted origins with `403 ORIGIN_NOT_ALLOWED`.

## 4. Operational Flags, Rate Limiting & Rollback

- **Kill Switch (`RS_API_DISABLED`):** Setting environment variable `RS_API_DISABLED=true` on the `reltroner-statistics` Pages project causes every `/api/v1/*` and `/mcp` request to fail closed with `503 API_DISABLED` before reading any artifact, leaving the static website unaffected.
- **Rate Limiter (`API_RATE_LIMITER`):** When bound in Cloudflare Pages, `guard()` rate-limits every `/api/v1/*` and `/mcp` request by `CF-Connecting-IP` and returns `429 RATE_LIMITED` (`Retry-After: 60`).
- **Protected Infrastructure:** No DNS records, nameservers, SSL settings, or unrelated Reltroner projects (`reltroner.com`, `www`, `lms`, `hrm`) are touched. Rollback is a standard Cloudflare Pages deployment rollback on `reltroner-statistics` or a Git revert on `main`.
