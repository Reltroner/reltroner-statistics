import { useMemo, useState } from 'react';
import { formatValue } from '../../lib/format.ts';
import type { CountryRow, IndicatorMeta } from '../../lib/views.ts';

interface Props { rows: CountryRow[]; indicators: IndicatorMeta[]; initial?: string[] }

const MAX = 4;

/** Side-by-side comparison. Each cell shows the value and its position within the 19-nation range. */
export default function CountryCompare({ rows, indicators, initial = [] }: Props) {
  const [picked, setPicked] = useState<string[]>(initial.slice(0, MAX));
  const ranges = useMemo(() => Object.fromEntries(indicators.map((i) => {
    const vals = rows.map((r) => r.values[i.id]).filter((v): v is number => v != null);
    return [i.id, vals.length ? ([Math.min(...vals), Math.max(...vals)] as [number, number]) : null];
  })) as Record<string, [number, number] | null>, [rows, indicators]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX ? [...p, id] : p));
  const chosen = picked.map((id) => rows.find((r) => r.id === id)!).filter(Boolean);
  const pos = (id: string, v: number | null) => {
    const r = ranges[id];
    if (v == null || !r) return null;
    return r[1] === r[0] ? 50 : ((v - r[0]) / (r[1] - r[0])) * 100;
  };

  return (
    <div>
      <fieldset>
        <legend className="rs-label">Choose up to {MAX} nations ({picked.length} selected)</legend>
        <div className="flex flex-wrap gap-2">
          {rows.map((r) => {
            const on = picked.includes(r.id);
            return (
              <label key={r.id} className={`rs-chip cursor-pointer !text-[0.8rem] ${on ? '!border-[var(--accent)] !text-[var(--text)]' : ''} ${!on && picked.length >= MAX ? 'opacity-50' : ''}`}>
                <input type="checkbox" className="rs-sr" checked={on} disabled={!on && picked.length >= MAX} onChange={() => toggle(r.id)} />
                {on && <span aria-hidden="true">✓</span>}{r.name}
              </label>
            );
          })}
        </div>
      </fieldset>
      {chosen.length === 0 ? (
        <p className="rs-notice mt-4" data-tone="unavailable">Select at least one nation to compare its production canon values.</p>
      ) : (
        <div className="rs-table-wrap mt-4" tabIndex={0}>
          <table className="rs-table">
            <thead>
              <tr><th scope="col">Indicator</th>{chosen.map((c) => <th scope="col" key={c.id}>{c.name}<span className="block text-[0.62rem] font-semibold normal-case tracking-normal text-ink-3">{c.cohort === 'PROFILED_14' ? 'Profiled' : 'Development'}</span></th>)}</tr>
            </thead>
            <tbody>
              {indicators.map((i) => (
                <tr key={i.id}>
                  <th scope="row" className="!normal-case !tracking-normal !text-[0.82rem] !font-semibold !text-ink-2 !bg-transparent">{i.label}<span className="block text-[0.7rem] font-normal text-ink-3">{i.unit}</span></th>
                  {chosen.map((c) => {
                    const v = c.values[i.id] ?? null;
                    const p = pos(i.id, v);
                    return (
                      <td key={c.id} className="min-w-[9rem]">
                        <span className={v == null ? 'text-ink-3' : 'font-semibold text-ink'}>{v == null ? (c.states[i.id] === 'MISSING' ? 'Not in source record' : 'Not assigned') : formatValue(v, i.format)}</span>
                        {p != null && (
                          <span className="relative mt-1.5 block h-1.5 rounded-full bg-[var(--chart-grid)]" aria-hidden="true" title="Position within the range of all 19 nations">
                            <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" style={{ left: `${p}%`, background: 'var(--series-1)', borderColor: 'var(--chart-surface)' }} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-3">Bars show each value’s position between the lowest and highest assigned value among the 19 modeled nations. “Not assigned” is an explicit null in the source; “Not in source record” means the member is absent. Neither is zero.</p>
    </div>
  );
}
