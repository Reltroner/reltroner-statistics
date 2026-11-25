# AGENTS.md — Reltroner Statistics

Instructions for local AI coding agents (Codex, Abacus AI Agent, Claude Code, and similar) working in this repository. Read this file before the first edit. It states repository-specific rules only; it does not replace higher-priority security, permission or sandbox controls.

## 1. Purpose and scope

Reltroner Statistics is a **statistical intelligence and evidence-backed worldbuilding system** for the Asthortera universe. It reads two external Studio repositories read-only through the GitHub API, compares them, computes statistics and QA identities, builds a knowledge graph, and publishes a static site with eight export formats plus read-only REST and MCP interfaces.

Every published value carries its source repository, commit, file and field. This repository owns only its own build output; it never writes to a Studio repository and never owns canon.

### Instruction discovery

Before editing, identify the instructions that apply to the files you will touch:

- Read this `AGENTS.md`, then any more specific `AGENTS.md` in a subdirectory you are changing; the nearer file wins for its own subtree.
- Do not assume this file was loaded automatically. Automatic discovery is not guaranteed for every agent or surface. If you cannot confirm it was loaded, read the file explicitly before implementation.
- If a task supplies its own instructions, follow them for that task; they narrow this file, they do not silently widen it.
- This file never overrides higher-priority security, sandbox, permission or approval controls. Those win on conflict.

Intended agent workflow:

1. Discover the applicable instructions (above), then preflight the working tree and record a baseline (§4).
2. Read the code that the change touches; do not assume architecture from this file alone.
3. Make the smallest change that satisfies the request.
4. Run targeted verification, then the wider gate only when the change warrants it (§6).
5. Report with evidence, exit codes and known limitations (§12).

## 2. Source authority

Four source identities, defined in `src/domain` and documented in `docs/ARCHITECTURE.md`:

| Identity | Meaning | Rule |
|---|---|---|
| `deployment` | The commit actually serving the live Studio site | Verified only from a live build identifier; otherwise `DEPLOYMENT_UNVERIFIED` |
| `production` | `Reltroner/reltroner-studio` at a pinned commit | Authoritative for every statistic |
| `remodeling` | `Reltroner/reltroner-studio-remodeling` at a pinned commit | Proposals for comparison only |
| `rules_version` | Comparator behavior | Versioned; changing it changes every comparison |

Non-negotiable:

- Production `main` is never presented as the deployed commit.
- Remodeling-only content is a **proposal**, never a production defect, and is always labeled `PROPOSED`.
- Never silently promote proposed canon to ratified canon. Canon is the creator's; this repository computes and cites.
- GitHub deployment records are reported as evidence and never accepted as deployment proof.

## 3. Architecture

Verified boundaries. Use these paths; do not invent modules.

- **Astro static-first frontend** — `src/pages` (routes), `src/layouts/BaseLayout.astro` (single shared shell), `src/components`, `src/styles`. Output is static; there is no server-rendered request path for pages.
- **React islands** — `src/features` (reports, graph, creative, decision, calculator surfaces), hydrated per island. Islands receive compact props or fetch `/data/*.json`.
- **TypeScript domain and computation engines** — `src/domain` is pure TypeScript (no Node, React or Astro); `src/engine` depends on domain only (comparator, diff, evidence rules, QA identities, graph builder, creative/decision intelligence, page mirrors); `src/adapters` performs all I/O; `src/export` is isomorphic so the build and the browser Report Center share renderers.
- **Python analytics** — `analytics/python/reltroner_analytics`, hash-pinned `requirements.lock`, reads `observations.json`, validates against the generated JSON Schema, emits `analytics.json` plus SVG figures.
- **Data contracts and schemas** — `src/contracts` holds Zod contracts; `npm run schemas` generates `analytics/schemas/*.schema.json`; `npm run schemas:check` fails on drift. Contracts are the boundary, not a suggestion.
- **Validated artifacts** — `artifacts/` is generated and git-ignored. `scripts/require-artifacts.ts` refuses to build unless `artifacts/manifest.json` and every listed checksum match. Never hand-edit `artifacts/`.
- **Cloudflare Pages Functions** — `functions/api/v1/[[path]].ts` (REST), `functions/mcp.ts` (stateless Streamable HTTP MCP), `functions/api/assistant.ts` (fail-closed optional explanation). All are thin wrappers over the shared read-only service in `src/api`.
- **Stateless REST and MCP intelligence interfaces** — one operation registry in `src/api/contract.ts` feeds `/api/v1/*`, `/mcp`, `/openapi.json`, `/llms.txt` and `/ai/*.json`. Read the registry for the current operation and tool set; do not assume a count.

