# RS-REPORT-UI-COLLISION-006 — Report Center collision: acceptance

The Report Center form at `/reports/?id=OPP-0296F531F526` ran under its own "Export plan" panel. The cause was measured, a five-class change in one component fixes it, and a new browser test that measures element rectangles and hit-tests control centres fails on the old code and passes on the new.

This is a draft change for owner review. It is not merged and not deployed.

## 1. Evidence and baseline

| Item | Value |
|---|---|
| Owner report | Desktop Chrome screenshot, 2026-11-18, of `https://statistics.reltroner.com/reports/?id=OPP-0296F531F526`, scrolled to "1 · What to export". The Export plan card covers part of the third scope option ("All … findings") and the area near "Report family"; the panel's provenance note mixes with the search row; Download is disabled. The image itself was not available to the agent; this text description was used, and the reproduction below matches it. |
| Base | `main` `ed3abce95fd5c6f4371bd5e957ff7aa4d680909c` = local `main` = `ls-remote` = GitHub API = published `build-info.json`, checked before the branch was created. |
| Data used locally | `npm run pipeline` on 2026-11-18: production `d1625b2872ec…`, remodeling `6dd3491b59fb…`; 574 findings (515 drift, 33 creative, 26 decision). `OPP-0296F531F526` is published in this build. |
| Browser | Microsoft Edge 157 (Chromium) on Windows 11 through Playwright 1.65; device pixel ratio 1. CI runs Playwright Chromium on Linux. |
| Disabled Download | Expected: no format is chosen yet. Not part of the defect and not changed. |

## 2. Reproduction

1. `npm run build`, then serve `dist/` with its production headers (`node scripts/serve.ts`).
2. Open `/reports/?id=OPP-0296F531F526` at 1688 × 864 and wait until the "One finding" option is checked. The page is a client-only React island; the query selects the finding during hydration.
3. Scroll until "1 · What to export" sits just below the sticky site header.

Result on `main`: the Export plan card (x 1112–1464) paints over the form, whose first fieldset spans x 224–1261.5. The page has **no horizontal overflow** at this width, which is why the existing overflow sweep never saw it.

## 3. Root cause (measured)

Measured with `getBoundingClientRect` and `getComputedStyle` at 1688 × 864, dark theme, after hydration.

