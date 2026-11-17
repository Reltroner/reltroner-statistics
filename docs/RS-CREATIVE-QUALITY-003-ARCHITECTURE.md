# RS-CREATIVE-QUALITY-003 — Architecture

Evidence-grounded creative response quality for the Reltroner Statistics intelligence API and MCP gateway.

- **Base:** `main` at `fc37812b6cad68cfb707fdcdd07d7a0e417825df` (verified 1:1 with `origin/main`, `git ls-remote`, the GitHub API and the published site before any change).
- **Branch:** `feat/rs-creative-quality-003`.
- **Scope:** this repository only. No change to Studio, Remodeling, canon, DNS, Cloudflare settings or PR #7.
- **Canon:** unchanged. H1, H2 and H3 of RS-AI-API-002 remain `HYPOTHESIS / UNRATIFIED`.

## 1. What was wrong at the baseline

Each item was confirmed in the code or by running the unchanged code against a built site. Numbers are in [the evaluation](RS-CREATIVE-QUALITY-003-EVALUATION.md).

| # | Baseline failure | Where | Evidence |
|---|---|---|---|
| 1 | Idea material is the six curated opportunity cards. A client asked for new ideas can only rephrase them. | `src/engine/creative-intelligence/opportunity-engine.ts`: six hand-written blocks, each matching fixed passages. | Every idea unit a pack returned was a card. |
| 2 | Citations were dropped without notice. The research pack filled its evidence budget in section order, so statistics used it up and rows of later sections pointed at citations that were not in the response. | `Citations.add` returned the id even when the citation was dropped; `build_research_context` in `src/api/service.ts`. | On the RS-AI-API-002 benchmark call, all 20 relationship rows cited evidence that was absent. The only signal was one sentence: "53 further citations were omitted". |
| 3 | Retrieval scope was invisible. Nothing said how many items matched, how many were shown, or how to get the rest. `truncated` was false when sections were cut. | Same function: `slice(0, perSection)` with no count. | No pack disclosed its scope. This is the source of the "19 versus 20 relationships" question in the PR #7 review: `compact` shows up to 10 relationships and `standard` up to 20, from one snapshot. |
| 4 | Evidence ids could not be traced again. Passages are returned as `NAF-…#1` and earlier values as `fact:…@1010BAC`, but the input pattern refused `#` and `@`, so one such id made the whole request fail with 422. | `id` pattern in `src/api/contract.ts`; `trace_evidence` in `service.ts`. | 42 of 362 returned citation ids were refused. |
| 5 | Function words matched names. "and" matched every nation ending in "land", so a sentence-shaped question pulled in unrelated nations and their statistics. | `tokens()` in `service.ts`. | "…between Reltronland and Depcutland" returned Stelpadland statistics. |
| 6 | Causal structure was left to the client. A verified conflict edge and a hypothesis about cause were not separated in any structure the client received. | No such structure existed. | — |
| 7 | A server cannot certify which tools a client called or which model wrote an answer. | Protocol property, not a defect. | Documented in [operations](RS-CREATIVE-QUALITY-003-OPERATIONS.md); not "fixed". |

## 2. What changed

One engine, shared by REST and MCP, as before. Nothing is computed by a language model and nothing is written anywhere.

```
published artifacts (unchanged)            src/domain/exploration.ts (new, pure)
  assistant-index.json  relationships ──►  pointsFromRelations ─┐
  creative.json         audit findings ─►  pointsFromFindings  ─┼─► composeExplorations ─► candidates
  assistant-index.json  Year 0 values ──►  pointsFromStatistics ┘        ▲
  creative.json         opportunity cards ───────────────────────────────┘ (overlap diagnostic only)

src/api/service.ts   build_research_context → data.exploration_candidates + data.coverage
                     discover_opportunities → view=explorations
                     trace_evidence         → sub-ids, evidence_class
src/api/contract.ts  additive inputs, descriptions, limits
src/api/discovery.ts research playbook in /llms.txt and /ai/context.json
```