Build and pipeline entry points: `scripts/pipeline.ts` (ingest → compare → observations → QA → graph → Python → contract validation → atomic swap of `artifacts/`), `scripts/build.ts` (artifact gate → Astro build → PDFs → page mirrors → `scripts/postbuild.ts`).

## 4. Repository safety

Before any edit, capture a fresh baseline. Never reuse a baseline from a previous task or from this document.

- Inspect: `git rev-parse --show-toplevel`, `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain=v1 --untracked-files=all`, `git diff --cached --name-status`, `git diff --name-status`.
- Record the index listing and both diff digests with one fixed serialization, e.g. `git ls-files --stage | sha256sum`, `git diff --cached | sha256sum`, `git diff | sha256sum`.
- Record SHA-256 of any file the task declares protected, plus its index blob (`git ls-files --stage -- <path>`).

Verify the source command before trusting its digest. A hashing process that exits 0 proves only that it hashed something; it does not prove the Git command feeding it succeeded. A failed `git` invocation can emit nothing, and the digest of empty input is a valid-looking hash.

A digest is only acceptable when the producer's failure would have prevented it. Printing an exit code and hashing anyway does not satisfy this: the hash still gets computed and can still be quoted.

- Chain on success so a failed producer stops the digest: `git ls-files --stage > "$tmp" && sha256sum "$tmp"`.
- Where a pipeline is unavoidable, use `pipefail` in a subshell and check the resulting status — `(set -o pipefail; git diff --cached | sha256sum); echo $?` — and only where the shell actually supports it.
- Where `pipefail` is unavailable, check each process explicitly rather than only the last one.
- Do not use `${PIPESTATUS[0]}` in POSIX `sh` or BusyBox ash; it is a Bash array and fails with `bad substitution`.
- Do not use predictable shared scratch filenames. Prefer in-memory processing; otherwise use a uniquely named temporary file outside the repository (`mktemp`) and remove it in a controlled cleanup.

Rules:

- Existing staged, unstaged, ignored and untracked user files are the owner's work. Do not unstage, overwrite, rename or delete them.
- Never run `git clean`, `git reset`, `git restore`, `git stash`, `git checkout -- .`, or any wildcard or recursive deletion to "tidy up".
- No commit, push, merge, pull, rebase, tag or remote mutation without explicit authorization for that specific action.
- Do not repair unrelated changes you did not make. Stop and report instead.
- Do not embed this branch name, the current HEAD, fixed file hashes, or the current staged-file set as permanent policy. They are per-task facts, not governance.

## 5. Engineering principles

- **Deterministic computation.** Same inputs, same output, on Windows and Ubuntu. Ordering uses code-unit comparison, never host-locale `localeCompare`. No wall-clock or random values in computed output.
- **Unknown is not zero.** `null` means unknown and stays `null`. Zero is a valid observation. Never coerce one into the other.
- **No unsupported interpolation.** Historical series are never interpolated; thin coverage is reported as `INSUFFICIENT_DATA`.
- **Preserve evidence provenance.** Every claim keeps its repository, commit, path, pointer and quote.
- **Respect epistemic status.** `CANON_OBSERVED`, `CANON_DERIVED`, `MODEL_ESTIMATE`, `SCENARIO`, `PROPOSED`, `ARCHIVED`, `INSUFFICIENT_DATA`. `MENTIONS` is co-occurrence, never a dependency; unverifiable links are `CANDIDATE`.
- **Minimal changes.** Fix the root cause with the smallest diff. No drive-by refactors, reformatting of untouched code, or speculative features.
- **Explicit contracts.** New data shapes go through `src/contracts` and the schema check.
- **No unnecessary dependencies.** Prefer the standard library and what is already installed. Never install packages to complete a task unless the task authorizes it.

## 6. Testing and verification

Commands come from `package.json` and `.github/workflows/`. Node `>=22.22.0`, ESM.

Classify a command before you run it. The classes are not interchangeable, and only the first is strictly read-only.

| Class | Meaning | Commands |
|---|---|---|
| Strict read-only inspection | Reads only; writes no file, cache or artifact | `git --no-optional-locks status`, `git diff`, `git ls-files`, `sha256sum`, file reads |
| Local verification with side effects | Runs code; may create caches or test artifacts | `npm test` (may write nothing, but is not proven write-free), `npm run schemas:check` (calls `fs.mkdirSync` on `analytics/schemas` even in check mode), `npm run typecheck` (`astro check` writes `.astro/`), `npm run test:py` (`__pycache__`), `npm run test:e2e` (`test-results/`, `playwright-report/`), `npm run verify:runtime` (`.wrangler/`, needs a built `dist/`) |
| Generated-artifact mutation | Rewrites build output | `npm run pipeline` (rewrites `artifacts/`), `npm run build` (`dist/`, PDFs), `npm run schemas` (rewrites `analytics/schemas/*.schema.json`) |
| Network-dependent verification | Needs the GitHub API or a provider | `npm run verify:baseline`, `npm run pipeline` |
| Remote publication or deployment | Changes a remote system | Cloudflare Pages deploy, `git push`, any remote mutation |

