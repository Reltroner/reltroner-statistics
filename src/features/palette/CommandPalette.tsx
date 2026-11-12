import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

interface Entry { title: string; href: string; kind: string; summary: string }

function score(entry: Entry, terms: string[]): number {
  const hay = `${entry.title} ${entry.kind} ${entry.summary}`.toLowerCase();
  let s = 0;
  for (const t of terms) {
    const i = hay.indexOf(t);
    if (i < 0) return -1;
    s += (entry.title.toLowerCase().startsWith(t) ? 6 : 0) + (entry.title.toLowerCase().includes(t) ? 3 : 0) + (i === 0 ? 1 : 0);
  }
  return s;
}

export default function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const load = useCallback(async () => {
    if (entries) return;
    try {
      const res = await fetch('/data/search-index.json');
      if (!res.ok) throw new Error(String(res.status));
      setEntries((await res.json()) as Entry[]);
    } catch {
      setError('The search index could not be loaded. Navigation links remain available in the header.');
    }
  }, [entries]);

  const open = useCallback(() => {
    const d = dialog.current;
    (window as unknown as { __rsPaletteRequested?: boolean }).__rsPaletteRequested = false;
    if (!d || d.open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    d.showModal();
    setActive(0);
    void load();
    requestAnimationFrame(() => input.current?.focus());
  }, [load]);

  const close = useCallback(() => {
    dialog.current?.close();
  }, []);

  useEffect(() => {
    const onOpen = () => open();
    window.addEventListener('rs:palette:open', onOpen);
    const w = window as unknown as { __rsPaletteRequested?: boolean };
    if (w.__rsPaletteRequested) open();
    const d = dialog.current;
    const onClose = () => {
      setQuery('');
      opener.current?.focus();
    };
    d?.addEventListener('close', onClose);
    return () => {
      window.removeEventListener('rs:palette:open', onOpen);
      d?.removeEventListener('close', onClose);
    };
  }, [open]);

  const results = useMemo(() => {
    if (!entries) return [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return entries.filter((e) => e.kind === 'Page').slice(0, 16);
    return entries
      .map((e) => ({ e, s: score(e, terms) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title, 'en'))
      .slice(0, 30)
      .map((x) => x.e);
  }, [entries, query]);

  useEffect(() => setActive(0), [query]);

  const go = (href: string) => {
    close();
    window.location.assign(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // A non-empty search field swallows the first Escape (it clears the text), so close explicitly.
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active].href); }
  };

  useEffect(() => {
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  return (
    <dialog
      ref={dialog}
      aria-label="Search the observatory"
      className="rs-palette"
      onClick={(e) => { if (e.target === dialog.current) close(); }}
    >
      <div className="rs-palette-panel" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            ref={input}
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-opt-${active}` : undefined}
            aria-autocomplete="list"
            placeholder="Search pages, indicators, countries, findings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-14 w-full bg-transparent text-[1rem] text-ink outline-none placeholder:text-ink-3"
          />
          <button type="button" onClick={close} className="rs-kbd cursor-pointer" aria-label="Close search">Esc</button>
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {error && <li className="px-3 py-6 text-sm text-ink-3">{error}</li>}
          {!error && !entries && <li className="px-3 py-6 text-sm text-ink-3">Loading index…</li>}
          {entries && results.length === 0 && <li className="px-3 py-6 text-sm text-ink-3">No matches for “{query}”.</li>}
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.href}`}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => go(r.href)}
              className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 ${i === active ? 'bg-accent-soft' : ''}`}
            >
              <span className="rs-chip mt-0.5 !px-2 !py-0 !text-[0.65rem]">{r.kind}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                <span className="block truncate text-xs text-ink-3">{r.summary}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="flex gap-4 border-t border-line px-4 py-2 text-[0.7rem] text-ink-3">
          <span><kbd className="rs-kbd">↑</kbd> <kbd className="rs-kbd">↓</kbd> move</span>
          <span><kbd className="rs-kbd">Enter</kbd> open</span>
          <span><kbd className="rs-kbd">Esc</kbd> close</span>
        </p>
      </div>
    </dialog>
  );
}
