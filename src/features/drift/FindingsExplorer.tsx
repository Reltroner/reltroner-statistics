import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable,
  type ColumnFiltersState, type RowSelectionState, type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Finding } from '../../domain/finding.ts';
import { SELECTION_KEY } from '../reports/download.ts';

const col = createColumnHelper<Finding>();
const short = (v: Finding['production']) => (!v.present ? '—' : v.value === null ? 'null' : typeof v.value === 'string' ? (v.value.length > 40 ? `${v.value.slice(0, 39)}…` : v.value) : JSON.stringify(v.value));
const FILTERS = ['classification', 'level', 'review_status', 'priority'] as const;


export default function FindingsExplorer() {
  const [data, setData] = useState<Finding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [file, setFile] = useState('');
  const [filters, setFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'priority', desc: false }]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQuery(p.get('q') ?? '');
    setFile(p.get('file') ?? '');
    setFilters(FILTERS.flatMap((k) => (p.get(k) ? [{ id: k, value: p.get(k)! }] : [])));
    fetch('/data/findings.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { findings: Finding[] }) => setData(j.findings))
      .catch(() => setError('Finding data could not be loaded. Each finding remains available at its own page.'));
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (file) p.set('file', file);
    for (const f of filters) p.set(f.id, String(f.value));
    const qs = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}#explorer`);
  }, [query, file, filters]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.filter((f) => (!file || f.file_path === file) && (!q || `${f.id} ${f.title} ${f.file_path} ${f.locator} ${f.entity?.name ?? ''}`.toLowerCase().includes(q)));
  }, [data, query, file]);

  const columns = useMemo(() => [
    col.display({
      id: 'select',
      header: ({ table }) => <input type="checkbox" aria-label="Select all matching findings" checked={table.getIsAllRowsSelected()} ref={(el) => { if (el) el.indeterminate = table.getIsSomeRowsSelected(); }} onChange={table.getToggleAllRowsSelectedHandler()} />,
      cell: ({ row }) => <input type="checkbox" aria-label={`Select ${row.original.id}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
      size: 40,
    }),
    col.accessor('id', { header: 'ID', cell: (c) => <a href={`/drift/${c.getValue()}`} className="font-mono text-[0.78rem]">{c.getValue()}</a>, size: 150 }),
    col.accessor('priority', { header: 'Pri.', filterFn: 'equals', size: 56 }),
    col.accessor('classification', { header: 'Classification', filterFn: 'equals', cell: (c) => <span className="text-[0.75rem] font-semibold">{c.getValue().replaceAll('_', ' ')}</span>, size: 150 }),
    col.accessor('level', { header: 'Level', filterFn: 'equals', size: 90 }),
    col.accessor('title', { header: 'Finding', cell: (c) => <span className="line-clamp-2">{c.getValue()}</span>, size: 340 }),
    col.accessor((f) => short(f.production), { id: 'production', header: 'Production', enableSorting: false, size: 110 }),
    col.accessor((f) => short(f.remodeling), { id: 'remodeling', header: 'Remodeling', enableSorting: false, size: 110 }),
    col.accessor('review_status', { header: 'Review', filterFn: 'equals', cell: (c) => <span className="text-[0.75rem]">{c.getValue().replaceAll('_', ' ').toLowerCase()}</span>, size: 120 }),
  ], []);

  const table = useReactTable({
    data: rows, columns, state: { columnFilters: filters, sorting, rowSelection: selection },
    onColumnFiltersChange: setFilters, onSortingChange: setSorting, onRowSelectionChange: setSelection,
    getRowId: (f) => f.id, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
  });
  const visible = table.getRowModel().rows;
  const virtual = useVirtualizer({ count: visible.length, getScrollElement: () => scroller.current, estimateSize: () => 58, overscan: 12 });
  const items = virtual.getVirtualItems();
  const padTop = items[0]?.start ?? 0;
  const padBottom = items.length ? virtual.getTotalSize() - items[items.length - 1]!.end : 0;
  const selected = Object.keys(selection).filter((k) => selection[k]);
  const options = (key: keyof Finding) => [...new Set((data ?? []).map((f) => String(f[key])))].sort();
  const files = useMemo(() => [...new Set((data ?? []).map((f) => f.file_path))].sort(), [data]);
  const setFilter = (id: string, value: string) => setFilters((fs) => [...fs.filter((f) => f.id !== id), ...(value ? [{ id, value }] : [])]);

  const exportSelected = () => {
    try { sessionStorage.setItem(SELECTION_KEY, JSON.stringify(selected)); } catch { /* storage blocked */ }
    window.location.assign('/reports?selection=drift');
  };

  if (error) return <p className="rs-notice" data-tone="unavailable">{error}</p>;
  if (!data) return <p className="rs-notice" data-tone="unavailable">Loading findings…</p>;
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-2"><span className="rs-label">Search</span>
          <input className="rs-input w-full" type="search" placeholder="ID, title, path, field, entity" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        {FILTERS.map((k) => (
          <label key={k}><span className="rs-label">{k.replace('_', ' ')}</span>
            <select className="rs-select w-full" value={String(filters.find((f) => f.id === k)?.value ?? '')} onChange={(e) => setFilter(k, e.target.value)}>
              <option value="">All</option>{options(k).map((o) => <option key={o} value={o}>{o}</option>)}
            </select></label>
        ))}
        <label className="sm:col-span-2 lg:col-span-6"><span className="rs-label">File</span>
          <select className="rs-select w-full" value={file} onChange={(e) => setFile(e.target.value)}>
            <option value="">All files ({files.length})</option>{files.map((f) => <option key={f} value={f}>{f}</option>)}
          </select></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-ink-2" aria-live="polite"><strong className="text-ink">{visible.length}</strong> of {data.length} findings{selected.length ? ` · ${selected.length} selected` : ''}</p>
        <div className="flex gap-2">
          {(query || file || filters.length > 0) && <button type="button" className="rs-button rs-button-ghost" onClick={() => { setQuery(''); setFile(''); setFilters([]); }}>Clear filters</button>}
          <button type="button" className="rs-button rs-button-primary" disabled={!selected.length} onClick={exportSelected}>Export selected ({selected.length})</button>
        </div>
      </div>
      <div ref={scroller} className="rs-table-wrap mt-3 max-h-[70vh] overflow-auto" tabIndex={0} aria-label="Findings table (scrollable)">
        <table className="rs-table min-w-[1000px] table-fixed" aria-rowcount={visible.length + 1}>
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>{hg.headers.map((h) => (
                <th key={h.id} style={{ width: h.getSize() }} aria-sort={h.column.getIsSorted() === 'asc' ? 'ascending' : h.column.getIsSorted() === 'desc' ? 'descending' : undefined}>
                  {h.column.getCanSort() ? (
                    <button type="button" className="inline-flex items-center gap-1 font-[inherit] uppercase tracking-[inherit] text-ink-3 hover:text-ink" onClick={h.column.getToggleSortingHandler()}>
                      {flexRender(h.column.columnDef.header, h.getContext())}<span aria-hidden="true">{h.column.getIsSorted() === 'asc' ? '↑' : h.column.getIsSorted() === 'desc' ? '↓' : ''}</span>
                    </button>
                  ) : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}</tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: padTop, padding: 0, border: 0 }} /></tr>}
            {items.map((vi) => {
              const row = visible[vi.index]!;
              return (
                <tr key={row.id} aria-rowindex={vi.index + 2} data-selected={row.getIsSelected() || undefined} style={{ height: 58 }}>
                  {row.getVisibleCells().map((c) => <td key={c.id} className="overflow-hidden">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
                </tr>
              );
            })}
            {padBottom > 0 && <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: padBottom, padding: 0, border: 0 }} /></tr>}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && <p className="mt-3 text-sm text-ink-3">No findings match these filters.</p>}
    </div>
  );
}