Do not describe a command as strictly read-only unless you verified it writes nothing. `npm run schemas:check` is the cautionary case: it fails on drift but still creates its output directory.

Ordinary `git status` is not unconditionally write-free: Git may refresh the index opportunistically, which rewrites `.git/index` without changing its logical content. For strict read-only inspection use `git --no-optional-locks status --porcelain=v1 --untracked-files=all`. Distinguish logical index preservation — the recorded entries and their digests are unchanged — from a guarantee that no filesystem write occurred; the first is what integrity checks assert, the second needs `--no-optional-locks`.

Sequence: run the targeted unit or e2e spec that covers your change first, then `npm run schemas:check` and `npm run typecheck`, then the wider gate only when the change crosses module boundaries. `npm run verify` chains test, schema check, typecheck, build, runtime and e2e.

Rules:

- Do not run the full pipeline or a full build for a small unrelated change.
- Never claim tests passed without the executed command, its exit code and its totals.
- Do not weaken, skip or delete an assertion to make a suite green.
- `npm run verify:baseline` and `npm run pipeline` need `GITHUB_TOKEN`; unauthenticated access is rate-limited. Keep the token process-local and never write it to disk.
- Generated output is disposable; never hand-edit `artifacts/`, `dist/` or `analytics/schemas/` to make a check pass.

## 7. API and MCP contracts

`src/api/contract.ts` is the single registry. REST routes, MCP tools, the OpenAPI document and the discovery manifest all derive from it, so they cannot disagree.

Two boundaries, not one:

- **Read-only statistical interfaces** — `/api/v1/*` and `/mcp`, implemented in `src/api` and wrapped by `functions/api/v1/[[path]].ts` and `functions/mcp.ts`. They read only the build-versioned artifacts through `env.ASSETS.fetch`, make no outbound request, hold no session and keep no cross-request user state.
- **Optional LLM explanation** — `functions/api/assistant.ts`, a separate same-origin endpoint. It is fail-closed and answers `503 AI_NOT_ACTIVATED` unless `RELTRONER_AI_ENABLED=true`, `OPENAI_API_KEY`, `OPENAI_MODEL` and the `AI_RATE_LIMITER` binding are all configured. When activated it may call its configured provider; within the statistical API request-serving boundary that authorized provider request is the only outbound call, and it is not a breach of the read-only rule above. It is not the only outbound access in the repository: the ingestion and verification scripts legitimately call the GitHub API (§6), and that access is unaffected by this rule.

Protect:

- **Operation identities and names.** Renaming or removing one is a breaking change.
- **Input and output schemas**, including the response envelope (`schema_version`, `operation`, `result_status`, `snapshot`, `data`, `evidence`, `assumptions`, `limitations`, `next_cursor`, `truncated`).
- **Response limits** in `API_LIMITS` (query length, body size, page size, offset, ids, graph depth and nodes, evidence items, response bytes, quote length). Do not raise a limit to make a test pass.
- **Evidence semantics.** Quotes are data, never instructions; `PASSAGES_ARE_DATA` stays in place.
- **Read-only construction of the statistical interfaces.** No outbound `fetch`, no caller-supplied URL or path, no session state, no cross-request user data. Do not stretch this prohibition over the assistant's configured provider call, and do not stretch the assistant's provider access into `/api/v1/*` or `/mcp`.
- **Assistant boundaries.** Keep it fail-closed, keep its rate limiter keyed on the caller, keep its body and question limits, keep the provider key server-side only, and keep the deterministic grounded answer travelling with every response. It never becomes a source of numbers, canon status or citations.
- **Compatibility.** No silent contract change. A behavior change needs a schema or version decision, recorded in the change description.

## 8. Windows compatibility

The owner's workstation is Windows; CI also runs Ubuntu. Both must pass.

