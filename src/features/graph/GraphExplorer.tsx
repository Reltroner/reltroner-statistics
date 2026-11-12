import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { m } from 'motion/react';
import { MotionRoot, useMotionTransition } from '../motion/MotionRoot.tsx';
import { EDGE_DESCRIPTIONS, EDGE_TYPES, NODE_TYPES, type EdgeType, type GraphEdge, type GraphNode, type GraphSide, type KnowledgeGraph } from '../../domain/graph.ts';
import { loadGraph, TYPE_LABEL } from './graph-client.ts';

type Elk = { layout: (graph: object) => Promise<{ children?: Array<{ id: string; x?: number; y?: number }> }> };
let elkReady: Promise<Elk> | null = null;
/** ELK is large; it loads only when a layout is first requested. */
const getElk = () => (elkReady ??= import('elkjs/lib/elk.bundled.js').then((m) => new m.default() as unknown as Elk));
const MAX_NODES = 260;
const PRIMARY_DATASET = 'dataset:data/asthortera/nccm-v6-active-cross-domain.json';
const NODE_W = 196, NODE_H = 54;
type NodeData = { g: GraphNode; dim: boolean; selected: boolean };

const GraphNodeView = memo(function GraphNodeView({ data }: NodeProps<Node<NodeData>>) {
  const { g, dim, selected } = data;
  const border = g.side === 'remodeling' ? 'var(--series-2)' : g.side === 'production' ? 'var(--series-1)' : 'var(--border-strong)';
  return (
    <div className="rs-gnode" data-dim={dim || undefined} data-selected={selected || undefined} style={{ borderColor: border, width: NODE_W }}>
      <Handle type="target" position={Position.Left} className="rs-ghandle" />
      <span className="rs-gnode-type">{TYPE_LABEL[g.type]}{g.side !== 'both' ? ` · ${g.side}` : ''}</span>
      <span className="rs-gnode-label" title={g.label}>{g.label}</span>
      <Handle type="source" position={Position.Right} className="rs-ghandle" />
    </div>
  );
});
const nodeTypes = { g: GraphNodeView };

