# RS-UI-RESPONSIVE-007 — Global Header Text Scaling & Accessibility

**State:** IMPLEMENTED ON FEATURE BRANCH; owner review and verified CI required before merge. No production deployment or Asthortera canon update is authorized by this document.

## 1. Context and problem

RS-REPORT-UI-COLLISION-006 (PR #12) repaired intrinsic-width overflow in the Report Center and identified a distinct **pre-existing global header** problem at enlarged text sizes. At 125–150% text, header navigation could run past the viewport, including the 1688 px Linux font case. The old header chose desktop visibility using a fixed 1280 CSS-pixel media query even when enlarged text no longer fit inside the actual 1240 px maximum-width site container.

**The original page-1 horizontal overflow test did not prove header reflow**: it used normal root font size and did not cover repeated 150% layout, control center hit testing or adaptive header mode. This milestone fixes the shared navigation source, not the Report Center or its export system.

## 2. Scope and explicit preservation

**In scope:** global Statistics header, logo accessibility when labels must collapse, search/full vs compact controls, mobile navigation disclosure, root text size, keyboard and touch accessibility, and regression evidence across home, spatial Statistics and Report Center routes.

**Out of scope:** changing navigation destinations, removing sections, Studio or LMS headers, country/creative datasets, publishing new canon, REST/MCP contracts, export internals, performance-sensitive charts, DNS/Cloudflare settings, or altering PR #12 code.

**Owner's permanent local checkout policy:** only C:\Projects\reltroner-statistics, no second worktree/clone. Implementation is authored directly to a GitHub feature branch, not through any additional checkout. Preserve the owner's staged .vscode/settings.json and public/reltroner-statistics-logo.webp; GitHub feature commits must exclude both.

## 3. Root cause and approach

| Previous behavior | Risk |
| --- | --- |
| Header desktop navigation toggled at viewport 1280 px, independent of font scaling | Desktop nav appeared even if scaled text could not fit |
| Site container capped at 1240 px | Increasing viewport width past 1240 did not create more room for the nav |
| Brand had no accessible fallback name when text could be visually collapsed | Compact branding could become an unnamed link |
| Mobile menu resize close behavior used fixed 1280 px | A compact menu could be closed incorrectly at enlarged desktop viewport sizes |
| Desktop-only body overflow override at 1280 px | Scaled compact menu could fail to lock body scroll |

**Implementation:** the inner header shell itself becomes a CSS inline-size query container. Its default layout is compact with accessible search/menu controls; at a measured container width of at least 77 em (relative to the shell's inherited font size), desktop navigation, full search and Ecosystem control are enabled. This respects the max-width container as well as zoom/text enlargement. The original normal desktop presentation is preserved at 1440 px/100%, while compact navigation stays available at enlarged text.

At extreme effective widths (21 em or less), brand text is hidden visually but the home link keeps a stable accessible label. The header minimum height permits growth if content reflows. The compact menu continues to provide the full sections, contact and ecosystem destinations. A ResizeObserver on the desktop navigation closes a previously opened compact disclosure if that navigation becomes visible following a zoom/text-size change, preserving aria-expanded and scroll state.

### 3.1 Desktop row width depends on the visitor's font (found by CI run 44540075725)

CI on the earlier head `8ce99cf` failed one assertion. At `/`, dark, 1440 px, 100 % text (wide fallback fonts, which resolve to DejaVu Sans on the Linux runner), the centre of the desktop **Contact** link was not the link. Local reproduction (the trace artifact could not be downloaded: GitHub answered `503 Egress is over the account limit`):

| Measured at 1440 px, 100 %, Verdana (the spec's wide font on Windows) | Value |
|---|---|
| Header shell | 1240 px (the site container cap, 77.5em) |
| Primary nav box | 690.41 px (`min-width: 0` lets it shrink) |
| Its single row of links | 837 px wide, so it overruns the box by 147 px |
| Contact link | x 1030.0–1114.1 |
| Actions group (Search, Ecosystem, theme) | starts at x 983.6 |
| `elementFromPoint` at Contact's centre | the "Search" label inside the full Search button |

This was a true collision, not a measurement artefact: the links ran under the actions. The nav-box overlap check could not see it because the box had shrunk; only the centre hit-test did.

The cause is font metrics. The 77em switch (1232 px) admits the desktop row, but the row's natural width depends on the font the visitor's system supplies. The site loads no web font, so Inter, Segoe UI, `system-ui` or the fallbacks apply. Measured natural widths of the previous desktop row:

| Font | Segoe UI Variable (Windows 11) | Segoe UI (classic) | Inter | Arial / Liberation Sans | Verdana | DejaVu Sans |
|---|---:|---:|---:|---:|---:|---:|
| Needed | 1232.7 px | 1236.7 px | 1286.6 px | 1287.1 px | 1386.5 px | 1391.7 px |

Only Segoe UI Variable fit, by 0.7 px of the switch width. The same row and actions are on `main` (desktop from 1280 px), so this overrun predates this PR. The new hit-test exposed it, and it affects Mac and Linux visitors at 1272–1920 px.

**Fix (CSS only, consistent with the container-query design):**
- In desktop mode, the primary links keep the header's existing compact style: 8 px side padding, 13 px text and a 2 px gap. The larger desktop-only style (12 px, 14 px, 4 px) is dropped.
- The "Ctrl K" chip in the Search button shows only where the shell is at least 81em wide. The button keeps its "Search" label, and `aria-keyshortcuts="Control+K"` keeps the shortcut announced.

The widest measured font, DejaVu Sans, now needs 1196.1 px. That leaves 35.9 px of room at the 1232 px switch. With the chip it needs 1261.1 px at 16 px text; the chip only appears from 81em, at most 15.31 px text in the 1240 px shell, so at least 33 px of room remains there. Measured after the change at 1440 px: Contact ends at least 59.9 px before the actions (DejaVu), and its centre hit-tests as itself on all three routes and both themes. JavaScript measurement was considered and rejected:
- it would flash the overlap on every page load for affected fonts;
- it would not help without JavaScript;
- it contradicts the no-size-guess rule below.

A font-aware `ch` threshold was also rejected: Arial needs 144.8 ch while Segoe UI has only 143.8 ch available, so no threshold separates them safely.

**Compatibility:** Astro component CSS container queries run in supported Chromium browsers. Avoid JavaScript size guesses, fixed CSS viewport hacks, clipping, horizontal-scroll navigation or hiding destinations without an accessible alternative.

## 4. Tests and measured acceptance

Automated browser test: tests/e2e/header-text-scaling.spec.ts. At least these cases must be executed in PR CI, not just asserted in a model summary.

| Gate | Required assertion |
| --- | --- |
| H0 Identity | Feature branch based on the verified GitHub main commit containing PR #12; owner primary checkout and two protected files untouched |
| H1 Layout | Header shell scrollWidth <= clientWidth + 1 px, no visible link/button offscreen or blocked, brand/nav/action rectangles do not intersect, and no visible desktop link intersects the actions group (checked per link, since the nav box can shrink below its links) |
| H2 Reflow | 320, 375, 390, 768, 1024, 1280, 1440, 1688 and 1920 px representatives, 100–200% text with wide fallback fonts |
| H3 Cross-page | Home, spatial Statistics and Reports routes; dark and light themes |
| H4 Functional controls | Exactly one nav mode and one search mode; all destinations remain reachable; theme and palette controls remain present |
| H5 Keyboard | Compact menu click opens, Escape closes and returns focus; resizing or text scaling back to desktop closes the compact disclosure |
| H6 Touch | Compact search, theme and menu buttons retain >=40 px dimension at narrow 200% text |
| H7 Accessibility | Skip link and focus visibility; axe serious/critical WCAG 2.1 A/AA violations absent for tested header |
| H8 Full regression | Astro typecheck, baseline/schema checks, Node/Python tests, pipeline, full static build, workerd REST/MCP and Playwright |
| H9 Release isolation | Draft PR only; no write into Statistics main, Cloudflare or Studio and no owner-local worktree |

Follow WCAG 2.2 Success Criteria 1.4.4 Resize Text, 1.4.10 Reflow and 1.4.12 Text Spacing for the wider site. This header-specific change is **not** a claim of WCAG certification or a demonstration that every other page handles all zoom and spacing combinations.

Authoritative WCAG reference: https://www.w3.org/TR/WCAG22/

## 5. Performance / non-functional requirements

- Client JavaScript changes are limited to the header's visibility-change listener; avoid polling, background network requests, extra frontend frameworks or third-party analytics.
- CSS changes are local to the SiteHeader component. No CSS overflow hiding masks loss of navigation.
- Preserve all existing 18 REST operations, 16 MCP tools, three PAGE-004 page tools, canonical and proposal classifications, source-digest parity, export functionality and Report Center collision fix.
- Inspect compiled assets and tests for unexpected semantic mirror or Tailwind CSS changes. Generated-at timestamps and source-version changes must not be treated as application regressions without comparing pinned inputs.
- Playwright test must be capable of failing against the old header. Do not weaken the test merely to make CI green; if unrelated site-wide zoom failures exist, separate them out and report them accurately.

## 6. Release gate and production handoff

1. Review GitHub feature-branch diff, source base SHA and preservation of protected owner files.
2. Require GitHub CI success on the exact final PR head; report test counts, failures and skips truthfully.
3. If stable, keep a **draft PR** for owner review; do not merge automatically.
4. On explicit owner merge, inspect the real main-push build, Cloudflare SHA and strict live MCP protocol verifier, then validate header behavior on production at 320/375/1440/1688 px and text 100/150/200%. Until then, **PRODUCTION_ACCEPTANCE: PENDING**.

**Status fields to fill only after CI:** FINAL_PR_HEAD; CI_RUN_URL; FULL_E2E_RESULT; HEADER_TEXT_SCALE_MATRIX; BROWSER_BUNDLE_DELTA; OWNER_LOCAL_FILES; MERGE; DEPLOYMENT; KNOWN_LIMITATIONS.

### 6.1 Status after the font-metric fix (2026-11-19)

| Field | Value |
|---|---|
| FINAL_PR_HEAD | Code `cce9574b6b9cf43a293f033ed913f8f7ed973ba7`; this record is a documentation-only commit on top of it, and its CI run is linked from the pull request |
| CI_RUN_URL | [run 44560624060](https://github.com/Reltroner/reltroner-statistics/actions/runs/44560624060) on `cce9574`: **success**. Determinism and Python (Ubuntu and Windows), pipeline, static build (568 pages, 575 PDFs, 33,898 links), workerd (18 REST operations, 16 MCP tools, 3 page tools) and browser tests all pass; GitGuardian passes; publishing skipped, as for every pull request |
| Earlier failing run | [run 44540075725](https://github.com/Reltroner/reltroner-statistics/actions/runs/44540075725) on `8ce99cf`: 464 passed, 7 skipped, 1 failed, the Contact centre hit-test explained in §3.1 |
| FULL_E2E_RESULT | CI: 465 passed, 7 skipped, 0 failed, none flaky. Local (Windows, Edge 157): 465 passed, 7 skipped. The 7 skips are by design: the matrix and axe header tests run only in the desktop project (6), and the existing mobile-menu test does not run there (1) |
| HEADER_TEXT_SCALE_MATRIX | 3 routes × 2 themes × 12 width/text cases (320–1920 px, 100–200 %) with wide fonts: pass in CI (Linux, DejaVu Sans) and locally (Verdana). A local copy of the spec with DejaVu Sans served same-origin as both the wide and the default font also passes, 10 of 10. Keyboard, Escape and text-resize focus handoff, 320 px at 200 % touch targets and skip link, and header axe at 150 % in both themes pass |
| BROWSER_BUNDLE_DELTA | Against live `main` `f0c61dc` built from the same pinned sources: stylesheet +701 bytes (56,378 → 57,079, measured on the build of this documented head). This change itself removes three link-spacing utilities and adds the chip rules. The header script is +304 bytes (2,791 → 3,095), from the earlier `header.ts` change; this fix does not touch the script |
| Local gates on `cce9574` | All 14 exit 0: `npm ci` (lockfile unchanged), baseline, schemas, typecheck (232 files, 0 errors), unit 180, MCP contract profile 9, Python 24, pipeline (production `d1625b2`, remodeling `6dd3491`), build, `verify:runtime`, focused desktop header spec 4, full e2e 465/7 skipped |
| OWNER_LOCAL_FILES | `.vscode/settings.json` (SHA-256 `5515EB78…3CB649F09`) and `public/reltroner-statistics-logo.webp` (`B1FECD11…18AB868B0`) are still staged, byte-identical, and in no commit. All commits were made from a separate temporary index in the single checkout |
| MERGE | NOT_DONE |
| DEPLOYMENT | NOT_DONE; PRODUCTION_ACCEPTANCE: PENDING |
| KNOWN_LIMITATIONS | See below |

KNOWN_LIMITATIONS:
- **Font coverage.** The desktop row is sized for fonts up to DejaVu Sans width, with 35.9 px of room at the switch. A wider font, or user text-spacing overrides (WCAG 1.4.12), can still overrun at the 1232–1240 px shell. The em switch only reacts to text size, not to glyph width.
- **Ctrl K chip.** The chip is no longer visible at 100 % text, where the shell is 77.5em. The shortcut still works and is announced through `aria-keyshortcuts`.
- **Tailwind scan artefacts.** Two harmless unused rules come from this PR's text: a container-type rule from the literal at-rule name in the header's style block, and a visibility rule from a selector string in the header spec. No element uses either class. A third, from a word in this document, was removed by rewording.
- **CI trace.** The trace of run 44540075725 could not be downloaded (`503 Egress is over the account limit`). The failure was reproduced locally instead.
