import { useEffect, useMemo, useState } from 'react';
import { m } from 'motion/react';
import { MotionRoot, useMotionTransition } from '../motion/MotionRoot.tsx';
import type { KnowledgeGraph } from '../../domain/graph.ts';
import {
  simulateNarrativeImpact,
  type NarrativeEntity,
  type NarrativeRelationship,
  type RemodelingScenario,
} from '../../domain/creative.ts';

interface Props {
  scenarios: RemodelingScenario[];
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
  graph: KnowledgeGraph;
  defaultMode?: 'remodel' | 'impact';
}

export default function CanonRemodelLab({
  scenarios,
  entities,
  relationships,
  graph,
  defaultMode = 'remodel',
}: Props) {
  const transition = useMotionTransition('content');
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(scenarios[0]?.id ?? '');
  const [paramChoices, setParamChoices] = useState<Record<string, string>>({});
  const [originId, setOriginId] = useState<string>('nar:nation:reltronland');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const origin = params.get('origin');
    if (origin && (entities.some((e) => e.id === origin) || graph.nodes.some((n) => n.id === origin))) {
      setOriginId(origin);
    }
    if (window.location.hash) {
      const h = window.location.hash.replace(/^#/, '');
      if (scenarios.some((s) => s.id === h)) {
        setSelectedScenarioId(h);
      }
    }
  }, [entities, graph.nodes, scenarios]);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedScenarioId) ?? scenarios[0] ?? null,
    [scenarios, selectedScenarioId],
  );

  const simulatedImpact = useMemo(
    () => simulateNarrativeImpact(graph, entities, relationships, originId),
    [graph, entities, relationships, originId],
  );

  return (
    <MotionRoot>
      <div className="grid min-w-0 gap-10 [overflow-wrap:anywhere]">
        {/* Scenario Selector & Parameter Sandbox */}
        {activeScenario && (
          <section aria-labelledby="scenario-lab-h" className="rs-card grid min-w-0 gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rs-eyebrow">Isolated Remodeling Sandbox</span>
                  <span className="rs-pill">Status: {activeScenario.canon_status} (UNRATIFIED)</span>
                  <span className="rs-pill">Production Canon Unmodified</span>
                </div>
                <h3 id="scenario-lab-h" className="rs-h2 mt-2">
                  {activeScenario.title}
                </h3>
                <p className="mt-1 text-sm text-cyan">“{activeScenario.question}”</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/reports?id=${encodeURIComponent(activeScenario.id)}`}
                  className="rs-button rs-button-primary !min-h-9 !px-3 !text-xs no-underline"
                >
                  Export Scenario Comparison →
                </a>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedScenarioId(s.id)}
                  className={`rs-button !min-h-9 max-w-full !px-3 !text-xs !whitespace-normal text-left ${
                    activeScenario.id === s.id ? 'rs-button-primary' : 'rs-button-ghost'
                  }`}
                >
                  {s.title.split(':')[0]!.slice(0, 48)}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-4 text-xs">
                <p className="rs-eyebrow">1 · Verified Production Baseline (CANON_OBSERVED)</p>
                <p className="mt-2 leading-relaxed text-ink">{activeScenario.production_baseline.summary}</p>
                <ul className="mt-3 grid gap-2">
                  {activeScenario.production_baseline.anchors.map((a) => (
                    <li key={a.label} className="rounded border border-line bg-[var(--bg)] p-2.5">
                      <div className="flex flex-wrap justify-between gap-2">
                        <strong className="text-ink">{a.label}</strong>
                        <span className="rs-pill text-[0.65rem]">{a.status}</span>
                      </div>
                      <p className="mt-1 text-ink-2">{a.value}</p>
                      <p className="mt-0.5 break-all font-mono text-[0.68rem] text-ink-3">
                        {a.path} · {a.commit_sha.slice(0, 10)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="min-w-0 rounded-xl border border-[var(--accent)] bg-surface-2 p-4 text-xs">
                <p className="rs-eyebrow">2 · Remodeling Candidate Changes (PROPOSED / DRAFT)</p>
                <p className="mt-2 leading-relaxed text-ink">{activeScenario.remodeling_candidate.summary}</p>
                <ul className="mt-3 grid gap-2">
                  {activeScenario.remodeling_candidate.changes.map((c) => (
                    <li key={c.label} className="rounded border border-line bg-[var(--bg)] p-2.5">
                      <strong className="text-cyan">{c.label}</strong>
                      <p className="mt-1 text-ink-2">
                        <strong>Production:</strong> {c.production_value}
                      </p>
                      <p className="mt-0.5 text-ink">
                        <strong>Remodeling:</strong> {c.remodeling_value}
                      </p>
                      <p className="mt-0.5 break-all font-mono text-[0.68rem] text-ink-3">
                        {c.path} {c.finding_id ? `· Drift Finding ${c.finding_id}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Interactive Hypothetical Scenario Parameters */}
            <div>
              <h4 className="rs-h3 text-sm">3 · Interactive Scenario Parameters (Hypothetical Sandbox)</h4>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                {activeScenario.hypothetical_parameters.map((param) => {
                  const currentVal = paramChoices[param.id] ?? param.current_state;
                  const activeOpt = param.options.find((o) => o.value === currentVal) ?? param.options[0];
                  return (
                    <div key={param.id} className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
                      <label className="block">
                        <span className="rs-label">{param.label}</span>
                        <select
                          className="rs-select mt-1 w-full"
                          value={currentVal}
                          onChange={(e) => setParamChoices({ ...paramChoices, [param.id]: e.target.value })}
                        >
                          {param.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {activeOpt && <p className="mt-2 text-ink-2">{activeOpt.description}</p>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 8-Dimension Consequence Matrix */}
            <div>
              <h4 className="rs-h3 text-sm">
                4 · Multi-Dimension Consequence Matrix (Separating Verified Dependencies from Speculative Brainstorming)
              </h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {activeScenario.impact_dimensions.map((imp) => (
                  <div key={imp.dimension} className="rounded-xl border border-line p-4 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="font-mono font-bold text-cyan">{imp.dimension}</span>
                      <span className="rs-pill text-[0.65rem]">{imp.verification_tier}</span>
                    </div>
                    <p className="mt-2 leading-relaxed text-ink">{imp.summary}</p>
                    <p className="mt-1.5 text-ink-3">
                      <strong>Evidence / Constraint:</strong> {imp.evidence_or_constraint}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[0.68rem] text-ink-3">
                        Quantitative model: {imp.quantitative_status}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {imp.affected_nodes.slice(0, 3).map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setOriginId(n)}
                            className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[0.65rem] text-ink hover:underline"
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Interactive Node Consequence Simulator */}
        <section
          aria-labelledby="node-simulator-h"
          className={`rs-card grid gap-6 p-6 ${defaultMode === 'impact' ? 'order-first' : ''}`}
        >
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
            <div>
              <span className="rs-eyebrow">Narrative & Graph Consequence Simulator</span>
              <h3 id="node-simulator-h" className="rs-h2 mt-1">
                Trace Verified Direct, Transitive, Candidate & Speculative Impacts
              </h3>
              <p className="mt-1 text-sm text-ink-2">
                Select any narrative entity or knowledge-graph node to inspect what is mathematically or structurally dependent vs. what is a non-causal mention or speculative hypothesis.
              </p>
            </div>
            <label className="w-full min-w-0 sm:w-auto sm:min-w-[18rem]">
              <span className="rs-label">Origin entity or node</span>
              <select className="rs-select w-full" value={originId} onChange={(e) => setOriginId(e.target.value)}>
                {entities.slice(0, 120).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.kind} · {e.id})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <m.div
            key={simulatedImpact.origin_id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
            className="grid gap-4 lg:grid-cols-2"
          >
            <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="rs-eyebrow">Tier 1 · Verified Direct Dependencies ({simulatedImpact.verified_direct.length})</p>
                <span className="rs-pill text-[0.65rem]">VERIFIED_DIRECT_DEPENDENCY</span>
              </div>
              {simulatedImpact.verified_direct.length === 0 ? (
                <p className="mt-2 text-ink-3">No direct structural dependencies at depth 1.</p>
              ) : (
                <ul className="mt-2.5 grid gap-2">
                  {simulatedImpact.verified_direct.map((d) => (
                    <li key={`${d.id}-${d.edge_type}`} className="rounded border border-line bg-[var(--bg)] p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => setOriginId(d.id)}
                          className="text-left font-semibold text-ink underline hover:text-cyan"
                        >
                          {d.label}
                        </button>
                        <span className="font-mono text-[0.7rem] text-cyan">{d.edge_type}</span>
                      </div>
                      <p className="mt-1 text-ink-2">{d.rationale}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="rs-eyebrow">
                  Tier 2 · Verified Transitive Dependencies ({simulatedImpact.verified_transitive.length})
                </p>
                <span className="rs-pill text-[0.65rem]">VERIFIED_TRANSITIVE_DEPENDENCY</span>
              </div>
              {simulatedImpact.verified_transitive.length === 0 ? (
                <p className="mt-2 text-ink-3">No transitive dependencies at depth 2–3.</p>
              ) : (
                <ul className="mt-2.5 grid gap-2">
                  {simulatedImpact.verified_transitive.slice(0, 12).map((t) => (
                    <li key={`${t.id}-${t.depth}`} className="rounded border border-line bg-[var(--bg)] p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-semibold text-ink">{t.label}</span>
                        <span className="font-mono text-[0.7rem] text-cyan">
                          depth {t.depth} · {t.edge_type}
                        </span>
                      </div>
                      <p className="mt-1 break-all font-mono text-[0.68rem] text-ink-3">Path: {t.via.join(' → ')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="rs-eyebrow">
                  Tier 3 · Candidate / Co-Occurrence Links ({simulatedImpact.candidate_narrative.length})
                </p>
                <span className="rs-pill text-[0.65rem]">CANDIDATE_NARRATIVE_IMPACT</span>
              </div>
              <p className="mt-1 text-[0.7rem] text-ink-3">
                Includes MENTIONS, THEMATICALLY_RELATED, and CAUSES_CANDIDATE. Never treated as verified plot causality.
              </p>
              {simulatedImpact.candidate_narrative.length === 0 ? (
                <p className="mt-2 text-ink-3">No candidate co-occurrence or thematic links recorded.</p>
              ) : (
                <ul className="mt-2.5 grid gap-2">
                  {simulatedImpact.candidate_narrative.slice(0, 10).map((c, idx) => (
                    <li key={`${c.id}-${idx}`} className="rounded border border-line bg-[var(--bg)] p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-semibold text-ink">{c.label}</span>
                        <span className="font-mono text-[0.7rem] text-ink-3">{c.edge_type}</span>
                      </div>
                      <p className="mt-1 text-ink-2">{c.rationale}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="rs-eyebrow">Tier 4 · Speculative Brainstorming Dimensions</p>
                <span className="rs-pill text-[0.65rem]">SPECULATIVE_BRAINSTORMING</span>
              </div>
              <ul className="mt-2.5 grid gap-2">
                {simulatedImpact.speculative_brainstorming.map((sb) => (
                  <li key={sb.dimension} className="rounded border border-line bg-[var(--bg)] p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-mono font-semibold text-cyan">{sb.dimension}</span>
                      <span className="break-all font-mono text-[0.65rem] text-[var(--status-warning-text)]">
                        {sb.quantitative_status}
                      </span>
                    </div>
                    <p className="mt-1 text-ink-2">{sb.hypothesis}</p>
                  </li>
                ))}
              </ul>
            </div>
          </m.div>
        </section>
      </div>
    </MotionRoot>
  );
}
