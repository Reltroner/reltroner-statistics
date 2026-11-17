# RS-CREATIVE-QUALITY-003 — Evaluation & Before/After Evidence

- **Base `main` SHA:** `fc37812b6cad68cfb707fdcdd07d7a0e417825df`
- **Feature branch:** `feat/rs-creative-quality-003`
- **Pinned snapshot evaluated (`build-info.json`):**
  - `production_source_sha`: `ad895e6d9184f09281a7cc14ccd7867c47acd29e` (`Reltroner/reltroner-studio`)
  - `remodeling_source_sha`: `0c80fdb05f5f338241c58663b87a01aa0e1748b2` (`Reltroner/reltroner-studio-remodeling`)
  - `semantic_digest`: `a24ccb3c5e585950ec746fb8b3936d4e35a3d4f5982dcaddbd1171fcb134aec2` (`P0R-2.0.0`)
  - `studio_deployment_status`: `DEPLOYMENT_UNVERIFIED`
- **Draft PR #7 (`feat/rs-ai-api-002-cross-model-acceptance`):** Untouched (`headRefOid: 25d5ec8eb6e11e424d7d9ce8c9da3ab02f41951c`, open draft).

---

## 1. Provenance of the Prior 86/100 Assessment

In PR #7 (`RS-AI-API-002`), the `86/100` score evaluated **one single pasted response artifact** on the Reltronland–Depcutland institutional custody prompt (`G4`), not an independent multi-case or multi-provider benchmark:

- **What that review measured:** canon faithfulness (`23/25`), citation fidelity (`18/20`), novelty/differentiation (`14/20`), causal/dependency reasoning (`13/15`), actionability (`9/10`), and creator control/safety (`9/10`).
- **Why novelty scored `14/20`:** `build_research_context` returned only the 6 static curated cards from `src/engine/creative-intelligence/opportunity-engine.ts`; hypotheses `H1` and `H2` in the pasted response largely rephrased `OPP-80CA41A41CE2` and `OPP-99EE8CDACFF0`.
- **Why citation/ledger questions arose:**
  1. In `build_research_context`, `statistics` consumed the `max_evidence_items` budget first, leaving later sections (`relationships`, `consistency_findings`) referencing `evidence_id` values omitted from `evidence[]` without an omitted-ID list.
  2. `compact` (`perSection = 5`, up to `10` relationships) and `standard` (`perSection = 10`, up to `20` relationships) returned different relationship counts from the same snapshot without a `coverage` object explaining the per-section limit.
  3. Sub-IDs returned in responses (`NAF-…#1`, `OPP-…#1`, `fact:…@1010BAC`) were rejected by `trace_evidence` (`422 INVALID_INPUT`).
  4. A self-reported tool ledger inside model prose cannot be certified by a stateless server and must be treated as `MODEL_SELF_REPORT_ONLY` unless backed by the client's native tool-call log.

---

## 2. Six-Axis Independent Evaluation Rubric (100 Points) vs Deterministic Proxies

| Axis | Max | What an Independent Human/Blind Review Scores | Deterministic Proxy Measured by `scripts/evaluate-creative-quality.ts` |
|---|---:|---|---|
| 1. Canon & source faithfulness | 25 | Zero invented facts; open/contested perspectives attributed; `PROPOSED` kept distinct from production canon | `remodeling_evidence_marked_canon = 0`, `non_hypothesis_ideas = 0`, `withheld.proposed_points_excluded` |
| 2. Citation & provenance fidelity | 20 | Resolvable commit/path/line or JSON pointer; accurate retrieval-scope disclosure | `evidence_pinned_to_snapshot = 1.0`, `references_without_citation_and_undisclosed = 0`, `trace_round_trip = 1.0`, `scope_disclosed = true` |
| 3. Novelty & differentiation | 20 | Cross-mechanism synthesis beyond paraphrasing curated opportunity cards | `exploration_candidates`, `distinct_mechanism_pairs`, `candidate_anchors_not_on_any_returned_card`, `mean_max_card_overlap`, `candidates_restating_a_card = 0` |
| 4. Causal & dependency reasoning | 15 | Preconditions (`VERIFIED`/`DECLARED`) separated from `ASSUMED` bridge/choice and `UNKNOWN` consequence; 2+ distinct alternatives; disconfirmation tests | `candidates_with_two_independent_anchors`, `candidates_with_alternatives_2plus`, `candidates_with_disconfirmation`, `relations_marked_causal = 0`, `verified_steps_without_evidence = 0` |
| 5. Actionability | 10 | Specific creator decision (`next_step.decision`) and executable follow-up tool calls (`next_step.research`, `coverage.follow_up`) | Validated against `INPUTS` schemas in `creative-quality.test.ts` |
| 6. Creator control & safety | 10 | Explicit `HYPOTHETICAL_UNRATIFIED` status; declining is valid; zero writes; prompt injection stays quoted data | `status = HYPOTHETICAL_UNRATIFIED`, adversarial suite `A1`–`A3` |

