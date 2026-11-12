# Report Export & Evidence Packaging — V3 Engineering Contract

**Status:** RATIFIED REQUIREMENT / IMPLEMENTATION IN PHASES. P0 exports JSON audit evidence and validates selection plans; other renderers are NOT yet production-capable.

## Equal-format selection

Supported format IDs (all first-class): **JSON, CSV, XLSX, TXT, MD, HTML, PDF, XML**.
XML is neither mandatory nor intrinsically less important. It is simply excluded if the user does not tick it, exactly like any other format. The selection API never silently inserts XML or any other format.

## Delivery matrix

| Scope | Selection | Output |
|---|---|---|
| Single finding | Exactly one format | Direct file in that format |
| Single finding | Multiple formats | ZIP of chosen formats |
| All findings | Any nonempty format set | ZIP with all selected reports |
| Selected findings | Any nonempty format set | ZIP with selected reports |

Bulk bundles support **per-finding** or **consolidated** layouts. Archive manifests and SHA-256 checksums document the source SHA pair, rules version, included files and each generated file hash. Each format uses the same normalized finding data and frozen input snapshots.

## Visual report rule

- HTML is a self-contained report: embedded local CSS, no external stylesheets, no live network dependency.
- PDF is always rendered using the **same HTML/CSS report source**, with print styling, page breaks, and text-selectable output.
- CSV and XLSX prevent formula injection from untrusted input fields.
- XLSX includes readable sheet names and numerical cell types without losing source values.
- Markdown, TXT, JSON and XML escape or serialize values correctly.
- XML supports a schema and preserves evidence/provenance but may be omitted by users.
- ZIP filenames and internal paths must be sanitized; no traversal, symlink or absolute paths. Deterministic ordering, per-run size limits and resource budgets apply.

## Privacy and source authority

All exports explicitly identify **production main candidate**, **remodeling candidate**, and separately **verified deployed source** when available. Do not label an unverified main SHA as deployed. Never silently replace production values with remodeling revisions. Exclude internal-only source documents and secrets from public report payloads.

## Exit criteria for a later export-engineering phase

1. All 8 standalone formats can be generated from one fixture without losing typed values or provenance.
2. PDF text/layout match HTML print source; no independent PDF template.
3. All valid format subsets and direct/ZIP rules pass automated tests.
4. ZIP manifests, checksums, XSD, CSV injection, HTML escaping and large-report limits pass.
5. Single source drift, selected drifts and all-source-drifts export independently.
6. Read-only source policy and last-known-good release behavior remain intact.
