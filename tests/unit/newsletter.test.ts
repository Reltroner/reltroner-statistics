/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R1: the Statistics newsletter adapter. A stub fetcher stands in for
 * Reltroner Studio; no real request is ever made and only synthetic example.test addresses are used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewsletterClient, diagnosticOf, newsletterMode, previewOutcome, STUDIO_LINKS, STUDIO_NEWSLETTER_ENDPOINT, validateSubscription } from '../../src/scripts/newsletter-client.ts';

const ADDRESS = 'Synthetic.Reader@Example.Test ';
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
type Call = { url: string; init: RequestInit };
const stub = (respond: (call: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return respond({ url, init }); }) as unknown as typeof fetch;
  return { calls, fetcher };
};
let clock = 1_000_000;
const now = () => clock;

test('mode: only https://statistics.reltroner.com (default port) is live; every other host is a preview', () => {
  assert.equal(newsletterMode({ protocol: 'https:', hostname: 'statistics.reltroner.com', port: '' }), 'live');
  for (const loc of [
    { protocol: 'http:', hostname: 'statistics.reltroner.com', port: '' },
    { protocol: 'https:', hostname: 'statistics.reltroner.com', port: '8443' },
    { protocol: 'https:', hostname: 'reltroner-statistics.pages.dev', port: '' },
    { protocol: 'https:', hostname: 'abc123.reltroner-statistics.pages.dev', port: '' },
    { protocol: 'http:', hostname: '127.0.0.1', port: '4174' },
    { protocol: 'http:', hostname: 'localhost', port: '4321' },
    { protocol: 'https:', hostname: 'statistics.reltroner.com.evil.test', port: '' },
    { protocol: 'https:', hostname: 'www.reltroner.com', port: '' },
  ]) assert.equal(newsletterMode(loc), 'preview', JSON.stringify(loc));
});

test('validation mirrors Studio: trimmed, lower-cased, 254 characters, explicit consent', () => {
  assert.deepEqual(validateSubscription(ADDRESS, true), { ok: true, email: 'synthetic.reader@example.test' });
  assert.equal(validateSubscription('', true).ok, false);
  assert.equal(validateSubscription('not-an-address', true).ok, false);
  assert.equal(validateSubscription(`${'a'.repeat(250)}@example.test`, true).ok, false);
  const noConsent = validateSubscription('reader@example.test', false);
  assert.equal(noConsent.ok, false);
  assert.equal(!noConsent.ok && noConsent.field, 'consent');
  assert.equal(validateSubscription('reader@example.test', 'true').ok, false, 'consent must be the boolean true');
});

test('endpoint and links are the exact canonical Studio URLs', () => {
  assert.equal(STUDIO_NEWSLETTER_ENDPOINT, 'https://www.reltroner.com/api/newsletter');
  assert.deepEqual({ ...STUDIO_LINKS }, { privacy: 'https://www.reltroner.com/privacy', unsubscribe: 'https://www.reltroner.com/newsletter/unsubscribe', signup: 'https://www.reltroner.com/contact#newsletter' });
});

test('one consented POST with the existing contract: JSON body {email, consent}, no credentials, no retry', async () => {
  const s = stub(() => json(200, { status: 'accepted', message: 'Your subscription was saved in Resend. No email was sent.', delivered: false, verified: false }));
  const client = createNewsletterClient({ fetcher: s.fetcher, now, online: () => true });
  const o = await client.submit(ADDRESS, true);
  assert.equal(s.calls.length, 1);
  const call = s.calls[0]!;
  assert.equal(call.url, 'https://www.reltroner.com/api/newsletter');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.credentials, 'omit');
  assert.equal(call.init.mode, 'cors');
  assert.equal(call.init.redirect, 'error');
  assert.deepEqual(call.init.headers, { 'Content-Type': 'application/json', Accept: 'application/json' });
  assert.deepEqual(JSON.parse(String(call.init.body)), { email: 'synthetic.reader@example.test', consent: true });
  assert.equal(o.confirmed, true);
  assert.equal(o.status, 'accepted');
  assert.equal(o.category, 'application-result');
});

test('prototype is reported truthfully and is never a confirmed subscriber', async () => {
  const s = stub(() => json(200, { status: 'prototype', message: 'Local prototype: your input is valid.', delivered: false, verified: false }));
  const o = await createNewsletterClient({ fetcher: s.fetcher, now, online: () => true }).submit(ADDRESS, true);
  assert.equal(o.confirmed, false);
  assert.equal(o.status, 'prototype');
  assert.match(o.message, /no subscription was created/);
});

test('invalid input or missing consent sends nothing', async () => {
  const s = stub(() => json(200, { status: 'accepted', message: 'x' }));
  const client = createNewsletterClient({ fetcher: s.fetcher, now, online: () => true });
  for (const [email, consent] of [['', true], ['bad', true], ['reader@example.test', false]] as const) {
    const o = await client.submit(email, consent);
    assert.equal(o.requestSent, false);
    assert.equal(o.status, 'invalid');
  }
  assert.equal(s.calls.length, 0);
});

test('single flight: a second submit while one is pending sends no request', async () => {
  let release!: (r: Response) => void;
  const s = stub(() => new Promise<Response>((r) => { release = r; }));
  const client = createNewsletterClient({ fetcher: s.fetcher, now, online: () => true });
  const first = client.submit(ADDRESS, true);
  const second = await client.submit(ADDRESS, true);
  assert.equal(second.status, 'loading');
  assert.equal(second.requestSent, false);
  release(json(200, { status: 'subscribed', message: 'ok', delivered: false, verified: false }));
  assert.equal((await first).confirmed, true);
  assert.equal(s.calls.length, 1);
});