function Explorer({ graph }: { graph: KnowledgeGraph }) {
  const flow = useReactFlow();
  const motionT = useMotionTransition('graph');
  const collections = useMemo(() => [...new Set(graph.nodes.filter((n) => n.type === 'document').map((n) => n.group ?? 'other'))].sort(), [graph]);
  const [types, setTypes] = useState<Set<string>>(new Set(['entity', 'indicator', 'dataset', 'observation', 'revision', 'document']));
  const [docGroups, setDocGroups] = useState<Set<string>>(new Set(['statistics'].filter((c) => collections.includes(c))));
  const [edgeTypes, setEdgeTypes] = useState<Set<EdgeType>>(new Set(EDGE_TYPES));
  const [sides, setSides] = useState<Set<GraphSide>>(new Set(['production', 'remodeling', 'both']));
  const [direction, setDirection] = useState<'RIGHT' | 'DOWN'>('RIGHT');
  const [algorithm, setAlgorithm] = useState<'layered' | 'stress'>('layered');
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [layingOut, setLayingOut] = useState(false);

  const visible = useMemo(() => {
    const nodes = graph.nodes.filter((n) => types.has(n.type) && sides.has(n.side) && (n.type !== 'document' || docGroups.has(n.group ?? 'other')));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => edgeTypes.has(e.type) && sides.has(e.side) && ids.has(e.source) && ids.has(e.target));
    return { nodes, edges };
  }, [graph, types, sides, docGroups, edgeTypes]);
  const tooMany = visible.nodes.length > MAX_NODES;

  useEffect(() => {
    if (tooMany || view !== 'graph') return;
    let cancelled = false;
    setLayingOut(true);
    getElk().then((elk) => elk.layout({
      id: 'root',
      layoutOptions: {
        'elk.algorithm': algorithm, 'elk.direction': direction, 'elk.spacing.nodeNode': '28', 'elk.layered.spacing.nodeNodeBetweenLayers': '70',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', 'elk.stress.desiredEdgeLength': '320', 'elk.randomSeed': '7',
      },
      children: visible.nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
      edges: visible.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    })).then((res) => {
      if (cancelled) return;
      setPositions(new Map((res.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }])));
      setLayingOut(false);
    }).catch(() => setLayingOut(false));
    return () => { cancelled = true; };
  }, [visible, direction, algorithm, tooMany, view, flow]);

  const didInitialFit = useRef(false);
  // Fit only after React has committed the new positions; otherwise bounds are computed from stale ones.
  useEffect(() => {
    if (!positions.size) return;
    const isFirst = !didInitialFit.current;
    didInitialFit.current = true;
    const duration = isFirst || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
    const t = setTimeout(() => {
      const xs = [...positions.values()].map((p) => p.x), ys = [...positions.values()].map((p) => p.y);
      const width = Math.max(...xs) - Math.min(...xs) + NODE_W, height = Math.max(...ys) - Math.min(...ys) + NODE_H;
      // Small graphs fit entirely; large ones open legibly at the start of the layout (Fit shows all).
      if (width * 0.75 < 900 && height * 0.75 < 640) void flow.fitView({ padding: 0.12, maxZoom: 1.2, duration });
      else {
        const anchor = positions.get(PRIMARY_DATASET);
        if (anchor) void flow.setCenter(anchor.x + NODE_W / 2 + 280, anchor.y + NODE_H / 2, { zoom: 0.75, duration });
        else void flow.setViewport({ x: -Math.min(...xs) * 0.75 + 24, y: -Math.min(...ys) * 0.75 + 24, zoom: 0.75 }, { duration });
      }
    }, isFirst ? 0 : 40);
    return () => clearTimeout(t);
  }, [positions, flow]);

  useEffect(() => {
    const onWindowFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      const id = target?.closest?.('.react-flow__node')?.getAttribute('data-id');
      if (id) setSelected(id);
    };
    const onWindowKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return;
      const nodeEl = target?.closest?.('.react-flow__node') ?? document.activeElement?.closest?.('.react-flow__node');
      const id = nodeEl?.getAttribute('data-id') ?? (e.key === 'Enter' ? visible.nodes[0]?.id : undefined);
      if (id) setSelected((prev) => prev ?? id);
    };
    window.addEventListener('focusin', onWindowFocus, true);
    window.addEventListener('keydown', onWindowKey, true);
    return () => {
      window.removeEventListener('focusin', onWindowFocus, true);
      window.removeEventListener('keydown', onWindowKey, true);
    };
  }, [visible.nodes]);

  const focus = hovered ?? selected;
  const neighbors = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]);
    for (const e of visible.edges) { if (e.source === focus) s.add(e.target); if (e.target === focus) s.add(e.source); }
    return s;
  }, [focus, visible.edges]);

  const rfNodes: Node<NodeData>[] = useMemo(() => visible.nodes.map((g) => ({
    id: g.id, type: 'g', position: positions.get(g.id) ?? { x: 0, y: 0 },
    selected: g.id === selected,
    data: { g, dim: !!neighbors && !neighbors.has(g.id), selected: g.id === selected },
    draggable: true, selectable: true, focusable: true,
  })), [visible.nodes, positions, neighbors, selected]);

  const rfEdges: Edge[] = useMemo(() => visible.edges.map((e) => {
    const dim = !!neighbors && !(neighbors.has(e.source) && neighbors.has(e.target) && (e.source === focus || e.target === focus));
    const stroke = e.type === 'PROPOSES_CHANGE_TO' ? 'var(--series-2)' : e.type === 'DEPENDS_ON' ? 'var(--series-1)' : e.type === 'MENTIONS' ? 'var(--chart-axis)' : 'var(--text-3)';
    return {
      id: e.id, source: e.source, target: e.target, type: 'default',
      style: { stroke, strokeWidth: e.type === 'DEPENDS_ON' ? 2.2 : e.type === 'MENTIONS' ? 1 : 1.5, strokeDasharray: e.status === 'CANDIDATE' ? '6 4' : undefined, opacity: dim ? 0.12 : e.type === 'MENTIONS' ? 0.55 : 0.9 },
      markerEnd: e.type === 'MENTIONS' ? undefined : { type: 'arrowclosed' as never, color: stroke, width: 14, height: 14 },
      ariaLabel: `${e.type} from ${e.source} to ${e.target}`,
    };
  }), [visible.edges, neighbors, focus]);

  const node = selected ? graph.nodes.find((n) => n.id === selected) : undefined;
  const incident = node ? graph.edges.filter((e) => e.source === node.id || e.target === node.id) : [];
  const label = useCallback((id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id, [graph]);
  const matches = search.trim() ? visible.nodes.filter((n) => n.label.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 12) : [];

  const select = (id: string) => {
    setSelected(id);
    const p = positions.get(id);
    if (p && view === 'graph') flow.setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, { zoom: 1.1, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260 });
  };
  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); apply(n); };

  return (
    <div className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_20rem]">
      <aside className="rs-card grid content-start gap-5 p-4 text-sm" aria-label="Graph filters">
        <label><span className="rs-label">Find a node</span>
          <input className="rs-input w-full" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or title" />
        </label>
        {matches.length > 0 && <ul className="-mt-3 grid gap-1">{matches.map((m) => <li key={m.id}><button type="button" className="w-full truncate rounded-md px-2 py-1 text-left hover:bg-accent-soft" onClick={() => select(m.id)}>{m.label}</button></li>)}</ul>}
        <fieldset><legend className="rs-label">Node types</legend>
          {NODE_TYPES.map((t) => <label key={t} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={types.has(t)} onChange={() => toggle(types, t, setTypes)} />{TYPE_LABEL[t]} <span className="text-ink-3">({graph.summary.nodes_by_type[t] ?? 0})</span></label>)}
        </fieldset>
        {types.has('document') && (
          <fieldset><legend className="rs-label">Document collections</legend>
            <div className="grid grid-cols-2 gap-x-2">{collections.map((c) => <label key={c} className="flex items-center gap-1.5 py-0.5 text-[0.8rem]"><input type="checkbox" checked={docGroups.has(c)} onChange={() => toggle(docGroups, c, setDocGroups)} />{c}</label>)}</div>
          </fieldset>
        )}
        <fieldset><legend className="rs-label">Edge types</legend>
          {EDGE_TYPES.map((t) => <label key={t} className="flex items-center gap-2 py-0.5" title={EDGE_DESCRIPTIONS[t]}><input type="checkbox" checked={edgeTypes.has(t)} onChange={() => toggle(edgeTypes, t, setEdgeTypes)} /><span className="font-mono text-[0.72rem]">{t}</span></label>)}
        </fieldset>
        <fieldset><legend className="rs-label">Source overlay</legend>
          {(['production', 'both', 'remodeling'] as const).map((s) => <label key={s} className="flex items-center gap-2 py-0.5"><input type="checkbox" checked={sides.has(s)} onChange={() => toggle(sides, s, setSides)} />{s === 'both' ? 'In both (unchanged)' : s === 'production' ? 'Production only' : 'Remodeling only'}</label>)}
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <label><span className="rs-label">Layout</span><select className="rs-select w-full" value={algorithm} onChange={(e) => setAlgorithm(e.target.value as 'layered' | 'stress')}><option value="layered">Layered</option><option value="stress">Stress</option></select></label>
          <label><span className="rs-label">Direction</span><select className="rs-select w-full" value={direction} disabled={algorithm !== 'layered'} onChange={(e) => setDirection(e.target.value as 'RIGHT' | 'DOWN')}><option value="RIGHT">Left → right</option><option value="DOWN">Top → bottom</option></select></label>
        </div>
      </aside>

      <section className="min-w-0" aria-label="Graph canvas">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-ink-2" aria-live="polite">{visible.nodes.length} nodes · {visible.edges.length} edges{layingOut ? ' · laying out…' : ''}</p>
          <div className="flex gap-1 rounded-xl border border-line bg-inset p-1" role="group" aria-label="View">
            {(['graph', 'list'] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1 text-sm font-semibold ${view === v ? 'bg-surface-2 text-ink' : 'text-ink-3'}`}>{v === 'graph' ? 'Graph' : 'List (accessible)'}</button>)}
          </div>
        </div>
        {view === 'graph' ? (
          tooMany ? (
            <p className="rs-notice" data-tone="caution"><strong>{visible.nodes.length} nodes exceed the {MAX_NODES}-node interactive limit.</strong>&nbsp;Narrow node types or document collections, or use the list view.</p>
          ) : positions.size === 0 ? (
            <div className="rs-card grid h-[72vh] min-h-[480px] place-items-center p-6 text-sm text-ink-3">Laying out graph…</div>
          ) : (
            <div
              className="rs-card h-[72vh] min-h-[480px] overflow-hidden"
              onFocusCapture={(e) => {
                const el = (e.target as HTMLElement | null)?.closest?.('.react-flow__node');
                const id = el?.getAttribute('data-id');
                if (id) setSelected(id);
              }}
              onKeyDownCapture={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  const el = (e.target as HTMLElement | null)?.closest?.('.react-flow__node');
                  const id = el?.getAttribute('data-id');
                  if (id) setSelected(id);
                }
              }}
            >
              <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} minZoom={0.1} maxZoom={2} panOnScroll zoomOnPinch zoomActivationKeyCode="Control"
                nodesDraggable={false} onNodeClick={(_, n) => setSelected(n.id)} onNodesChange={(changes) => { for (const c of changes) if (c.type === 'select' && c.selected) setSelected(c.id); }} onNodeMouseEnter={(_, n) => setHovered(n.id)} onNodeMouseLeave={() => setHovered(null)}
                onPaneClick={() => setSelected(null)} proOptions={{ hideAttribution: true }} colorMode={document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'}>
                <Background gap={28} size={1} color="var(--grid-dot)" />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
          )
        ) : (
          <div className="rs-table-wrap max-h-[72vh] overflow-auto" tabIndex={0}>
            <table className="rs-table">
              <thead><tr><th>Node</th><th>Type</th><th>Side</th><th className="num">Edges</th></tr></thead>
              <tbody>{visible.nodes.map((n) => (
                <tr key={n.id}><td><button type="button" className="text-left text-accent underline-offset-2 hover:underline" onClick={() => setSelected(n.id)}>{n.label}</button></td><td>{TYPE_LABEL[n.type]}</td><td>{n.side}</td><td className="num">{visible.edges.filter((e) => e.source === n.id || e.target === n.id).length}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3" aria-label="Legend">
          <li><span className="mr-1 inline-block h-0.5 w-6 align-middle" style={{ background: 'var(--series-1)' }} />DEPENDS_ON (QA-verified)</li>
          <li><span className="mr-1 inline-block h-0.5 w-6 align-middle" style={{ background: 'var(--series-2)' }} />PROPOSES_CHANGE_TO (remodeling)</li>
          <li><span className="mr-1 inline-block h-0.5 w-6 align-middle" style={{ background: 'var(--text-3)' }} />DEFINES / DERIVED_FROM / REFERENCES / SUPERSEDES</li>
          <li><span className="mr-1 inline-block h-0.5 w-6 align-middle" style={{ background: 'var(--chart-axis)' }} />MENTIONS (co-occurrence, never dependency)</li>
          <li><span className="mr-1 inline-block w-6 border-t-2 border-dashed align-middle" style={{ borderColor: 'var(--text-3)' }} />CANDIDATE (not established)</li>
          <li>Node border: blue production · orange remodeling · neutral both</li>
        </ul>
      </section>

      <aside className="rs-card content-start overflow-hidden p-4 text-sm" aria-label="Node inspector" aria-live="polite">
        {!node ? (
          <p className="text-ink-3">Select a node to inspect its attributes and every incident edge with its evidence.</p>
        ) : (
          <m.div key={node.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={motionT}>
            <p className="rs-eyebrow">{TYPE_LABEL[node.type]} · {node.side}</p>
            <h3 className="rs-h3 mt-1 [overflow-wrap:anywhere]">{node.label}</h3>
            <p className="mt-1 font-mono text-[0.7rem] text-ink-3 [overflow-wrap:anywhere]">{node.id}</p>
            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[0.8rem]">
              {Object.entries(node.attrs).filter(([, v]) => v !== null && v !== '').map(([k, v]) => <Fragment key={k}><dt className="text-ink-3">{k.replaceAll('_', ' ')}</dt><dd className="m-0 [overflow-wrap:anywhere]">{String(v)}</dd></Fragment>)}
            </dl>
            <a className="rs-button rs-button-secondary mt-3 w-full" href={`/impact?node=${encodeURIComponent(node.id)}`}>Analyze impact</a>
            <h4 className="mt-4 text-[0.72rem] font-bold uppercase tracking-wider text-ink-3">Edges ({incident.length})</h4>
            <ul className="mt-2 grid max-h-[40vh] gap-2 overflow-auto">
              {incident.slice(0, 80).map((e: GraphEdge) => {
                const other = e.source === node.id ? e.target : e.source;
                return (
                  <li key={e.id} className="rounded-lg border border-line p-2">
                    <span className="font-mono text-[0.68rem] text-ink-2">{e.source === node.id ? '→' : '←'} {e.type}</span> <span className="rs-badge" data-tone={e.status === 'CANDIDATE' ? 'unknown' : e.status === 'VERIFIED' ? 'good' : 'canon'}>{e.status}</span>
                    <button type="button" className="mt-1 block text-left text-[0.8rem] text-accent hover:underline" onClick={() => select(other)}>{label(other)}</button>
                    <span className="mt-0.5 block text-[0.72rem] text-ink-3">{e.evidence}</span>
                  </li>
                );
              })}
            </ul>
          </m.div>
        )}
      </aside>
    </div>
  );
}

export default function GraphExplorer() {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { loadGraph().then(setGraph).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <p className="rs-notice" data-tone="unavailable">{error}</p>;
  if (!graph) return <p className="rs-notice" data-tone="unavailable">Loading graph…</p>;
  return <MotionRoot><ReactFlowProvider><Explorer graph={graph} /></ReactFlowProvider></MotionRoot>;
}
