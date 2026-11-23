/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R1: one shared Studio newsletter opt-in per eligible page. Live-domain
 * behaviour is exercised by serving the local build under https://statistics.reltroner.com through
 * Playwright routing, with Reltroner Studio's endpoint replaced by a stub: no request ever leaves the
 * machine, and only synthetic example.test addresses are used.
 */
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { setTheme, watchConsole } from './helpers.ts';

const STUDIO_API = 'https://www.reltroner.com/api/newsletter';
const LIVE = 'https://statistics.reltroner.com';
const PORT = Number(process.env.E2E_PORT || 4174);
const ADDRESS = 'synthetic.reader@example.test';
const ROUTES = ['/', '/clustering/', '/reports/', '/statistics/spatial/', '/creative/', '/drift/', '/graph/', '/methodology/'];
const LINKS = { 'Unsubscribe and preferences': 'https://www.reltroner.com/newsletter/unsubscribe', Privacy: 'https://www.reltroner.com/privacy', 'Subscribe on Reltroner Studio': 'https://www.reltroner.com/contact#newsletter' };
const cors = { 'Access-Control-Allow-Origin': LIVE, 'Access-Control-Expose-Headers': 'Retry-After', Vary: 'Origin', 'Cache-Control': 'no-store' };
// Wide fallback fonts (as in the other layout specs) so Windows runs measure Linux-like text widths.
const WIDE_FONTS = ':root{--font-sans:Verdana,"DejaVu Sans",sans-serif!important;--font-display:Verdana,"DejaVu Sans",sans-serif!important}';
const studioJson = (status: number, body: unknown, headers: Record<string, string> = {}) => async (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', headers: { ...cors, ...headers }, body: JSON.stringify(body) });

/** Serve the local build as the live domain; `studio` answers Studio's endpoint; everything else external is refused. */
async function asLive(page: Page, studio: (route: Route) => Promise<void>) {
  const posts: string[] = [];
  const refused: string[] = [];
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === LIVE) {
      const response = await route.fetch({ url: `http://127.0.0.1:${PORT}${url.pathname}${url.search}` });
      return route.fulfill({ response });
    }
    if (url.href === STUDIO_API && route.request().method() === 'POST') { posts.push(route.request().postData() ?? ''); return studio(route); }
    if (url.hostname === '127.0.0.1') return route.continue();
    refused.push(`${route.request().method()} ${url.href}`);
    return route.abort();
  });
  return { posts, refused };
}

async function fill(page: Page, email = ADDRESS, consent = true) {
  const form = page.locator('[data-newsletter-placement] form');
  await form.getByLabel('Email address').fill(email);
  if (consent) await form.getByRole('checkbox', { name: /I choose to receive Studio updates/ }).check();
  return form;
}

test('@responsive one shared placement after <main> on representative pages, exact Studio links, unique ids', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    const report = await page.evaluate(() => {
      const placements = [...document.querySelectorAll('[data-newsletter-placement]')];
      const el = placements[0];
      const main = document.querySelector('main');
      const footer = document.querySelector('footer[data-site-footer]');
      const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      const r = el?.getBoundingClientRect(), f = footer?.getBoundingClientRect();
      return {
        count: placements.length, forms: el?.querySelectorAll('form').length ?? 0, parent: el?.parentElement?.tagName,
        afterMain: !!(main && el && main.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !main.contains(el)),
        beforeFooter: !!(footer && el && el.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING),
        gap: r && f ? f.top - r.bottom : null, dup, landmark: el?.tagName, label: el?.getAttribute('aria-labelledby'),
        statusRoles: document.querySelectorAll('[data-newsletter-placement] [role="status"]').length,
      };
    });
    expect(report, route).toMatchObject({ count: 1, forms: 1, parent: 'BODY', afterMain: true, beforeFooter: true, landmark: 'ASIDE', label: 'rs-newsletter-heading', statusRoles: 0, dup: [] });
    expect(report.gap!, `${route}: breathing space above the footer`).toBeGreaterThanOrEqual(0);
    const aside = page.getByRole('complementary', { name: 'Keep a little curiosity in your inbox.' });
    await expect(aside.getByText('Stay connected', { exact: true })).toBeVisible();
    await expect(aside.getByText(/held by Reltroner Studio, not by a separate Statistics list/)).toBeVisible();
    for (const [name, href] of Object.entries(LINKS)) await expect(aside.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute('href', href);
  }
  await page.goto('/404.html');
  await expect(page.locator('[data-newsletter-placement]')).toHaveCount(0);
});

