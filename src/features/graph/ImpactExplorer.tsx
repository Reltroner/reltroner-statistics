import { useEffect, useMemo, useState } from 'react';
import { m } from 'motion/react';
import { MotionRoot, useMotionTransition } from '../motion/MotionRoot.tsx';
import { DEFAULT_IMPACT_TYPES, EDGE_DESCRIPTIONS, PROPAGATION, traverseImpact, type EdgeType, type GraphSide, type KnowledgeGraph } from '../../domain/graph.ts';
import { loadGraph, TYPE_LABEL } from './graph-client.ts';

const PRESETS = [
  { id: 'indicator:population', label: 'Population indicator' },
  { id: 'document:content/events/history-timeline.md', label: 'History timeline document' },
  { id: 'dataset:data/asthortera/nccm-v6-active-cross-domain.json', label: 'NCCM V6.5 dataset' },
];
const PROPAGATING = (Object.keys(PROPAGATION) as EdgeType[]).filter((t) => PROPAGATION[t] !== 'none');

export default function ImpactExplorer() {
  return <MotionRoot><Impact /></MotionRoot>;
}

function Impact() {
  const motionT = useMotionTransition('content');
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<Set<EdgeType>>(new Set(DEFAULT_IMPACT_TYPES));
  const [includeRemodeling, setIncludeRemodeling] = useState(false);
  const [depth, setDepth] = useState(4);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('node');
    loadGraph().then((g) => {
      setGraph(g);
      const start = fromUrl && g.nodes.some((n) => n.id === fromUrl) ? fromUrl : PRESETS.find((p) => g.nodes.some((n) => n.id === p.id))?.id ?? g.nodes[0]?.id ?? '';
      setOrigin(start);
    }).catch((e: Error) => setError(e.message));
  }, []);

  const byId = useMemo(() => new Map((graph?.nodes ?? []).map((n) => [n.id, n])), [graph]);
  const sides: GraphSide[] = includeRemodeling ? ['production', 'both', 'remodeling'] : ['production', 'both'];
  const result = useMemo(() => (graph && origin ? traverseImpact(graph.edges, origin, { types: [...types], maxDepth: depth, sides }) : null), [graph, origin, types, depth, includeRemodeling]); // eslint-disable-line react-hooks/exhaustive-deps
  const matches = useMemo(() => (graph && query.trim() ? graph.nodes.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 14) : []), [graph, query]);

  useEffect(() => {
    if (!origin) return;
    const url = new URL(window.location.href);
    url.searchParams.set('node', origin);
    window.history.replaceState(null, '', url);
  }, [origin]);

  if (error) return <p className="rs-notice" data-tone="unavailable">{error}</p>;
  if (!graph || !result) return <p className="rs-notice" data-tone="unavailable">Loading graph…</p>;
  const o = byId.get(origin);
  const name = (id: string) => byId.get(id)?.label ?? id;
  const Hit = ({ h }: { h: (typeof result.direct)[number] }) => {
    const n = byId.get(h.node);
    return (
      <li className="rs-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rs-chip !py-0 !text-[0.65rem]">{n ? TYPE_LABEL[n.type] : 'Node'}</span>
          <span className="rs-badge" data-tone={h.strength === 'dependency' ? 'canon' : h.strength === 'reference' ? 'unknown' : 'archived'}>{h.strength}</span>
          <span className="font-mono text-[0.68rem] text-ink-3">via {h.via} · depth {h.depth}</span>
        </div>
        <button type="button" className="mt-1 text-left font-semibold text-accent hover:underline" onClick={() => setOrigin(h.node)}>{name(h.node)}</button>
        {h.depth > 1 && <p className="mt-1 text-[0.72rem] text-ink-3">Path: {h.path.map(name).join(' → ')}</p>}
      </li>
    );
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="rs-card grid content-start gap-5 p-4 text-sm" aria-label="Impact settings">
        <label><span className="rs-label">Origin node</span>
          <input className="rs-input w-full" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search nodes" />
        </label>
        {matches.length > 0 && <ul className="-mt-3 grid gap-1">{matches.map((m) => <li key={m.id}><button type="button" className="w-full truncate rounded-md px-2 py-1 text-left hover:bg-accent-soft" onClick={() => { setOrigin(m.id); setQuery(''); }}>{m.label} <span className="text-ink-3">· {TYPE_LABEL[m.type]}</span></button></li>)}</ul>}
        <div><span className="rs-label">Presets</span><div className="flex flex-wrap gap-2">{PRESETS.filter((p) => byId.has(p.id)).map((p) => <button key={p.id} type="button" className="rs-chip cursor-pointer hover:border-[var(--accent)]" onClick={() => setOrigin(p.id)}>{p.label}</button>)}</div></div>
        <fieldset><legend className="rs-label">Propagate through</legend>
          {PROPAGATING.map((t) => (
            <label key={t} className="flex items-start gap-2 py-0.5" title={EDGE_DESCRIPTIONS[t]}>
              <input type="checkbox" className="mt-1" checked={types.has(t)} onChange={() => { const n = new Set(types); if (n.has(t)) n.delete(t); else n.add(t); setTypes(n); }} />
              <span><span className="font-mono text-[0.72rem]">{t}</span>{t === 'MENTIONS' && <span className="block text-[0.72rem] text-ink-3">Mention reach only, not dependency.</span>}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2"><input type="checkbox" checked={includeRemodeling} onChange={(e) => setIncludeRemodeling(e.target.checked)} />Include remodeling-only edges</label>
        <label><span className="rs-label">Maximum depth: {depth}</span><input type="range" min={1} max={6} value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-full" /></label>
      </aside>
      <m.section key={`${origin}-${depth}-${[...types].join()}-${includeRemodeling}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={motionT} className="min-w-0" aria-live="polite">
        <p className="rs-eyebrow">If this changes</p>
        <h2 className="rs-h2 mt-1 [overflow-wrap:anywhere]">{o?.label ?? origin}</h2>
        <p className="mt-1 text-sm text-ink-3">{o ? `${TYPE_LABEL[o.type]} · ${o.side}` : ''} · {result.direct.length} direct, {result.transitive.length} transitive{result.truncated ? ' · stopped at depth or size bound' : ''}</p>
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          <div><h3 className="rs-h3">Direct impact</h3>
            {result.direct.length ? <ul className="mt-3 grid gap-2">{result.direct.map((h) => <Hit key={h.node} h={h} />)}</ul> : <p className="mt-3 text-sm text-ink-3">Nothing depends on this node through the selected edge types.</p>}
          </div>
          <div><h3 className="rs-h3">Transitive impact</h3>
            {result.transitive.length ? <ul className="mt-3 grid gap-2">{result.transitive.map((h) => <Hit key={h.node} h={h} />)}</ul> : <p className="mt-3 text-sm text-ink-3">No further propagation within depth {depth}.</p>}
          </div>
        </div>
      </m.section>
    </div>
  );
}
