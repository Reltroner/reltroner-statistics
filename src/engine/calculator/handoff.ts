/**
 * Hand-off between /calculator and /assistant. Same-origin, session-scoped and user-initiated: one
 * validated request under one sessionStorage key, removed when it is consumed. Nothing is put in a
 * URL, a build artifact or a log, and the receiver recomputes the result with the shared engine
 * instead of trusting stored numbers. Without session storage the pages keep working: the link
 * still opens the other page and the sender shows its own deterministic explanation.
 */
import type { CalcRequest } from '../../domain/calculator.ts';
import { CALC_HANDOFF_SCHEMA, CalcHandoffSchema, type CalcHandoff } from '../../domain/calculator-schemas.ts';

export const HANDOFF_KEY = 'rs-calculator-handoff';
export const HANDOFF_MAX_CHARS = 8192;
export const HANDOFF_TTL_MS = 10 * 60_000;
export type HandoffTarget = CalcHandoff['target'];
/** Destination paths never carry a query string or fragment with scenario content. */
export const HANDOFF_PATH: Readonly<Record<HandoffTarget, string>> = Object.freeze({ calculator: '/calculator', assistant: '/assistant' });

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** sessionStorage, or null where the browser blocks it (privacy mode, disabled storage). */
export function sessionStore(): Store | null {
  try {
    const store = globalThis.sessionStorage;
    const probe = `${HANDOFF_KEY}:probe`;
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export function encodeHandoff(target: HandoffTarget, request: CalcRequest, nowMs: number): string | null {
  const parsed = CalcHandoffSchema.safeParse({ schema_version: CALC_HANDOFF_SCHEMA, target, created_at_ms: Math.trunc(nowMs), request });
  if (!parsed.success) return null;
  const raw = JSON.stringify(parsed.data);
  return raw.length <= HANDOFF_MAX_CHARS ? raw : null;
}

/** Null for anything oversized, malformed, unknown, addressed elsewhere or expired. */
export function decodeHandoff(raw: string | null, target: HandoffTarget, nowMs: number): CalcRequest | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > HANDOFF_MAX_CHARS) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  const parsed = CalcHandoffSchema.safeParse(value);
  if (!parsed.success || parsed.data.target !== target) return null;
  const age = nowMs - parsed.data.created_at_ms;
  return age >= 0 && age <= HANDOFF_TTL_MS ? (parsed.data.request as CalcRequest) : null;
}

/** True when the request was stored for the other page. False means: fall back, do not navigate with data. */
export function writeHandoff(store: Store | null, target: HandoffTarget, request: CalcRequest, nowMs: number): boolean {
  const raw = encodeHandoff(target, request, nowMs);
  if (!store || raw === null) return false;
  try {
    store.setItem(HANDOFF_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/** Reads the payload once. A payload for this page, or one that is invalid or expired, is removed. */
export function takeHandoff(store: Store | null, target: HandoffTarget, nowMs: number): CalcRequest | null {
  if (!store) return null;
  try {
    const raw = store.getItem(HANDOFF_KEY);
    if (raw === null) return null;
    const request = decodeHandoff(raw, target, nowMs);
    // A valid payload addressed to the other page is left for that page.
    if (request || decodeHandoff(raw, target === 'calculator' ? 'assistant' : 'calculator', nowMs) === null) store.removeItem(HANDOFF_KEY);
    return request;
  } catch {
    return null;
  }
}