test('build census: exactly one placement on every indexable site page, none on the 404 page, standalone reports or mirrors', () => {
  const dist = path.join(process.cwd(), 'dist');
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(dist);
  const html = files.filter((f) => f.endsWith('.html'));
  const census = html.map((f) => {
    const src = fs.readFileSync(f, 'utf8');
    // Site pages are rendered by BaseLayout (site footer present); standalone report HTML is not.
    const sitePage = src.includes('data-site-footer') && !/<meta name="robots" content="noindex"/.test(src);
    return { file: path.relative(dist, f).split(path.sep).join('/'), sitePage, n: (src.match(/data-newsletter-placement/g) ?? []).length };
  });
  for (const c of census) expect(c.n, c.file).toBe(c.sitePage ? 1 : 0);
  expect(census.filter((c) => c.sitePage).length, 'site pages carrying the placement').toBeGreaterThan(500);
  expect(census.filter((c) => !c.sitePage).map((c) => c.file)).toContain('404.html');
  expect(census.filter((c) => !c.sitePage).every((c) => c.file === '404.html' || c.file.startsWith('reports/all/')), 'only the 404 page and standalone report files lack it').toBe(true);
  for (const mirror of files.filter((f) => /[\\/]ai[\\/]pages[\\/]/.test(f)).slice(0, 400)) expect(fs.readFileSync(mirror, 'utf8'), mirror).not.toContain('Keep a little curiosity');
  for (const report of files.filter((f) => /[\\/]reports[\\/]all[\\/]/.test(f) && f.endsWith('.html'))) expect(fs.readFileSync(report, 'utf8'), report).not.toContain('data-newsletter-placement');
});

test('preview hosts validate locally, focus the field to fix, and never send', async ({ page }) => {
  const studio: string[] = [];
  page.on('request', (r) => { if (r.url().startsWith('https://www.reltroner.com/')) studio.push(r.url()); });
  await page.goto('/clustering/');
  const root = page.locator('[data-newsletter-placement]');
  await expect(root).toHaveAttribute('data-newsletter-mode', 'preview');
  const button = root.getByRole('button', { name: 'Preview newsletter opt-in' });
  await expect(button).toBeEnabled();
  await root.getByLabel('Email address').fill('not-an-address');
  await button.click();
  await expect(root.locator('#rs-newsletter-feedback')).toHaveText('Please enter a valid email address.');
  await expect(root.getByLabel('Email address')).toBeFocused();
  await expect(root.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');
  await root.getByLabel('Email address').fill(ADDRESS);
  await root.getByLabel('Email address').press('Enter');
  await expect(root.locator('#rs-newsletter-feedback')).toHaveText(/confirm that you would like to receive Studio updates/);
  await expect(root.getByRole('checkbox', { name: /I choose to receive Studio updates/ })).toBeFocused();
  await root.getByRole('checkbox', { name: /I choose to receive Studio updates/ }).check();
  await button.click();
  await expect(root.locator('#rs-newsletter-feedback')).toHaveText(/no request was sent and no subscription was created/);
  await root.getByLabel('Email address').press('Escape');
  await expect(root.locator('#rs-newsletter-feedback')).toHaveText('');
  expect(studio).toEqual([]);
});

test('live domain: one consented POST per submit, Studio contract, no address in diagnostics', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const net = await asLive(page, async (route) => { await gate; await studioJson(200, { status: 'accepted', message: 'Your subscription was saved in Resend. No email was sent.', delivered: false, verified: false })(route); });
  await page.goto(`${LIVE}/reports/`);
  const root = page.locator('[data-newsletter-placement]');
  await expect(root).toHaveAttribute('data-newsletter-mode', 'live');
  const form = await fill(page);
  await expect(form.getByRole('button', { name: 'Subscribe to Studio updates' })).toBeEnabled();
  // Stable handle: while sending, the button's accessible name becomes "Sending…".
  const button = form.locator('[data-newsletter-submit]');
  await button.dblclick();
  await expect(form).toHaveAttribute('aria-busy', 'true');
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(button).toHaveText('Sending…');
  // An impatient extra click on the busy (aria-disabled) button must not send anything.
  await button.click({ force: true });
  release();
  await expect(root.locator('#rs-newsletter-feedback')).toHaveText(/Reltroner Studio accepted your subscription/);
  expect(net.posts.length).toBe(1);
  expect(JSON.parse(net.posts[0]!)).toEqual({ email: ADDRESS, consent: true });
  await button.click();
  await expect(root.locator('#rs-newsletter-feedback')).toHaveText(/already confirmed on this page. No additional request was sent/);
  expect(net.posts.length).toBe(1);
  expect(net.refused.filter((r) => r.includes('reltroner.com/api'))).toEqual([]);
  expect(logs.join('\n')).not.toContain('example.test');
});

