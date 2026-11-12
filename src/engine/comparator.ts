import type { Audit, AuditSummary, FileRecord, Finding, SideValue, ValueType } from '../domain/finding.ts';
import type { DeploymentVerification, SourceIdentity } from '../domain/source.ts';
import type { ChangeType, ContentChangeNature, FileClassification, FindingClassification, ReviewStatus } from '../domain/status.ts';
import { canonicalJson, codeUnitCompare, deepEqualJson } from './canonical.ts';
import { gitBlobSha, sha256Hex } from './git-objects.ts';
import { compareJsonValues, jsonKind, normalizeJson, resolvePointer, type JsonDifference } from './json-diff.ts';
import { diffLines } from './line-diff.ts';
import { excerpt, normalizedSectionLines, parseFrontmatter, splitSections, textChangeNature } from './markdown.ts';
import { ALLOWED_MODES, MAX_BLOB_BYTES, RULES_VERSION, isComparedPath, scopeDescription } from './scope.ts';
import { inferUnit } from './units.ts';

export interface SnapshotEntry {
  sha: string;
  size: number;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
}

/** A pinned, read-only source revision. Content is addressed by Git blob SHA only. */
export interface SourceSnapshot {
  identity: SourceIdentity;
  entries: ReadonlyMap<string, SnapshotEntry>;
  readBlob(sha: string): Promise<Uint8Array>;
}

const TOKEN_RE = /^[A-Za-z0-9_.:+\-/]{1,64}$/;
const decoder = new TextDecoder('utf-8', { fatal: false });

export function stableFindingId(level: string, file: string, locator: string): string {
  return `CRD-${sha256Hex(`${level}\0${file}\0${locator}`).slice(0, 12).toUpperCase()}`;
}

function valueType(v: unknown): ValueType {
  return jsonKind(v);
}

function side(present: boolean, value?: unknown, type?: ValueType): SideValue {
  return present ? { present: true, value, value_type: type ?? valueType(value) } : { present: false };
}

function classifyField(d: JsonDifference): FindingClassification {
  switch (d.change) {
    case 'ADDED':
    case 'REMOVED':
    case 'TYPE_CHANGED':
      return 'SCHEMA_DRIFT';
    case 'UNASSIGNED_TO_ASSIGNED':
    case 'ASSIGNED_TO_UNASSIGNED':
      return 'VALUE_DRIFT';
    case 'VALUE_CHANGED': {
      const a = d.production_value, b = d.remodeling_value;
      if (typeof a === 'string' && typeof b === 'string') {
        return TOKEN_RE.test(a) && TOKEN_RE.test(b) ? 'VALUE_DRIFT' : 'SEMANTIC_REVIEW_CANDIDATE';
      }
      return 'VALUE_DRIFT';
    }
  }
}

function fieldRule(d: JsonDifference, cls: FindingClassification): string {
  if (cls === 'SCHEMA_DRIFT') return `R-JSON-SCHEMA: member ${d.change === 'TYPE_CHANGED' ? 'type changed' : d.change.toLowerCase()}`;
  if (cls === 'SEMANTIC_REVIEW_CANDIDATE') return 'R-JSON-TEXT: free-text value changed; meaning cannot be decided deterministically';
  if (d.change === 'UNASSIGNED_TO_ASSIGNED' || d.change === 'ASSIGNED_TO_UNASSIGNED') return 'R-JSON-NULL: null/assigned transition (null is not zero)';
  return 'R-JSON-VALUE: same member, same type, different value';
}

function entityFromPointer(pointer: string): { kind: 'country' | 'record'; name: string; collection: string } | null {
  const m = /^([A-Za-z0-9_]+)\[([^\]]+)\]/.exec(pointer);
  if (!m) return null;
  const collection = m[1]!, name = m[2]!;
  if (/^\d+$/.test(name)) return null;
  return { kind: /^countries_/.test(collection) ? 'country' : 'record', name, collection };
}

