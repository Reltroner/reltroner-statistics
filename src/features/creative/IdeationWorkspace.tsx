import { useEffect, useMemo, useState } from 'react';
import { m } from 'motion/react';
import { MotionRoot, useMotionTransition } from '../motion/MotionRoot.tsx';
import {
  PROPOSAL_REVIEW_STATUSES,
  transitionProposalStatus,
  type AiAdapterStatus,
  type CreativeOpportunity,
  type CreativeProposal,
  type NarrativeEntity,
  type NarrativeRelationship,
  type ProposalReviewStatus,
  type RemodelingScenario,
} from '../../domain/creative.ts';
import { generateDeterministicIdeation } from '../../engine/creative-intelligence/ai-adapter.ts';
import { proposalToFinding } from '../../export/creative-reports.ts';
import { buildReportDocument, type ReportContext } from '../../export/model.ts';
import { MIME, renderFormat } from '../../export/bundle.ts';
import { saveBytes } from '../reports/download.ts';

const PRIVATE_SESSION_KEY = 'rs-private-creative-proposals-v1';

interface Props {
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
  opportunities: CreativeOpportunity[];
  scenarios: RemodelingScenario[];
  seedProposals: CreativeProposal[];
  aiAdapter: AiAdapterStatus;
  reportContext: ReportContext;
}

