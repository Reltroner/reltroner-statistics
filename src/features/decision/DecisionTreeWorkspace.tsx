import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { m } from 'motion/react';
import { MotionRoot, useMotionTransition } from '../motion/MotionRoot.tsx';
import {
  transitionDecisionReview,
  type DecisionBranch,
  type DecisionEvidence,
  type DecisionFact,
  type DecisionNode,
  type DecisionTree,
} from '../../domain/decision.ts';
import { PROPOSAL_REVIEW_STATUSES, type ProposalReviewStatus } from '../../domain/creative.ts';
import { evaluateDecisionTree, type DecisionPathResult } from '../../engine/decision-intelligence/evaluate.ts';
import type { CaseEvaluation, PathSummary } from '../../engine/decision-intelligence/index.ts';
import { decisionPathToReportFinding, decisionTreeToReportFinding } from '../../export/decision-reports.ts';
import { buildReportDocument, pinnedUrl, type ReportContext } from '../../export/model.ts';
import { MIME, renderFormat } from '../../export/bundle.ts';
import { saveBytes } from '../reports/download.ts';

const PRIVATE_REVIEW_KEY = 'rs-private-decision-reviews-v1';

interface PrivateReviewState {
  status: ProposalReviewStatus;
  notes: string;
}

interface Props {
  trees: DecisionTree[];
  modelTrees?: DecisionTree[];
  paths: PathSummary[];
  evaluations: CaseEvaluation[];
  reportContext: ReportContext;
}

function nodeTone(type: DecisionNode['type'], active: boolean): string {
  if (active) return 'border-[var(--accent)] bg-accent-soft text-ink shadow-sm';
  if (type === 'INSUFFICIENT_DATA') return 'border-[var(--status-warning-border)] bg-surface-2 text-ink-2';
  if (type === 'DECISION' || type === 'REVIEW_GATE') return 'border-[var(--cyan)]/60 bg-surface text-ink';
  return 'border-line bg-surface text-ink-2';
}

function outcomeBadgeClass(cls: string | undefined | null): string {
  if (cls === 'VERIFIED_SOURCE_GROUNDED') return 'text-[var(--status-canon-text)]';
  if (cls === 'DEPENDENCY_SUPPORTED') return 'text-cyan';
  if (cls === 'REVIEW_RECOMMENDATION') return 'text-[var(--status-warning-text)]';
  return 'text-ink-2';
}

