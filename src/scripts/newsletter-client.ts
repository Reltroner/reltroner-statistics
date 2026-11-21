/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R1: browser adapter for the one canonical newsletter service, Reltroner
 * Studio's POST /api/newsletter. This module never stores subscribers, holds keys or decides subscription
 * state: it validates input, sends at most one consented request per submit from the live Statistics
 * domain, and maps Studio's existing JSON response contract to a truthful message. Pure (no DOM), so it is
 * unit-tested directly.
 */

export const STUDIO_ORIGIN = 'https://www.reltroner.com';
export const STUDIO_NEWSLETTER_ENDPOINT = `${STUDIO_ORIGIN}/api/newsletter`;
export const STUDIO_LINKS = Object.freeze({
  privacy: `${STUDIO_ORIGIN}/privacy`,
  unsubscribe: `${STUDIO_ORIGIN}/newsletter/unsubscribe`,
  signup: `${STUDIO_ORIGIN}/contact#newsletter`,
});
/** The only page origin that may send a request; every other host renders the preview. */
export const LIVE_HOSTNAME = 'statistics.reltroner.com';
export const REQUEST_TIMEOUT_MS = 10_000;

export type NewsletterMode = 'live' | 'preview';

export function newsletterMode(location: { protocol: string; hostname: string; port: string }): NewsletterMode {
  return location.protocol === 'https:' && location.hostname.toLowerCase() === LIVE_HOSTNAME && location.port === '' ? 'live' : 'preview';
}

export type Validation = { ok: true; email: string } | { ok: false; field: 'email' | 'consent'; message: string };

/** Same rules as Studio's validator: trimmed, lower-cased, at most 254 characters, explicit consent. */
export function validateSubscription(email: unknown, consent: unknown): Validation {
  const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!value) return { ok: false, field: 'email', message: 'Please enter your email address.' };
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { ok: false, field: 'email', message: 'Please enter a valid email address.' };
  if (consent !== true) return { ok: false, field: 'consent', message: 'Please confirm that you would like to receive Studio updates.' };
  return { ok: true, email: value };
}

/** Where an outcome came from. Only `application-result` carries a validated Studio response. */
export type OutcomeCategory = 'application-result' | 'platform-error' | 'platform-rate-limit' | 'invalid-response' | 'timeout' | 'network' | 'offline' | 'not-sent' | 'preview';

export interface Outcome {
  /** True only for a 2xx Studio result whose status is accepted, subscribed or duplicate. */
  confirmed: boolean;
  /** Studio's status token, or a local one (`loading`, `held`, `preview`, `invalid`, `network-error`). */
  status: string;
  message: string;
  category: OutcomeCategory;
  requestSent: boolean;
  httpStatus: number | null;
  retryAfterSeconds: number | null;
}

/** Primitive-only diagnostic: never the address, the body or exception text. */
export function diagnosticOf(o: Outcome): string {
  return JSON.stringify({ scope: 'statistics-newsletter', category: o.category, status: o.status, requestSent: o.requestSent, httpStatus: o.httpStatus, retryAfterSeconds: o.retryAfterSeconds });
}

const STATUSES = new Set(['invalid', 'prototype', 'accepted', 'subscribed', 'duplicate', 'rejected', 'network-error', 'quota-error']);
const SUCCESS = new Set(['prototype', 'accepted', 'subscribed', 'duplicate']);
const MAX_RESPONSE_BYTES = 16_384;
const HOLD_SECONDS = 10;
const MAX_HOLD_SECONDS = 3600;
const UNCONFIRMED = 'Your address may or may not have been saved, and no automatic retry was made.';

const MESSAGES: Record<string, string> = {
  accepted: 'Reltroner Studio accepted your subscription. Signing up does not send a welcome email; you can unsubscribe at any time on Studio.',
  subscribed: 'Reltroner Studio confirmed your subscription. Signing up does not send a welcome email; you can unsubscribe at any time on Studio.',
  duplicate: 'Reltroner Studio reports that this address is already subscribed. Nothing changed.',
  prototype: 'Reltroner Studio checked your address, but its newsletter is not live yet: no subscription was created and no email was sent.',
  invalid: 'Reltroner Studio could not accept this address. Please check it and try again.',
  rejected: 'Reltroner Studio did not accept this request, so no subscription has been confirmed. You can subscribe on Reltroner Studio instead.',
  'quota-error': `The newsletter request limit was reached, so the subscription is not confirmed. ${UNCONFIRMED} Please wait before trying again.`,
  'network-error': `Reltroner Studio could not confirm the subscription with its newsletter provider. ${UNCONFIRMED} Please check your preferences on Studio before trying again.`,
};

function retryAfter(value: string | null, now: number): number | null {
  const text = value?.trim() ?? '';
  if (!text) return null;
  const seconds = /^\d{1,7}$/.test(text) ? Number(text) : Math.ceil((Date.parse(text) - now) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, MAX_HOLD_SECONDS) : null;
}

function outcome(partial: Partial<Outcome> & Pick<Outcome, 'status' | 'message' | 'category'>): Outcome {
  return { confirmed: false, requestSent: false, httpStatus: null, retryAfterSeconds: null, ...partial };
}

