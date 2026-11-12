# Report export contract

**Status: implemented.** All eight formats render from one canonical report model (`src/export/model.ts`).

## Equal-format selection

JSON, CSV, XLSX, TXT, MD, HTML, PDF and XML are first-class, equally selectable formats. None is inserted automatically; XML is optional like any other.

## Delivery

| Scope | Formats | Output |
|---|---|---|
| One finding | One | Direct file |
| One finding | Several | ZIP |
| Selected findings | Any | ZIP, per-finding or consolidated layout |
| All findings | Any | ZIP, per-finding or consolidated layout |

ZIP bundles contain sorted, path-safe entries with fixed timestamps, `MANIFEST.json` (source SHA pair, rules version, semantic digest, deployment status, selection, safeguards, limits, per-entry SHA-256) and `SHA256SUMS.txt` (`sha256sum -c` compatible). Browser limits: 2,000 findings, 600 PDFs, 200 MB per bundle.

## Formats

- **JSON** — typed report document with provenance.
- **CSV** — RFC 4180, UTF-8 with BOM, CRLF; text beginning with `= + - @ TAB CR` is prefixed with an apostrophe; numbers stay numeric.
- **XLSX** — Summary, Findings and Diff excerpts sheets; numeric and boolean cells typed; frozen header, autofilter; no formula elements are written and formula-like text carries `quotePrefix`.
- **TXT** — complete plain-text forensic summary.
- **Markdown** — GitHub-friendly tables and fenced diff blocks with safe escaping.
- **HTML** — self-contained branded report with embedded CSS and no external requests; all text escaped.
- **PDF** — printed by headless Chromium from the same HTML; tagged, selectable text, page footer with source SHAs. Per-finding PDFs and one consolidated PDF of all findings are precomputed at build time (`/reports/pdf/index.json` lists SHA-256s and the SHA-256 of the HTML each was printed from). A consolidated PDF for a custom selection is not produced in the browser; such bundles carry per-finding PDFs and say so in the manifest.
- **XML** — validates against `analytics/schemas/report.xsd` (verified in tests with `xmlschema`).

## Verification

Unit tests cover typed values and provenance in every format, formula-injection guards, HTML/XML escaping, XLSX structure, direct versus ZIP delivery, deterministic ZIP bytes, manifest and checksum integrity, and path safety. Browser tests download a real bundle and verify every checksum, and extract PDF text to confirm it matches the HTML source.
