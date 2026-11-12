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
        return r.right > doc.clientWidth + 1 && style.position !== 'fixed' && !el.closest('.rs-table-wrap, .rs-slot, [class*="overflow-x-auto"], [class*="overflow-auto"], [class*="overflow-hidden"], .react-flow, .rs-chart-frame, nav[aria-label="Section"]');
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n && offenders.length < 8; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!parent || parent.closest('.rs-table-wrap, [class*="overflow-x-auto"], [class*="overflow-auto"], .react-flow, .rs-chart-frame, nav[aria-label="Section"]')) continue;
      range.selectNodeContents(n);
      if (range.getBoundingClientRect().right > doc.clientWidth + 1) offenders.push(`text in ${parent.tagName.toLowerCase()}: ${String(n.textContent).slice(0, 40)}`);
    }
    return { scroll: doc.scrollWidth, client: doc.clientWidth, offenders };
  });
  expect(overflow.scroll, `horizontal overflow: ${overflow.offenders.join(', ')}`).toBeLessThanOrEqual(overflow.client + 1);
}

/** Islands hydrate lazily; wait until the island containing this locator is interactive. */
export async function hydrated(locator: import('@playwright/test').Locator) {
  await locator.first().scrollIntoViewIfNeeded();
  await expect(locator.first().locator('xpath=ancestor::astro-island[1]')).not.toHaveAttribute('ssr', /.*/, { timeout: 15_000 });
}