class Interrupted extends Error {}

export interface ClientOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  online?: () => boolean;
  endpoint?: string;
}

/**
 * One transport per page. Sends at most one POST per call and none while another is in flight, never
 * retries, never parses a non-JSON body, and after any unconfirmed outcome holds further requests until
 * Retry-After (or the request bound) has elapsed, so an indeterminate write is not repeated blindly.
 */
export function createNewsletterClient(options: ClientOptions = {}) {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const endpoint = options.endpoint ?? STUDIO_NEWSLETTER_ENDPOINT;
  let inFlight = false;
  let holdUntil = 0;

  async function submit(email: string, consent: boolean): Promise<Outcome> {
    const checked = validateSubscription(email, consent);
    if (!checked.ok) return outcome({ status: 'invalid', message: checked.message, category: 'not-sent' });
    if (inFlight) return outcome({ status: 'loading', message: 'A subscription request is already in progress. No additional request was sent.', category: 'not-sent' });
    const remaining = Math.ceil((holdUntil - now()) / 1000);
    if (remaining > 0) {
      return outcome({ status: 'held', message: `The previous request was not confirmed, so no new request was sent. Please wait about ${remaining} seconds, then check your preferences on Reltroner Studio before trying again.`, category: 'not-sent' });
    }
    if ((options.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine)))() === false) {
      return outcome({ status: 'network-error', message: 'You appear to be offline, so nothing was sent. Please try again when you are connected.', category: 'offline' });
    }
    inFlight = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interrupted = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Interrupted()); }, timeoutMs);
    });
    let result: Outcome;
    try {
      const response = await Promise.race([(options.fetcher ?? fetch)(endpoint, {
        method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'strict-origin-when-cross-origin',
        signal: controller.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: checked.email, consent: true }),
      }), interrupted]);
      const httpStatus = response.status;
      const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
      const wait = retryAfter(response.headers.get('retry-after'), now());
      if (type !== 'application/json' || response.redirected) {
        // Platform pages (for example a Cloudflare HTML error or challenge) are never parsed or trusted.
        void response.body?.cancel().catch(() => {});
        result = httpStatus === 429
          ? outcome({ status: 'quota-error', message: MESSAGES['quota-error']!, category: 'platform-rate-limit', requestSent: true, httpStatus, retryAfterSeconds: wait })
          : outcome({ status: 'network-error', message: `Subscription status could not be confirmed: Reltroner Studio returned HTTP ${httpStatus} instead of a subscription result. ${UNCONFIRMED}`, category: response.redirected ? 'invalid-response' : 'platform-error', requestSent: true, httpStatus, retryAfterSeconds: wait });
      } else {
        const text = await Promise.race([response.text(), interrupted]);
        let data: unknown = null;
        try { data = text.length > MAX_RESPONSE_BYTES ? null : JSON.parse(text); } catch { data = null; }
        const value = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
        const status = typeof value?.status === 'string' ? value.status : '';
        if (!value || typeof value.message !== 'string' || !STATUSES.has(status)
          || ('delivered' in value && value.delivered !== false) || ('verified' in value && value.verified !== false)
          || (!response.ok && SUCCESS.has(status))) {
          result = outcome({ status: 'network-error', message: `Subscription status could not be confirmed: the reply was not a valid subscription result (HTTP ${httpStatus}). ${UNCONFIRMED}`, category: 'invalid-response', requestSent: true, httpStatus, retryAfterSeconds: wait });
        } else {
          result = outcome({ status, message: MESSAGES[status]!, category: 'application-result', requestSent: true, httpStatus, retryAfterSeconds: wait, confirmed: response.ok && status !== 'prototype' && SUCCESS.has(status) });
        }
      }
    } catch (error) {
      const timedOut = error instanceof Interrupted || controller.signal.aborted;
      result = outcome({
        status: 'network-error', category: timedOut ? 'timeout' : 'network', requestSent: true,
        message: timedOut
          ? `Subscription status could not be confirmed because Reltroner Studio did not answer within ${Math.round(timeoutMs / 1000)} seconds. ${UNCONFIRMED} Please check your preferences on Studio before trying again.`
          : `Subscription status could not be confirmed because Reltroner Studio could not be reached from this page, or did not accept a request from it. ${UNCONFIRMED} Please check your preferences on Studio before trying again.`,
      });
    } finally {
      clearTimeout(timer);
      controller.abort();
      inFlight = false;
    }
    const settled = result.confirmed || result.status === 'invalid' || result.status === 'prototype';
    holdUntil = settled ? 0 : now() + Math.max(result.retryAfterSeconds ?? 0, HOLD_SECONDS) * 1000;
    return result;
  }

  return { submit, get busy() { return inFlight; } };
}

/** Preview hosts never send: the outcome only reflects local validation. */
export function previewOutcome(email: string, consent: boolean): Outcome {
  const checked = validateSubscription(email, consent);
  if (!checked.ok) return outcome({ status: 'invalid', message: checked.message, category: 'not-sent' });
  return outcome({ status: 'preview', message: 'Your email looks valid. This page is a preview, not statistics.reltroner.com, so no request was sent and no subscription was created.', category: 'preview' });
}