test('HTTP error contract: 422, 403, 429 with Retry-After, 502 and 503 map truthfully and hold resubmission', async () => {
  const cases: Array<[Response, string, boolean]> = [
    [json(422, { status: 'invalid', message: 'Please enter a valid email address.' }), 'invalid', false],
    [json(403, { status: 'rejected', message: 'The request could not be validated.' }), 'rejected', true],
    [json(429, { status: 'quota-error', message: 'Rate limited.' }, { 'Retry-After': '30' }), 'quota-error', true],
    [json(502, { status: 'rejected', message: 'Unavailable.' }), 'rejected', true],
    [json(503, { status: 'network-error', message: 'Provider down.' }), 'network-error', true],
  ];
  for (const [response, status, holds] of cases) {
    clock += 4_000_000;
    const s = stub(() => response);
    const client = createNewsletterClient({ fetcher: s.fetcher, now, online: () => true });
    const o = await client.submit(ADDRESS, true);
    assert.equal(o.status, status);
    assert.equal(o.confirmed, false);
    assert.equal(o.category, 'application-result');
    const again = await client.submit(ADDRESS, true);
    assert.equal(again.status === 'held', holds, `${status} hold`);
    assert.equal(s.calls.length, holds ? 1 : 2);
    if (status === 'quota-error') assert.equal(o.retryAfterSeconds, 30);
  }
});

test('non-JSON pages, oversized or malformed JSON and impossible claims are never trusted as results', async () => {
  const cases: Response[] = [
    new Response('<!doctype html><title>Just a moment...</title>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    new Response('<html>502</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
    json(200, '{"status":'),
    json(200, { status: 'accepted', message: 'x'.repeat(20_000) }),
    json(200, { status: 'accepted', message: 'ok', delivered: true }),
    json(200, { status: 'mystery', message: 'ok' }),
    json(500, { status: 'accepted', message: 'ok' }),
    json(200, ['accepted']),
  ];
  for (const response of cases) {
    clock += 4_000_000;
    const s = stub(() => response);
    const o = await createNewsletterClient({ fetcher: s.fetcher, now, online: () => true }).submit(ADDRESS, true);
    assert.equal(o.confirmed, false);
    assert.equal(o.status, 'network-error');
    assert.match(o.message, /could not be confirmed/);
  }
  clock += 4_000_000;
  const html429 = stub(() => new Response('<html>429</html>', { status: 429, headers: { 'Content-Type': 'text/html', 'Retry-After': '12' } }));
  const o429 = await createNewsletterClient({ fetcher: html429.fetcher, now, online: () => true }).submit(ADDRESS, true);
  assert.equal(o429.status, 'quota-error');
  assert.equal(o429.category, 'platform-rate-limit');
  assert.equal(o429.retryAfterSeconds, 12);
});

test('timeout aborts the request at the bound and is reported as unconfirmed', async () => {
  let signal: AbortSignal | undefined;
  const s = stub(({ init }) => { signal = init.signal ?? undefined; return new Promise<Response>(() => {}); });
  const o = await createNewsletterClient({ fetcher: s.fetcher, now, timeoutMs: 40, online: () => true }).submit(ADDRESS, true);
  assert.equal(o.category, 'timeout');
  assert.equal(o.confirmed, false);
  assert.equal(signal?.aborted, true);
  assert.match(o.message, /may or may not have been saved/);
});

test('denied CORS or a dropped connection is a network outcome; offline sends nothing', async () => {
  clock += 4_000_000;
  const denied = stub(() => { throw new TypeError('Failed to fetch'); });
  const o = await createNewsletterClient({ fetcher: denied.fetcher, now, online: () => true }).submit(ADDRESS, true);
  assert.equal(o.category, 'network');
  assert.equal(o.confirmed, false);
  const off = stub(() => json(200, { status: 'accepted', message: 'x' }));
  const offline = await createNewsletterClient({ fetcher: off.fetcher, now, online: () => false }).submit(ADDRESS, true);
  assert.equal(offline.category, 'offline');
  assert.equal(offline.requestSent, false);
  assert.equal(off.calls.length, 0);
});

test('hold expires after Retry-After so a later manual attempt can be made', async () => {
  clock += 4_000_000;
  let n = 0;
  const s = stub(() => (n++ === 0 ? json(429, { status: 'quota-error', message: 'x' }, { 'Retry-After': '20' }) : json(200, { status: 'accepted', message: 'ok' })));
  const client = createNewsletterClient({ fetcher: s.fetcher, now, online: () => true });
  await client.submit(ADDRESS, true);
  clock += 19_000;
  assert.equal((await client.submit(ADDRESS, true)).status, 'held');
  clock += 2_000;
  assert.equal((await client.submit(ADDRESS, true)).confirmed, true);
  assert.equal(s.calls.length, 2);
});

test('preview outcome never sends and diagnostics carry no address', () => {
  const p = previewOutcome(ADDRESS, true);
  assert.equal(p.status, 'preview');
  assert.equal(p.requestSent, false);
  const d = diagnosticOf({ ...p, httpStatus: 429, retryAfterSeconds: 5 });
  assert.doesNotMatch(d, /example\.test|synthetic/i);
  assert.deepEqual(Object.keys(JSON.parse(d)).sort(), ['category', 'httpStatus', 'requestSent', 'retryAfterSeconds', 'scope', 'status']);
});