export default function IdeationWorkspace({
  entities,
  relationships,
  opportunities,
  scenarios,
  seedProposals,
  aiAdapter,
  reportContext,
}: Props) {
  const transition = useMotionTransition('content');
  const [query, setQuery] = useState('Reltronland and Depcutland cooperating against Henchoway and Nytherion Abyss');
  const [focusIds, setFocusIds] = useState<string[]>([
    'nar:nation:reltronland',
    'nar:nation:depcutland',
    'nar:faction:henchoway',
  ]);
  const [proposals, setProposals] = useState<CreativeProposal[]>(seedProposals);
  const [selectedProposalId, setSelectedProposalId] = useState<string>(seedProposals[0]?.proposal_id ?? '');
  const [guardrailMessage, setGuardrailMessage] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newHypothesis, setNewHypothesis] = useState('');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ent = params.get('entity');
    if (ent && entities.some((e) => e.id === ent)) {
      const target = entities.find((e) => e.id === ent)!;
      setFocusIds([ent]);
      setQuery(`Narrative tensions and institutional constraints around ${target.name}`);
    }
    try {
      const saved = sessionStorage.getItem(PRIVATE_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CreativeProposal[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProposals([...seedProposals, ...parsed]);
        }
      }
    } catch {
      /* ignore session storage errors */
    }
  }, [entities, seedProposals]);

  const ideationResult = useMemo(
    () =>
      generateDeterministicIdeation({
        query,
        focusEntityIds: focusIds,
        entities,
        relationships,
        opportunities,
        scenarios,
      }),
    [query, focusIds, entities, relationships, opportunities, scenarios],
  );

  const relDepCaseStudy = useMemo(
    () =>
      scenarios.find((s) => s.title.includes('Reltronland & Depcutland')) ??
      scenarios.find((s) => s.focus_entities.includes('nar:nation:reltronland') && s.focus_entities.includes('nar:nation:depcutland')) ??
      scenarios[0] ??
      null,
    [scenarios],
  );

  const activeProposal = useMemo(
    () => proposals.find((p) => p.proposal_id === selectedProposalId) ?? proposals[0] ?? null,
    [proposals, selectedProposalId],
  );

  const handleStatusChange = (status: ProposalReviewStatus) => {
    if (!activeProposal) return;
    setGuardrailMessage(null);
    try {
      const updated = transitionProposalStatus(activeProposal, status, {
        updatedAt: new Date().toISOString(),
      });
      setProposals((prev) => prev.map((p) => (p.proposal_id === updated.proposal_id ? updated : p)));
      if (status === 'APPROVED_FOR_AUTHORING') {
        setGuardrailMessage(
          `Status updated to APPROVED_FOR_AUTHORING. Canon status remains ${updated.canon_status} (UNRATIFIED) until committed to Reltroner/reltroner-studio.`,
        );
      }
    } catch (e) {
      setGuardrailMessage((e as Error).message);
    }
  };

  const handleCreatePrivateDraft = () => {
    if (!newTitle.trim() || !newHypothesis.trim()) return;
    const id = `PRP-PRIV${Math.random().toString(16).slice(2, 10).toUpperCase().padEnd(8, '0')}`;
    const now = new Date().toISOString();
    const draft: CreativeProposal = {
      proposal_id: id,
      schema_version: 'reltroner-creative-proposal.v1',
      title: newTitle.trim(),
      intent: query.trim() || 'Private in-memory creator brainstorming draft',
      proposal_type: 'NARRATIVE_IDEATION',
      visibility: 'PRIVATE_LOCAL_SESSION',
      originating_entities: focusIds.length ? focusIds : ['nar:world:asthortera'],
      source_references: [
        {
          repository: 'Reltroner/reltroner-studio',
          side: 'production',
          commit_sha: reportContext.production.commit_sha,
          path: 'content/factions/reltronland-vs-depcutland.md',
          blob_sha: null,
          line: 1,
          quote: 'Grounded in pinned production snapshot.',
        },
      ],
      production_source_sha: reportContext.production.commit_sha,
      remodeling_source_sha: reportContext.remodeling.commit_sha,
      historical_context: 'Private creator exploration session (stored only in browser memory/sessionStorage; never published to static artifacts).',
      existing_constraints: ideationResult.verified_constraints.slice(0, 4),
      narrative_hypothesis: newHypothesis.trim(),
      alternatives: ideationResult.grounded_hypotheses.slice(0, 2).map((h, i) => ({
        id: `priv-alt-${i + 1}`,
        title: h.title,
        summary: h.premise,
        pros: ['Grounded in local knowledge graph constraints'],
        cons: [h.risk_guardrail],
      })),
      assumptions: ['Private exploratory hypothesis; not ratified canon.'],
      potential_impacts: focusIds.map((fid) => ({
        target_id: fid,
        tier: 'CANDIDATE_IMPACT',
        detail: 'Selected focus entity in private ideation workspace.',
      })),
      consistency_risks: ideationResult.verified_constraints.slice(0, 2),
      creator_notes: newNotes.trim() || 'Private local session draft — do not publish in public static builds.',
      review_status: 'IDEA',
      canon_status: 'PROPOSED',
      ratification_evidence: null,
      content_digest: '0'.repeat(64),
      created_at: now,
      updated_at: now,
    };

    const next = [...proposals, draft];
    setProposals(next);
    setSelectedProposalId(draft.proposal_id);
    setNewTitle('');
    setNewHypothesis('');
    setNewNotes('');
    try {
      const privOnly = next.filter((p) => p.visibility === 'PRIVATE_LOCAL_SESSION');
      sessionStorage.setItem(PRIVATE_SESSION_KEY, JSON.stringify(privOnly));
    } catch {
      /* ignore */
    }
  };

  const exportProposalPackageJson = (p: CreativeProposal) => {
    const bytes = new TextEncoder().encode(`${JSON.stringify(p, null, 2)}\n`);
    saveBytes(bytes, `${p.proposal_id}.proposal.json`, 'application/json');
  };

  const exportProposalFormat = (p: CreativeProposal, fmt: 'json' | 'csv' | 'xlsx' | 'txt' | 'md' | 'html' | 'xml') => {
    const finding = proposalToFinding(p);
    const doc = buildReportDocument(reportContext, [finding], 'single');
    const bytes = renderFormat(doc, fmt);
    saveBytes(bytes, `${p.proposal_id}.${fmt}`, MIME[fmt]);
  };

  return (
    <MotionRoot>
      <div className="grid gap-10">
        {/* Privacy & AI Adapter Status Banner */}
        <div className="rs-card flex flex-wrap items-center justify-between gap-4 border-l-4 !border-l-[var(--cyan)] p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rs-eyebrow">Privacy & AI Boundary</span>
              <span className="rs-pill">{aiAdapter.mode}</span>
              <span className="rs-pill">{aiAdapter.privacy_boundary}</span>
            </div>
            <p className="mt-1 text-xs text-ink-2">{aiAdapter.reason}</p>
          </div>
          <span className="rs-pill font-mono text-xs">External LLM API Required: NO</span>
        </div>

        {/* Section 6 Benchmark Case Study: Reltronland / Depcutland */}
        {relDepCaseStudy && (
          <section aria-labelledby="case-study-h" className="rs-card grid gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rs-eyebrow">Benchmark Case Study · Section 6</span>
                  <span className="rs-pill">Status: {relDepCaseStudy.canon_status} (UNRATIFIED)</span>
                </div>
                <h3 id="case-study-h" className="rs-h2 mt-2">
                  {relDepCaseStudy.title}
                </h3>
                <p className="mt-1 text-sm font-semibold text-cyan">“{relDepCaseStudy.question}”</p>
              </div>
              <a
                href={`/reports?id=${encodeURIComponent(relDepCaseStudy.id)}`}
                className="rs-button rs-button-primary !min-h-9 !px-3 !text-xs no-underline"
              >
                Export Case Study in 8 Formats →
              </a>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <h4 className="rs-h3 text-sm">1 · Verified Production Source Anchors (CANON_OBSERVED)</h4>
                <p className="mt-2 text-xs leading-relaxed text-ink-2">{relDepCaseStudy.production_baseline.summary}</p>
                <ul className="mt-3 grid gap-2 text-xs">
                  {relDepCaseStudy.production_baseline.anchors.map((a) => (
                    <li key={a.label} className="rounded border border-line bg-[var(--bg)] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-ink">{a.label}</strong>
                        <span className="rs-pill text-[0.65rem]">{a.status}</span>
                      </div>
                      <p className="mt-1 text-ink-2">{a.value}</p>
                      <p className="mt-1 font-mono text-[0.68rem] text-ink-3">
                        {a.path}
                        {a.line ? `:${a.line}` : ''} · commit {a.commit_sha.slice(0, 10)} · blob {a.blob_sha.slice(0, 10)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <h4 className="rs-h3 text-sm">2 · Evidenced Actor & Institutional Perspectives</h4>
                <ul className="mt-3 grid gap-2.5 text-xs">
                  {relDepCaseStudy.perspectives.map((p) => (
                    <li key={p.actor_id} className="rounded border border-line bg-[var(--bg)] p-3">
                      <p className="font-semibold text-ink">{p.actor_name}</p>
                      <p className="mt-1 text-ink-2">
                        <strong>Stance:</strong> {p.stance}
                      </p>
                      <p className="mt-1 text-ink-2">
                        <strong>Fear / Constraint:</strong> {p.fear_or_constraint}
                      </p>
                      <blockquote className="mt-1.5 border-l-2 border-[var(--accent)] pl-2 italic text-ink-3">
                        “{p.evidence_quote}” ({p.source_path}
                        {p.evidence_line ? `:${p.evidence_line}` : ''})
                      </blockquote>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {relDepCaseStudy.alternatives.map((alt) => (
                <div key={alt.id} className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
                  <span className="rs-eyebrow">Plausible Alternative · SCENARIO</span>
                  <h4 className="mt-1 text-sm font-semibold text-ink">{alt.title}</h4>
                  <p className="mt-2 text-ink-2">
                    <strong>Premise:</strong> {alt.premise}
                  </p>
                  <p className="mt-1.5 text-ink-2">
                    <strong>Mechanism:</strong> {alt.institutional_mechanism}
                  </p>
                  <p className="mt-1.5 text-cyan">
                    <strong>Narrative Payoff:</strong> {alt.narrative_payoff}
                  </p>
                  <p className="mt-1.5 text-[var(--status-warning-text)]">
                    <strong>Guardrail:</strong> {alt.contradiction_risks.join(' ')}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-line p-4 text-xs">
                <p className="rs-eyebrow">Hard Canon Guardrails & Contradictions to Avoid</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
                  {relDepCaseStudy.potential_contradictions.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-line p-4 text-xs">
                <p className="rs-eyebrow">Speculative Assumptions (Unratified)</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
                  {relDepCaseStudy.speculative_assumptions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Deterministic Graph-Grounded Ideation Engine */}
        <section aria-labelledby="ideation-engine-h" className="rs-card grid gap-5 p-6">
          <div>
            <span className="rs-eyebrow">Deterministic Graph-Grounded Ideation</span>
            <h3 id="ideation-engine-h" className="rs-h2 mt-1">
              Explore Narrative Questions Against Established Worldbuilding
            </h3>
            <p className="mt-1 text-sm text-ink-2">
              Enter any creative question or toggle focus entities. The engine retrieves verified constraints and generates source-anchored hypotheses locally without external AI calls.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
            <label>
              <span className="rs-label">Creative question or story prompt</span>
              <input
                type="text"
                className="rs-input w-full"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask a worldbuilding or story question…"
              />
            </label>
            <label>
              <span className="rs-label">Add focus entity</span>
              <select
                className="rs-select w-full"
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && !focusIds.includes(val)) setFocusIds([...focusIds, val]);
                }}
              >
                <option value="">+ Select entity to focus…</option>
                {entities.slice(0, 80).map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name} ({ent.kind})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-3">Active focus entities:</span>
            {focusIds.map((fid) => {
              const ent = entities.find((e) => e.id === fid);
              return (
                <button
                  key={fid}
                  type="button"
                  onClick={() => setFocusIds(focusIds.filter((x) => x !== fid))}
                  className="rs-pill flex items-center gap-1.5 text-xs hover:border-[var(--accent)]"
                  title="Remove entity from focus"
                >
                  <span>{ent?.name ?? fid}</span>
                  <span aria-hidden="true">×</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
              <div className="flex items-center justify-between">
                <p className="rs-eyebrow">Verified Constraints From Graph ({ideationResult.verified_constraints.length})</p>
                <span className="rs-pill text-[0.65rem]">{ideationResult.epistemic_label}</span>
              </div>
              <ul className="mt-2.5 space-y-1.5 text-ink-2">
                {ideationResult.verified_constraints.map((c) => (
                  <li key={c} className="rounded bg-[var(--bg)] p-2 font-mono text-[0.72rem]">
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
              <p className="rs-eyebrow">Source-Anchored Brainstorming Hypotheses ({ideationResult.grounded_hypotheses.length})</p>
              <ul className="mt-2.5 space-y-2.5">
                {ideationResult.grounded_hypotheses.map((h) => (
                  <li key={h.title} className="rounded border border-line bg-[var(--bg)] p-3">
                    <p className="font-semibold text-ink">{h.title}</p>
                    <p className="mt-1 text-ink-2">{h.premise}</p>
                    <p className="mt-1 text-[var(--status-warning-text)]">
                      <strong>Guardrail:</strong> {h.risk_guardrail}
                    </p>
                    <p className="mt-1 font-mono text-[0.68rem] text-ink-3">Sources: {h.supporting_sources.join(', ')}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Proposal Review Controls & Private Local Session Composer */}
        <section aria-labelledby="proposal-manager-h" className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="rs-card flex flex-col gap-4 p-5">
            <div>
              <span className="rs-eyebrow">Creative Proposals</span>
              <h3 id="proposal-manager-h" className="rs-h3 mt-1">
                Seed & Private Session Proposals
              </h3>
              <p className="mt-1 text-xs text-ink-3">
                Public observatory fixtures are pre-built from source snapshots. Private session drafts stay exclusively in your browser memory.
              </p>
            </div>

            <ul className="grid gap-2">
              {proposals.map((p) => (
                <li key={p.proposal_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProposalId(p.proposal_id);
                      setGuardrailMessage(null);
                    }}
                    className={`w-full rounded-xl border p-3 text-left text-xs transition-colors ${
                      activeProposal?.proposal_id === p.proposal_id
                        ? 'border-[var(--accent)] bg-accent-soft text-ink'
                        : 'border-line hover:bg-surface-2 text-ink-2'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-cyan">{p.proposal_id}</span>
                      <span className="rs-pill text-[0.65rem]">
                        {p.visibility === 'PRIVATE_LOCAL_SESSION' ? 'PRIVATE LOCAL' : 'PUBLIC FIXTURE'}
                      </span>
                    </div>
                    <p className="mt-1 font-semibold text-ink">{p.title}</p>
                    <p className="mt-1 text-[0.7rem] text-ink-3">
                      Review: <strong>{p.review_status}</strong> · Canon: <strong>{p.canon_status} (UNRATIFIED)</strong>
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="border-t border-line pt-4">
              <p className="rs-eyebrow mb-2">New Private In-Memory Draft</p>
              <div className="grid gap-2.5 text-xs">
                <label>
                  <span className="rs-label">Draft title</span>
                  <input
                    type="text"
                    className="rs-input w-full"
                    placeholder="e.g., Season 31 Neutral Clearing Escrow Arc"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </label>
                <label>
                  <span className="rs-label">Narrative hypothesis</span>
                  <textarea
                    rows={3}
                    className="rs-input w-full"
                    placeholder="Describe the proposed storyline or structural hypothesis…"
                    value={newHypothesis}
                    onChange={(e) => setNewHypothesis(e.target.value)}
                  />
                </label>
                <label>
                  <span className="rs-label">Creator notes (private)</span>
                  <input
                    type="text"
                    className="rs-input w-full"
                    placeholder="Optional private notes…"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="rs-button rs-button-primary mt-1 w-full !text-xs"
                  disabled={!newTitle.trim() || !newHypothesis.trim()}
                  onClick={handleCreatePrivateDraft}
                >
                  Save Private Session Proposal (Local Memory Only)
                </button>
              </div>
            </div>
          </div>

          {activeProposal && (
            <m.div
              key={activeProposal.proposal_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition}
              className="rs-card grid gap-5 p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-cyan">{activeProposal.proposal_id}</span>
                    <span className="rs-pill">{activeProposal.proposal_type}</span>
                    <span className="rs-pill">{activeProposal.visibility}</span>
                    <span className="rs-pill">Canon: {activeProposal.canon_status} (UNRATIFIED)</span>
                  </div>
                  <h4 className="rs-h2 mt-2">{activeProposal.title}</h4>
                  <p className="mt-1 text-sm text-ink-2">{activeProposal.intent}</p>
                </div>
              </div>

              {activeProposal.visibility === 'PRIVATE_LOCAL_SESSION' && (
                <div className="rs-notice" data-tone="warning">
                  <strong>Private Workspace Isolation Active:</strong> This proposal exists only in your local browser session (`PRIVATE_LOCAL_SESSION`). It is never written to static build artifacts, public search indexes, or external servers. Exporting it saves a local file to your machine—handle exported private ideas carefully.
                </div>
              )}

              <div>
                <p className="rs-eyebrow mb-2">Creator Review Status & Ratification Guardrail</p>
                <div className="flex flex-wrap gap-2">
                  {PROPOSAL_REVIEW_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleStatusChange(st)}
                      className={`rs-button !min-h-8 !px-2.5 !py-1 !text-xs ${
                        activeProposal.review_status === st ? 'rs-button-primary' : 'rs-button-ghost'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                {guardrailMessage && (
                  <p
                    role="status"
                    className="mt-2.5 rounded-lg border border-[var(--accent)] bg-accent-soft p-3 text-xs text-ink"
                  >
                    {guardrailMessage}
                  </p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
                  <p className="rs-eyebrow">Narrative Hypothesis</p>
                  <p className="mt-2 leading-relaxed text-ink">{activeProposal.narrative_hypothesis}</p>
                  <p className="rs-eyebrow mt-4">Creator Notes</p>
                  <p className="mt-1 text-ink-2">{activeProposal.creator_notes}</p>
                </div>

                <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
                  <p className="rs-eyebrow">Existing Canon Constraints & Risks</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
                    {activeProposal.existing_constraints.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p className="rs-eyebrow mt-4">Pinned Source SHAs</p>
                  <p className="mt-1 font-mono text-[0.7rem] text-ink-3">
                    production: {activeProposal.production_source_sha.slice(0, 12)} · remodeling:{' '}
                    {activeProposal.remodeling_source_sha.slice(0, 12)}
                  </p>
                </div>
              </div>

              <div className="border-t border-line pt-4">
                <p className="rs-eyebrow mb-2">Export Proposal Package (All Formats Carry Explicit UNRATIFIED Notice)</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rs-button rs-button-primary !min-h-9 !px-3 !text-xs"
                    onClick={() => exportProposalPackageJson(activeProposal)}
                  >
                    Download Proposal Schema (.proposal.json)
                  </button>
                  {(['json', 'md', 'html', 'txt', 'csv', 'xlsx', 'xml'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      className="rs-button rs-button-ghost !min-h-9 !px-2.5 !text-xs uppercase"
                      onClick={() => exportProposalFormat(activeProposal, fmt)}
                    >
                      .{fmt}
                    </button>
                  ))}
                  {activeProposal.visibility === 'PUBLIC_OBSERVATORY_FIXTURE' && (
                    <a
                      href={`/reports?id=${encodeURIComponent(activeProposal.proposal_id)}`}
                      className="rs-button rs-button-ghost !min-h-9 !px-3 !text-xs no-underline"
                    >
                      Open in Report Center (+ PDF) →
                    </a>
                  )}
                </div>
              </div>
            </m.div>
          )}
        </section>
      </div>
    </MotionRoot>
  );
}
