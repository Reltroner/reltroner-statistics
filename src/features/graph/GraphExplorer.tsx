import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { m } from 'motion/react';
import { MotionRoot, useMotionTransition } from '../motion/MotionRoot.tsx';
import { EDGE_DESCRIPTIONS, EDGE_TYPES, NODE_TYPES, type EdgeType, type GraphEdge, type GraphNode, type GraphSide, type KnowledgeGraph } from '../../domain/graph.ts';
import { loadGraph, TYPE_LABEL } from './graph-client.ts';
import { fitZoom, focusSubgraph, initialFocus, type SubGraph } from './graph-view.ts';

type Elk = { layout: (graph: object) => Promise<{ children?: Array<{ id: string; x?: number; y?: number }> }> };
let elkReady: Promise<Elk> | null = null;
/** ELK is large; it loads only when a layout is first requested. */
const getElk = () => (elkReady ??= import('elkjs/lib/elk.bundled.js').then((m) => new m.default() as unknown as Elk));
const MAX_NODES = 260;
const NODE_W = 196, NODE_H = 54;
// RS-NEWSLETTER-BRANDING-EXPORT-008 R4: a view opens at a zoom where 12 px labels stay legible (>= 8.4 px);
// when a neighbourhood cannot fit at that zoom the camera centres the focus node instead of shrinking it.
const READABLE_ZOOM = 0.7, CENTER_ZOOM = 0.85, MAX_FIT_ZOOM = 1.15, SMALL_LABEL_ZOOM = 0.55, FOCUS_PADDING = 0.06, FIT_PADDING = 0.06;
type NodeData = { g: GraphNode; dim: boolean; selected: boolean; focus: boolean };
type Layout = { source: SubGraph; direction: string; algorithm: string; positions: Map<string, { x: number; y: number }>; ms: number };

const GraphNodeView = memo(function GraphNodeView({ data }: NodeProps<Node<NodeData>>) {
  const { g, dim, selected, focus } = data;
  const border = g.side === 'remodeling' ? 'var(--series-2)' : g.side === 'production' ? 'var(--series-1)' : 'var(--border-strong)';
  return (
    <div className="rs-gnode" data-dim={dim || undefined} data-selected={selected || undefined} data-focus={focus || undefined} style={{ borderColor: border, width: NODE_W }}>
      <Handle type="target" position={Position.Left} className="rs-ghandle" />
      <span className="rs-gnode-type">{TYPE_LABEL[g.type]}{g.side !== 'both' ? ` · ${g.side}` : ''}</span>
      <span className="rs-gnode-label" title={g.label}>{g.label}</span>
      <Handle type="source" position={Position.Right} className="rs-ghandle" />
    </div>
  );
});
const nodeTypes = { g: GraphNodeView };

