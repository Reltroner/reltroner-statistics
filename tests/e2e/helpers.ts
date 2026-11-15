import { expect, type Page } from '@playwright/test';

/** Collect console errors and CSP violations for the lifetime of a page. */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return {
    problems,
    expectClean: () => expect(problems.filter((p) => !/favicon/.test(p)), problems.join('\n')).toEqual([]),
  };
}

export async function setTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((t) => {
    try { if (!sessionStorage.getItem('rs-theme-seeded')) { localStorage.setItem('rs-theme', t); sessionStorage.setItem('rs-theme-seeded', '1'); } } catch { /* ignore */ }
  }, theme);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.right > doc.clientWidth + 1 && style.position !== 'fixed' && !el.closest('.rs-sr, .rs-table-wrap, .rs-slot, [class*="overflow-x-auto"], [class*="overflow-auto"], [class*="overflow-hidden"], .react-flow, .rs-chart-frame, nav[aria-label="Section"]');
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n && offenders.length < 8; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!parent || parent.closest('.rs-sr, .rs-table-wrap, [class*="overflow-x-auto"], [class*="overflow-auto"], .react-flow, .rs-chart-frame, nav[aria-label="Section"]')) continue;
      range.selectNodeContents(n);
      if (range.getBoundingClientRect().right > doc.clientWidth + 1) offenders.push(`text in ${parent.tagName.toLowerCase()}: ${String(n.textContent).slice(0, 40)}`);
    }
    return { scroll: doc.scrollWidth, client: doc.clientWidth, offenders };
  });
  expect(overflow.scroll, `horizontal overflow: ${overflow.offenders.join(', ')}`).toBeLessThanOrEqual(overflow.client + 1);
}

/**
 * Text must stay inside the card (or notice, header, footer) that contains it. Content inside a
 * deliberate scroll container (tables, wide figures) or inside a chart canvas is exempt: those
 * scroll or are checked by chart-specific tests.
 */
export async function expectContainedText(page: Page) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const containers = [...document.querySelectorAll('.rs-card, .rs-notice, header[data-site-header] .rs-container, footer .rs-container')];
    const range = document.createRange();
    for (const box of containers) {
      const cr = box.getBoundingClientRect();
      if (cr.width === 0 || cr.height === 0) continue;
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n && out.length < 12; n = walker.nextNode()) {
        const parent = n.parentElement;
        if (!parent || !(n.textContent ?? '').trim()) continue;
        if (parent.closest('.rs-sr, .rs-table-wrap, .rs-figure-scroll, [class*="overflow-x-auto"], [class*="overflow-auto"], [class*="overflow-y-auto"], .react-flow, .rs-chart-frame, svg, [hidden]')) continue;
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > cr.right + 1.5 || r.left < cr.left - 1.5) {
          out.push(`${parent.tagName.toLowerCase()} "${(n.textContent ?? '').trim().slice(0, 48)}" leaves ${box.tagName.toLowerCase()}.${String(box.className).slice(0, 40)} (${Math.round(r.left)}–${Math.round(r.right)} vs ${Math.round(cr.left)}–${Math.round(cr.right)})`);
        }
      }
    }
    return out;
  });
  expect(problems, problems.join('\n')).toEqual([]);
}

/** Islands hydrate lazily; wait until the island containing this locator is interactive. */
export async function hydrated(locator: import('@playwright/test').Locator) {
  await locator.first().scrollIntoViewIfNeeded();
  await expect(locator.first().locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr', /.*/, { timeout: 15_000 });
}