export default function DecisionTreeWorkspace({
  trees,
  modelTrees = [],
  paths,
  evaluations,
  reportContext,
}: Props) {
  const allTrees = useMemo(() => [...trees, ...modelTrees], [trees, modelTrees]);
  const transition = useMotionTransition('content');

  const [selectedTreeId, setSelectedTreeId] = useState<string>(allTrees[0]?.tree_id ?? '');
  const [viewMode, setViewMode] = useState<'diagram' | 'outline'>('diagram');
  const [selectedEvalId, setSelectedEvalId] = useState<string>('');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [choiceOrder, setChoiceOrder] = useState<string[]>([]);
  const [unknownFacts, setUnknownFacts] = useState<Set<string>>(new Set());
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState<string>('');
  const [privateReviews, setPrivateReviews] = useState<Record<string, PrivateReviewState>>({});
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [guardrailMessage, setGuardrailMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tree');
    if (t && allTrees.some((x) => x.tree_id === t)) {
      setSelectedTreeId(t);
    }
    try {
      const saved = sessionStorage.getItem(PRIVATE_REVIEW_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, PrivateReviewState>;
        if (parsed && typeof parsed === 'object') setPrivateReviews(parsed);
      }
    } catch {
      /* ignore session storage errors */
    }
  }, [allTrees]);

  const activeTree = useMemo(
    () => allTrees.find((t) => t.tree_id === selectedTreeId) ?? allTrees[0] ?? null,
    [allTrees, selectedTreeId],
  );

  const treeEvaluations = useMemo(
    () => (activeTree ? evaluations.filter((e) => e.tree_id === activeTree.tree_id) : []),
    [evaluations, activeTree],
  );

  const treePaths = useMemo(
    () => (activeTree ? paths.filter((p) => p.tree_id === activeTree.tree_id) : []),
    [paths, activeTree],
  );

  const activeEvaluation = useMemo(
    () => treeEvaluations.find((e) => e.evaluation_id === selectedEvalId) ?? null,
    [treeEvaluations, selectedEvalId],
  );

  // Sync draft note input when tree changes.
  useEffect(() => {
    if (!activeTree) return;
    setNoteDraft(privateReviews[activeTree.tree_id]?.notes ?? '');
  }, [activeTree?.tree_id]);

  const selectTree = (id: string) => {
    setSelectedTreeId(id);
    setSelectedEvalId('');
    setChoices({});
    setChoiceOrder([]);
    setUnknownFacts(new Set());
    setCollapsedNodes(new Set());
    setFocusedNodeId('');
    setGuardrailMessage(null);
  };

  const effectiveFacts = useMemo<Record<string, DecisionFact>>(() => {
    if (!activeTree) return {};
    const base = { ...(activeEvaluation ? activeEvaluation.facts : activeTree.facts) };
    for (const fk of unknownFacts) {
      base[fk] = {
        state: 'NULL',
        value: null,
        unit: base[fk]?.unit ?? null,
        period: null,
        canon_status: 'INSUFFICIENT_DATA',
        source: 'Interactive unknown simulation (local exploration)',
        evidence_ids: [],
      };
    }
    return base;
  }, [activeTree, activeEvaluation, unknownFacts]);

  const evalResult: DecisionPathResult | null = useMemo(() => {
    if (!activeTree) return null;
    return evaluateDecisionTree(activeTree, { choices, facts: effectiveFacts });
  }, [activeTree, choices, effectiveFacts]);

  const childrenByNode = useMemo(() => {
    const map = new Map<string, DecisionBranch[]>();
    if (!activeTree) return map;
    for (const b of activeTree.branches) {
      const list = map.get(b.from) ?? [];
      list.push(b);
      map.set(b.from, list);
    }
    return map;
  }, [activeTree]);

  const nodeById = useMemo(
    () => new Map((activeTree?.nodes ?? []).map((n) => [n.id, n])),
    [activeTree],
  );

  const evidenceById = useMemo(
    () => new Map((activeTree?.evidence ?? []).map((e) => [e.id, e])),
    [activeTree],
  );

  // BFS depth layers respecting expanded/collapsed subtrees.
  const layers = useMemo(() => {
    if (!activeTree) return [] as Array<{ depth: number; nodes: DecisionNode[] }>;
    const levels: DecisionNode[][] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: activeTree.root_node_id, depth: 0 }];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (seen.has(cur.id)) continue;
      seen.add(cur.id);
      const node = nodeById.get(cur.id);
      if (!node) continue;
      (levels[cur.depth] ??= []).push(node);
      if (collapsedNodes.has(cur.id)) continue;
      for (const b of childrenByNode.get(cur.id) ?? []) {
        queue.push({ id: b.to, depth: cur.depth + 1 });
      }
    }
    return levels.map((nodes, depth) => ({ depth, nodes }));
  }, [activeTree, nodeById, childrenByNode, collapsedNodes]);

  if (!activeTree || !evalResult) {
    return <p className="rs-notice" data-tone="unavailable">No decision trees are available in the current artifact build.</p>;
  }

  const visitedSet = new Set(evalResult.visited);
  const takenBranchSet = new Set(evalResult.branches_taken);
  const defaultFocusId = evalResult.outcome_node_id ?? evalResult.pending?.node_id ?? evalResult.visited.at(-1) ?? activeTree.root_node_id;
  const focusedNode = nodeById.get(focusedNodeId) ?? nodeById.get(defaultFocusId) ?? activeTree.nodes[0]!;
  const focusedEvidence = focusedNode.evidence_ids.map((id) => evidenceById.get(id)).filter((e): e is DecisionEvidence => !!e);
  const consultedEvidence = evalResult.evidence_consulted.map((id) => evidenceById.get(id)).filter((e): e is DecisionEvidence => !!e);
  const focusedLinks = activeTree.links.filter((l) => l.node_id === focusedNode.id);

  const chooseBranch = (nodeId: string, branchId: string) => {
    setChoices((prev) => ({ ...prev, [nodeId]: branchId }));
    setChoiceOrder((prev) => [...prev.filter((id) => id !== nodeId), nodeId]);
    setFocusedNodeId('');
  };

  const backtrack = () => {
    if (choiceOrder.length === 0) return;
    const lastNode = choiceOrder[choiceOrder.length - 1]!;
    setChoiceOrder((prev) => prev.slice(0, -1));
    setChoices((prev) => {
      const next = { ...prev };
      delete next[lastNode];
      return next;
    });
    setFocusedNodeId(lastNode);
  };

  const resetPath = () => {
    setChoices({});
    setChoiceOrder([]);
    setUnknownFacts(new Set());
    setFocusedNodeId('');
  };

  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const toggleUnknownFact = (factKey: string) => {
    setUnknownFacts((prev) => {
      const next = new Set(prev);
      if (next.has(factKey)) next.delete(factKey);
      else next.add(factKey);
      return next;
    });
  };

  const loadAlternativePath = (p: PathSummary) => {
    const keys = Object.keys(p.choices);
    setChoices(p.choices);
    setChoiceOrder(keys);
    setUnknownFacts(new Set());
    setFocusedNodeId(p.outcome_node_id ?? '');
  };

  const persistReviews = (next: Record<string, PrivateReviewState>) => {
    setPrivateReviews(next);
    try {
      if (Object.keys(next).length > 0) sessionStorage.setItem(PRIVATE_REVIEW_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(PRIVATE_REVIEW_KEY);
    } catch {
      /* ignore session storage errors */
    }
  };

  const savedReview = privateReviews[activeTree.tree_id];
  const currentReviewStatus = savedReview?.status ?? activeTree.creator_review_status;

  const handleReviewTransition = (nextStatus: ProposalReviewStatus) => {
    setGuardrailMessage(null);
    try {
      const res = transitionDecisionReview(currentReviewStatus, nextStatus);
      persistReviews({
        ...privateReviews,
        [activeTree.tree_id]: { status: res.status, notes: noteDraft },
      });
      setGuardrailMessage(
        `Local review status updated to ${res.status}. Canon status remains ${activeTree.canon_status} (UNRATIFIED); no repository file was modified.`,
      );
    } catch (e) {
      setGuardrailMessage((e as Error).message);
    }
  };

  const handleSaveNotes = () => {
    persistReviews({
      ...privateReviews,
      [activeTree.tree_id]: { status: currentReviewStatus, notes: noteDraft },
    });
    setGuardrailMessage('Saved private creator notes to browser sessionStorage (PRIVATE_LOCAL_SESSION only).');
  };

  const handleDiscardPrivateReview = () => {
    const next = { ...privateReviews };
    delete next[activeTree.tree_id];
    persistReviews(next);
    setNoteDraft('');
    setGuardrailMessage(`Cleared local session review state for ${activeTree.tree_id}.`);
  };

  const exportTreeFormat = (fmt: 'json' | 'csv' | 'xlsx' | 'txt' | 'md' | 'html' | 'xml') => {
    const hasPrivate = !!savedReview;
    const finding = decisionTreeToReportFinding(activeTree, {
      pathResult: evalResult,
      pathSummaries: treePaths,
      reviewOverride: hasPrivate
        ? { status: currentReviewStatus, notes: savedReview.notes, visibility: 'PRIVATE_LOCAL_SESSION' }
        : undefined,
    });
    const doc = buildReportDocument(reportContext, [finding], 'single');
    saveBytes(renderFormat(doc, fmt), `${activeTree.tree_id}.${fmt}`, MIME[fmt]);
  };

  const exportMatchedPath = (fmt: 'json' | 'md' | 'txt') => {
    const matched = treePaths.find((p) => JSON.stringify(p.choices) === JSON.stringify(choices)) ?? treePaths[0];
    if (!matched) return;
    const finding = decisionPathToReportFinding(matched, activeTree, evalResult);
    const doc = buildReportDocument(reportContext, [finding], 'single');
    saveBytes(renderFormat(doc, fmt), `${matched.path_id}.${fmt}`, MIME[fmt]);
  };

  const renderOutlineNode = (nodeId: string, viaBranch?: DecisionBranch): ReactNode => {
    const node = nodeById.get(nodeId);
    if (!node) return null;
    const children = childrenByNode.get(nodeId) ?? [];
    const collapsed = collapsedNodes.has(nodeId);
    const isVisited = visitedSet.has(nodeId);
    const isPending = evalResult.pending?.node_id === nodeId;
    return (
      <li key={nodeId} className="mt-2 border-l-2 border-line pl-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/60 p-2.5 text-xs">
          {viaBranch && (
            <span className={`rs-pill font-mono text-[0.65rem] ${takenBranchSet.has(viaBranch.id) ? '!border-[var(--accent)] text-cyan' : ''}`}>
              {viaBranch.when ? `${viaBranch.when}: ` : ''}
              {viaBranch.label}
            </span>
          )}
          <span className="rs-pill text-[0.65rem]">{node.type}</span>
          <button
            type="button"
            onClick={() => setFocusedNodeId(node.id)}
            className={`font-semibold underline-offset-2 hover:underline ${isVisited ? 'text-ink' : 'text-ink-2'}`}
          >
            {node.label}
          </button>
          {isVisited && <span className="rs-pill text-[0.65rem] text-cyan">On active path</span>}
          {children.length > 0 && (
            <button
              type="button"
              aria-expanded={!collapsed}
              onClick={() => toggleCollapse(nodeId)}
              className="rs-button rs-button-ghost !min-h-7 !px-2 !text-[0.68rem]"
            >
              {collapsed ? `Expand (${children.length})` : 'Collapse'}
            </button>
          )}
          {viaBranch && isPending && nodeById.get(viaBranch.from)?.id === evalResult.pending?.node_id && (
            <button
              type="button"
              onClick={() => chooseBranch(viaBranch.from, viaBranch.id)}
              className="rs-button rs-button-primary !min-h-7 !px-2.5 !text-[0.68rem]"
            >
              Select branch
            </button>
          )}
        </div>
        {children.length > 0 && !collapsed && (
          <ul className="pl-2">{children.map((b) => renderOutlineNode(b.to, b))}</ul>
        )}
      </li>
    );
  };

  const factEntries = Object.entries(effectiveFacts);

  return (
    <MotionRoot>
      <div className="grid min-w-0 gap-8 [overflow-wrap:anywhere]">
        {/* 1. Tree Switcher */}
        <section aria-labelledby="dt-selector-h" className="rs-card grid gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="dt-selector-h" className="rs-h3">Select Source-Grounded Decision Tree</h2>
              <p className="mt-1 text-xs text-ink-3">
                Pinned sources: production {activeTree.production_source_sha.slice(0, 12)} · remodeling {activeTree.remodeling_source_sha.slice(0, 12)} · rules {activeTree.rules_version}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={viewMode === 'diagram'}
                onClick={() => setViewMode('diagram')}
                className={`rs-button !min-h-9 !px-3 !text-xs ${viewMode === 'diagram' ? 'rs-button-primary' : 'rs-button-ghost'}`}
              >
                Diagram view
              </button>
              <button
                type="button"
                aria-pressed={viewMode === 'outline'}
                onClick={() => setViewMode('outline')}
                className={`rs-button !min-h-9 !px-3 !text-xs ${viewMode === 'outline' ? 'rs-button-primary' : 'rs-button-ghost'}`}
              >
                Outline (accessible)
              </button>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {allTrees.map((t) => {
              const selected = t.tree_id === activeTree.tree_id;
              return (
                <button
                  key={t.tree_id}
                  type="button"
                  onClick={() => selectTree(t.tree_id)}
                  className={`rounded-xl border p-3.5 text-left transition-colors ${
                    selected ? 'border-[var(--accent)] bg-accent-soft text-ink' : 'border-line bg-surface hover:bg-surface-2 text-ink-2'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="font-mono text-[0.7rem] font-bold text-cyan">{t.tree_id}</span>
                    <span className="rs-pill text-[0.65rem]">{t.canon_status}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-ink">{t.title}</p>
                  <p className="mt-1 text-[0.72rem] text-ink-3">
                    {t.tree_type} · {t.nodes.length} nodes · {t.outcomes.length} outcomes
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. Interactive Controls: Case Evaluation, Unknown Facts Simulator, Path Controls */}
        <section aria-labelledby="dt-controls-h" className="rs-card grid gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rs-eyebrow">{activeTree.tree_type}</span>
                <span className="rs-pill">Evaluation: {evalResult.status}</span>
                <span className="rs-pill">Canon: {activeTree.canon_status} (UNRATIFIED)</span>
                {evalResult.recommended_action && <span className="rs-pill">Action: {evalResult.recommended_action}</span>}
              </div>
              <h3 id="dt-controls-h" className="rs-h2 mt-2">{activeTree.title}</h3>
              <p className="mt-1 text-sm text-cyan">“{activeTree.question}”</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={backtrack}
                disabled={choiceOrder.length === 0}
                className="rs-button rs-button-ghost !min-h-9 !px-3 !text-xs"
              >
                ← Backtrack one step
              </button>
              <button
                type="button"
                onClick={resetPath}
                className="rs-button rs-button-ghost !min-h-9 !px-3 !text-xs"
              >
                Reset path
              </button>
            </div>
          </div>

          {/* Pre-evaluated cases selector (Triage / Readiness) + Unknown Simulator */}
          <div className="grid gap-4 lg:grid-cols-2">
            {treeEvaluations.length > 0 && (
              <label className="text-xs">
                <span className="rs-label">Evaluate real source case ({treeEvaluations.length} findings/opportunities)</span>
                <select
                  className="rs-input mt-1 w-full"
                  value={selectedEvalId}
                  onChange={(e) => {
                    setSelectedEvalId(e.target.value);
                    setUnknownFacts(new Set());
                    setFocusedNodeId('');
                  }}
                >
                  <option value="">Default tree facts (interactive simulation)</option>
                  {treeEvaluations.map((ev) => (
                    <option key={ev.evaluation_id} value={ev.evaluation_id}>
                      {ev.subject.id}: {ev.subject.title.slice(0, 64)} ({ev.result.recommended_action ?? ev.result.status})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {factEntries.length > 0 && (
              <div className="text-xs">
                <p className="rs-label">Simulate UNKNOWN conditions (null/missing never coerces to FALSE)</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {factEntries.slice(0, 6).map(([fk, fv]) => {
                    const isSimUnknown = unknownFacts.has(fk);
                    return (
                      <button
                        key={fk}
                        type="button"
                        aria-pressed={isSimUnknown}
                        onClick={() => toggleUnknownFact(fk)}
                        className={`rs-button !min-h-8 !px-2.5 !text-[0.7rem] ${
                          isSimUnknown ? 'rs-button-primary' : 'rs-button-ghost'
                        }`}
                      >
                        {isSimUnknown ? `${fk}: UNKNOWN (forced)` : `${fk}: ${fv.state === 'ASSIGNED' ? String(fv.value) : fv.state}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Pending Creator / Review Gate Branching Controls */}
          {evalResult.pending && (
            <div className="rounded-xl border border-[var(--accent)]/60 bg-accent-soft/50 p-4">
              <p className="rs-eyebrow">
                {evalResult.pending.review_gate ? 'Review Gate Decision Required' : 'Creator Branch Selection'}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">{evalResult.pending.question}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {evalResult.pending.options.map((opt) => (
                  <button
                    key={opt.branch_id}
                    type="button"
                    onClick={() => chooseBranch(evalResult.pending!.node_id, opt.branch_id)}
                    className={`rounded-xl border p-3 text-left text-xs transition-colors ${
                      opt.availability === 'BLOCKED'
                        ? 'border-[var(--status-warning-border)] bg-surface-2 text-ink-2 hover:bg-surface'
                        : 'border-line bg-surface text-ink hover:border-[var(--accent)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{opt.label}</span>
                      <span className="rs-pill text-[0.65rem]">{opt.availability}</span>
                    </div>
                    <p className="mt-1 text-[0.7rem] text-ink-3">{opt.reason}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Traversal Trace Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-ink-2">Active path:</span>
            {evalResult.steps.map((s, idx) => (
              <span key={`${s.node_id}-${idx}`} className="inline-flex items-center gap-1.5">
                {idx > 0 && <span aria-hidden="true" className="text-ink-3">→</span>}
                <button
                  type="button"
                  onClick={() => setFocusedNodeId(s.node_id)}
                  className={`rs-pill cursor-pointer text-[0.7rem] ${
                    focusedNode.id === s.node_id ? '!border-[var(--accent)] font-bold text-ink' : 'text-ink-2'
                  }`}
                >
                  {s.node_label}
                  {s.branch_label ? ` (${s.branch_label})` : ''}
                </button>
              </span>
            ))}
          </div>
        </section>

        {/* 3. Tree Diagram OR Accessible Outline */}
        <section aria-labelledby="dt-viz-h" className="rs-card grid gap-4 p-5">
          <h3 id="dt-viz-h" className="rs-h3">
            {viewMode === 'diagram' ? 'Interactive Decision Tree Structure' : 'Accessible Decision Tree Outline'}
          </h3>

          {viewMode === 'diagram' ? (
            <div className="max-w-full overflow-x-auto pb-2" tabIndex={0} aria-label="Interactive decision tree diagram levels">
              <div className="grid min-w-[36rem] gap-4">
                {layers.map((layer) => (
                  <div key={layer.depth} className="rounded-xl border border-line bg-surface-2/40 p-3">
                    <p className="rs-eyebrow mb-2">Depth {layer.depth}</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {layer.nodes.map((node) => {
                        const isVisited = visitedSet.has(node.id);
                        const isFocused = focusedNode.id === node.id;
                        const outgoing = childrenByNode.get(node.id) ?? [];
                        const isCollapsed = collapsedNodes.has(node.id);
                        return (
                          <div
                            key={node.id}
                            data-tree-node={node.id}
                            data-active={isVisited ? 'true' : 'false'}
                            className={`rounded-xl border p-3 text-xs transition-colors ${nodeTone(node.type, isVisited)} ${
                              isFocused ? 'ring-2 ring-[var(--accent)]' : ''
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <span className="rs-pill text-[0.62rem]">{node.type}</span>
                              {node.outcome_class && (
                                <span className={`font-mono text-[0.65rem] font-semibold ${outcomeBadgeClass(node.outcome_class)}`}>
                                  {node.outcome_class}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setFocusedNodeId(node.id)}
                              className="mt-1.5 block w-full text-left text-sm font-semibold text-ink hover:underline"
                            >
                              {node.label}
                            </button>
                            <p className="mt-1 text-[0.72rem] leading-snug text-ink-3">{node.description}</p>
                            {outgoing.length > 0 && (
                              <div className="mt-2.5 border-t border-line pt-2">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <span className="text-[0.68rem] font-semibold text-ink-3">
                                    Branches ({outgoing.length})
                                  </span>
                                  <button
                                    type="button"
                                    aria-expanded={!isCollapsed}
                                    onClick={() => toggleCollapse(node.id)}
                                    className="rs-button rs-button-ghost !min-h-6 !px-2 !text-[0.65rem]"
                                  >
                                    {isCollapsed ? 'Expand subtree' : 'Collapse subtree'}
                                  </button>
                                </div>
                                <ul className="mt-1.5 grid gap-1">
                                  {outgoing.map((b) => {
                                    const taken = takenBranchSet.has(b.id);
                                    const selectableHere = evalResult.pending?.node_id === node.id;
                                    return (
                                      <li key={b.id} className="flex items-center justify-between gap-2 text-[0.7rem]">
                                        <span className={taken ? 'font-bold text-cyan' : 'text-ink-2'}>
                                          {b.when ? `[${b.when}] ` : ''}
                                          {b.label} → {nodeById.get(b.to)?.label ?? b.to}
                                        </span>
                                        {selectableHere && (
                                          <button
                                            type="button"
                                            onClick={() => chooseBranch(node.id, b.id)}
                                            className="rs-button rs-button-primary !min-h-6 shrink-0 !px-2 !text-[0.65rem]"
                                          >
                                            Choose
                                          </button>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ul aria-label="Decision tree outline" className="m-0 list-none p-0">
              {renderOutlineNode(activeTree.root_node_id)}
            </ul>
          )}
        </section>

        {/* 4. Focused Node, Condition & Evidence Inspector */}
        <m.section
          key={`${activeTree.tree_id}-${focusedNode.id}-${evalResult.status}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
          aria-labelledby="dt-inspector-h"
          className="grid gap-6 lg:grid-cols-2"
        >
          {/* Left: Node Details, Conditions, Consequences, Unknowns */}
          <div className="rs-card grid min-w-0 content-start gap-4 p-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rs-eyebrow">Node & Logic Inspector</span>
                <span className="rs-pill">{focusedNode.type}</span>
                <span className="font-mono text-xs text-cyan">{focusedNode.id}</span>
              </div>
              <h3 id="dt-inspector-h" className="rs-h2 mt-2">{focusedNode.label}</h3>
              <p className="mt-1 text-sm text-ink-2">{focusedNode.description}</p>
            </div>

            {focusedNode.type === 'CONDITION' && focusedNode.predicate && (
              <div className="rounded-xl border border-line bg-surface-2 p-4 text-xs">
                <p className="rs-eyebrow">Deterministic Condition (Three-Valued Kleene Logic)</p>
                <p className="mt-1 font-semibold text-ink">{focusedNode.question}</p>
                {(() => {
                  const matchedCond = evalResult.conditions.find((c) => c.node_id === focusedNode.id);
                  if (!matchedCond) {
                    return <p className="mt-1 text-ink-3">Condition predicate operator: <code>{focusedNode.predicate.op}</code></p>;
                  }
                  return (
                    <div className="mt-2 grid gap-1 text-ink-2">
                      <p>Result: <strong className="text-cyan">{matchedCond.trace.result}</strong></p>
                      <p>Observed: <code>{matchedCond.trace.observed}</code></p>
                      <p>Reason: {matchedCond.trace.reason}</p>
                    </div>
                  );
                })()}
              </div>
            )}

            {evalResult.unknown_conditions.length > 0 && (
              <div className="rs-notice text-xs" data-tone="warning">
                <strong>Insufficient / Unknown Condition Handling:</strong>{' '}
                {evalResult.unknown_conditions.map((u) => `${u.node_id}: ${u.reason}`).join(' | ')}{' '}
                Unknown inputs stop in INSUFFICIENT_DATA or follow the explicit UNKNOWN branch — never coerced to FALSE.
              </div>
            )}

            {evalResult.status === 'BLOCKED_BY_CONSTRAINT' && (
              <div className="rs-notice text-xs" data-tone="warning">
                <strong>Blocked by Canon Constraint:</strong> {evalResult.explanation.join(' ')}
              </div>
            )}

            {focusedNode.consequences && focusedNode.consequences.length > 0 && (
              <div className="grid gap-2 text-xs">
                <p className="rs-eyebrow">Outcome Consequences (Strictly Separated Epistemic Bases)</p>
                {focusedNode.consequences.map((c, idx) => (
                  <div key={idx} className="rounded-lg border border-line bg-surface-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rs-pill font-mono text-[0.65rem] ${outcomeBadgeClass(c.basis)}`}>{c.basis}</span>
                      {c.dimension && <span className="rs-pill text-[0.65rem]">{c.dimension}</span>}
                    </div>
                    <p className="mt-1.5 text-ink">{c.text}</p>
                  </div>
                ))}
              </div>
            )}

            {focusedNode.missing && focusedNode.missing.length > 0 && (
              <div className="rounded-lg border border-[var(--status-warning-border)] bg-surface-2 p-3 text-xs">
                <p className="rs-eyebrow">Missing Inputs Blocking Evaluation</p>
                <ul className="mt-1 list-disc pl-4 text-ink-2">
                  {focusedNode.missing.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            {activeTree.constraints.length > 0 && (
              <div className="grid gap-1.5 text-xs">
                <p className="rs-eyebrow">Constraints & Guardrails</p>
                <ul className="list-disc space-y-1 pl-4 text-ink-2">
                  {activeTree.constraints.map((c) => (
                    <li key={c.id}>
                      <code>{c.binding}</code>: {c.statement}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-line bg-surface-2/60 p-3 text-xs">
              <p className="rs-eyebrow">Step-by-Step Evaluation Summary</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-ink-2">
                {evalResult.explanation.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>
          </div>

          {/* Right: Verified Evidence & Graph Links */}
          <div className="rs-card grid min-w-0 content-start gap-4 p-5">
            <p className="rs-eyebrow">
              Verified Source Evidence ({(focusedEvidence.length ? focusedEvidence : consultedEvidence).length} shown)
            </p>
            {(focusedEvidence.length ? focusedEvidence : consultedEvidence).length === 0 ? (
              <p className="text-xs text-ink-3">
                No direct passage attached to this node. Select a condition, premise or outcome node, or inspect all {activeTree.evidence.length} citations below.
              </p>
            ) : (
              <ul className="grid gap-3">
                {(focusedEvidence.length ? focusedEvidence : consultedEvidence).map((ev) => (
                  <li key={ev.id} className="rounded-xl border border-line bg-surface-2 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-bold text-cyan">{ev.id}</span>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rs-pill text-[0.65rem]">{ev.status}</span>
                        <span className="rs-pill text-[0.65rem]">{ev.canon_status}</span>
                      </div>
                    </div>
                    <p className="mt-1 font-mono text-[0.7rem] text-ink-3">
                      <a
                        href={pinnedUrl(ev.repository, ev.commit_sha, ev.path, ev.line)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-ink"
                      >
                        {ev.repository}@{ev.commit_sha.slice(0, 12)} · {ev.path}
                        {ev.line ? `#L${ev.line}` : ''}
                      </a>
                    </p>
                    {ev.quote && <blockquote className="mt-2 border-l-2 border-[var(--accent)] pl-2.5 text-ink-2">{ev.quote}</blockquote>}
                  </li>
                ))}
              </ul>
            )}

            {focusedLinks.length > 0 && (
              <div className="border-t border-line pt-3 text-xs">
                <p className="rs-eyebrow mb-2">Knowledge Graph Links on Focused Node</p>
                <ul className="grid gap-1.5">
                  {focusedLinks.map((l) => (
                    <li key={l.id} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                      <span className="rs-pill mr-2 text-[0.65rem]">{l.kind}</span>
                      <strong>{l.target_label}</strong>{' '}
                      {l.edge_type && <span className="font-mono text-[0.68rem] text-ink-3">[{l.edge_type} · {l.edge_status}]</span>}
                      {l.detail && <span className="block text-[0.72rem] text-ink-3">{l.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </m.section>

        {/* 5. Alternative Comparison Table */}
        <section aria-labelledby="dt-compare-h" className="rs-card grid gap-4 p-5">
          <h3 id="dt-compare-h" className="rs-h3">Alternative Paths Comparison ({treePaths.length} reachable paths)</h3>
          <div className="rs-table-wrap" tabIndex={0}>
            <table className="rs-table text-xs">
              <thead>
                <tr>
                  <th>Path ID</th>
                  <th>Choices</th>
                  <th>Status</th>
                  <th>Outcome Class</th>
                  <th>Outcome</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {treePaths.map((p) => (
                  <tr key={p.path_id}>
                    <td className="font-mono text-cyan">{p.path_id}</td>
                    <td>{p.choice_labels.join(' → ') || '(automatic)'}</td>
                    <td><span className="rs-pill text-[0.65rem]">{p.status}</span></td>
                    <td className="font-mono text-[0.7rem]">{p.outcome_class ?? '—'}</td>
                    <td>{p.outcome_label ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => loadAlternativePath(p)}
                        className="rs-button rs-button-ghost !min-h-7 !px-2.5 !text-[0.7rem]"
                      >
                        Load path
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 6. Creator Review Workflow + Export (Strict Non-Canon Boundary) */}
        <section aria-labelledby="dt-review-h" className="rs-card grid gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 id="dt-review-h" className="rs-h3">Creator Review Status, Private Notes & 8-Format Export</h3>
              <p className="mt-1 text-xs text-ink-3">
                Review state: <strong>{currentReviewStatus}</strong> · Canon status: <strong>{activeTree.canon_status} (UNRATIFIED)</strong>
              </p>
            </div>
            {savedReview && (
              <button
                type="button"
                onClick={handleDiscardPrivateReview}
                className="rs-button rs-button-ghost !min-h-8 !px-3 !text-xs"
              >
                Discard private notes
              </button>
            )}
          </div>

          <div className="rs-notice text-xs" data-tone="warning">
            <strong>Non-Canon & Private Session Guarantee:</strong> Decision review transitions and creator notes live only in local browser <code>sessionStorage</code> (<code>PRIVATE_LOCAL_SESSION</code>). They are never emitted into public build artifacts, and marking a tree as <code>RATIFIED_EXTERNALLY</code> is blocked without verified publication evidence in <code>Reltroner/reltroner-studio</code>.
          </div>

          <div className="flex flex-wrap gap-2">
            {PROPOSAL_REVIEW_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => handleReviewTransition(st)}
                className={`rs-button !min-h-8 !px-3 !text-xs ${
                  currentReviewStatus === st ? 'rs-button-primary' : 'rs-button-ghost'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {guardrailMessage && (
            <p role="status" className="rs-notice text-xs" data-tone="info">
              {guardrailMessage}
            </p>
          )}

          <div className="grid gap-2 text-xs">
            <label>
              <span className="rs-label">Private creator notes for this decision tree (sessionStorage only)</span>
              <textarea
                rows={2}
                className="rs-input mt-1 w-full"
                placeholder="Record private author notes or review rationale..."
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
            </label>
            <div>
              <button type="button" onClick={handleSaveNotes} className="rs-button rs-button-ghost !min-h-8 !px-3 !text-xs">
                Save Private Note (Local Session Only)
              </button>
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <p className="rs-eyebrow mb-2">Export Decision Tree Exploration (All 8 Formats Carry Explicit UNRATIFIED Markers)</p>
            <div className="flex flex-wrap gap-2">
              {(['json', 'csv', 'xlsx', 'txt', 'md', 'html', 'xml'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => exportTreeFormat(fmt)}
                  className="rs-button rs-button-ghost !min-h-8 !px-2.5 !text-xs uppercase"
                >
                  Tree .{fmt}
                </button>
              ))}
              {treePaths.length > 0 && (
                <button
                  type="button"
                  onClick={() => exportMatchedPath('md')}
                  className="rs-button rs-button-ghost !min-h-8 !px-2.5 !text-xs"
                >
                  Active Path .md
                </button>
              )}
              <a
                href={`/reports?id=${encodeURIComponent(activeTree.tree_id)}`}
                className="rs-button rs-button-primary !min-h-8 !px-3 !text-xs no-underline"
              >
                Open in Report Center (+ PDF) →
              </a>
            </div>
          </div>
        </section>
      </div>
    </MotionRoot>
  );
}