| Element | Computed value on `main` |
|---|---|
| Outer Report Center grid | `grid-template-columns: 856px 352px` (from `lg:grid-cols-[minmax(0,1fr)_22rem]`; the utility layer overrides the global `.grid` rule in the components layer) |
| Form column (grid item) | width 856 px, `min-width: auto`; its track minimum is 0, so it stays 856 px |
| First fieldset | `min-inline-size: min-content` (the browser's default for fieldsets; no author rule overrides it), **width 1037.52 px** |
| Findings list inside it | width 1037.52 px; its longest title row is 987 px of unbreakable text (`truncate` sets `white-space: nowrap`) |
| Panel (`aside`) | `position: sticky; top: 96px`, `z-index: auto`, x 1112–1464 |
| Site header | height 65 px, sticky |

The chain:

1. **Intrinsic width.** A fieldset is never narrower than its min-content width unless an author rule says otherwise. The findings list holds one-line titles, so the fieldset becomes as wide as the longest title row: 1037.52 px in an 856 px track.
2. **Escape.** The fieldset overflows its track by 181.5 px, into the 32 px gap and 149.5 px into the panel's column.
3. **Paint order.** The sticky panel is a positioned box, so it paints above in-flow content. Its card covers the right 149.5 px of the form: the end of the "All 515 findings" option, the preset rows and the end of the list. The provenance note has no background, so its text mixes with the search row. No `z-index` is involved; the defect is geometry.
4. **Why only with `?id=`.** The list exists only when the scope is not "all". `?id=`, `?family=` and `?selection=` set another scope; plain `/reports/` opens with scope "all", so the existing sweep, which loads `/reports/` only, never rendered the list.
5. **Why the width does not change with the viewport.** The min-content width (1037.52 px) is fixed by the data, so the overlap grows as the track shrinks: 149.5 px at ≥ 1280 px, 304.5 px at 1125 px, 352 px (the whole card) at 1024 px. Below 1024 px the layout stacks, and the same fieldset makes the whole page overflow by 290–732 px.

Two smaller causes appeared once the first was fixed, both only with enlarged text:

- **Search box minimum.** The "Find findings" label had a fixed 14rem minimum width. At 150 % text that is 336 px, wider than a 333 px phone column (375 px screen); at 320 px it would be 58 px too wide.
- **Scope option columns.** Three fixed columns give each option about 124 px in the 388 px form column at 1024 px with 150 % text. The word "Selected" then crosses its own card border by 3.1 px (text to x 287.8, border at x 284.7).

## 4. Change

One file, `src/features/reports/ReportCenter.tsx`; five class changes and one comment:

| Where | Before | After | Why |
|---|---|---|---|
| The three fieldsets | no class | `min-w-0` | Overrides the fieldset default so each stays inside its `minmax(0, 1fr)` track. Long titles now end in the ellipsis the `truncate` class always intended. All three get it because the rule is the same for each; only the first was observed to overflow. |
| "Find findings" label | fixed 14rem minimum | `min-w-[min(14rem,100%)]` | Same 14rem minimum wherever the row is wider; never wider than the row. |
| "Report family" label | fixed 11rem minimum | `min-w-[min(11rem,100%)]` | Same rule as the search box. **Preventive:** it did not overflow anywhere in the tested matrix. |
| Scope option row | three fixed columns from 640 px (`sm:grid-cols-3`) | `sm:grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))]` | Three columns whenever each can be at least 9rem wide, otherwise fewer. At 100 % text this is the same layout at every tested width: one row of three from 640 px (checked by the new test), one per row below. 9rem scales with the text, so the options wrap instead of squeezing. |

Rejected alternatives:

- **`z-index` on the form:** the form would paint over the panel instead; the two would still overlap.
- **Hiding overflow:** cuts content without making room for it.
- **Absolute positioning or negative margins:** fragile; they move the symptom.
- **A global fieldset or `.grid` reset:** 12 other fieldsets in 8 components would change without evidence.
- **Moving the sticky breakpoint or capping the panel height:** not needed. The panel is 268 px tall (335 px at 125 % text, 402 px at 150 %), and the room below the sticky offset is at least 480 px in every tested two-column viewport.
- **Wrapping titles instead of truncating them:** this would change the list's designed density. The full title stays in the accessible name and on the finding's own page.

## 5. Before and after geometry

Scrolled to "1 · What to export" just below the header, dark theme; light theme gives identical geometry.

| Viewport, text | Layout | Form track | Fieldset 1 before → after | Card overlap before → after | Page overflow before → after | Control centres under the panel, before → after |
|---|---|---:|---:|---:|---:|---|
| 1688×864, 100 % (owner) | two columns | 856 px | 1037.52 → 856 px | 149.5 → 0 px | 0 → 0 px | none → none (the overlap covers the option's right edge, not its centre) |
| 1920×1080, 100 % | two columns | 856 px | 1037.52 → 856 px | 149.5 → 0 px | 0 → 0 px | none → none |
| 1440×900, 100 % | two columns | 856 px | 1037.52 → 856 px | 149.5 → 0 px | 0 → 0 px | none → none |
| 1280×800, 100 % | two columns | 856 px | 1037.52 → 856 px | 149.5 → 0 px | 0 → 0 px | none → none |
| 1350×691 (owner width at 125 % browser zoom) | two columns | 856 px | 1037.52 → 856 px | 149.5 → 0 px | 0 → 0 px | none → none |
| 1125×576 (owner width at 150 % browser zoom) | two columns | 701 px | 1037.52 → 701 px | 304.5 → 0 px | 0 → 0 px | "All" option, family selector → none |
| 1024×768, 100 % | two columns | 600 px | 1037.52 → 600 px | 352.0 → 0 px | 34 → 0 px | "All" option, family selector → none |
| 1688×864, 125 % text | two columns | 760 px | 1293.16 → 760 px | 440.0 → 0 px | 0 → 0 px | "All" option, family selector → none |
| 1688×864, 150 % text | two columns | 664 px | 1548.78 → 664 px | 528.0 → 0 px | 85 → 0 px | family selector → none |
| 1024×768, 125 % text | two columns | 494 px | 1293.16 → 494 px | 440.0 → 0 px | 294 → 0 px | none → none |
| 1024×768, 150 % text | two columns | 388 px | 1548.78 → 388 px | 528.0 → 0 px | 555 → 0 px | search box → none |
| 768×1024, 100 % | stacked | 728 px | 1037.52 → 728 px | — | 290 → 0 px | — |
| 390×844, 100 % | stacked | 362 px | 1037.52 → 362 px | — | 662 → 0 px | — |
| 375×812, 100 % | stacked | 347 px | 1037.52 → 347 px | — | 677 → 0 px | — |
| 375×812, 150 % text | stacked | 333 px | 1548.78 → 333 px | — | 1195 → 12 px (site header, see §9) | — |
| 320×700, 100 % | stacked | 292 px | 1037.52 → 292 px | — | 732 → 0 px | — |

Keyboard check at 1024 × 768 on `main`: Tab moves focus to the presets "Case Evaluations (DTE)", "Statistical Trees (DTS)", "Opportunities (OPP)" and "Seed Proposals (PRP)" while they sit under the panel, so the focused control cannot be seen. After the change, every focused control is its own topmost element.

In the full diagnostic sweep (38 states: 11 viewports × 2 themes, plus 125 % and 150 % text at four widths, at 5 scroll positions each, 190 measurements), the Report Center has no element outside its track, no overlap with the panel, no control centre under the panel and no console error. The only remaining page overflow is the shared site header on phone widths with enlarged text (§9).

## 6. Sticky panel

| | Result after the change |
|---|---|
| Two columns (≥ 1024 px) | `position: sticky; top: 96px` (6rem); it stops below the 65 px header. The panel is 268 / 335 / 402 px tall at 100 / 125 / 150 % text, and fits in the room below the offset at every tested height (smallest: 480 px at 1125 × 576). |
| Stacked (< 1024 px) | `position: static`; the panel follows the form in normal flow. |
| Scroll positions tested | top of page (not yet stuck), "What to export" under the header, "Report family" under the header, 60 % down the grid (stuck), end of the grid (released). At the last one the end of the panel is on screen. |
| Growth | The download outcome block and the plan error message make the card taller; the state tests repeat every check after each. |

## 7. Tests

New file `tests/e2e/report-center-collision.spec.ts`, 11 tests; the `@responsive` one also runs in the laptop, tablet and mobile projects, so 14 runs in total. At each scroll position it measures rectangles and checks four things:

- No form element (fieldsets, options, presets, search box, selector, buttons, list) leaves the form track, and no panel element leaves the panel track. When stacked, both must stay within the container.
- No form element overlaps the card, the provenance note, the Download button or the outcome and alert blocks (tolerance 1 px).
- `document.elementFromPoint` at the centre of the "All … findings" option, its radio, the family selector, the search box and Download returns the control itself. Controls under the header or off screen are skipped, but at the owner's two scroll positions they are required to be tested.
- Text inside each option and button stays within that control's border. The page has no horizontal overflow.

Failure messages list coordinates. Coverage:

| Test | Covers |
|---|---|
| Owner reproduction | 1688 × 864, both themes, five scroll positions, screenshot attached |
| `@responsive` | project viewports 1440, 1024, 768 and the 375 px iPhone profile (touch, mobile viewport) |
| Two-column sweep | 1920, 1440, 1280, 1350, 1125, 1024 px, both themes; also checks the scope options keep one row |
| Stacked sweep | 1023 (just below the breakpoint), 768, 390, 375, 320 px, both themes |
| Text and fonts | 125 % and 150 % text, wide fallback fonts (Verdana, as CI's Linux fonts are wider), reduced motion, at 1688, 1024, 375 and 320 px |
| Query hydration | `?id=OPP-0296F531F526` selects that finding (plan file `OPP-0296F531F526.json` after choosing JSON); an id the build does not publish leaves the default "all" view |
| State changes, at 1024, 1688 and 390 px | single and selected scopes; the longest published title shown and picked; one format (direct file, downloaded); three formats with PDF; OPP preset; search; family selector; select all shown; consolidated and per-finding layouts; clear (plan error shown); a real ZIP download with its outcome; scope "all" |
| Accessibility and keyboard (both themes) | axe WCAG 2.1 A/AA with no serious or critical issue; the fieldset group, the search box and the selector have accessible names; Tab through the radios, the 12 presets, the search box and the selector shows a focus ring on each, and nothing covers it |

Proof that the tests detect the defect, same final spec file, local Edge:

| Build | Result |
|---|---|
| `main`'s component (rebuilt from `HEAD`) | **13 failed, 1 passed**. The pass is query hydration, which does not depend on layout. |
| This change | **14 passed** |

## 8. Unchanged behaviour and size

- **Export contract:** `src/export/*` and `src/features/reports/download.ts` are untouched. Eight formats; direct file for one finding in one format; ZIP with manifest and SHA-256 sums otherwise; PDF availability and the consolidated-PDF rule unchanged. The existing Report Center download tests run unchanged.
- **Not touched:** `src/api/`, `functions/`, MCP and REST schemas, page mirrors, workflows, Cloudflare, DNS, secrets and canon. The runtime verifier still reports 18 REST operations and 16 MCP tools.
- **Client assets compared with `main` (same pipeline output):**
  - 48 of 50 files under `/_astro/` are byte-identical.
  - The stylesheet gains three rules and loses two (the two fixed minimum widths), +187 bytes (56,028 → 56,215).
  - The Report Center script grows by 124 bytes (13,399 → 13,523).

## 9. Known limitations

- **Site header on phones with enlarged text.** At 320 px with 125 % text, or 375–320 px with 150 % text, the shared site header's control group is wider than the screen (12–67 px of page overflow). It happens on every page, for example `/` and `/methodology/`, and is outside this component. In those states the new test checks that the Report Center itself fits, not the whole page. A site-wide fix is a separate decision.
- **Finding ids in the list at 320 px with 150 % text.** The monospace line of id, priority and classification can run past the list's edge; it scrolls inside the list. Not changed.
- **Opening a finding by link.** With `?id=` the finding is selected, but the list shows the first 250 findings of all families, which may not include it. This existing behaviour is not changed and does not affect the export.
- **Approximations.** Browser zoom was approximated by the equivalent CSS viewport, and text scaling by the root font size. Local runs used Edge on Windows; CI uses Chromium on Linux.
- **Production.** Production behaviour is unverified until an owner-approved merge and deployment.

## 10. Owner files and delivery

- `.vscode/settings.json`: SHA-256 `5515EB78…3CB649F09`, index `100644 c7c1623b…`.
- `public/reltroner-statistics-logo.webp`: SHA-256 `B1FECD11…18AB868B0`, index `100644 e79c4806…`.
- Both stayed staged and byte-identical from start to end. The commit was made from a separate temporary index, so the real index was never rewritten.
- One checkout (`git worktree list` shows one entry); no worktree, clone or stash.
- Draft PR only. No merge, no deployment, no Cloudflare change, no canon change.

## 11. Gate results

Filled in after the gate run on the committed tree.