> **Important distinction:** Deterministic proxies verify that the API/MCP payload supplies complete, non-paraphrased, traceable building blocks. They **do not** score a language model's prose answer and never claim a `95–100/100` human review score on behalf of an unrun external model client (`PROVIDER_CLIENT_NOT_RUN`).

---

## 3. Pinned Evaluation Cases (`tests/evaluation/creative-quality-cases.json`)

Six Asthortera worldbuilding tasks (2 runs each = 12 domain runs) plus 3 adversarial runs (15 runs total):

| Case ID | Split | Domain | Runs |
|---|---|---|---|
| `C1-custody` | `dev` | Reltronland–Depcutland institutional custody (RS-AI-API-002 G4 benchmark topic) | `C1a` (`standard`, budget 40), `C1b` (`compact`, default budget 20) |
| `C2-war-testimony` | `holdout` | War of Conscience timeline, first-strike claims & contested testimony | `C2a` (`standard`, budget 40), `C2b` (`compact`, focus `nar:conflict:reltronland-vs-depcutland`) |
| `C3-henchoway` | `dev` | Henchoway doctrine (*Adaptive Stillness*), independence & attribution boundaries | `C3a` (`standard`, budget 40), `C3b` (`compact`, focus `nar:faction:henchoway`) |
| `C4-neiput` | `holdout` | Neiput cross-border movement versus citizenship and jurisdiction | `C4a` (`standard`, budget 40), `C4b` (`compact`, focus `nar:location:neiput-border-trade-gateway`, `include_proposed`) |
| `C5-demography` | `dev` | Asthortera demography & civilizational statistics with explicit missing values | `C5a` (`standard`, Calespia/Ethaptoria/Krisberia), `C5b` (`compact`, focus `planet:asthortera`) |
| `C6-beluftner` | `holdout` | Beluftner–Cosmeilia conflict & production-vs-remodeling land area (`88` vs `363` million km²) | `C6a` (`standard`, `include_proposed`, budget 40), `C6b` (`compact`, focus `nar:nation:beluftner`) |
| `A-adversarial` | `adversarial` | Prompt-injection-shaped query (`A1`), unknown entity `Atlantis` (`A2`), mixed known + unknown focus (`A3`) | `A1`, `A2`, `A3` |

**Bias & holdout controls:**
1. `C2-war-testimony`, `C4-neiput`, and `C6-beluftner` were designated `holdout` before writing `src/domain/exploration.ts`; their candidate outputs were not inspected during algorithm development.
2. `src/domain/exploration.ts` is enforced by unit test (`creative-quality.test.ts:178`) to contain zero entity names (`Reltronland`, `Depcutland`, `Henchoway`, `Neiput`, `Beluftner`, `Asthortera`), zero card/finding IDs (`OPP-…`, `NAF-…`), and zero benchmark keywords (`custody`, `invasion`, `H1`, `H2`, `H3`).

---

## 4. Same-Snapshot Before vs After Measurements (15 Runs)

Both baseline (`BASE_MAIN_SHA` `fc37812b6cad68cfb707fdcdd07d7a0e417825df`) and upgraded candidate (`feat/rs-creative-quality-003`) were executed via `node scripts/evaluate-creative-quality.ts` against the exact same built artifact directory (`semantic_digest: a24ccb3c5e585950ec746fb8b3936d4e35a3d4f5982dcaddbd1171fcb134aec2`).