/** Line look per relationship. Only DEPENDS_ON is blue; MENTIONS is thin, faint and arrowless; CANDIDATE is dashed. */
const edgeLook = (e: GraphEdge) => ({
  stroke: e.type === 'PROPOSES_CHANGE_TO' ? 'var(--series-2)' : e.type === 'DEPENDS_ON' ? 'var(--series-1)' : 'var(--text-3)',
  width: e.type === 'DEPENDS_ON' ? 2.4 : e.type === 'MENTIONS' ? 1 : 1.6,
  opacity: e.type === 'MENTIONS' ? 0.6 : 0.95,
});

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
  // View state only: which part of the filtered graph is drawn. The graph data is never changed.
  const [scope, setScope] = useState<'focus' | 'all'>('focus');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hops, setHops] = useState<1 | 2>(1);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [layoutError, setLayoutError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [partial, setPartial] = useState(false);
  const [cameraNonce, setCameraNonce] = useState(0);
  const layoutSeq = useRef(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  // React Flow hides a node it considers unmeasured. Node objects are rebuilt on every hover or selection,
  // so their measured size is carried over; otherwise each rebuild hid every node for a frame, and a
  // click's pointerup fell through to the pane, which cleared the selection it had just made.
  const measured = useRef(new Map<string, { width: number; height: number }>());
  const camera = useRef<{ layout: Layout | null; nonce: number }>({ layout: null, nonce: 0 });

  const visible = useMemo(() => {
    const nodes = graph.nodes.filter((n) => types.has(n.type) && sides.has(n.side) && (n.type !== 'document' || docGroups.has(n.group ?? 'other')));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = graph.edges.filter((e) => edgeTypes.has(e.type) && sides.has(e.side) && ids.has(e.source) && ids.has(e.target));
    return { nodes, edges };
  }, [graph, types, sides, docGroups, edgeTypes]);
  const defaultFocus = useMemo(() => initialFocus(visible.nodes, visible.edges), [visible]);
  const focus = scope === 'focus' ? (focusId && visible.nodes.some((n) => n.id === focusId) ? focusId : defaultFocus) : null;
  const rendered: SubGraph = useMemo(() => (scope === 'all' ? visible : focus ? focusSubgraph(visible.nodes, visible.edges, focus, hops) : { nodes: [], edges: [] }), [scope, visible, focus, hops]);
  const tooMany = rendered.nodes.length > MAX_NODES;
  const layoutCurrent = !!layout && layout.source === rendered && layout.direction === direction && layout.algorithm === algorithm;
  const layingOut = view === 'graph' && !tooMany && rendered.nodes.length > 0 && !layoutCurrent && !layoutError;

  useEffect(() => {
    if (tooMany || view !== 'graph' || rendered.nodes.length === 0) return;
    let cancelled = false;
    const seq = ++layoutSeq.current;
    const started = performance.now();
    setLayoutError(false);
    getElk().then((elk) => elk.layout({
      id: 'root',
      layoutOptions: {
        'elk.algorithm': algorithm, 'elk.direction': direction, 'elk.spacing.nodeNode': '28', 'elk.layered.spacing.nodeNodeBetweenLayers': '70',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF', 'elk.stress.desiredEdgeLength': '320', 'elk.randomSeed': '7',
      },
      children: rendered.nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
      edges: rendered.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    })).then((res) => {
      // Only the newest request may commit: a slow layout for old filters never overwrites a newer one.
      if (cancelled || seq !== layoutSeq.current) return;
      setLayout({ source: rendered, direction, algorithm, positions: new Map((res.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }])), ms: Math.round(performance.now() - started) });
    }).catch(() => { if (!cancelled && seq === layoutSeq.current) setLayoutError(true); });
    return () => { cancelled = true; };
  }, [rendered, direction, algorithm, tooMany, view]);

  /** Viewport from the known layout (no dependency on DOM measurement timing). */
  const applyCamera = useCallback((l: Layout, kind: 'open' | 'fit', animate: boolean) => {
    const el = canvasRef.current;
    if (!el || !l.positions.size) return;
    const pts = [...l.positions.values()];
    const minX = Math.min(...pts.map((p) => p.x)), minY = Math.min(...pts.map((p) => p.y));
    const box = { width: Math.max(...pts.map((p) => p.x)) - minX + NODE_W, height: Math.max(...pts.map((p) => p.y)) - minY + NODE_H };
    const canvas = { width: el.clientWidth, height: el.clientHeight };
    const duration = animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 260 : 0;
    const fit = fitZoom(box, canvas, kind === 'fit' ? FIT_PADDING : FOCUS_PADDING);
    const centerOn = (x: number, y: number, z: number) => { void flow.setViewport({ x: canvas.width / 2 - x * z, y: canvas.height / 2 - y * z, zoom: z }, { duration }); setZoom(z); };
    const focusPos = l.source.nodes.length && focus ? l.positions.get(focus) : undefined;
    if (kind === 'open' && scope === 'focus' && fit < READABLE_ZOOM && focusPos) {
      centerOn(focusPos.x + NODE_W / 2, focusPos.y + NODE_H / 2, CENTER_ZOOM);
      setPartial(true);
      return;
    }
    centerOn(minX + box.width / 2, minY + box.height / 2, Math.max(0.1, Math.min(MAX_FIT_ZOOM, fit)));
    setPartial(false);
  }, [flow, focus, scope]);

  // A new layout (or a reset) opens its view once, after React has committed the nodes and React Flow's
  // viewport exists. The layout counts as opened only when the camera was actually applied: useReactFlow()
  // returns a new object once the viewport initialises, which re-runs (and cleans up) this effect.
  useEffect(() => {
    if (!layout || !layoutCurrent || !flow.viewportInitialized) return;
    if (camera.current.layout === layout && camera.current.nonce === cameraNonce) return;
    const first = camera.current.layout === null;
    const t = setTimeout(() => { camera.current = { layout, nonce: cameraNonce }; applyCamera(layout, 'open', !first); }, 0);
    return () => clearTimeout(t);
  }, [layout, layoutCurrent, cameraNonce, applyCamera, flow.viewportInitialized]);

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
      const id = nodeEl?.getAttribute('data-id') ?? (e.key === 'Enter' ? rendered.nodes[0]?.id : undefined);
      if (id) setSelected((prev) => prev ?? id);
    };
    window.addEventListener('focusin', onWindowFocus, true);
    window.addEventListener('keydown', onWindowKey, true);
    return () => {
      window.removeEventListener('focusin', onWindowFocus, true);
      window.removeEventListener('keydown', onWindowKey, true);
    };
  }, [rendered.nodes]);

  const highlight = hovered ?? selected;
  const shown = layoutCurrent && layout ? layout.source : null;
  const neighbors = useMemo(() => {
    if (!highlight || !shown) return null;
    const s = new Set([highlight]);
    for (const e of shown.edges) { if (e.source === highlight) s.add(e.target); if (e.target === highlight) s.add(e.source); }
    return s;
  }, [highlight, shown]);

  const rfNodes: Node<NodeData>[] = useMemo(() => (shown && layout ? shown.nodes.map((g) => ({
    id: g.id, type: 'g', position: layout.positions.get(g.id) ?? { x: 0, y: 0 },
    initialWidth: NODE_W, initialHeight: NODE_H, measured: measured.current.get(g.id),
    selected: g.id === selected,
    data: { g, dim: !!neighbors && !neighbors.has(g.id), selected: g.id === selected, focus: g.id === focus },
    draggable: true, selectable: true, focusable: true,
  })) : []), [shown, layout, neighbors, selected, focus]);

  const label = useCallback((id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id, [graph]);
  const rfEdges: Edge[] = useMemo(() => (shown ? shown.edges.map((e) => {
    const dim = !!neighbors && !(neighbors.has(e.source) && neighbors.has(e.target) && (e.source === highlight || e.target === highlight));
    const look = edgeLook(e);
    return {
      id: e.id, source: e.source, target: e.target, type: 'default',
      style: { stroke: look.stroke, strokeWidth: look.width, strokeDasharray: e.status === 'CANDIDATE' ? '6 4' : undefined, opacity: dim ? 0.12 : look.opacity },
      markerEnd: e.type === 'MENTIONS' ? undefined : { type: 'arrowclosed' as never, color: look.stroke, width: 14, height: 14 },
      ariaLabel: `${e.type} (${e.status}, ${e.side}) from ${label(e.source)} to ${label(e.target)}`,
    };
  }) : []), [shown, neighbors, highlight, label]);

  const node = selected ? graph.nodes.find((n) => n.id === selected) : undefined;
  const incident = node ? graph.edges.filter((e) => e.source === node.id || e.target === node.id) : [];
  const matches = search.trim() ? visible.nodes.filter((n) => n.label.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 12) : [];
  const focusNode = focus ? graph.nodes.find((n) => n.id === focus) : undefined;
  const focusIsolated = scope === 'focus' && !!focus && rendered.edges.length === 0;

  /** Search, list and inspector selections: in the focused view the selected node becomes the focus. */
  const select = (id: string) => {
    setSelected(id);
    if (scope === 'focus') { setFocusId(id); return; }
    const p = layout?.positions.get(id);
    if (p && view === 'graph') { void flow.setCenter(p.x + NODE_W / 2, p.y + NODE_H / 2, { zoom: 1.1, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260 }); setZoom(1.1); }
  };
  const focusConnections = () => { setScope('focus'); if (selected && visible.nodes.some((n) => n.id === selected)) setFocusId(selected); setCameraNonce((n) => n + 1); };
  const showFiltered = () => { setScope('all'); setCameraNonce((n) => n + 1); };
  const fitCurrent = () => { if (layout && layoutCurrent) applyCamera(layout, 'fit', true); };
  const resetView = () => { setScope('focus'); setFocusId(null); setHops(1); setSelected(null); setHovered(null); setSearch(''); setCameraNonce((n) => n + 1); };
  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); apply(n); };
  const control = 'rs-button rs-button-ghost !min-h-10 border border-line !px-3 text-sm';

  const summary = scope === 'all'
    ? `Filtered graph: ${visible.nodes.length} nodes · ${visible.edges.length} relationships (full graph: ${graph.nodes.length} · ${graph.edges.length}).`
    : !focus
      ? `No relationships match the current filters: ${visible.nodes.length} nodes, none connected.`
      : `Focused neighborhood of “${focusNode?.label ?? focus}”: ${rendered.nodes.length} nodes · ${rendered.edges.length} relationships. Filtered graph: ${visible.nodes.length} nodes · ${visible.edges.length} relationships.`;

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
          <p className="min-w-0 text-ink-2" aria-live="polite" data-graph-summary>{summary}</p>
          <div className="flex gap-1 rounded-xl border border-line bg-inset p-1" role="group" aria-label="View">
            {(['graph', 'list'] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`min-h-10 rounded-lg px-3 py-1 text-sm font-semibold ${view === v ? 'bg-surface-2 text-ink' : 'text-ink-3'}`}>{v === 'graph' ? 'Graph' : 'List (accessible)'}</button>)}
          </div>
        </div>
        {view === 'graph' && (
          <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label="Graph view controls">
            <button type="button" className={control} aria-pressed={scope === 'focus'} onClick={focusConnections}>Focus connections</button>
            <button type="button" className={control} aria-pressed={scope === 'all'} onClick={showFiltered}>Show filtered graph</button>
            <button type="button" className={control} onClick={fitCurrent} disabled={!layoutCurrent}>Fit current view</button>
            <button type="button" className={control} onClick={resetView}>Reset view</button>
            {scope === 'focus' && <label className="flex min-h-10 items-center gap-2 px-1 text-sm text-ink-2"><input type="checkbox" checked={hops === 2} onChange={(e) => setHops(e.target.checked ? 2 : 1)} />Include 2 hops</label>}
            {layingOut && <span className="text-xs text-ink-3">Laying out…</span>}
          </div>
        )}
        {view === 'graph' ? (
          tooMany ? (
            <p className="rs-notice" data-tone="caution"><strong>{rendered.nodes.length} nodes exceed the {MAX_NODES}-node interactive limit.</strong>&nbsp;Narrow node types or document collections, use Focus connections, or use the list view.</p>
          ) : rendered.nodes.length === 0 ? (
            <div className="rs-notice" data-tone="unavailable" data-graph-empty>
              {scope === 'all' || visible.nodes.length === 0
                ? <p><strong>No nodes match the current filters.</strong> Select at least one node type and source overlay.</p>
                : <p><strong>No relationships match the current filters.</strong> {visible.nodes.length} nodes remain and none of them is connected by a visible relationship. Adjust node or edge types, or <button type="button" className="font-semibold text-accent underline" onClick={showFiltered}>show the filtered graph</button>.</p>}
            </div>
          ) : layoutError ? (
            <p className="rs-notice" data-tone="caution">The graph layout could not be computed in this browser. The list view shows every node and relationship.</p>
          ) : !layout ? (
            <div className="rs-card grid h-[72vh] min-h-[480px] place-items-center p-6 text-sm text-ink-3">Laying out graph…</div>
          ) : (
            <>
              {/* Space is reserved so the canvas does not move when a hint appears. */}
              <p className="mb-2 min-h-5 text-xs text-ink-3" data-graph-hint>
                {focusIsolated ? `“${focusNode?.label ?? focus}” has no relationships under the current filters. ` : ''}
                {partial ? 'Part of this neighborhood lies outside the frame: drag to pan, or use Fit current view. ' : ''}
                {zoom < SMALL_LABEL_ZOOM ? `Labels are too small to read at ${Math.round(zoom * 100)} % zoom: zoom in, use Focus connections, or open the list view.` : ''}
              </p>
              <div
                ref={canvasRef}
                className="rs-card rs-graph h-[72vh] min-h-[480px] overflow-hidden"
                data-graph-scope={scope}
                data-layout-ms={layout.ms}
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
                  nodesDraggable={false} onNodeClick={(_, n) => setSelected(n.id)} onNodesChange={(changes) => { for (const c of changes) { if (c.type === 'select' && c.selected) setSelected(c.id); if (c.type === 'dimensions' && c.dimensions) measured.current.set(c.id, c.dimensions); } }} onNodeMouseEnter={(_, n) => setHovered(n.id)} onNodeMouseLeave={() => setHovered(null)}
                  onPaneClick={() => setSelected(null)} onMoveEnd={(_, vp) => setZoom(vp.zoom)} proOptions={{ hideAttribution: true }} colorMode={document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'}>
                  <Background gap={28} size={1} color="var(--grid-dot)" />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
            </>
          )
        ) : (
          <div className="rs-table-wrap max-h-[72vh] overflow-auto" tabIndex={0}>
            <table className="rs-table">
              <caption className="rs-sr">Every node of the filtered graph ({visible.nodes.length}) with its visible relationship count</caption>
              <thead><tr><th>Node</th><th>Type</th><th>Side</th><th className="num">Edges</th></tr></thead>
              <tbody>{visible.nodes.map((n) => (
                <tr key={n.id}><td><button type="button" className="text-left text-accent underline-offset-2 hover:underline" aria-current={n.id === focus ? 'true' : undefined} onClick={() => select(n.id)}>{n.label}</button></td><td>{TYPE_LABEL[n.type]}</td><td>{n.side}</td><td className="num">{visible.edges.filter((e) => e.source === n.id || e.target === n.id).length}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3" aria-label="Legend">
          <li><span className="mr-1 inline-block h-0.5 w-6 align-middle" style={{ background: 'var(--series-1)' }} />DEPENDS_ON (QA-verified)</li>
          <li><span className="mr-1 inline-block h-0.5 w-6 align-middle" style={{ background: 'var(--series-2)' }} />PROPOSES_CHANGE_TO (remodeling)</li>
          <li><span className="mr-1 inline-block h-0.5 w-6 align-middle" style={{ background: 'var(--text-3)' }} />DEFINES / DERIVED_FROM / REFERENCES / SUPERSEDES</li>
          <li><span className="mr-1 inline-block h-px w-6 align-middle" style={{ background: 'var(--text-3)', opacity: 0.6 }} />MENTIONS (thin, no arrow: co-occurrence, never dependency)</li>
          <li><span className="mr-1 inline-block w-6 border-t-2 border-dashed align-middle" style={{ borderColor: 'var(--text-3)' }} />CANDIDATE (not established)</li>
          <li>Arrows point from source to target as recorded · node border: blue production · orange remodeling · neutral both</li>
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
                const outgoing = e.source === node.id;
                const other = outgoing ? e.target : e.source;
                return (
                  <li key={e.id} className="rounded-lg border border-line p-2">
                    <span className="font-mono text-[0.68rem] text-ink-2"><span aria-hidden="true">{outgoing ? '→' : '←'}</span><span className="rs-sr">{outgoing ? 'Outgoing' : 'Incoming'}</span> {e.type}</span> <span className="rs-badge" data-tone={e.status === 'CANDIDATE' ? 'unknown' : e.status === 'VERIFIED' ? 'good' : 'canon'}>{e.status}</span> <span className="text-[0.68rem] text-ink-3">{e.side}</span>
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