### P0 — Evidence completeness

- **Coverage.** Every research pack carries `data.coverage`: the request as applied, the per-section limit, and for each section `matched`, `returned` and `omitted`; the evidence budget (`cited`, `returned`, `omitted`, by section, and the omitted ids); and `follow_up`, a list of ready-to-send calls that retrieve what was left out. `exhaustive` is always `false`. `truncated` is now true whenever any section or citation was cut.
- **Fair evidence budget.** Citations are collected for every section first. The budget is then shared by turns between sections, so relationships and findings keep their citations. Kept citations stay in first-use order. Omitted ones are listed and resolvable; none is dropped silently.
- **Drill-down.** `trace_evidence` accepts every id other operations return: one passage of a finding (`NAF-…#2`), one anchor of an opportunity (`OPP-…#1`), an earlier value (`fact:…@1010BAC`), composition (`composition:<entity>:ancestry`), and decision evidence (`DT-…:EV-…`). A parent id still returns all its passages. Each item states `evidence_class` (`SOURCE_VALUE`, `SOURCE_QUOTATION` or `RELATION_STATEMENT`); a relationship states `is_causal_claim: false`. A position that does not exist, a forged parent and request-scoped ids (calculator, exploration candidate) are reported as not found with the reason. Nothing is substituted.
- **Retrieval precision.** Function words are ignored when matching. A query made only of them is matched as typed.

### P1 — Causal and counterfactual support

An **exploration candidate** pairs two source-grounded points of different kinds that share an entity. A point is one of twelve kinds, read from the artifacts:

| Kind | Read from |
|---|---|
| `STATED_CAUSE` | a relationship the artifact classifies `VERIFIED_CAUSAL` (none exists in the current corpus) |
| `OPEN_CONFLICT`, `INSTITUTIONAL_CONSTRAINT`, `ACTOR_MOTIVE`, `SHARED_ORIGIN`, `CHRONOLOGY` | verified relationships `CONFLICTS_WITH`, `CONSTRAINED_BY`/`DEFINES`, `MOTIVATED_BY`, `DERIVED_FROM`, `PRECEDES`/`FOLLOWS` |
| `CONTESTED_ACCOUNT`, `DELIBERATE_AMBIGUITY`, `DECLARED_UNKNOWN`, `REVIEW_BOUNDARY` | audit findings by classification |
| `PROPOSAL_DIVERGENCE` | remodeling-declared relationships and findings with a remodeling passage; only on request |
| `QUANTITATIVE_ASYMMETRY`, `DECLARED_UNKNOWN` | Year 0 values of two nations differing by a factor of 2 or more; indicators a nation lacks |

Each candidate carries:

- `mechanism_steps`: two preconditions with the status of their source (`VERIFIED`, `DECLARED`, `UNKNOWN`), then the bridge (`ASSUMED`), the actor choice (`ASSUMED` when a motive is stated, else `UNKNOWN`) and the consequence (`UNKNOWN`). The composition cannot produce a `VERIFIED` step that is not a cited precondition.
- `anchors` with repository, commit, path, line or pointer and quote, and `anchor_check` (`TWO_OR_MORE_INDEPENDENT` or `MISSING_ANCHOR` with the reason).
- `alternatives`: two or three ways to develop the tension, each a different kind of mechanism resting on its own evidence, with its trade-off.
- `disconfirmation_tests`: what would make each reading fail, what evidence would change the assessment, and the call that checks it.
- `expected_impacts`: entities one verified relationship away, institutions implicated, audit findings to respect, and the count of unverified links (never used).
- `next_step`: one small creator decision, where declining is a valid outcome.

### P2 — Novelty and repetition

