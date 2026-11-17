# RS-CREATIVE-QUALITY-003 — Operations

How to use the upgraded research tools from an AI client, and what the server can and cannot guarantee. Setup of the connector itself is in [RS-AI-API-001-MCP-CLIENT-SETUP.md](RS-AI-API-001-MCP-CLIENT-SETUP.md).

## 1. Research sequence for a client

The same seven steps are published in `/llms.txt`, `/ai/context.json` and the MCP server instructions.

1. **Retrieve.** `build_research_context` with the question. Read `data.coverage` first.
2. **Complete.** Run the calls in `data.coverage.follow_up` before concluding that something is absent.
3. **Verify.** `trace_evidence` for any claim you rely on. Cite repository, commit, path and line or pointer as returned.
4. **Compose.** Use `data.exploration_candidates`. Steps 1 and 2 of a candidate are source-grounded; the bridge, actor choice and consequence are `ASSUMED` or `UNKNOWN`.
5. **Differentiate.** Prefer candidates with low overlap with the opportunity cards. Do not present a restated card as new.
6. **Test.** State alternatives, what would disconfirm the idea, and what the creator would have to decide.
7. **Report.** Label every idea `HYPOTHESIS / UNRATIFIED`. List only the tool calls you made. Give fewer than three ideas if fewer are supported.

A reusable instruction for a chat:

```text
Use the Reltroner Statistics tools. Call build_research_context for my question, read data.coverage, and run its
follow_up calls. Build at most three ideas on data.exploration_candidates. For each idea give: the two cited points
with repository, commit, path and line; which steps are VERIFIED and which are ASSUMED or UNKNOWN; two different ways
to develop it; what would disconfirm it; and the decision I would have to make. Label every idea HYPOTHESIS /
UNRATIFIED. If the evidence supports fewer than three, give fewer. End with the exact list of tool calls you made.
```

No instruction makes a model reason well. The tools return checkable material; the answer is the client's.

## 2. Pinned data

Every answer carries `snapshot`: the Statistics commit, the production and remodeling source commits, the semantic digest and the Studio deployment status. Two answers are comparable only when their snapshots are equal **and** their arguments are equal.

- Source commit is not the live Studio release. `studio_deployment_status` says whether that was verified.
- Answers are cached for five minutes (`GET`) or not at all (`POST`). A new build changes the snapshot.

## 3. Source-limit semantics

| Field | Meaning |
|---|---|
| `coverage.exhaustive` | Always `false`. A pack is a selection. |
| `coverage.sections.<name>.matched / returned / omitted` | How many items matched the question, how many are in this response, and the difference. |
| `coverage.per_section_limit` | 5 for `compact`, 10 for `standard` (relationships: twice that). |
| `coverage.evidence.cited / returned / omitted` | Citations the rows refer to, those in `evidence[]`, and the rest. |
| `coverage.evidence.omitted_ids` | Ids of omitted citations (up to 100; `omitted_ids_truncated` says when there are more). Each resolves through `trace_evidence`. |
| `coverage.follow_up` | Calls, with arguments, that retrieve what was omitted. |
| `truncated` | True when any section or citation was cut. |

**Compact and standard differ by design.** They are two selections of one snapshot. A different relationship count between them is not a source mismatch. Compare counts only between calls with identical arguments.

**Evidence budget.** `max_evidence_items` (default 20, maximum 40) bounds `evidence[]`. Sections share it by turns. A row whose citation was omitted still names its `evidence_id`; trace it.

**Exploration candidates** carry their citations inline in `anchors`, so they do not use the evidence budget. In the `explorations` view the same anchors are also in `evidence[]`.

## 4. Retrieving more

| Need | Call |
|---|---|
| Omitted citations | `trace_evidence { ids: [...] }` — up to 20 per call |
| One passage of a finding | `trace_evidence { ids: ["NAF-…#2"] }` |
| An earlier value | `trace_evidence { ids: ["fact:country:reltronland:population@1010BAC"] }` |
| Larger sections | `build_research_context { …, detail: "standard", max_evidence_items: 40 }` |
| All relationships of one entity | `get_entity_context { id, include_proposed }` — up to 50 |
| More candidates | `discover_opportunities { view: "explorations", entity, limit, cursor }` — 10 per page |
| Candidates that use remodeling material | add `source_policy: "include_proposed"` (pack) or `include_proposed: true` (view) |

In a REST query string write `#` as `%23`: `GET /api/v1/evidence?ids=NAF-…%231`. In MCP arguments and JSON bodies write it as is.

Ids that do not resolve, by design:

- Calculator citations (`source:…`, `rubric:…`) belong to the calculation that returned them; that response has the full locator.
- Exploration candidate ids (`EXP-…`) are composed per request; trace the evidence ids the candidate lists.
- Co-occurrence candidate links are counted, never listed, and have no evidence id.

## 5. Tool results and ledgers

A model's own list of the tools it called is a claim, not a record. The PR #7 review found a pasted answer whose ledger contradicted the client's native event log.

- **The server cannot certify** which tools a client called, in what order, or which model wrote an answer. It is stateless and keeps no per-client log, by design.
- **What is checkable:** every envelope repeats its `operation` and `snapshot`; `coverage.request` repeats the arguments as applied; ids are stable for a snapshot. A reviewer can replay a claimed call and compare.
- **For acceptance evidence** use the client's native tool-call view (activity card, event log, developer mode). Mark a call that exists only in the answer text as `MODEL_SELF_REPORT_ONLY`.
- **Do not** infer the provider or model from pasted text.

## 6. What stays out

- No canon is written or ratified. Candidates, cards, scenarios and decision outcomes are hypotheses.
- No external model, API key, outbound fetch, storage or logging of chat prompts.
- No change to the kill switch (`RS_API_DISABLED`), the optional rate limiter, the Origin policy or the body and response limits of RS-AI-API-001.

## 7. Diagnostics

`node scripts/evaluate-creative-quality.ts [--dir dist] [--split dev|holdout|adversarial|all] [--out file]` runs the pinned cases of `tests/evaluation/creative-quality-cases.json` through the service against a built site and prints citation, scope, drill-down and overlap measurements. They are proxies, not a quality score. See [the evaluation](RS-CREATIVE-QUALITY-003-EVALUATION.md).
