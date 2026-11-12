/**
 * Locale-independent ordering and canonical JSON. Isomorphic (no Node imports).
 *
 * `String.prototype.localeCompare` depends on the host ICU locale and differed between the
 * Windows workstation and Ubuntu CI. Every ordering in the engine uses UTF-16 code-unit order.
 */

export function codeUnitCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort(codeUnitCompare);
}

/** Deterministic JSON: object keys in code-unit order, no whitespace, `undefined` members dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite number in canonical JSON');
    if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
      throw new Error(`Unsupported canonical JSON type: ${typeof value}`);
    }
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of sortedKeys(obj)) {
    if (obj[key] === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${canonicalJson(obj[key])}`);
  }
  return `{${parts.join(',')}}`;
}

export function deepEqualJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