- **Overlap diagnostic.** Each candidate is compared with every opportunity card: Jaccard overlap of entity ids, and the share of the candidate's source locations the card already cites. `restates_existing_card` is true when one card cites all of them. A restatement is never moved up; it is listed last. The diagnostic is labeled `not_an_objective_creativity_score`.
- **Variety.** One candidate per pair of kinds on the same shared entities; kinds not yet shown go first; one point leads at most two candidates.
- **No filler.** A comparison between two nations is paired only with a point about both. An order in time is paired only with a point about the parties of both events. If nothing can be paired, the result says so and lists the single points as leads.
- **No answer content.** `src/domain/exploration.ts` names no entity, topic, title or benchmark answer, and a test enforces it. Wording comes from one fixed sentence set per kind of point.

### P3 — Client compatibility

- The 13 MCP tools keep their names, transport, envelope, annotations and required arguments. A test pins the list.
- Additive only: `build_research_context.include` gains `exploration_candidates`; `discover_opportunities.view` gains `explorations` and an optional `include_proposed`; `trace_evidence.ids` accepts `#` and `@`.
- MCP server version `1.0.0` → `1.1.0`. Tool descriptions and server instructions now tell a client to read coverage, follow up, test candidates and report only real tool calls.
- No new endpoint, tool, dependency, runtime, service or secret.

### P4 — Owner control

- Every candidate has status `HYPOTHETICAL_UNRATIFIED`, the label the repository already uses for machine-suggested ideas.
- Co-occurrence and thematic links are never points. Remodeling material appears only with `source_policy: include_proposed` and stays `DECLARED`.
- Read-only as before: the only I/O is the allowlisted artifact loader.

## 3. No-regression contract

| Contract | How it is kept | Test |
|---|---|---|
| Calculator results | Calculator code untouched | `855 × 1.01^100 = 2312.6158241554067`, `SCENARIO`, `INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST` |
| Null is not zero; unknown is not substituted | Unchanged paths | Atlantis `NOT_FOUND`; Calespia GDP `null` |
| Envelope `rs-intelligence.v1` | Unchanged | every test reads it |
| Earlier inputs | No new required argument | calls "as an earlier client sends them" |
| Earlier outputs | New keys only; an explicit earlier `include` list returns the earlier sections plus `coverage` | key-set assertions |
| REST = MCP | One `run()` | byte equality for packs, the new view and traces |
| Determinism | Pure functions, stable sort, no clock or randomness | permutation test; repeated runs |

Two behaviors changed on purpose, both for correctness: the selection of citations in a pack whose budget is exceeded (now shared between sections), and matching of queries that contain function words.

## 4. Evidence authority

Unchanged. Production `main` is canon; remodeling `main` is a proposal workspace; the Statistics commit, the source commits and the live Studio deployment are three identities. Candidate anchors come from citations the build already verified against their pinned blobs (`verifyCreativeEvidence`). The composition adds no citation of its own.

## 5. Cost and limits

| Item | Bound |
|---|---|
| Candidates in a pack | 3 (`compact`), 5 (`standard`) |
| Candidates per page of the view | 10 |
| Omitted ids listed | 100 |
| Candidate size | about 7 KB |
| Pack size | about 50 KB compact, 100 KB standard on the current corpus; the 256 KB response limit is unchanged |
| Extra artifact reads | none: the pack already read `creative.json` whenever findings, opportunities or decision trees were requested |
| Composition | pairs of at most a few dozen points per request; no network, storage or model call |

## 6. Trade-offs

- **Templates, not prose.** Tensions, alternatives and tests are worded by fixed rules. They are precise about status and plain in style. Synthesis stays with the AI client and the creator.
- **Sparse evidence gives few candidates.** The corpus holds 36 verified relationships that are not mentions and 12 audit findings. Questions outside the densest area often get no candidate. That is reported, not padded.
- **Larger packs.** A default pack roughly doubles in size. A client that wants the earlier size passes an `include` list without `exploration_candidates`.
- **Overlap is a proxy.** Low overlap with a card shows the material is not on a card. It does not show the idea is good.
- **Curated cards stay curated.** The opportunity engine is unchanged; candidates are a second, compositional source beside it.
