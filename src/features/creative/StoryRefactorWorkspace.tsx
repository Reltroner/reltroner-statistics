import { useMemo, useState } from 'react';
import { m } from 'motion/react';
import { MotionRoot, useMotionTransition } from '../motion/MotionRoot.tsx';
import {
  PROPOSAL_REVIEW_STATUSES,
  REFACTOR_OPERATIONS,
  type ProposalReviewStatus,
  type StoryRefactoringPlan,
} from '../../domain/creative.ts';

interface Props {
  plans: StoryRefactoringPlan[];
}

export default function StoryRefactorWorkspace({ plans: initialPlans }: Props) {
  const transition = useMotionTransition('content');
  const [plans, setPlans] = useState<StoryRefactoringPlan[]>(initialPlans);
  const [opFilter, setOpFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string>(initialPlans[0]?.id ?? '');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const filtered = useMemo(
    () => plans.filter((p) => !opFilter || p.operation === opFilter),
    [plans, opFilter],
  );

  const active = useMemo(
    () => filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  const updateDecisionStatus = (status: ProposalReviewStatus) => {
    if (!active) return;
    if (status === 'RATIFIED_EXTERNALLY') {
      setStatusNotice(
        'Cannot mark a refactoring plan as RATIFIED_EXTERNALLY from the UI without verified commit evidence in Reltroner/reltroner-studio. Use APPROVED_FOR_AUTHORING to approve for authoring.',
      );
      return;
    }
    setPlans((prev) =>
      prev.map((p) => (p.id === active.id ? { ...p, decision_status: status, canon_status: 'PROPOSED' } : p)),
    );
    setStatusNotice(
      `Decision status set to ${status}. Canon status remains PROPOSED (non-destructive; source repositories are never modified directly).`,
    );
  };

  return (
    <MotionRoot>
      <div className="grid gap-6">
        <div className="rs-card flex flex-wrap items-end justify-between gap-4 p-4">
          <label className="min-w-[16rem]">
            <span className="rs-label">Filter by refactoring operation</span>
            <select className="rs-select w-full" value={opFilter} onChange={(e) => setOpFilter(e.target.value)}>
              <option value="">All refactoring operations ({plans.length})</option>
              {REFACTOR_OPERATIONS.map((op) => (
                <option key={op} value={op}>
                  {op.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-ink-3">
            Non-destructive guarantee: Refactoring plans generate structured before/after blueprints and impact analyses without mutating any repository file.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="rs-card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">
              Refactoring Blueprints ({filtered.length})
            </p>
            <ul className="grid gap-2">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(p.id);
                      setStatusNotice(null);
                    }}
                    className={`w-full rounded-xl border p-3 text-left text-xs transition-colors ${
                      active?.id === p.id
                        ? 'border-[var(--accent)] bg-accent-soft text-ink'
                        : 'border-line hover:bg-surface-2 text-ink-2'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-cyan">{p.id}</span>
                      <span className="rs-pill text-[0.65rem]">{p.decision_status}</span>
                    </div>
                    <p className="mt-1 font-semibold text-ink">{p.title}</p>
                    <p className="mt-1 font-mono text-[0.68rem] text-ink-3">{p.operation}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {active && (
            <m.div
              key={active.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition}
              className="rs-card grid gap-6 p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-cyan">{active.id}</span>
                    <span className="rs-pill">{active.operation}</span>
                    <span className="rs-pill">Decision: {active.decision_status}</span>
                    <span className="rs-pill">Canon: {active.canon_status} (UNRATIFIED)</span>
                  </div>
                  <h3 className="rs-h2 mt-2">{active.title}</h3>
                  <p className="mt-1 text-sm text-ink-2">{active.rationale}</p>
                </div>
                <a
                  href={`/reports?id=${encodeURIComponent(active.id)}`}
                  className="rs-button rs-button-primary !min-h-9 !px-3 !text-xs no-underline"
                >
                  Export Plan in 8 Formats →
                </a>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
                  <p className="rs-eyebrow">Before · Current Structure (Production Baseline)</p>
                  <p className="mt-2 leading-relaxed text-ink-2">{active.current_structure.summary}</p>
                  <ul className="mt-3 grid gap-2">
                    {active.current_structure.units.map((u, idx) => (
                      <li key={`${u.path}-${idx}`} className="rounded border border-line bg-[var(--bg)] p-2.5">
                        <p className="font-mono font-semibold text-ink">{u.path}</p>
                        <p className="mt-0.5 text-ink-2">{u.section}</p>
                        <p className="mt-0.5 text-[0.7rem] text-ink-3">
                          Role: {u.role} · ~{u.line_count} lines
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-[var(--accent)] bg-surface-2 p-4 text-xs">
                  <p className="rs-eyebrow">After · Proposed Structure (UNRATIFIED Blueprint)</p>
                  <p className="mt-2 leading-relaxed text-ink-2">{active.proposed_structure.summary}</p>
                  <ul className="mt-3 grid gap-2">
                    {active.proposed_structure.units.map((u, idx) => (
                      <li key={`${u.target}-${idx}`} className="rounded border border-line bg-[var(--bg)] p-2.5">
                        <p className="font-mono font-semibold text-cyan">{u.target}</p>
                        <p className="mt-0.5 font-semibold text-ink">{u.section}</p>
                        <p className="mt-0.5 text-ink-2">{u.action}</p>
                        <p className="mt-0.5 text-[0.7rem] text-ink-3">Rationale: {u.rationale}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-line p-4 text-xs">
                  <p className="rs-eyebrow">Expected Benefits</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
                    {active.expected_benefits.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-line p-4 text-xs">
                  <p className="rs-eyebrow">Possible Narrative Losses</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
                    {active.possible_narrative_losses.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-line p-4 text-xs">
                  <p className="rs-eyebrow">Canon Risks & Guardrails</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-2">
                    {active.canon_risks.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
                <p className="rs-eyebrow">Knowledge Graph Dependency Impact</p>
                <p className="mt-1 text-ink">{active.dependency_impact.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {active.dependency_impact.direct_nodes.map((n) => (
                    <span key={n} className="rounded bg-[var(--bg)] px-2 py-0.5 font-mono text-[0.7rem] text-cyan">
                      direct: {n}
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-line pt-4">
                <p className="rs-eyebrow mb-2">Creator Review Decision</p>
                <div className="flex flex-wrap gap-2">
                  {PROPOSAL_REVIEW_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => updateDecisionStatus(st)}
                      className={`rs-button !min-h-8 !px-2.5 !py-1 !text-xs ${
                        active.decision_status === st ? 'rs-button-primary' : 'rs-button-ghost'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                {statusNotice && (
                  <p className="mt-2 rounded border border-[var(--accent)] bg-accent-soft p-2.5 text-xs text-ink">
                    {statusNotice}
                  </p>
                )}
              </div>
            </m.div>
          )}
        </div>
      </div>
    </MotionRoot>
  );
}
