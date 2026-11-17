# RS-AI-API-002 — Version-aware MCP contract verification (legacy 13 + PAGE-004 3)

**Date:** 2026-11-17 (Asia/Jakarta)  
**Scope:** Provider-neutral, public REST/MCP verification. This document does **not** prove signed-in ChatGPT/Claude/Gemini usage or authorize a merge or deployment.

## Problem and release reality

The original `scripts/verify-remote-mcp.mjs` asserted **exactly 13 MCP tool names**. That assumption was correct for **RS-AI-API-001**, but it would give a false failure once the additive **RS-AI-PAGE-004** three-tool feature was deployed. Dropping the tool-count assertion alone would be unsafe: removing or changing a legacy tool could then go unnoticed.

PR #8 (RS-CREATIVE-QUALITY-003) merged into Statistics `main` at `5b5473875f81b16d9f47ac0dc52f6d49e30a0861`. It enhances some *existing* input schemas additively but still exposes **13** MCP tools. PR #9, which proposes the additional page-aware tools, remained **draft and unmerged** at the time of this change and requires reconciliation with PR #8. Neither a draft PR head nor an MCP server's internal `version` string proves a production deployment.

## Fixed acceptance contracts

| Published profile | Required MCP inventory | Release signals and obligations |
| --- | --- | --- |
| `core-v1` | **Exactly the original 13** tools | `/ai/pages/index.json` must be 404, discovery must not advertise page mirrors or page REST operations; all 13 legacy input schemas must remain backwards compatible |
| `page-aware-v1` | **Exactly the original 13 + 3 page tools (16)** | `/ai/pages/index.json` must be 200 with `rs-page-registry.v1`, matching published `statistics_commit`; discovery manifest must identify the registry and three tools; OpenAPI must publish the three read-only page GET operations; all 16 tools must be read-only and non-destructive |

Expected new tools: `resolve_statistics_page`, `read_statistics_page`, `read_statistics_section`. They are **never** silently optional when the static PAGE-004 registry is deployed.

Version selection is **fail-closed**. A registry and manifest that disagree, an unexpected 14/15/17 tools, an OpenAPI page route without mirrors, a wrong published SHA or a missing page tool is a **test failure**. `--profile auto` uses the independently published signals; `--profile core-v1` and `--profile page-aware-v1` can explicitly require a candidate release during controlled verification.

## What is checked beyond the count

- A locked original-source fixture `tests/fixtures/rs-ai-api-001-tool-inputs.json` captures **all 13 RS-AI-API-001 tool input JSON Schemas** from `fc37812b6cad68cfb707fdcdd07d7a0e417825df`.
- `scripts/lib/mcp-contract-profile.mjs` recursively checks that a future input schema did not remove previous properties or enum values, add newly required arguments, narrow numeric/string/array bounds, change defaults or introduce unknown restrictive patterns. Known compatible additions from PR #8 are allowed. The one deliberately reviewed `trace_evidence` pattern widening for `#` / `@` child IDs is explicitly allowlisted.
- All tools must advertise `readOnlyHint: true` and `destructiveHint: false`. Extra tools and duplicate names fail.
- For the three page tools, **exact** argument names, required keys, source policy, cursor and input types are verified.
- **MCP SDK normalization caveat:** `tools/list` may omit the source's `additionalProperties: false` marker when `McpServer` registers an `z.object(shape)` rather than the original strict root. The verifier refuses an explicit `additionalProperties: true`, and makes **separate negative REST calls** to verify unknown input keys return 422. It does not claim that the tools/list representation itself proves MCP unknown-key rejection.
- The live protocol still invokes the existing scenario calculator, research pack and unknown-entity handling and compares REST/MCP calculation data.
- Once PAGE-004 is published, the verifier additionally invokes all three page tools: exact Spatial URL resolution, identity/provenance, two distinct Spatial tables and denominations, REST/MCP page data parity, remodeling `PROPOSED` status, production-only withholding, unknown page, foreign-origin and extraneous REST parameter refusal.

The acceptance script tests **one deployed release**. The local unit tests include both 13-tool and synthetic 16-tool profiles to prevent changing the checker in a way that accepts a future broken deployment.

## Files and commands

```text
scripts/verify-remote-mcp.mjs                      public live protocol probe
scripts/lib/mcp-contract-profile.mjs               profile selection and contract checks
tests/fixtures/rs-ai-api-001-tool-inputs.json       immutable 13-tool baseline
tests/protocol/mcp-contract-profile.test.mjs        no-network positive/negative tests
.github/workflows/rs-ai-api-002-protocol.yml        workflow gate
```

On an **authorized checkout with these verifier changes** and installed dependencies:

```bash
node --test tests/protocol/mcp-contract-profile.test.mjs
node scripts/verify-remote-mcp.mjs --expected-sha <CURRENT_40_HEX_STATISTICS_MAIN_SHA> --profile auto

# Optional: intentionally require the PAGE-004 candidate to be live.
# This MUST fail until PAGE-004 actually ships:
node scripts/verify-remote-mcp.mjs --expected-sha <CURRENT_40_HEX_STATISTICS_MAIN_SHA> --profile page-aware-v1
```

The GitHub Actions job pins its expected live SHA to the **actual remote GitHub `main`**, not the PR head, so draft PRs never masquerade as a deployed release.

## Acceptance boundary

1. **Current source PR #8 merged** means quality engineering exists on `main`; it does not mean the three PAGE-004 tools are published.
2. **PR #9 draft** must first be reconciled with PR #8 and passed through combined tests. This verifier does not resolve that textual integration.
3. On current `core-v1` deployment, all 13 original tools must pass backwards-compatibility checks. On future `page-aware-v1`, those same checks continue **plus** strict page-tool checks and real MCP/REST invocations.
4. G8 authenticated provider-hosted acceptance remains separate. A remote SDK success is not a ChatGPT/Claude/Gemini user-session tool trace.
5. No source canon, Remodeling, owner WIP, Cloudflare project or live custom domain is modified by this test-only patch.
