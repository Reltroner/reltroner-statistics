# RS-AI-API-001 — Architecture: Static-First Intelligence API + Stateless MCP Gateway

- **Status:** Ratified & implemented (`rs-intelligence.v1`)
- **Host:** `https://statistics.reltroner.com` (dedicated Cloudflare Pages project `reltroner-statistics`)
- **Base commit (main before feature branch):** `54708b04d8a675d065ea30a18798877d057d4982`

## 1. Runtime & Authority Diagram

```text
ChatGPT / Claude / Gemini / MCP Inspector / HTTP clients
        |                                 |
        | 1. Browse / REST / OpenAPI      | 2. Connected MCP tool calls
        v                                 v
https://statistics.reltroner.com (Cloudflare Pages: reltroner-statistics)
  Static Astro routes:              Pages Functions (stateless Workers):
   /llms.txt                         /api/v1/[[path]].ts  (GET/POST REST)
   /ai/manifest.json                 /mcp.ts              (Streamable HTTP MCP)
   /ai/context.json                  /api/assistant.ts    (existing fail-closed 503)
   /openapi.json
                \                   /
                 v                 v
         src/api/{contract,service,http,mcp,discovery}.ts
           (read-only, bounded, Zod-validated adapters)
                 |                 |
      env.ASSETS.fetch(...)   Pure TS domain evaluators
      (immutable build JSON)  - src/domain/calculator.ts (evaluate)
       - /build-info.json     - src/domain/graph.ts (traverseImpact)
       - /ai/manifest.json    - src/engine/decision-intelligence/evaluate.ts
       - /data/assistant-index.json
       - /data/creative.json
       - /data/decisions.json
       - /data/findings.json
       - /data/graph.json
                 |
      Pinned GitHub API snapshots at build time
       - Reltroner/reltroner-studio (production canon)
       - Reltroner/reltroner-studio-remodeling (PROPOSED workspace)
```

## 2. Three Distinct Access Modes

1. **Browse (`BROWSE`)** — Reading `https://statistics.reltroner.com/`, `/llms.txt`, `/ai/manifest.json`, `/ai/context.json`, `/openapi.json`, or `/data/*.json`. Opening or pasting a URL into a chat does **not** connect an MCP server or execute tools.
2. **REST (`REST`)** — Calling the read-only HTTP endpoints under `/api/v1/*` described by `/openapi.json`.
3. **Connected MCP (`MCP`)** — Connecting `https://statistics.reltroner.com/mcp` as a stateless Streamable HTTP MCP server (`@modelcontextprotocol/server` `2.4.0`, `createMcpHandler` with `{ legacy: 'stateless' }`). A fresh `McpServer` instance is built per request; no Durable Object, WebSocket, session store, or cross-request state is used.

## 3. Shared Operation Registry & Routes

All 15 REST routes and 13 MCP tools share a single operation registry in `src/api/contract.ts` and a single service implementation in `src/api/service.ts`:

| Operation / MCP Tool | HTTP Route | MCP | Domain / Artifact Authority |
|---|---|---|---|
| `get_statistics_manifest` | `GET /api/v1/manifest` | Yes | `/build-info.json`, `/ai/manifest.json` |
| `search_asthortera` | `GET /api/v1/search` | Yes | `/data/assistant-index.json` |
| `list_entities` | `GET /api/v1/entities` | No (REST) | `/data/assistant-index.json` |
| `get_entity_context` | `GET /api/v1/entities/{id}` | Yes | `/data/assistant-index.json` (stats, ancestry, Spatial 3D, narrative relations) |
| `query_statistics` | `GET /api/v1/statistics` | Yes | `/data/assistant-index.json` (Year 0, historical anchors, composition) |
| `calculate_scenario` | `POST /api/v1/calculator` | Yes | `evaluate()` in `src/domain/calculator.ts` |
| `compare_scenarios` | `POST /api/v1/calculator/compare` | Yes | `evaluate()` in `src/domain/calculator.ts` (`compareScenarios` / `analyzeSensitivity`) |
| `trace_evidence` | `GET /api/v1/evidence` | Yes | `/data/assistant-index.json`, `/data/creative.json`, `/data/findings.json` |
| `analyze_source_drift` | `GET /api/v1/drift` | Yes | `/data/findings.json` |
| `analyze_narrative_impact` | `GET /api/v1/graph` | Yes | `traverseImpact()` in `src/domain/graph.ts` over `/data/graph.json` |
| `audit_consistency` | `GET /api/v1/creative` | Yes | `/data/creative.json` (`audit_findings`) |
| `discover_opportunities` | `GET /api/v1/creative/opportunities` | Yes | `/data/creative.json` (`opportunities`, `refactoring_plans`, `scenarios`) |
| `evaluate_decision_tree` | `GET /api/v1/decisions` | Yes | `evaluateDecisionTree()` in `src/engine/decision-intelligence/evaluate.ts` over `/data/decisions.json` |
| `build_research_context` | `POST /api/v1/research/context` | Yes | Bounded multi-domain orchestration over published artifacts |
| `list_reports` | `GET /api/v1/reports` | No (REST) | Precomputed report links (`/reports`, `/reports/all/*`, `/reports/pdf/*`) |

## 4. Contract & Epistemic Invariants

- **Shared Envelope (`rs-intelligence.v1`):** Every REST and MCP tool response returns `{ schema_version, operation, result_status, snapshot, data, evidence, assumptions, limitations, next_cursor, truncated }`.
- **Three Separate Identities:** `snapshot.statistics_commit` (Statistics app build), `snapshot.production_source_sha` (`Reltroner/reltroner-studio`), `snapshot.remodeling_source_sha` (`Reltroner/reltroner-studio-remodeling`), and `snapshot.studio_deployment_status` (`DEPLOYMENT_UNVERIFIED` unless proven by a live Studio build identifier) are never conflated.
- **Statuses Preserved:** `CANON_OBSERVED`, `CANON_DERIVED`, `MODEL_ESTIMATE`, `SCENARIO`, `PROPOSED`, `ARCHIVED`, `INSUFFICIENT_DATA`. Missing values remain `null` with `INSUFFICIENT_DATA` (never `0` and never substituted from another entity).
- **Zero Duplicate Math:** `calculate_scenario` and `compare_scenarios` call `evaluate()` in `src/domain/calculator.ts` directly.
- **No Side Effects:** No tool or route writes to disk, calls GitHub APIs at request time, fetches caller-supplied URLs, executes shell/Python, or ratifies canon.
