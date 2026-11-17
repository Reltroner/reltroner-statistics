#!/usr/bin/env node
/**
 * RS-CREATIVE-QUALITY-003 deterministic diagnostics.
 *
 * Runs the pinned cases of tests/evaluation/creative-quality-cases.json through the same service
 * REST and MCP use, against the artifacts of a built site (default: dist/), and measures what can
 * be measured without a model or a reviewer: citation integrity, retrieval-scope disclosure,
 * evidence drill-down, epistemic labeling and overlap with the existing opportunity cards.
 *
 * These are proxies. They are not a creativity score and not the 100-point review rubric, which
 * needs complete answers from real AI clients and independent reviewers.
 *
 *   node scripts/evaluate-creative-quality.ts [--dir dist] [--split dev|holdout|adversarial|all] [--out file.json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { ApiError } from '../src/api/contract.ts';
import { ARTIFACTS, createService, type ArtifactName } from '../src/api/service.ts';
import { ROOT } from './lib/context.ts';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback; };
const dir = path.resolve(ROOT, arg('dir', 'dist'));
const split = arg('split', 'all');
const out = arg('out', '');

const cache = new Map<ArtifactName, unknown>();
const service = createService(async (name) => {
  if (!cache.has(name)) cache.set(name, JSON.parse(fs.readFileSync(path.join(dir, ARTIFACTS[name].path), 'utf8')));
  return cache.get(name);
});
const cases = (JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/evaluation/creative-quality-cases.json'), 'utf8')) as Any).cases as Any[];

/** Every evidence id a response refers to from inside its data. */
function referenced(data: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(data)) for (const x of data) referenced(x, into);
  else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (k === 'evidence_id' && typeof v === 'string') into.add(v);
      else if (k === 'evidence_ids' && Array.isArray(v)) { for (const id of v) if (typeof id === 'string') into.add(id); }
      else referenced(v, into);
    }
  }
  return into;
}
const ratio = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 1000 : null);
const CANON = new Set(['CANON_OBSERVED', 'CANON_DERIVED']);

async function trace(ids: string[]) {
  let resolved = 0; let rejected = 0;
  for (let i = 0; i < ids.length; i += 20) {
    try {
      const r = (await service.run('trace_evidence', { ids: ids.slice(i, i + 20) })) as Any;
      resolved += r.data.items.filter((x: Any) => x.found).length;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      rejected += Math.min(20, ids.length - i); // the whole request is refused
    }
  }
  return { resolved, rejected };
}

