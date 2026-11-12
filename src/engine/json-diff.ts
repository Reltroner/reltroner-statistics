import { codeUnitCompare } from './canonical.ts';

/**
 * Structural JSON comparison (behavior carried over from P0-0.1.0, verified by regression tests):
 *  - Arrays whose members are all objects with a unique non-empty string identity field
 *    (first match of KEY_FIELDS) are compared by identity, so reordering is not a change.
 *  - `null` is distinct from 0, "" and from a missing member.
 *  - Added/removed subtrees expand to leaf-level evidence.
 * P0R change: member ordering uses code-unit order instead of host-locale `localeCompare`.
 */

export const KEY_FIELDS = Object.freeze(['name', 'code', 'id', 'series_id', 'indicator_id', 'event_id'] as const);

export type JsonChange =
  | 'ADDED'
  | 'REMOVED'
  | 'VALUE_CHANGED'
  | 'TYPE_CHANGED'
  | 'UNASSIGNED_TO_ASSIGNED'
  | 'ASSIGNED_TO_UNASSIGNED';

export interface JsonDifference {
  pointer: string;
  change: JsonChange;
  production_value?: unknown;
  remodeling_value?: unknown;
}

export function jsonKind(value: unknown): 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as 'object' | 'string' | 'number' | 'boolean';
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const field of KEY_FIELDS) {
      if (
        value.length &&
        value.every((x) => isPlainObject(x) && typeof x[field] === 'string' && (x[field] as string).length > 0)
      ) {
        const keys = value.map((x) => (x as Record<string, string>)[field]);
        if (new Set(keys).size === keys.length) {
          return Object.fromEntries(value.map((x) => [`[${(x as Record<string, string>)[field]}]`, normalizeJson(x)]));
        }
      }
    }
    return value.map(normalizeJson);
  }
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeJson(v)]));
  return value;
}

const join = (pointer: string, key: string) => (key.startsWith('[') ? pointer + key : pointer ? `${pointer}.${key}` : key);

export function compareJsonValues(production: unknown, remodeling: unknown): JsonDifference[] {
  const out: JsonDifference[] = [];
  const emitSubtree = (value: unknown, pointer: string, change: 'ADDED' | 'REMOVED') => {
    if (value && typeof value === 'object') {
      const pairs: Array<[string, unknown]> = Array.isArray(value)
        ? value.map((x, i) => [`[${i}]`, x])
        : Object.entries(value as Record<string, unknown>).sort(([a], [b]) => codeUnitCompare(a, b));
      if (pairs.length) {
        for (const [key, child] of pairs) emitSubtree(child, join(pointer, key), change);
        return;
      }
    }
    out.push(change === 'ADDED' ? { pointer, change, remodeling_value: value } : { pointer, change, production_value: value });
  };
  const walk = (a: unknown, b: unknown, pointer: string) => {
    if (isPlainObject(a) && isPlainObject(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(codeUnitCompare);
      for (const key of keys) {
        const next = join(pointer, key);
        if (!(key in a)) emitSubtree(b[key], next, 'ADDED');
        else if (!(key in b)) emitSubtree(a[key], next, 'REMOVED');
        else walk(a[key], b[key], next);
      }
      return;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        const next = `${pointer}[${i}]`;
        if (i >= a.length) out.push({ pointer: next, change: 'ADDED', remodeling_value: b[i] });
        else if (i >= b.length) out.push({ pointer: next, change: 'REMOVED', production_value: a[i] });
        else walk(a[i], b[i], next);
      }
      return;
    }
    if (Object.is(a, b)) return;
    const change: JsonChange =
      a === null && b !== null
        ? 'UNASSIGNED_TO_ASSIGNED'
        : b === null && a !== null
          ? 'ASSIGNED_TO_UNASSIGNED'
          : jsonKind(a) !== jsonKind(b)
            ? 'TYPE_CHANGED'
            : 'VALUE_CHANGED';
    out.push({ pointer, change, production_value: a, remodeling_value: b });
  };
  walk(normalizeJson(production), normalizeJson(remodeling), '');
  return out;
}

/** Resolve an engine pointer (`a.b[Name].c[0]`) against a normalized document. */
export function resolvePointer(normalized: unknown, pointer: string): { present: boolean; value?: unknown } {
  if (!pointer) return { present: true, value: normalized };
  const tokens: string[] = [];
  const re = /\[([^\]]*)\]|([^.[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pointer))) tokens.push(m[1] !== undefined ? `[${m[1]}]` : (m[2] as string));
  let cur: unknown = normalized;
  for (const t of tokens) {
    if (Array.isArray(cur) && /^\[\d+\]$/.test(t)) {
      const i = Number(t.slice(1, -1));
      if (i >= cur.length) return { present: false };
      cur = cur[i];
    } else if (isPlainObject(cur) && t in cur) {
      cur = cur[t];
    } else return { present: false };
  }
  return { present: true, value: cur };
}