const FAILURES: Array<[string, (route: Route) => Promise<void>, RegExp, boolean]> = [
  ['prototype (service not live)', studioJson(200, { status: 'prototype', message: 'Local prototype.', delivered: false, verified: false }), /not live yet: no subscription was created/, false],
  ['422 invalid', studioJson(422, { status: 'invalid', message: 'Please enter a valid email address.' }), /could not accept this address/, false],
  ['403 rejected', studioJson(403, { status: 'rejected', message: 'The request could not be validated.' }), /did not accept this request/, true],
  ['429 with Retry-After', studioJson(429, { status: 'quota-error', message: 'Rate limited.' }, { 'Retry-After': '30' }), /request limit was reached/, true],
  ['503 provider down', studioJson(503, { status: 'network-error', message: 'Provider down.' }), /could not confirm the subscription with its newsletter provider/, true],
  ['HTML challenge page', async (route) => route.fulfill({ status: 200, contentType: 'text/html', headers: cors, body: '<!doctype html><title>Just a moment...</title>' }), /returned HTTP 200 instead of a subscription result/, true],
  ['malformed JSON', async (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '{"status":' }), /not a valid subscription result/, true],
  // A refused CORS preflight (Studio allowlist not deployed) or a dropped connection both reach the page as a
  // failed fetch; Playwright adds CORS headers to fulfilled responses, so the failure is injected as such.
  ['CORS refused or connection failed', async (route) => route.abort('failed'), /could not be reached from this page, or did not accept a request from it/, true],
];
for (const [name, studio, message, holds] of FAILURES) {
  test(`live domain: ${name} is reported truthfully${holds ? ' and holds the next submit' : ''}`, async ({ page }) => {
    const watch = watchConsole(page);
    const net = await asLive(page, studio);
    await page.goto(`${LIVE}/methodology/`);
    const form = await fill(page);
    await form.getByRole('button', { name: 'Subscribe to Studio updates' }).click();
    const feedback = page.locator('#rs-newsletter-feedback');
    await expect(feedback).toHaveText(message);
    await form.getByRole('button', { name: 'Subscribe to Studio updates' }).click();
    if (holds) await expect(feedback).toHaveText(/previous request was not confirmed, so no new request was sent/);
    await expect.poll(() => net.posts.length).toBe(holds ? 1 : 2);
    expect(watch.problems.filter((p) => !/favicon|Access-Control|CORS|Failed to load resource|net::ERR_FAILED/i.test(p))).toEqual([]);
  });
}

