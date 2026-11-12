/** Isomorphic number formatting. Null is rendered as "Not assigned", never as zero. */
import type { IndicatorFormat } from '../domain/indicators.ts';
import type { EpistemicStatus } from '../domain/status.ts';

const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

export function scientific(value: number, digits = 3): string {
  if (value === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(value)));
  const mant = value / 10 ** exp;
  const e = String(exp).split('').map((c) => SUPERSCRIPT[c] ?? c).join('');
  return `${mant.toFixed(digits - 1)} × 10${e}`;
}

export function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e15) return scientific(value);
  if (abs >= 1e12) return `${trim(value / 1e12)} trillion`;
  if (abs >= 1e9) return `${trim(value / 1e9)} billion`;
  if (abs >= 1e6) return `${trim(value / 1e6)} million`;
  if (abs >= 1e4) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return trim(value);
}

function trim(v: number, max = 3): string {
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 1 : abs >= 10 ? 2 : max;
  return Number(v.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function formatValue(value: number | null | undefined, format: IndicatorFormat | string = 'number'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Not assigned';
  switch (format) {
    case 'ratio_pct': {
      const pct = value * 100;
      const d = Math.abs(pct) < 1 ? 3 : Math.abs(pct) < 10 ? 2 : 1;
      return `${Number(pct.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d })}%`;
    }
    case 'index':
      return value.toFixed(3);
    case 'usd':
      return `USD ${compact(value)}`;
    case 'years':
      return `${trim(value)} years`;
    case 'billion':
      return `${trim(value)} billion`;
    case 'area':
      return `${trim(value)} million km²`;
    default:
      return trim(value, 4);
  }
}

/** Short axis/tick formatter for charts. */
export function tickValue(value: number, format: IndicatorFormat | string): string {
  if (!Number.isFinite(value)) return '';
  if (format === 'ratio_pct') return `${Number((value * 100).toFixed(2))}%`;
  if (format === 'usd') return Math.abs(value) >= 1e15 ? scientific(value, 2) : compact(value);
  if (Math.abs(value) >= 1e4) return compact(value);
  return String(Number(value.toPrecision(4)));
}

export function formatDelta(absolute: number, relative: number | null): string {
  const sign = absolute > 0 ? '+' : absolute < 0 ? '−' : '±';
  const abs = Math.abs(absolute);
  const rel = relative === null ? '' : ` (${relative > 0 ? '+' : relative < 0 ? '−' : '±'}${Number((Math.abs(relative) * 100).toFixed(1))}%)`;
  return `${sign}${abs >= 1e4 ? compact(abs) : trim(abs, 4)}${rel}`;
}

export type Tone = 'canon' | 'proposed' | 'scenario' | 'model' | 'archived' | 'unknown';

export function statusTone(status: EpistemicStatus | string): Tone {
  switch (status) {
    case 'CANON_OBSERVED':
    case 'CANON_DERIVED':
      return 'canon';
    case 'PROPOSED':
      return 'proposed';
    case 'SCENARIO':
      return 'scenario';
    case 'MODEL_ESTIMATE':
      return 'model';
    case 'ARCHIVED':
      return 'archived';
    default:
      return 'unknown';
  }
}

export function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
