import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { MotionRoot, useMotionTransition } from '../motion/MotionRoot.tsx';
import {
  NARRATIVE_ENTITY_KINDS,
  NARRATIVE_RELATIONSHIP_TYPES,
  type NarrativeEntity,
  type NarrativeRelationship,
} from '../../domain/creative.ts';

interface Props {
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
}

export default function NarrativeGraphExplorer({ entities, relationships }: Props) {
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [sideFilter, setSideFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [relTypeFilter, setRelTypeFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string>(() => {
    return entities.find((e) => e.id === 'nar:nation:reltronland')?.id ?? entities[0]?.id ?? '';
  });
  const transition = useMotionTransition('content');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ent = params.get('entity');
    if (ent && entities.some((e) => e.id === ent)) {
      setSelectedId(ent);
    }
  }, [entities]);

  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  const filteredEntities = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entities.filter((e) => {
      if (kindFilter && e.kind !== kindFilter) return false;
      if (sideFilter && e.source_side !== sideFilter) return false;
      if (statusFilter && e.canon_status !== statusFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.source_path.toLowerCase().includes(q) ||
        e.original_terminology.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [entities, query, kindFilter, sideFilter, statusFilter]);

  const selectedEntity = useMemo(
    () => entityById.get(selectedId) ?? filteredEntities[0] ?? null,
    [entityById, selectedId, filteredEntities],
  );

  const selectedRelationships = useMemo(() => {
    if (!selectedEntity) return { outgoing: [] as NarrativeRelationship[], incoming: [] as NarrativeRelationship[] };
    const outgoing = relationships.filter(
      (r) => r.source_id === selectedEntity.id && (!relTypeFilter || r.type === relTypeFilter),
    );
    const incoming = relationships.filter(
      (r) => r.target_id === selectedEntity.id && (!relTypeFilter || r.type === relTypeFilter),
    );
    return { outgoing, incoming };
  }, [relationships, selectedEntity, relTypeFilter]);

  const presentKinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entities) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    return NARRATIVE_ENTITY_KINDS.filter((k) => counts.has(k)).map((k) => ({ kind: k, count: counts.get(k)! }));
  }, [entities]);

  return (
    <MotionRoot>
      <div className="grid gap-6">
        <div className="rs-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="sm:col-span-2 lg:col-span-2">
            <span className="rs-label">Search narrative entities</span>
            <input
              type="search"
              className="rs-input w-full"
              placeholder="Name, terminology, source path, or ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span className="rs-label">Entity kind</span>
            <select className="rs-select w-full" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="">All kinds ({entities.length})</option>
              {presentKinds.map(({ kind, count }) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll('_', ' ')} ({count})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="rs-label">Source side</span>
            <select className="rs-select w-full" value={sideFilter} onChange={(e) => setSideFilter(e.target.value)}>
              <option value="">All sides</option>
              <option value="both">Both (production + remodeling)</option>
              <option value="production">Production only</option>
              <option value="remodeling">Remodeling proposal only</option>
            </select>
          </label>
          <label>
            <span className="rs-label">Canon status</span>
            <select className="rs-select w-full" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="CANON_OBSERVED">CANON_OBSERVED</option>
              <option value="PROPOSED">PROPOSED (remodeling/provisional)</option>
              <option value="SCENARIO">SCENARIO</option>
            </select>
          </label>
        </div>

        <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="rs-card flex flex-col p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Showing {filteredEntities.length} of {entities.length} entities
              </p>
              {(query || kindFilter || sideFilter || statusFilter) && (
                <button
                  type="button"
                  className="rs-button rs-button-ghost !min-h-8 !px-2 !py-1 !text-xs"
                  onClick={() => {
                    setQuery('');
                    setKindFilter('');
                    setSideFilter('');
                    setStatusFilter('');
                  }}
                >
                  Reset
                </button>
              )}
            </div>
            <ul
              aria-label="Narrative entities"
              className="max-h-[34rem] divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-line"
            >
              {filteredEntities.slice(0, 150).map((ent) => {
                const isSelected = selectedEntity?.id === ent.id;
                return (
                  <li key={ent.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(ent.id)}
                      className={`w-full px-3 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-accent-soft text-ink' : 'hover:bg-surface-2 text-ink-2'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[0.7rem] uppercase text-cyan">{ent.kind.replaceAll('_', ' ')}</span>
                        <span className="rs-pill text-[0.65rem]">{ent.canon_status}</span>
                      </div>
                      <span className="mt-0.5 block font-semibold text-ink">{ent.name}</span>
                      <span className="mt-0.5 block truncate font-mono text-[0.7rem] text-ink-3">{ent.source_path}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <AnimatePresence mode="wait">
            {selectedEntity ? (
              <m.div
                key={selectedEntity.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={transition}
                className="rs-card grid gap-6 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rs-eyebrow">{selectedEntity.kind.replaceAll('_', ' ')}</span>
                      <span className="rs-pill">{selectedEntity.canon_status}</span>
                      <span className="rs-pill">{selectedEntity.extraction_confidence}</span>
                      <span className="rs-pill">side: {selectedEntity.source_side}</span>
                    </div>
                    <h3 className="rs-h2 mt-2">{selectedEntity.name}</h3>
                    <p className="mt-1 font-mono text-xs text-ink-3">{selectedEntity.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/creative/impact?origin=${encodeURIComponent(selectedEntity.id)}`}
                      className="rs-button rs-button-ghost !min-h-9 !px-3 !text-xs no-underline"
                    >
                      Simulate Impact →
                    </a>
                    <a
                      href={`/creative/ideas?entity=${encodeURIComponent(selectedEntity.id)}`}
                      className="rs-button rs-button-primary !min-h-9 !px-3 !text-xs no-underline"
                    >
                      Brainstorm with Entity →
                    </a>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-4">
                    <p className="rs-eyebrow">Source-Grounded Summary</p>
                    <p className="mt-2 text-sm leading-relaxed text-ink">{selectedEntity.summary}</p>
                    {selectedEntity.original_terminology.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {selectedEntity.original_terminology.map((term) => (
                          <span key={term} className="rounded bg-accent-soft px-2 py-0.5 font-mono text-xs text-ink">
                            {term}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 rounded-xl border border-line bg-surface-2 p-4">
                    <p className="rs-eyebrow">Provenance & Chronology</p>
                    <dl className="mt-2 grid gap-1.5 text-xs">
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-ink-3">Source path</dt>
                        <dd className="m-0 break-all font-mono text-ink">{selectedEntity.source_path}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-ink-3">Evidence locator</dt>
                        <dd className="m-0 break-all font-mono text-ink">
                          {selectedEntity.evidence_locator}
                          {selectedEntity.evidence_line ? ` (line ${selectedEntity.evidence_line})` : ''}
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-ink-3">Commit / Blob SHA</dt>
                        <dd className="m-0 break-all font-mono text-ink">
                          {selectedEntity.commit_sha.slice(0, 10)} / {selectedEntity.blob_sha.slice(0, 10)}
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-ink-3">In-universe BAC era</dt>
                        <dd className="m-0 font-semibold text-cyan">
                          {selectedEntity.historical_bac ? selectedEntity.historical_bac.label : 'Timeless / Unassigned'}
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-ink-3">Editorial updated</dt>
                        <dd className="m-0 font-mono text-ink-2">{selectedEntity.editorial_updated_at ?? '—'}</dd>
                      </div>
                    </dl>
                    <blockquote className="mt-3 border-l-2 border-[var(--accent)] pl-3 text-xs italic text-ink-2">
                      “{selectedEntity.evidence_quote}”
                    </blockquote>
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="rs-h3">
                      Typed Narrative Relationships ({selectedRelationships.outgoing.length + selectedRelationships.incoming.length})
                    </h4>
                    <label className="flex items-center gap-2 text-xs">
                      <span className="text-ink-3">Filter edge type:</span>
                      <select
                        className="rs-select !py-1 !text-xs"
                        value={relTypeFilter}
                        onChange={(e) => setRelTypeFilter(e.target.value)}
                      >
                        <option value="">All relationship types</option>
                        {NARRATIVE_RELATIONSHIP_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">
                        Outgoing ({selectedRelationships.outgoing.length})
                      </p>
                      {selectedRelationships.outgoing.length === 0 ? (
                        <p className="text-xs text-ink-3">No outgoing relationships matching filter.</p>
                      ) : (
                        <ul className="grid gap-2">
                          {selectedRelationships.outgoing.slice(0, 20).map((rel) => {
                            const target = entityById.get(rel.target_id);
                            return (
                              <li key={rel.id} className="rounded-lg border border-line p-3 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-1">
                                  <span className="font-mono font-bold text-cyan">{rel.type}</span>
                                  <span className="rs-pill text-[0.65rem]">{rel.verification}</span>
                                </div>
                                <button
                                  type="button"
                                  className="mt-1 font-semibold text-ink underline hover:text-cyan"
                                  onClick={() => setSelectedId(rel.target_id)}
                                >
                                  → {target ? `${target.name} (${target.kind})` : rel.target_id}
                                </button>
                                <p className="mt-1 text-ink-2">{rel.rationale}</p>
                                <p className="mt-1 break-all font-mono text-[0.68rem] text-ink-3">
                                  Causal class: {rel.causal_class} · {rel.source_path}
                                  {rel.evidence_line ? `:${rel.evidence_line}` : ''}
                                </p>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">
                        Incoming ({selectedRelationships.incoming.length})
                      </p>
                      {selectedRelationships.incoming.length === 0 ? (
                        <p className="text-xs text-ink-3">No incoming relationships matching filter.</p>
                      ) : (
                        <ul className="grid gap-2">
                          {selectedRelationships.incoming.slice(0, 20).map((rel) => {
                            const source = entityById.get(rel.source_id);
                            return (
                              <li key={rel.id} className="rounded-lg border border-line p-3 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-1">
                                  <span className="font-mono font-bold text-cyan">{rel.type}</span>
                                  <span className="rs-pill text-[0.65rem]">{rel.verification}</span>
                                </div>
                                <button
                                  type="button"
                                  className="mt-1 font-semibold text-ink underline hover:text-cyan"
                                  onClick={() => setSelectedId(rel.source_id)}
                                >
                                  ← {source ? `${source.name} (${source.kind})` : rel.source_id}
                                </button>
                                <p className="mt-1 text-ink-2">{rel.rationale}</p>
                                <p className="mt-1 break-all font-mono text-[0.68rem] text-ink-3">
                                  Causal class: {rel.causal_class} · {rel.source_path}
                                  {rel.evidence_line ? `:${rel.evidence_line}` : ''}
                                </p>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </m.div>
            ) : (
              <div className="rs-card p-6">
                <p className="text-sm text-ink-3">No narrative entity matches the current filters.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MotionRoot>
  );
}