function leafField(pointer: string): string {
  const stripped = pointer.replace(/^[A-Za-z0-9_]+\[[^\]]+\]\.?/, '');
  return stripped || pointer;
}

function recommendFor(cls: FindingClassification, review: ReviewStatus, change: ChangeType, canon: string | null): string {
  if (review === 'INFORMATIONAL') return 'No semantic change. No canon action required; formatting may be normalized at the next production sync.';
  if (review === 'PROPOSAL') return 'Remodeling-only proposal. Not a production defect. Promote only through an explicit creator decision and production commit.';
  if (change === 'REMOVED' || change === 'FILE_REMOVED') return 'Production content absent from remodeling. Confirm whether remodeling intends removal or has not yet incorporated it; production remains authoritative.';
  if (change === 'INVALID_SOURCE') return 'Source could not be parsed. Fix the source file before any comparison conclusion is drawn.';
  if (cls === 'VALUE_DRIFT' && canon === 'C') return 'Proposed change to a canon-C production value. Requires creator ratification before any public statistic changes; production value stays authoritative until then.';
  if (cls === 'VALUE_DRIFT') return 'Value differs between production and remodeling. Review the remodeling rationale; production value remains the public statistic.';
  if (cls === 'SCHEMA_DRIFT') return 'Structure differs. Align schemas before merging data; consumers of the production structure must not break.';
  if (cls === 'SEMANTIC_REVIEW_CANDIDATE') return 'Text differs. Human editorial review required; no automated canon conclusion is drawn.';
  return 'Review the difference against production canon.';
}

function priorityFor(cls: FindingClassification, review: ReviewStatus, change: ChangeType, canon: string | null, numeric: boolean): 'P1' | 'P2' | 'P3' {
  if (review === 'INFORMATIONAL' || review === 'PROPOSAL') return 'P3';
  if (change === 'INVALID_SOURCE') return 'P1';
  if (cls === 'VALUE_DRIFT' && numeric && canon === 'C') return 'P1';
  if (cls === 'VALUE_DRIFT' || change === 'REMOVED' || change === 'TYPE_CHANGED' || change === 'FILE_REMOVED') return 'P2';
  return 'P3';
}

function fmt(v: unknown): string {
  if (v === undefined) return '∅';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 48 ? `${s.slice(0, 47)}…` : s;
}

interface Pair { path: string; prod: SnapshotEntry | undefined; draft: SnapshotEntry | undefined }

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

function scopedEntries(s: SourceSnapshot): Map<string, SnapshotEntry> {
  const m = new Map<string, SnapshotEntry>();
  for (const [path, e] of s.entries) {
    if (e.type === 'blob' && ALLOWED_MODES.has(e.mode) && isComparedPath(path)) m.set(path, e);
  }
  return m;
}

async function readVerified(s: SourceSnapshot, e: SnapshotEntry): Promise<Uint8Array> {
  const bytes = await s.readBlob(e.sha);
  const actual = gitBlobSha(bytes);
  if (actual !== e.sha) throw new Error(`Blob integrity failure: expected ${e.sha}, computed ${actual}`);
  return bytes;
}

function titleOf(text: string | null, path: string): string | null {
  if (text === null) return null;
  const fm = parseFrontmatter(text);
  if (fm.ok && fm.value && typeof fm.value.title === 'string') return fm.value.title.slice(0, 200);
  if (path.endsWith('.json')) {
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      if (typeof j.schema_version === 'string') return j.schema_version.slice(0, 200);
    } catch { /* recorded elsewhere */ }
  }
  return null;
}

export interface CompareOptions {
  deployment: DeploymentVerification;
  generatedAt?: string;
  concurrency?: number;
}