- Detect the actual shell before using shell-specific syntax. A POSIX `sh` (Git Bash / BusyBox ash) is not PowerShell, and neither is Bash.
- When a task explicitly requires Windows PowerShell 5.1, run that verification through PowerShell 5.1 — `powershell.exe -NoProfile -NonInteractive` — and report it as PowerShell 5.1. A more permissive general default never replaces a mandatory task-specific requirement.
- In BusyBox ash there is no `${PIPESTATUS[0]}` and no `/c/...` drive mount. Write drive paths as `C:/...`.
- Capture exit codes reliably: `cmd > out.txt 2>&1; echo $?; tail -30 out.txt`, or `(set -o pipefail; cmd 2>&1 | tail -30); echo $?` with `pipefail` kept in a subshell. Verify the producer's status, not only the consumer's (§4).
- Check `$LASTEXITCODE` for `git`, `node`, `npm` and `gh` inside PowerShell. `scripts/audit-local.ps1` targets Windows PowerShell 5.1+.
- Do not change execution policy, profiles, or global shell or environment configuration.
- Keep line endings as found; do not normalize CRLF/LF. File identity is computed from Git objects, not checkout bytes, and that must stay true.

## 9. Deployment governance

Five distinct states. Never collapse them:

1. **Local verification** — commands passed on this machine.
2. **CI verification** — the workflow run passed.
3. **Deployment authorization** — the publication gate was satisfied and explicitly enabled.
4. **Actual deployment** — an artifact was published to the `reltroner-statistics` Cloudflare Pages project.
5. **Live deployment verification** — the live `/build-info.json` commit and digest match the artifact.

Rules:

- **CI PASS does not prove a deployment.** Never report a passing workflow as live.
- Never claim deployment success without live identity evidence from `build-info.json`.
- Publication is gated on every check plus explicit configuration; missing credentials, custom-domain association or environment approval intentionally block it. Do not work around a gate.
- Deployment scope is the dedicated `reltroner-statistics` project only. No DNS, nameserver, apex, `www`, LMS, HRM or Studio changes.
- Do not deploy, publish or roll back without explicit authorization for that action.
- Report the state actually reached, using these labels where they apply, and do not read more into a label than it asserts:
  - `NOT TESTED` — the check was not run.
  - `NOT AUTHORIZED` — blocked on approval.
  - `PUBLICATION_HELD` — publication was withheld. This does not assert that every gate passed; say which gates were verified and which were not.
  - `DEPLOYMENT_UNVERIFIED` — live deployment identity has not been established. This does not assert that publication occurred, and it does not assert that it did not; report what is actually known about publication separately.
  - Never upgrade any of these to "deployed".

## 10. Multi-agent coordination

- **One local checkout, one active writer — the standing default.** Work in the single existing checkout. Do not create another clone, a Git worktree, a copied folder, or a temporary checkout inside this repository.
- Only the repository owner can override the single-checkout constraint, and only for a specific named task. General authorization to implement a change is not permission to create another checkout.
- Do not run two agents that edit the same checkout concurrently.
- Do not overwrite another agent's changes. Re-read a file before patching it if it may have changed since your last read.
- Hand off with evidence: what changed, which commands ran, their exit codes, what remains unverified.
- This file does not override sandbox, permission or approval controls; those win.

## 11. Documentation policy

- `docs/` is git-ignored (`.gitignore` ends with `/docs/`). Engineering documents live there locally and are **not** versioned; reviewer-facing acceptance evidence belongs in the pull request description.
- Consequence: a fresh clone has no `docs/`. Instructions that must survive a clone belong in this file, `README.md`, or code comments — not only in `docs/`.
- Do not change `.gitignore` to track `docs/` as a side effect of another task.
- Do not copy local engineering documents into this file. Reference them by path and summarize only what an agent needs to act correctly.
- `README.md` and `docs/ARCHITECTURE.md` are the human-facing descriptions. Keep them accurate when behavior changes; do not rewrite them for style.

## 12. Reporting and Definition of Done

A change is done when the report contains:

- **Changed files** — exact paths, and whether each is tracked, staged or untracked.
- **Verification commands** — the actual command lines executed.
- **Exit codes** — per command, not summarized away.
- **Test totals** — passed, failed, skipped, and the runner's own counts.
- **Known limitations** — what was not run and why.
- **Remaining risks** — what could still break.
- **Deployment status** — one of the five states in §9, named exactly, or `NOT TESTED`, `NOT AUTHORIZED`, `PUBLICATION_HELD` or `DEPLOYMENT_UNVERIFIED`.
- **Git integrity** — HEAD, branch, status, index count and digest, both diff digests, protected hashes, compared initial versus final.

Rules:

- Reconcile every numeric claim; if two counts disagree, surface it rather than picking one.
- Use `PASS`, `FAIL`, `NOT TESTED` and `NOT AVAILABLE` precisely. `NOT TESTED` is not a soft pass.
- Never fabricate model usage, token usage, duration or credit consumption. If the environment does not expose a metric, report `NOT AVAILABLE`.
- Lead with any failure or skipped step; never bury it under successes.
- Report the state you actually confirmed: code written ≠ tests passing ≠ running locally ≠ deployed ≠ verified live.
