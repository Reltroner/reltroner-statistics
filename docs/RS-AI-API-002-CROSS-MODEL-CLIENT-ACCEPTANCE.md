# RS-AI-API-002 — Cross-Model Client Acceptance

**Status:** PARTIAL ACCEPTANCE — G1 remote protocol PASS; ChatGPT actual tool execution and a three-hypothesis source-grounded synthesis demonstrated; cross-model reported result parity PASS; Claude/Gemini raw tool traces and independent creative responses outstanding  
**Record date:** 2026-11-17 (Asia/Jakarta)  
**Scope:** ChatGPT, Claude, and Gemini consumption of the existing read-only RS-AI-API-001 gateway. No new source facts, formulas, canon ratification, or changes to Statistics production routing.

## 1. Evidence and non-claims

- **GitHub evidence:** [RS-AI-API-001 PR #6](https://github.com/Reltroner/reltroner-statistics/pull/6) was merged as Statistics SHA fc37812b6cad68cfb707fdcdd07d7a0e417825df. [Main CI/publish #43882166165](https://github.com/Reltroner/reltroner-statistics/actions/runs/43882166165) completed successfully, including deployment identity verification.
- **Repository implementation:** src/api/contract.ts defines 13 read-only MCP tools; scripts/verify-pages-runtime.ts already exercises the official SDK against Cloudflare workerd in a local simulation.
- **Fresh independent network verification:** **PASS on 2026-11-17** from [GitHub Actions remote protocol run #44003607623](https://github.com/Reltroner/reltroner-statistics/actions/runs/44003607623), executed against the live production site using the official MCP client. The reviewer runtime itself still could not resolve the public hostname, but the separate GitHub-hosted verification succeeded. This is protocol acceptance, not proof of model account access.
- **Logged-in model connections:** ChatGPT's connected app was invoked successfully from the assistant conversation. Owner supplied screenshots of Claude Connected and Gemini web 13/13 schema discovery; subsequently supplied text responses from Claude Sonnet Medium and Gemini Hydrogen High claiming the same four MCP operations. Those model-generated reports provide result parity evidence but not raw tool-call telemetry; do not upgrade their execution trace to independently audited PASS without the event log.
- **Local Windows workspace:** NOT_INSPECTED. The owner/agent previously reported local-main/GitHub parity for RS-AI-API-001; this review cannot inspect C:\Projects\reltroner-statistics or claim current parity.

## 2. Existing endpoints and invariants

| Surface | URL |
|---|---|
| Public website | https://statistics.reltroner.com |
| MCP (stateless Streamable HTTP) | https://statistics.reltroner.com/mcp |
| REST | https://statistics.reltroner.com/api/v1 |
| OpenAPI | https://statistics.reltroner.com/openapi.json |
| AI discovery | https://statistics.reltroner.com/llms.txt |
| AI manifests | https://statistics.reltroner.com/ai/manifest.json and /ai/context.json |

For the current implementation, **POST /mcp** handles protocol traffic, while **GET /mcp returns 405 intentionally**. A browser GET is not an MCP test.

Maintain distinct identities: Statistics application SHA, Studio production source SHA, Remodeling source SHA, semantic digest, and Studio live deployment status. Canon values are not the same as SCENARIO or PROPOSED. A missing observation must not become zero. Prose mentions and candidate relationships do not imply causation. No tool can write to Studio or Remodeling.

## 3. G1 — Independent provider-neutral live test

From a Windows checkout that has npm dependencies installed:

~~~powershell
Set-Location 'C:\Projects\reltroner-statistics'
git status --porcelain
git branch --show-current
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
npm ci
$MainSHA = (git rev-parse origin/main).Trim()
node .\scripts\verify-remote-mcp.mjs --expected-sha $MainSHA
~~~

The script returns JSON with PASS or FAIL_OR_BLOCKED and exits nonzero on failure. It tests public build identity; SHA/source/digest parity; four discovery URLs; stateless MCP method and Origin guards; real protocol discovery of 13 read-only tools; manifest equality; REST/MCP calculator parity; source-grounded research pack; unknown-entity handling; and rejection of malformed calculator input.

**This script is NOT a test of actual ChatGPT, Claude or Gemini sessions.** A DNS or firewall error is a network blocker; it is not evidence that the API or model succeeded or failed.

**G1 live evidence:** The [remote CI run #44003607623](https://github.com/Reltroner/reltroner-statistics/actions/runs/44003607623) finished successfully on 2026-11-17 02:31:43 UTC, validating ten checks: published build SHA, REST source/digest parity, four discovery endpoints, MCP Origin/method guards, 13 read-only tools discovered, MCP manifest parity, exact REST/MCP calculator result, research context (20 evidence items), unknown entity rejection, and invalid calculator input rejection. Observed Statistics SHA: fc37812b6cad68cfb707fdcdd07d7a0e417825df; production source SHA: ad895e6d9184f09281a7cc14ccd7867c47acd29e; remodeling source SHA: 0c80fdb05f5f338241c58663b87a01aa0e1748b2; semantic digest: a24ccb3c5e585950ec746fb8b3936d4e35a3d4f5982dcaddbd1171fcb134aec2. These are live snapshots, not immutable future source values.

## 4. G2 — Actual AI client setup

### ChatGPT

Review account or workspace permissions first. OpenAI documents full custom MCP support for Business/Enterprise/Edu and limited read/fetch support for Pro; individual access and the exposure of individual tools must be tested, not assumed. Where available, navigate to **Plugins → Add custom MCP server** and provide https://statistics.reltroner.com/mcp with no authentication. Review the connection risk; inspect discovered tools and enable the connector in the conversation. If the client cannot execute the read-only calculator, log CLIENT_CAPABILITY_BLOCKED; a simple browsing response is not MCP acceptance.

Official instructions: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

### Claude

For a supported individual or team account, navigate **Customize → Connectors → Add → Add custom connector**, enter https://statistics.reltroner.com/mcp, choose **No sign in**, and enable it in the chat. Confirm actual tool execution and capture a redacted tool trace.

Official instructions: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp

### Gemini CLI

In user or workspace .gemini/settings.json, merge this server entry without deleting existing entries:

~~~json
{
  "mcpServers": {
    "reltroner-statistics": {
      "httpUrl": "https://statistics.reltroner.com/mcp",
      "trust": false
    }
  }
}
~~~

Run Gemini CLI, inspect MCP discovery, and execute the common acceptance prompt. This verifies **Gemini CLI**, not automatically the separate Gemini web chat product. Google's Gemini API Interactions remote MCP is another route requiring the user's own developer/API access.

Official documentation: https://geminicli.com/docs/tools/mcp-server/ and https://ai.google.dev/gemini-api/docs/function-calling

## 5. G3 — Common scenario, copied identically to all three clients

> Use the CONNECTED Reltroner Statistics MCP tools, not browsing alone. First call get_statistics_manifest. Then search the evidence and relationships for Reltronland, Depcutland, Henchoway and Nytherion. Call build_research_context for "Reltronland Depcutland cooperation" using source_policy "production_only". Evaluate relevant audit findings and decision options. Call calculate_scenario on entity_id "country:reltronland", indicator "population", operation "projectScenario", annual_rate_pct 1, horizon_years 100 and label "RS-AI-API-002 test". Label that result SCENARIO, not a validated forecast. Call query_statistics for "Atlantis" and "population"; do not substitute another country. Return three distinct, evidence-grounded, unratified development hypotheses in this chat. Cite pinned sources, source SHAs, assumption and missing data. Show which MCP tools were actually invoked. If a tool is unavailable, state that fact rather than inventing its result. Do not modify any repository or canon.

Compare deterministic calculation **structuredContent** (inputs, result, formula, source, status), not the model's rounded prose. Different creative suggestions are acceptable. Uncited facts, invented citations, or canon/proposal confusion are failures.

## 6. G4 — Acceptance ledger

| Gate | ChatGPT | Claude | Gemini CLI |
|---|---|---|---|
| Account-side connector added | NOT_RUN | NOT_RUN | NOT_RUN |
| Real MCP tools/list observed | NOT_RUN | NOT_RUN | NOT_RUN |
| Manifest/source identities correct | NOT_RUN | NOT_RUN | NOT_RUN |
| Real calculator tool call matches REST | NOT_RUN | NOT_RUN | NOT_RUN |
| Research context with pinned citations | NOT_RUN | NOT_RUN | NOT_RUN |
| Unknown entity handled without invention | NOT_RUN | NOT_RUN | NOT_RUN |
| Original hypotheses delivered in chat | NOT_RUN | NOT_RUN | NOT_RUN |
| No write or canon ratification | NOT_RUN | NOT_RUN | NOT_RUN |
| Same-input cross-client parity | NOT_RUN | NOT_RUN | NOT_RUN |

Allowed statuses: NOT_RUN, PASS, FAIL, CLIENT_CAPABILITY_BLOCKED, ACCOUNT_SETUP_BLOCKED, NETWORK_BLOCKED, NEEDS_INVESTIGATION.

Collect only real, redacted evidence: exact model/client version, time, accessible tool names, sanitized call parameters, tool outputs (source SHAs + digest), final user-visible analysis and whether evidence citations resolve. Suggested record names: chatgpt-YYYYMMDD.md, claude-YYYYMMDD.md, gemini-cli-YYYYMMDD.md, protocol-YYYYMMDD.json. Do not commit API keys, cookies, session IDs, private ideation or screenshots showing account identifiers.

## 6A. 2026-11-17 hosted-client evidence update (account screenshots + ChatGPT tools)

**Screenshot evidence supplied by owner:**
- ChatGPT: Reltroner Statistics custom app appears installed with `Try in chat`; this is connector registration proof.
- Claude: Reltroner Statistics plugin displays `Added`, `Connected`, `No sign-in required`, and source `statistics.reltroner.com/mcp`. This is connection proof only. No tool invocation output yet.
- Gemini web Developer Mode (not Gemini CLI): `Live schema 13 / 13 tools`, including `get_statistics_manifest`, `search_asthortera`, and `get_entity_context`, marked read-only. This proves native Gemini-web schema discovery, **not** tool execution.

**Actual ChatGPT MCP calls performed in the acceptance conversation via the connected Reltroner Statistics app (not web browsing):**
- `get_statistics_manifest` returned `OK`, 13 advertised MCP tools, and pinned source identity.
- `calculate_scenario` for `country:reltronland`, population, `projectScenario`, 1% annually over 100 years returned `OK`; baseline 855 billion sentients, calculated conditional result **2312.6158241554067 billion sentients**, `SCENARIO`; empirical forecast declared `INSUFFICIENT_DATA`.
- `build_research_context` for `Reltronland Depcutland cooperation` with `source_policy=production_only` returned `OK`, 20 evidence citations; output reported limited coverage, not exhaustive.
- `query_statistics` for nonexistent entity Atlantis, indicator population, returned `NOT_FOUND`, zero rows, no silent fallback.

**Returned snapshot:** Statistics SHA `fc37812b6cad68cfb707fdcdd07d7a0e417825df`; production source SHA `ad895e6d9184f09281a7cc14ccd7867c47acd29e`; remodeling source SHA `0c80fdb05f5f338241c58663b87a01aa0e1748b2`; semantic digest `a24ccb3c5e585950ec746fb8b3936d4e35a3d4f5982dcaddbd1171fcb134aec2`; Studio deployment still `DEPLOYMENT_UNVERIFIED`.

**Important limits:** This transcript demonstrates **ChatGPT actual MCP execution for four tools**; it is not proof the full 13 tools have been invoked. Exact REST/MCP parity was independently checked by G1 GitHub Actions, not re-compared manually in the account conversation. The full human-visible three-hypothesis ChatGPT benchmark, Claude tool execution, Gemini-web tool execution, and cross-model same-input parity are still pending. Owner screenshots are not uploaded to GitHub and no hidden account data was committed.

**Partial provider status after this update:**

| Gate | ChatGPT | Claude web | Gemini web Developer Mode |
|---|---|---|---|
| Connector installed / connected | PASS | PASS | PASS (schema visible) |
| Schema or tools discovered | PASS (manifest advertises 13) | NOT_RUN | PASS (13/13 read-only) |
| Actual `get_statistics_manifest` call | PASS | NOT_RUN | NOT_RUN |
| Actual `calculate_scenario` call | PASS | NOT_RUN | NOT_RUN |
| Actual `build_research_context` call | PASS | NOT_RUN | NOT_RUN |
| Unknown entity rejected in tool call | PASS | NOT_RUN | NOT_RUN |
| Creative three-hypothesis in-chat response | NOT_RUN | NOT_RUN | NOT_RUN |
| Full cross-client parity | NOT_RUN | NOT_RUN | NOT_RUN |

Preserve the original Gemini CLI setup instructions as an additional optional client. The current screenshot instead proves a different client: **Gemini web Developer Mode**.

## 6B. Claude Sonnet Medium + Gemini Hydrogen High: model-reported parity (2026-11-17)

**Evidence classification:** Responses supplied by the owner in conversation (Claude Sonnet Medium and Gemini Hydrogen High). No authenticated raw MCP event-log export or native structuredContent dump from either provider was attached. The observed *reported outputs* match the ChatGPT MCP results and the independent GitHub Actions protocol baseline. Do not mislabel this as independently inspected provider-side invocation telemetry.

| Field | ChatGPT (direct MCP invocation) | Claude Sonnet Medium (owner-supplied response) | Gemini Hydrogen High (owner-supplied response) |
|---|---|---|---|
| Statistics application commit | `fc37812b6cad68cfb707fdcdd07d7a0e417825df` | MATCH | MATCH |
| Production source | `ad895e6d9184f09281a7cc14ccd7867c47acd29e` | MATCH | MATCH |
| Remodeling source | `0c80fdb05f5f338241c58663b87a01aa0e1748b2` | MATCH | MATCH |
| Semantic digest | `a24ccb3c5e585950ec746fb8b3936d4e35a3d4f5982dcaddbd1171fcb134aec2` | MATCH | MATCH |
| Rules / generation / Studio deployment | `P0R-2.0.0` / `2026-11-16T14:08:01.661Z` / `DEPLOYMENT_UNVERIFIED` | MATCH | MATCH |
| Conditional population result | `2312.6158241554067` billion sentients | EXACT MATCH | EXACT MATCH |
| Calculation ID | `calc-36cdf967` | MATCH | MATCH |
| Scenario status | `SCENARIO`; empirical forecast `INSUFFICIENT_DATA` | MATCH | MATCH |
| Research evidence | 20 returned, 3 omitted | MATCH | MATCH |
| Atlantis population query | `NOT_FOUND`, zero rows | MATCH | MATCH |

**Additional source-aware observations from both owner-supplied model answers:** baseline Reltronland population 855 billion sentients (Year 0, `CANON_OBSERVED`); change +1457.6158241554067 billion / +170.48138294215283%; 2 observed points vs 8 required for empirical forecast; research pack contains zero verified relationships between matched entities and 63 unverified candidate links (not causes). Claude also noted 39 matching drift findings and five shown; Gemini reported one consistency finding and one opportunity. They correctly did not silently create a new observation for Atlantis.

**Granular decision:**
- G1 independent production REST/MCP protocol: **PASS** (GitHub Actions).
- G2 ChatGPT real tool invocation (the four required functions): **PASS**, observed directly through connected tool. Claude and Gemini connection/schema are observed, and their four-operation *result summaries* have been received; **actual per-model tool-call traces: PENDING**.
- G3 **cross-model response result parity: PASS** for the common four-operation input/snapshot. The evidence is exact matching reported values, not a packet-level trace parity audit.
- G4 **full creative acceptance: NOT_RUN** — the same three source-anchored, diverse, unratified hypotheses were not generated and assessed across all three chats. Need specific real tool traces plus in-chat creative reasoning benchmark.
- Do not infer that all 13 MCP tools have each been exercised by any given client. No private account identifiers or unredacted data are stored here.

### Next provider evidence gates

1. Save redacted Claude tool-execution trace and Gemini Developer Mode event log showing actual `get_statistics_manifest`, `calculate_scenario`, `build_research_context`, and `query_statistics` call/response pairs, including request parameters.
2. Run the shared three-hypothesis creative acceptance prompt in each chat. Judge **evidence accuracy, grounded constraints, epistemic labeling, usefulness of novel opportunities, and absence of canon mutation**, not identical story prose.
3. Record model/client version and whether each relevant tool was actually called. Preserve all 1:1 Git safety checks before any subsequent merge.

## 6C. ChatGPT in-chat Creative Intelligence benchmark (2026-11-17)

The assistant invoked three further connected MCP operations directly: `discover_opportunities({view:"opportunities",limit:10})`, `audit_consistency({limit:15})`, and `evaluate_decision_tree({})`. Each returned `OK` with the same Statistics SHA as the earlier four operations. In the user-visible response, it developed three explicit unratified story directions anchored to the returned source passages:

1. **Dual Custody Crisis:** a shared global threat forces coordination between Reltronland financial custody and Depcutland epistemic custody; the story tension is speed versus preservation of provenance. Canon source: `Reltroner/reltroner-studio@ad895e6d`, `content/factions/reltronland-vs-depcutland.md`, lines 438–442 and 461 (opportunity `OPP-5899EF941CF8`).
2. **The Evidence Before the War:** explore the explicitly undecided historical question of whether Depcutland possessed authenticated invasion orders before firing its missiles; competing institutional testimony should stay attributed, not automatically treated as factual contradiction. Sources: bilateral dossier lines 531–541; audit `NAF-424DD7FB68E1` (opportunity `OPP-A94C7A02AFD4`).
3. **The Adaptive Stillness Paradox:** Henchoway relies on skilled learning and correction in pursuit of a less independently transformable society. Investigate how this contradiction plays out without inventing historical continuity or automatically attributing all societal change to Henchoway. Source: `content/factions/henchoway.md` line 196 (opportunity `OPP-0296F531F526`; audit `NAF-246423B4E0C2`).

All are **HYPOTHESIS / UNRATIFIED**, not canon or empirically predictive model outputs. This demonstrates a basic ChatGPT *source-grounded tool-to-synthesis* acceptance path. It does **not** independently prove high novelty, quality judged by other readers, or three-model creative reasoning parity.

**Updated evidence states:**
- ChatGPT: connected-app tool execution PASS; reported numeric/source parity PASS; basic in-chat three-hypothesis synthesis DEMONSTRATED.
- Claude Sonnet Medium: reported common-tool results MATCH; raw tool trace and creative synthesis pending.
- Gemini Hydrogen High (Gemini web Developer Mode): reported common-tool results MATCH; raw event-log trace and creative synthesis pending.
- Full RS-AI-API-002 acceptance still OPEN. No automatic canon ratification, no merge, no deployed route changes.

## 7. Release and local 1:1 safety

This milestone is authored on a feature branch. **Do not change GitHub main or infer local main parity from a remote commit.** No force-push, hard reset, branch overwrite, DNS/nameserver/Cloudflare changes, or unrelated domain edits.

Before approved merge, require green PR CI and owner inspection of local uncommitted changes. After merge, the owner must run the existing fast-forward-only sync from a clean main and verify its website identity explicitly:

~~~powershell
.\scripts\sync-main-ff-only.ps1 -VerifyWebsite
~~~

A successful publish CI establishes Statistics release SHA; it does not establish that the separate Studio website runs the Studio source SHA. The API_RATE_LIMITER binding is optional in the existing deployment; configure rate limiting appropriately before public promotion at scale, without weakening CSP.

## 8. Acceptance decision

**RS-AI-API-002 remains OPEN (partial acceptance).** G1 production protocol PASS; ChatGPT's four direct MCP invocations PASS; reported cross-model numeric/source/status parity PASS from owner-supplied Claude/Gemini responses. Provider-side tool execution telemetry for Claude/Gemini and their creative three-hypothesis benchmarks remain outstanding. ChatGPT demonstrated three source-grounded unratified hypotheses in the conversation; it is not a quality/novelty benchmark across models. Preserve distinction between reported model answers and independently inspected tool-call logs. Do not call full G4 acceptance or auto-merge until those gates have verifiable evidence.