### 4A. Aggregate Totals Across All 15 Runs

| Metric | Baseline (`fc37812b`) | Upgraded (`feat/rs-creative-quality-003`) | Change |
|---|---:|---:|---|
| Total runs / deterministic runs | `15 / 15` | `15 / 15` | Preserved (`100%`) |
| Runs disclosing retrieval scope (`data.coverage`) | `0 / 15` | **`15 / 15`** | `+15` runs (`0%` → `100%`) |
| Dangling `evidence_id` references without citation in response | `493` | `169` | `-324` (`-65.7%` via fair round-robin budget + stopword filtering) |
| **Undisclosed** dangling `evidence_id` references | `493` | **`0`** | **`-493` (`100%` eliminated; every omitted ID is listed in `coverage.evidence.omitted_ids`)** |
| `trace_evidence` round-trip resolved / attempted | `320 / 364` (`87.9%`) | **`364 / 364` (`100.0%`)** | **`+44` resolved (`0` refused; `#` and `@` sub-IDs now resolve)** |
| `trace_evidence` refused with `422 INVALID_INPUT` | `44` | **`0`** | **`-44` (`100%` eliminated)** |
| Remodeling evidence mislabeled as canon | `0` | `0` | Preserved (`0`) |
| Relationships marked as causal claims (`is_causal_claim !== false`) | `0` | `0` | Preserved (`0`) |
| `VERIFIED` mechanism steps without cited `evidence_ids` | `0` | `0` | Preserved (`0`) |
| Idea items not labeled `HYPOTHESIS*` | `0` | `0` | Preserved (`0`) |
| Static opportunity cards returned | `23` | `20` | `-3` unrelated cards dropped by stopword fix (`"and"` no longer matches `*land`) |
| Compositional `exploration_candidates` returned | `0` | **`27`** | **`+27` structured candidates** |
| Candidates with `>= 2` independent source anchors | `0` | **`27 / 27` (`100%`)** | `+27` |
| Candidate anchors not on any returned opportunity card | `0` | **`40`** | `+40` non-card source anchors surfaced |
| Candidates restating an existing opportunity card | `0` | **`0`** | `0` restatements |

### 4B. Per-Run Breakdown (Baseline → Upgraded)

| Run | Split | Undisclosed Dangling Refs | `trace_evidence` Resolved / Attempted | Scope Disclosed | Opportunity Cards | Exploration Candidates (`>=2` Anchors) | Mean Max Card Overlap |
|---|---|---:|---:|---|---:|---:|---:|
| `C1a` | `dev` | `53` → **`0`** | `40/40` → **`46/46`** | `false` → **`true`** | `2` → `2` | `0` → **`5` (`5`)** | `0.368` |
| `C1b` | `dev` | `8` → **`0`** | `20/20` → **`27/27`** | `false` → **`true`** | `1` → `1` | `0` → **`3` (`3`)** | `0.292` |
| `C2a` | `holdout` | `49` → **`0`** | `40/40` → **`39/39`** | `false` → **`true`** | `1` → `1` | `0` → **`2` (`2`)** | `0.375` |
| `C2b` | `holdout` | `11` → **`0`** | `20/20` → **`27/27`** | `false` → **`true`** | `1` → `1` | `0` → **`3` (`3`)** | `0.292` |
| `C3a` | `dev` | `0` → **`0`** | `20/31` (`11` refused) → **`31/31`** | `false` → **`true`** | `4` → `4` | `0` → **`5` (`5`)** | `0.427` |
| `C3b` | `dev` | `25` → **`0`** | `20/20` → **`21/21`** | `false` → **`true`** | `4` → `4` | `0` → **`3` (`3`)** | `0.322` |
| `C4a` | `holdout` | `74` → **`0`** | `40/40` → **`11/11`** | `false` → **`true`** | `2` → `1` | `0` → **`0` (`0`)** | `null` (honest sparse report) |
| `C4b` | `holdout` | `0` → **`0`** | `0/13` (`13` refused) → **`9/9`** | `false` → **`true`** | `1` → `1` | `0` → **`0` (`0`)** | `null` (honest sparse report) |
| `C5a` | `dev` | `127` → **`0`** | `20/20` → **`21/21`** | `false` → **`true`** | `2` → `1` | `0` → **`0` (`0`)** | `null` (honest sparse report) |
| `C5b` | `dev` | `10` → **`0`** | `20/20` → **`21/21`** | `false` → **`true`** | `0` → `0` | `0` → **`0` (`0`)** | `null` (honest sparse report) |
| `C6a` | `holdout` | `95` → **`0`** | `40/40` → **`41/41`** | `false` → **`true`** | `2` → `0` | `0` → **`0` (`0`)** | `null` (honest sparse report) |
| `C6b` | `holdout` | `9` → **`0`** | `0/20` (`20` refused) → **`20/20`** | `false` → **`true`** | `1` → `1` | `0` → **`0` (`0`)** | `null` (`1` proposed point excluded) |
| `A1` | `adversarial` | `15` → **`0`** | `20/20` → **`25/25`** | `false` → **`true`** | `0` → `1` | `0` → **`3` (`3`)** | `0.258` (no canon ratification) |
| `A2` | `adversarial` | `0` → **`0`** | `0/0` → **`0/0`** | `false` → **`true`** | `0` → `0` | `0` → **`0` (`0`)** | `null` (`404 NOT_FOUND`) |
| `A3` | `adversarial` | `17` → **`0`** | `20/20` → **`25/25`** | `false` → **`true`** | `2` → `2` | `0` → **`3` (`3`)** | `0.292` (Atlantis reported missing) |

