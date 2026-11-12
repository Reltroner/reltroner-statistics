import { useMemo, useState } from 'react';
import { m } from 'motion/react';
import { MotionRoot, useMotionTransition } from '../motion/MotionRoot.tsx';
import {
  NARRATIVE_AUDIT_CATEGORIES,
  NARRATIVE_FINDING_CLASSIFICATIONS,
  type NarrativeAuditFinding,
} from '../../domain/creative.ts';

interface Props {
  findings: NarrativeAuditFinding[];
}

export default function ConsistencyAuditExplorer({ findings }: Props) {
  const transition = useMotionTransition('content');
  const [query, setQuery] = useState('');
  const [clsFilter, setClsFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [defectFilter, setDefectFilter] = useState<'ALL' | 'DEFECT' | 'NON_DEFECT'>('ALL');
  const [selectedId, setSelectedId] = useState<string>(findings[0]?.id ?? '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return findings.filter((f) => {
      if (clsFilter && f.classification !== clsFilter) return false;
      if (catFilter && f.category !== catFilter) return false;
      if (defectFilter === 'DEFECT' && !f.is_defect) return false;
      if (defectFilter === 'NON_DEFECT' && f.is_defect) return false;
      if (!q) return true;
      return (
        f.id.toLowerCase().includes(q) ||
        f.title.toLowerCase().includes(q) ||
        f.conflict_hypothesis.toLowerCase().includes(q) ||
        f.storytelling_context.toLowerCase().includes(q) ||
        f.affected_entities.some((e) => e.toLowerCase().includes(q))
      );
    });
  }, [findings, query, clsFilter, catFilter, defectFilter]);

  const active = useMemo(
    () => filtered.find((f) => f.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  return (
    <MotionRoot>
      <div className="grid gap-6">
        <div className="rs-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="rs-label">Search audit findings</span>
            <input
              type="search"
              className="rs-input w-full"
              placeholder="ID, title, entity, or hypothesis…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span className="rs-label">Classification</span>
            <select className="rs-select w-full" value={clsFilter} onChange={(e) => setClsFilter(e.target.value)}>
              <option value="">All classifications ({findings.length})</option>
              {NARRATIVE_FINDING_CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {c.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="rs-label">Audit category</span>
            <select className="rs-select w-full" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">All 12 categories</option>
              {NARRATIVE_AUDIT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="rs-label">Defect vs. Storytelling Device</span>
            <select
              className="rs-select w-full"
              value={defectFilter}
              onChange={(e) => setDefectFilter(e.target.value as 'ALL' | 'DEFECT' | 'NON_DEFECT')}
            >
              <option value="ALL">All findings</option>
              <option value="NON_DEFECT">Intentional ambiguity / perspective / review candidate</option>
              <option value="DEFECT">Objective contradictions only</option>
            </select>
          </label>
        </div>

        <div className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
          <div className="rs-card flex flex-col p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">
              Showing {filtered.length} of {findings.length} audit evaluations
            </p>
            <ul className="max-h-[34rem] divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-line">
              {filtered.map((f) => {
                const isSelected = active?.id === f.id;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(f.id)}
                      className={`w-full px-3 py-3 text-left text-xs transition-colors ${
                        isSelected ? 'bg-accent-soft text-ink' : 'hover:bg-surface-2 text-ink-2'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-mono font-bold text-cyan">{f.id}</span>
                        <span className="rs-pill text-[0.65rem]">{f.classification}</span>
                      </div>
                      <p className="mt-1 font-semibold text-ink">{f.title}</p>
                      <p className="mt-1 font-mono text-[0.68rem] text-ink-3">
                        {f.category} · {f.is_defect ? 'OBJECTIVE DEFECT' : 'NON-DEFECT / STORYTELLING CONTEXT'}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {active ? (
            <m.div
              key={active.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={transition}
              className="rs-card grid gap-5 p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-cyan">{active.id}</span>
                    <span className="rs-pill">{active.classification}</span>
                    <span className="rs-pill">{active.category}</span>
                    <span className="rs-pill">Severity: {active.severity}</span>
                    <span className="rs-pill">
                      {active.is_defect ? 'Objective Defect' : 'Non-Defect / Narrative Device'}
                    </span>
                  </div>
                  <h3 className="rs-h2 mt-2">{active.title}</h3>
                </div>
                <a
                  href={`/reports?id=${encodeURIComponent(active.id)}`}
                  className="rs-button rs-button-primary !min-h-9 !px-3 !text-xs no-underline"
                >
                  Export Finding in Report Center →
                </a>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
                  <p className="rs-eyebrow">Conflict / Evaluation Hypothesis</p>
                  <p className="mt-2 leading-relaxed text-ink">{active.conflict_hypothesis}</p>
                </div>
                <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
                  <p className="rs-eyebrow">Storytelling Context & Epistemic Interpretation</p>
                  <p className="mt-2 leading-relaxed text-ink">{active.storytelling_context}</p>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
                <p className="rs-eyebrow">Creator Review Guidance</p>
                <p className="mt-1.5 text-ink-2">{active.review_guidance}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {active.affected_entities.map((entId) => (
                    <a
                      key={entId}
                      href={`/creative/explore?entity=${encodeURIComponent(entId)}`}
                      className="rounded bg-accent-soft px-2 py-1 font-mono text-[0.7rem] text-ink no-underline hover:underline"
                    >
                      {entId}
                    </a>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="rs-h3 text-sm">Passage Evidence ({active.passages.length})</h4>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {active.passages.map((p, idx) => (
                    <div key={`${p.path}-${idx}`} className="rounded-xl border border-line p-4 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-cyan">{p.side.toUpperCase()}</span>
                        <span className="font-mono text-[0.7rem] text-ink-3">{p.repository}</span>
                      </div>
                      <p className="mt-1 font-mono text-ink">
                        {p.path}
                        {p.line ? `:${p.line}` : ''} ({p.locator})
                      </p>
                      <p className="mt-0.5 font-mono text-[0.68rem] text-ink-3">
                        commit {p.commit_sha.slice(0, 10)} · blob {p.blob_sha.slice(0, 10)}
                      </p>
                      <blockquote className="mt-2 border-l-2 border-[var(--accent)] pl-2.5 italic text-ink-2">
                        “{p.quote}”
                      </blockquote>
                    </div>
                  ))}
                </div>
              </div>
            </m.div>
          ) : (
            <div className="rs-card p-6">
              <p className="text-sm text-ink-3">No audit findings match the selected filters.</p>
            </div>
          )}
        </div>
      </div>
    </MotionRoot>
  );
}