export async function compareSources(production: SourceSnapshot, remodeling: SourceSnapshot, options: CompareOptions): Promise<Audit> {
  const P = scopedEntries(production), D = scopedEntries(remodeling);
  const paths = [...new Set([...P.keys(), ...D.keys()])].sort(codeUnitCompare);
  const pairs: Pair[] = paths.map((path) => ({ path, prod: P.get(path), draft: D.get(path) }));
  const provenance = (s: SourceSnapshot, path: string, e: SnapshotEntry | undefined, line?: number | null) =>
    e ? { repository: s.identity.repository, commit_sha: s.identity.commit_sha, path, blob_sha: e.sha, ...(line ? { line } : {}) } : null;

  const results = await mapLimit(pairs, options.concurrency ?? 8, async ({ path, prod, draft }) => {
    const kind: 'json' | 'markdown' = path.endsWith('.json') ? 'json' : 'markdown';
    const classification: FileClassification = !prod ? 'DRAFT_ONLY' : !draft ? 'PRODUCTION_ONLY' : prod.sha === draft.sha ? 'IDENTICAL' : 'CHANGED';
    const record: FileRecord = {
      path, kind, classification,
      production_blob_sha: prod?.sha ?? null,
      remodeling_blob_sha: draft?.sha ?? null,
      production_bytes: prod?.size ?? null,
      remodeling_bytes: draft?.size ?? null,
      content_nature: null,
      finding_count: 0,
      title: null,
      analysis: 'NOT_REQUIRED',
    };
    const findings: Finding[] = [];
    if (classification === 'IDENTICAL') return { record, findings };
    if ((prod && prod.size > MAX_BLOB_BYTES) || (draft && draft.size > MAX_BLOB_BYTES)) {
      record.analysis = 'SKIPPED_OVERSIZE';
    }
    const okToRead = record.analysis !== 'SKIPPED_OVERSIZE';
    const prodText = okToRead && prod ? decoder.decode(await readVerified(production, prod)) : null;
    const draftText = okToRead && draft ? decoder.decode(await readVerified(remodeling, draft)) : null;
    record.title = titleOf(prodText ?? draftText, path);

    const base = (partial: Omit<Finding, 'provenance' | 'file_path' | 'file_kind'> & { prodLine?: number | null; draftLine?: number | null }): Finding => {
      const { prodLine, draftLine, ...rest } = partial;
      return {
        ...rest,
        file_path: path,
        file_kind: kind,
        provenance: {
          production: provenance(production, path, prod, prodLine),
          remodeling: provenance(remodeling, path, draft, draftLine),
        },
      };
    };

    // File-level finding: one per non-identical file.
    let nature: ContentChangeNature | null = null;
    let normProd: unknown;
    let parsedProd: unknown, parsedDraft: unknown;
    let invalid: string | null = null;
    if (classification === 'CHANGED' && prodText !== null && draftText !== null) {
      if (kind === 'json') {
        try {
          parsedProd = JSON.parse(prodText);
          parsedDraft = JSON.parse(draftText);
          normProd = normalizeJson(parsedProd);
          nature = deepEqualJson(parsedProd, parsedDraft) ? 'JSON_FORMAT_ONLY' : 'CONTENT';
        } catch (err) {
          invalid = String((err as Error).message).slice(0, 180);
        }
      } else {
        nature = textChangeNature(prodText, draftText);
      }
    }
    record.content_nature = nature;
    const fileChange: ChangeType =
      classification === 'DRAFT_ONLY' ? 'FILE_ADDED'
        : classification === 'PRODUCTION_ONLY' ? 'FILE_REMOVED'
          : invalid ? 'INVALID_SOURCE'
            : nature && nature !== 'CONTENT' ? 'FORMAT_ONLY' : 'CONTENT_CHANGED';
    const fileReview: ReviewStatus =
      classification === 'DRAFT_ONLY' ? 'PROPOSAL' : fileChange === 'FORMAT_ONLY' ? 'INFORMATIONAL' : 'REVIEW_CANDIDATE';
    const fileCls: FindingClassification = classification as FindingClassification;
    findings.push(base({
      id: stableFindingId('FILE', path, ''),
      level: 'FILE',
      classification: fileCls,
      change_type: fileChange,
      review_status: fileReview,
      priority: priorityFor(fileCls, fileReview, fileChange, null, false),
      title: `${path.split('/').pop()} — ${
        classification === 'DRAFT_ONLY' ? 'remodeling-only file'
          : classification === 'PRODUCTION_ONLY' ? 'production-only file'
            : fileChange === 'FORMAT_ONLY' ? `formatting only (${(nature ?? '').toLowerCase().replaceAll('_', ' ')})`
              : fileChange === 'INVALID_SOURCE' ? 'unparseable source' : 'content changed'
      }`,
      locator: '',
      entity: record.title ? { kind: 'document', name: record.title } : null,
      field: null,
      unit: null,
      unit_source: null,
      production: prod ? side(true, prod.size, 'number') : side(false),
      remodeling: draft ? side(true, draft.size, 'number') : side(false),
      numeric_delta: prod && draft ? { absolute: draft.size - prod.size, relative: prod.size ? (draft.size - prod.size) / prod.size : null } : null,
      production_canon_status: null,
      content_nature: nature,
      diff: null,
      recommendation: invalid
        ? `Source could not be parsed (${invalid}). Fix the source before drawing conclusions.`
        : recommendFor(fileCls, fileReview, fileChange, null),
      rule: classification === 'CHANGED' ? 'R-FILE-BLOB: Git blob SHA differs' : `R-FILE-PRESENCE: path exists only in ${classification === 'DRAFT_ONLY' ? 'remodeling' : 'production'}`,
    }));

    if (classification === 'CHANGED' && nature === 'CONTENT' && !invalid) {
      record.analysis = 'COMPLETE';
      if (kind === 'json') {
        for (const d of compareJsonValues(parsedProd, parsedDraft)) {
          const cls = classifyField(d);
          const review: ReviewStatus = d.change === 'ADDED' ? 'PROPOSAL' : 'REVIEW_CANDIDATE';
          const ent = entityFromPointer(d.pointer);
          const canonRaw = ent ? resolvePointer(normProd, `${ent.collection}[${ent.name}].canon_status`) : { present: false };
          const canon = canonRaw.present && typeof canonRaw.value === 'string' ? canonRaw.value : null;
          const numeric = typeof d.production_value === 'number' && typeof d.remodeling_value === 'number';
          const field = ent ? leafField(d.pointer) : d.pointer;
          const pv = 'production_value' in d, dv = 'remodeling_value' in d;
          findings.push(base({
            id: stableFindingId('FIELD', path, d.pointer),
            level: 'FIELD',
            classification: cls,
            change_type: d.change,
            review_status: review,
            priority: priorityFor(cls, review, d.change, canon, numeric),
            title: `${ent ? `${ent.name} · ` : ''}${field}: ${fmt(d.production_value)} → ${fmt(d.remodeling_value)}`,
            locator: d.pointer,
            entity: ent ? { kind: ent.kind, name: ent.name } : null,
            field,
            unit: inferUnit(d.pointer),
            unit_source: inferUnit(d.pointer) ? 'FIELD_NAME_CONVENTION' : null,
            production: side(pv, d.production_value),
            remodeling: side(dv, d.remodeling_value),
            numeric_delta: numeric
              ? {
                  absolute: (d.remodeling_value as number) - (d.production_value as number),
                  relative: d.production_value !== 0 ? ((d.remodeling_value as number) - (d.production_value as number)) / Math.abs(d.production_value as number) : null,
                }
              : null,
            production_canon_status: canon,
            content_nature: 'CONTENT',
            diff: null,
            recommendation: recommendFor(cls, review, d.change, canon),
            rule: fieldRule(d, cls),
          }));
        }
      } else {
        const fa = parseFrontmatter(prodText!), fb = parseFrontmatter(draftText!);
        if (!fa.ok || !fb.ok) {
          const msg = !fa.ok ? `production: ${fa.error}` : `remodeling: ${(fb as { error: string }).error}`;
          findings.push(base({
            id: stableFindingId('FRONTMATTER', path, '(invalid)'),
            level: 'FRONTMATTER', classification: 'SCHEMA_DRIFT', change_type: 'INVALID_SOURCE', review_status: 'REVIEW_CANDIDATE', priority: 'P1',
            title: `${path.split('/').pop()} — frontmatter could not be parsed`, locator: '(invalid)', entity: null, field: null, unit: null, unit_source: null,
            production: side(false), remodeling: side(false), numeric_delta: null, production_canon_status: null, content_nature: 'CONTENT', diff: null,
            recommendation: `Frontmatter is not valid YAML (${msg}). Fix before comparison.`, rule: 'R-MD-FRONTMATTER-YAML',
          }));
        } else if (!deepEqualJson(fa.value, fb.value)) {
          for (const d of compareJsonValues(fa.value ?? {}, fb.value ?? {})) {
            const cls = classifyField(d);
            const review: ReviewStatus = d.change === 'ADDED' ? 'PROPOSAL' : 'REVIEW_CANDIDATE';
            findings.push(base({
              id: stableFindingId('FRONTMATTER', path, d.pointer),
              level: 'FRONTMATTER', classification: cls, change_type: d.change, review_status: review,
              priority: priorityFor(cls, review, d.change, null, false),
              title: `${path.split('/').pop()} · frontmatter ${d.pointer}: ${fmt(d.production_value)} → ${fmt(d.remodeling_value)}`,
              locator: d.pointer, entity: record.title ? { kind: 'document', name: record.title } : null, field: d.pointer,
              unit: null, unit_source: null,
              production: side('production_value' in d, d.production_value),
              remodeling: side('remodeling_value' in d, d.remodeling_value),
              numeric_delta: null, production_canon_status: null, content_nature: 'CONTENT', diff: null,
              recommendation: recommendFor(cls, review, d.change, null), rule: fieldRule(d, cls), prodLine: 1, draftLine: 1,
            }));
          }
        }
        const sa = splitSections(prodText!), sb = splitSections(draftText!);
        const ma = new Map(sa.map((s) => [s.key, s])), mb = new Map(sb.map((s) => [s.key, s]));
        const keys = [...new Set([...ma.keys(), ...mb.keys()])].sort(codeUnitCompare);
        for (const key of keys) {
          const a = ma.get(key), b = mb.get(key);
          const la = a ? normalizedSectionLines(a) : [], lb = b ? normalizedSectionLines(b) : [];
          if (a && b && la.join('\n') === lb.join('\n')) continue;
          const change: ChangeType = !a ? 'SECTION_ADDED' : !b ? 'SECTION_REMOVED' : 'SECTION_CHANGED';
          const review: ReviewStatus = change === 'SECTION_ADDED' ? 'PROPOSAL' : 'REVIEW_CANDIDATE';
          const d = diffLines(la, lb);
          findings.push(base({
            id: stableFindingId('SECTION', path, key),
            level: 'SECTION', classification: 'SEMANTIC_REVIEW_CANDIDATE', change_type: change, review_status: review,
            priority: change === 'SECTION_REMOVED' ? 'P2' : 'P3',
            title: `${path.split('/').pop()} § ${key.length > 80 ? `${key.slice(0, 79)}…` : key} — ${change === 'SECTION_ADDED' ? 'section added in remodeling' : change === 'SECTION_REMOVED' ? 'section absent from remodeling' : `+${d.added}/−${d.removed} lines`}`,
            locator: key, entity: record.title ? { kind: 'document', name: record.title } : null, field: null,
            unit: null, unit_source: null,
            production: a ? side(true, excerpt(la), 'text') : side(false),
            remodeling: b ? side(true, excerpt(lb), 'text') : side(false),
            numeric_delta: null, production_canon_status: null, content_nature: 'CONTENT',
            diff: { added_lines: d.added, removed_lines: d.removed, excerpt: d.excerpt, truncated: d.truncated },
            recommendation: change === 'SECTION_ADDED'
              ? recommendFor('SEMANTIC_REVIEW_CANDIDATE', 'PROPOSAL', change, null)
              : change === 'SECTION_REMOVED'
                ? 'Section present in production but absent from remodeling. Confirm intent; production text remains authoritative.'
                : recommendFor('SEMANTIC_REVIEW_CANDIDATE', 'REVIEW_CANDIDATE', change, null),
            rule: 'R-MD-SECTION: heading-path section text differs after whitespace normalization',
            prodLine: a?.start_line ?? null, draftLine: b?.start_line ?? null,
          }));
        }
      }
    } else if (invalid) {
      record.analysis = 'INVALID_SOURCE';
    } else if (classification === 'CHANGED') {
      record.analysis = 'COMPLETE';
    }
    record.finding_count = findings.length;
    return { record, findings };
  });

  const files = results.map((r) => r.record);
  const findings = results.flatMap((r) => r.findings);
  const ids = new Set<string>();
  for (const f of findings) {
    if (ids.has(f.id)) throw new Error(`Finding ID collision: ${f.id}`);
    ids.add(f.id);
  }
  const tally = (key: (f: Finding) => string) => {
    const out: Record<string, number> = {};
    for (const f of findings) out[key(f)] = (out[key(f)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => codeUnitCompare(a, b)));
  };
  const count = (c: FileClassification) => files.filter((f) => f.classification === c).length;
  const natures: Record<string, number> = {};
  for (const f of files) if (f.classification === 'CHANGED') natures[f.content_nature ?? 'UNKNOWN'] = (natures[f.content_nature ?? 'UNKNOWN'] ?? 0) + 1;
  const summary: AuditSummary = {
    total_compared_paths: files.length,
    identical: count('IDENTICAL'),
    changed: count('CHANGED'),
    production_only: count('PRODUCTION_ONLY'),
    draft_only: count('DRAFT_ONLY'),
    changed_by_nature: Object.fromEntries(Object.entries(natures).sort(([a], [b]) => codeUnitCompare(a, b))),
    findings_total: findings.length,
    json_field_findings: findings.filter((f) => f.level === 'FIELD').length,
    findings_by_level: tally((f) => f.level),
    findings_by_classification: tally((f) => f.classification),
    findings_by_review_status: tally((f) => f.review_status),
    findings_by_priority: tally((f) => f.priority),
  };
  const core = {
    schema_version: 'reltroner-statistics-audit.v2' as const,
    rules_version: RULES_VERSION,
    scope: scopeDescription(),
    sources: { production: production.identity, remodeling: remodeling.identity },
    summary,
    files,
    findings,
  };
  return {
    ...core,
    deployment: options.deployment,
    semantic_digest: semanticDigest(core),
    generated_at: options.generatedAt ?? new Date().toISOString(),
  };
}

/** Digest over everything that must be identical across platforms for the same SHA pair and rules. */
export function semanticDigest(core: {
  rules_version: string;
  scope: unknown;
  sources: { production: SourceIdentity; remodeling: SourceIdentity };
  summary: unknown;
  files: unknown;
  findings: unknown;
}): string {
  const pin = (s: SourceIdentity) => ({ repository: s.repository, commit_sha: s.commit_sha, tree_sha: s.tree_sha });
  return sha256Hex(
    canonicalJson({
      rules_version: core.rules_version,
      scope: core.scope,
      sources: { production: pin(core.sources.production), remodeling: pin(core.sources.remodeling) },
      summary: core.summary,
      files: core.files,
      findings: core.findings,
    }),
  );
}
