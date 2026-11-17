/**
 * Decodes the props Astro serializes on an <astro-island> (astro/dist/runtime/server/serialize.js):
 * every value is a [type, value] pair. These props are exactly the data the island renders from
 * in the browser, so the page mirror reads the same numbers as the human page.
 *
 * A type this decoder does not know fails the build loudly instead of guessing; a unit test round-
 * trips Astro's own serializer through this decoder.
 */

const VALUE = 0;
const JSON_ARRAY = 1;
const REGEXP = 2;
const DATE = 3;
const MAP = 4;
const SET = 5;
const BIGINT = 6;
const URL_TYPE = 7;
const U8 = 8;
const U16 = 9;
const U32 = 10;
const INFINITY = 11;

function revive(v: unknown, where: string): unknown {
  if (!Array.isArray(v) || v.length < 1 || v.length > 2 || typeof v[0] !== 'number') throw new Error(`Unexpected serialized prop at ${where}`);
  const [type, value] = v as [number, unknown];
  switch (type) {
    case VALUE:
      if (value === undefined) return undefined;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, x]) => [k, revive(x, `${where}.${k}`)]));
      return value;
    case JSON_ARRAY:
    case SET:
      return (value as unknown[]).map((x, i) => revive(x, `${where}[${i}]`));
    case MAP:
      return (value as unknown[]).map((x, i) => revive(x, `${where}[${i}]`));
    case REGEXP:
    case DATE:
    case BIGINT:
    case URL_TYPE:
      return String(value);
    case U8:
    case U16:
    case U32:
      return [...(value as number[])];
    case INFINITY:
      return (value as number) > 0 ? 'Infinity' : '-Infinity';
    default:
      throw new Error(`Unknown serialized prop type ${type} at ${where}. Astro's island prop format changed; update props.ts.`);
  }
}

/** `raw` is the decoded value of the island's props attribute. */
export function reviveAstroProps(raw: string, where = 'island'): Record<string, unknown> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, revive(v, `${where}.${k}`)]));
}