test('live domain: a request without an answer is abandoned at 10 s and reported as unconfirmed', async ({ page }) => {
  test.setTimeout(40_000);
  const net = await asLive(page, async (route) => { await new Promise((r) => setTimeout(r, 13_000)); await route.fulfill({ status: 200, body: '{}' }).catch(() => undefined); });
  await page.goto(`${LIVE}/creative/`);
  const form = await fill(page);
  const started = Date.now();
  await form.getByRole('button', { name: 'Subscribe to Studio updates' }).click();
  await expect(page.locator('#rs-newsletter-feedback')).toHaveText(/did not answer within 10 seconds/, { timeout: 15_000 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(9_500);
  await expect(form).not.toHaveAttribute('aria-busy', 'true');
  expect(net.posts.length).toBe(1);
});

test('CSP: connect-src adds exactly the Studio origin and every other directive is unchanged', async ({ page }) => {
  const csp = (await page.request.get('/')).headers()['content-security-policy'] ?? '';
  const directives = Object.fromEntries(csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k!, v.join(' ')]; }));
  expect(directives['connect-src']).toBe("'self' https://www.reltroner.com");
  expect(directives['form-action']).toBe("'none'");
  expect(directives['frame-ancestors']).toBe("'none'");
  expect(directives['object-src']).toBe("'none'");
  expect(directives['default-src']).toBe("'self'");
  expect(directives['worker-src']).toBe("'self' blob:");
  expect(directives['img-src']).toBe("'self' data: blob:");
  expect(directives['script-src']).toMatch(/^'self'( 'sha256-[A-Za-z0-9+/=]+')+$/);
  expect(directives['script-src']).not.toMatch(/unsafe/);
  expect(Object.keys(directives).sort()).toEqual(['base-uri', 'connect-src', 'default-src', 'font-src', 'form-action', 'frame-ancestors', 'img-src', 'object-src', 'script-src', 'style-src', 'upgrade-insecure-requests', 'worker-src']);
});

for (const theme of ['dark', 'light'] as const) {
  test(`layout and accessibility (${theme}): 320–1440 px at 100–200 % text, no overflow or footer collision, axe clean`, async ({ page }) => {
    test.setTimeout(90_000);
    await setTheme(page, theme);
    const cases: Array<[number, number]> = [[320, 100], [375, 125], [768, 150], [800, 150], [1024, 100], [1024, 200], [1440, 200], [320, 200]];
    for (const [width, scale] of cases) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/statistics/spatial/');
      await page.addStyleTag({ content: `html{font-size:${scale}%!important}${WIDE_FONTS}` });
      const box = await page.evaluate(() => {
        const el = document.querySelector('[data-newsletter-placement]')!;
        el.scrollIntoView();
        const r = el.getBoundingClientRect(), f = document.querySelector('footer[data-site-footer]')!.getBoundingClientRect();
        const inner = [...el.querySelectorAll('h2, p, label, input, button, a')].map((x) => x.getBoundingClientRect());
        const small = [...el.querySelectorAll('button, input[type="email"]')].map((x) => x.getBoundingClientRect().height).filter((h) => h < 40);
        return { left: r.left, right: r.right, bottom: r.bottom, footerTop: f.top, vw: document.documentElement.clientWidth, outside: inner.filter((b) => b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1)).length, small: small.length };
      });
      const where = `${theme} ${width}px ${scale}%`;
      expect(box.left, where).toBeGreaterThanOrEqual(0);
      expect(box.right, where).toBeLessThanOrEqual(box.vw + 1);
      expect(box.outside, `${where}: content stays inside the panel`).toBe(0);
      expect(box.bottom, `${where}: panel ends before the footer`).toBeLessThanOrEqual(box.footerTop + 1);
      expect(box.small, `${where}: 40 px touch targets`).toBe(0);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/clustering/');
    const axe = await new AxeBuilder({ page }).include('[data-newsletter-placement]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}