---

## 5. Honest Sparse-Corpus Findings (Holdouts `C4` and `C6`, Dev `C5`)

Why did `C4a`, `C4b`, `C5a`, `C5b`, `C6a`, and `C6b` return `0` compositional `exploration_candidates` while `C1`, `C2`, and `C3` returned `2`–`5` each?

- **Holdout `C4-neiput` (`nar:location:neiput-border-trade-gateway`):** The current corpus holds one audit finding (`NAF-…`, `REVIEW_BOUNDARY`) on Neiput and co-occurrence links, but no second non-mention relationship or statistical point of a different mechanism sharing the entity. Rather than inventing a second point or promoting a co-occurrence link, `composeExplorations` returns `returned: 0`, sets `insufficient` explaining why no pairing is supported, and surfaces the single verified point in `unpaired_points` as a lead.
- **Dev `C5-demography` (`Calespia`, `Ethaptoria`, `Krisberia`, `Asthortera`):** The query hits statistical entities and `DECLARED_UNKNOWN` gaps (`unknown, not zero`), without a second narrative mechanism on the same entity ID. In `C5a`, eliminating the `"and"` stopword bug dropped `74` false-positive `*land` citations.
- **Holdout `C6-beluftner` (`nar:nation:beluftner`):** In `C6b` (`production_only`), Beluftner has one `OPEN_CONFLICT` point (with Cosmeilia) and one remodeling-only `PROPOSAL_DIVERGENCE` point (excluded under `production_only`, reported in `withheld.proposed_points_excluded = 1`). When `discover_opportunities` is called with `view=explorations&entity=nar:nation:beluftner&include_proposed=true`, that pairing is surfaced with `DECLARED` status. In `C6a`, Beluftner's statistical asymmetry with other `*land` nations is no longer spuriously pulled in because `"and"` is filtered as a function word; only Beluftner is in statistical scope (`1` nation), so no two-nation `QUANTITATIVE_ASYMMETRY` point is formed unless a second nation is named.

This behavior satisfies the P2 requirement: *"If the evidence cannot sustain three strong, distinct hypotheses, return fewer justified proposals or clear insufficient evidence, not low-quality filler to satisfy a count."*

---

## 6. External Model Client Status

- **Live hosted ChatGPT / Claude / Gemini UI connectors:** `PROVIDER_CLIENT_NOT_RUN` (no signed-in external LLM account is used or simulated inside this repository).
- **Real MCP SDK & Cloudflare `workerd` protocol verification:** Executed and passed via `npm run verify:runtime` (`scripts/verify-pages-runtime.ts`) and `tests/unit/creative-quality.test.ts` using `@modelcontextprotocol/client@2.4.0` (`StreamableHTTPClientTransport`).