async function measure(args: Any) {
  const first = (await service.run('build_research_context', args)) as Any;
  const second = (await service.run('build_research_context', args)) as Any;
  const snap = first.snapshot;
  const pinned = new Set([snap.production_source_sha, snap.remodeling_source_sha]);
  const evidence = first.evidence as Any[];
  const exploration = first.data.exploration_candidates as Any | undefined;
  const candidates = (exploration?.candidates ?? []) as Any[];
  const inline: string[] = [];
  (function anchorsOf(d: unknown) { if (Array.isArray(d)) d.forEach(anchorsOf); else if (d && typeof d === 'object') for (const [k, v] of Object.entries(d)) { if (k === 'anchors' && Array.isArray(v)) for (const a of v) inline.push((a as Any).evidence_id); else anchorsOf(v); } })(exploration);
  const have = new Set(evidence.map((e) => e.id));
  const refs = [...referenced(first.data)];
  // A reference is accounted for when its citation is in evidence[], inline in a candidate, or listed as omitted.
  const disclosed = new Set([...have, ...inline, ...((first.data.coverage?.evidence?.omitted_ids ?? []) as string[])]);
  const dangling = refs.filter((id) => !have.has(id) && !inline.includes(id));
  const undisclosed = refs.filter((id) => !disclosed.has(id));
  const traceIds = [...new Set([...evidence.map((e) => e.id), ...inline])];
  const t = await trace(traceIds);
  const cards = (first.data.creative_opportunities ?? []) as Any[];
  const steps = candidates.flatMap((c) => c.mechanism_steps ?? []);
  const cardAnchors = new Set(cards.flatMap((c) => c.evidence_ids ?? []).map((id: string) => { const e = evidence.find((x) => x.id === id); return e ? `${e.path}:${e.line}` : id; }));
  const candidateAnchors = new Set(candidates.flatMap((c) => (c.anchors ?? []).map((a: Any) => `${a.path}:${a.line ?? a.pointer}`)));
  return {
    result_status: first.result_status,
    truncated: first.truncated,
    deterministic: JSON.stringify(first) === JSON.stringify(second),
    response_bytes: JSON.stringify(first).length,
    // Citation integrity
    evidence_items: evidence.length,
    evidence_pinned_to_snapshot: ratio(evidence.filter((e) => e.commit_sha && pinned.has(e.commit_sha) && e.path).length, evidence.length),
    evidence_with_line_or_pointer: ratio(evidence.filter((e) => e.line !== null || e.pointer !== null).length, evidence.length),
    referenced_evidence_ids: refs.length,
    references_without_citation_in_response: dangling.length,
    references_without_citation_and_undisclosed: undisclosed.length,
    // Evidence drill-down: can every returned citation be traced again by id?
    trace_resolved: t.resolved,
    trace_refused: t.rejected,
    trace_attempted: traceIds.length,
    trace_round_trip: ratio(t.resolved, traceIds.length),
    // Retrieval scope
    scope_disclosed: Boolean(first.data.coverage?.sections),
    omitted_ids_truncated: first.data.coverage?.evidence?.omitted_ids_truncated ?? null,
    omitted_reported: first.data.coverage ? Object.values(first.data.coverage.sections as Record<string, Any>).reduce((n, s) => n + (s.omitted ?? 0), 0) : null,
    // Epistemic labeling
    remodeling_evidence_marked_canon: evidence.filter((e) => e.repository?.endsWith('-remodeling') && CANON.has(e.status)).length,
    relations_marked_causal: ((first.data.relationships ?? []) as Any[]).filter((r) => r.is_causal_claim !== false).length,
    verified_steps_without_evidence: steps.filter((s) => s.evidence_status === 'VERIFIED' && !(s.evidence_ids ?? []).length).length,
    non_hypothesis_ideas: [...cards, ...candidates].filter((c) => !/^HYPOTH/.test(String(c.status))).length,
    // Idea material
    opportunity_cards: cards.length,
    exploration_candidates: candidates.length,
    candidates_with_two_independent_anchors: candidates.filter((c) => new Set((c.anchors ?? []).map((a: Any) => `${a.path}:${a.line ?? a.pointer}`)).size >= 2).length,
    candidates_with_alternatives_2plus: candidates.filter((c) => new Set((c.alternatives ?? []).map((a: Any) => a.mechanism)).size >= 2).length,
    candidates_with_disconfirmation: candidates.filter((c) => (c.disconfirmation_tests ?? []).length > 0).length,
    mechanism_steps_by_status: steps.reduce((m: Record<string, number>, s) => { m[s.evidence_status] = (m[s.evidence_status] ?? 0) + 1; return m; }, {}),
    distinct_mechanism_pairs: new Set(candidates.map((c) => (c.mechanisms ?? []).join('+'))).size,
    // Overlap with the curated cards (a proxy: low overlap is not creativity)
    candidate_anchors_not_on_any_returned_card: [...candidateAnchors].filter((a) => !cardAnchors.has(a)).length,
    mean_max_card_overlap: candidates.length ? Math.round((candidates.reduce((n, c) => n + (c.novelty_diagnostic?.max_card_overlap ?? 1), 0) / candidates.length) * 1000) / 1000 : null,
    candidates_restating_a_card: candidates.filter((c) => c.novelty_diagnostic?.restates_existing_card).length,
    withheld: exploration?.withheld ?? null,
  };
}

const snapshot = await service.snapshot();
const report: Any = { schema_version: 'rs-creative-quality-diagnostics.v1', artifacts_dir: path.relative(ROOT, dir).replaceAll('\\', '/'), snapshot, split, cases: [] };
for (const c of cases) {
  if (split !== 'all' && c.split !== split) continue;
  const runs = [];
  for (const r of c.runs) runs.push({ id: r.id, args: r.args, metrics: await measure(r.args) });
  report.cases.push({ id: c.id, split: c.split, domain: c.domain, runs });
}
const all = report.cases.flatMap((c: Any) => c.runs.map((r: Any) => r.metrics)) as Any[];
const sum = (k: string) => all.reduce((n, m) => n + (typeof m[k] === 'number' ? m[k] : 0), 0);
report.totals = {
  runs: all.length,
  deterministic_runs: all.filter((m) => m.deterministic).length,
  evidence_items: sum('evidence_items'),
  references_without_citation_in_response: sum('references_without_citation_in_response'),
  references_without_citation_and_undisclosed: sum('references_without_citation_and_undisclosed'),
  trace_attempted: sum('trace_attempted'),
  trace_resolved: sum('trace_resolved'),
  trace_refused: sum('trace_refused'),
  runs_with_scope_disclosed: all.filter((m) => m.scope_disclosed).length,
  remodeling_evidence_marked_canon: sum('remodeling_evidence_marked_canon'),
  relations_marked_causal: sum('relations_marked_causal'),
  verified_steps_without_evidence: sum('verified_steps_without_evidence'),
  non_hypothesis_ideas: sum('non_hypothesis_ideas'),
  opportunity_cards: sum('opportunity_cards'),
  exploration_candidates: sum('exploration_candidates'),
  candidates_with_two_independent_anchors: sum('candidates_with_two_independent_anchors'),
  candidate_anchors_not_on_any_returned_card: sum('candidate_anchors_not_on_any_returned_card'),
  candidates_restating_a_card: sum('candidates_restating_a_card'),
};
const text = `${JSON.stringify(report, null, 2)}\n`;
if (out) { fs.mkdirSync(path.dirname(path.resolve(ROOT, out)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, out), text); console.log(`wrote ${out}`); console.log(JSON.stringify(report.totals, null, 2)); } else process.stdout.write(text);
