import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** RS-UI-RESPONSIVE-007. Header geometry matters even where the document never overflows.
 * Root font scaling does not resize the viewport; this reproduces the old breakpoint defect.
 */
const ROUTES = ['/', '/statistics/spatial/', '/reports/?id=OPP-0296F531F526'] as const;
const CASES = [
  [320, 100], [320, 150], [320, 200], [375, 150], [390, 200],
  [768, 150], [1024, 150], [1280, 125], [1440, 100],
  [1688, 150], [1920, 150], [1920, 200],
] as const;
const WIDE_FONTS = '--font-sans:Verdana,"DejaVu Sans",sans-serif!important;--font-display:Verdana,"DejaVu Sans",sans-serif!important;';

async function setScale(page: Page, percent: number, wideFonts = true) {
  await page.addStyleTag({ content: 'html{font-size:' + percent + '%!important;' + (wideFonts ? WIDE_FONTS : '') + '}' });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('header[data-site-header]')!;
    const shell = header.querySelector<HTMLElement>('.rs-header-shell')!;
    const nav = header.querySelector<HTMLElement>('[data-primary-nav]')!;
    const brand = header.querySelector<HTMLElement>('a[aria-label="Reltroner Statistics home"]')!;
    const actions = header.querySelector<HTMLElement>('[data-theme-toggle]')!.parentElement!;
    const menu = header.querySelector<HTMLButtonElement>('[data-menu-toggle]')!;
    const searchFull = header.querySelector<HTMLElement>('.rs-header-search-full')!;
    const searchCompact = header.querySelector<HTMLElement>('.rs-header-search-compact')!;
    const shown = (el: Element) => getComputedStyle(el).display !== 'none' && !!el.getClientRects().length;
    const intersects = (a: DOMRect, b: DOMRect) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const offscreen: string[] = [], blocked: string[] = [], overlaps: string[] = [];
    for (const el of header.querySelectorAll<HTMLElement>('a, button')) {
      if (!shown(el) || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      const label = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 32) || el.tagName;
      if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) {
        offscreen.push(label); continue;
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === el || el.contains(hit))) blocked.push(label);
    }
    if (intersects(brand.getBoundingClientRect(), actions.getBoundingClientRect())) overlaps.push('brand/actions');
    if (shown(nav) && intersects(nav.getBoundingClientRect(), actions.getBoundingClientRect())) overlaps.push('nav/actions');
    if (shown(nav) && intersects(nav.getBoundingClientRect(), brand.getBoundingClientRect())) overlaps.push('nav/brand');
    return {
      shell: shell.clientWidth, scroll: shell.scrollWidth,
      wide: shown(nav), compact: shown(menu), fullSearch: shown(searchFull),
      smallSearch: shown(searchCompact), offscreen, blocked, overlaps,
    };
  });
}

test('@responsive RS-UI-RESPONSIVE-007 header reflow at 100–200% text, three routes and two themes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'Exhaustive matrix runs once');
  test.setTimeout(240_000);
  for (const route of ROUTES) for (const theme of ['dark', 'light'] as const) for (const [width, scale] of CASES) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(route);
    await page.evaluate(t => { document.documentElement.dataset.theme = t; try { localStorage.setItem('rs-theme', t); } catch { /* ignore */ } }, theme);
    await setScale(page, scale);
    const r = await measure(page);
    const scope = route + ' ' + theme + ' ' + width + 'px ' + scale + '%';
    expect(r.offscreen, scope + ' offscreen links').toEqual([]);
    expect(r.blocked, scope + ' blocked centers').toEqual([]);
    expect(r.overlaps, scope + ' overlap').toEqual([]);
    expect(r.scroll, scope + ' header scroll width').toBeLessThanOrEqual(r.shell + 1);
    expect(r.wide !== r.compact, scope + ' exactly one navigation').toBe(true);
    expect(r.fullSearch === r.wide && r.smallSearch === r.compact, scope + ' exactly one search').toBe(true);
    if (scale > 100) expect(r.compact, scope + ' enlarged text must reflow').toBe(true);
    if (scale === 100 && width >= 1440) expect(r.wide, scope + ' normal desktop preserved').toBe(true);
  }
});

test('@responsive RS-UI-RESPONSIVE-007 disclosure keyboard Escape and zoom back to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1688, height: 900 });
  await page.goto('/reports/');
  await setScale(page, 150);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const compact = page.getByRole('navigation', { name: 'Mobile' });
  const button = page.getByRole('button', { name: 'Open navigation menu' });
  await expect(nav).toBeHidden();
  await expect(button).toBeVisible();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(compact).toBeVisible();
  await expect(compact.getByRole('link', { name: 'Observatory overview' })).toBeVisible();
  await expect(compact.getByRole('link', { name: /Contact/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(compact).toBeHidden();
  await expect(button).toBeFocused();
  await button.click();
  await expect(compact).toBeVisible();
  await expect(compact.getByRole('link', { name: 'Observatory overview' })).toBeFocused();
  await setScale(page, 100, false); // no viewport resize
  await expect(nav).toBeVisible();
  await expect(button).toBeHidden();
  await expect(compact).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.locator('a[aria-current="page"]')).toBeFocused();
  await expect(page.locator('body')).not.toHaveClass(/overflow-hidden/);
  await expect(page.locator('header[data-site-header] [data-palette-open]:visible')).toHaveCount(1);
});

test('@responsive RS-UI-RESPONSIVE-007 320px at 200% retains skip link and touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/statistics/spatial/');
  await setScale(page, 200);
  const r = await measure(page);
  expect(r.offscreen).toEqual([]); expect(r.blocked).toEqual([]);
  expect(r.overlaps).toEqual([]); expect(r.compact).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  for (const selector of ['[data-menu-toggle]', '[data-theme-toggle]', '.rs-header-search-compact']) {
    const btn = page.locator(selector);
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(Math.min(box!.width, box!.height), selector).toBeGreaterThanOrEqual(40);
  }
  await page.locator('[data-menu-toggle]').click();
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeHidden();
});

test('@responsive RS-UI-RESPONSIVE-007 header axe at 150% text, both themes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'Representative axe sweep');
  for (const theme of ['dark', 'light']) {
    await page.goto('/statistics/spatial/');
    await page.evaluate(t => { document.documentElement.dataset.theme = t; try { localStorage.setItem('rs-theme', t); } catch { /* ignore */ } }, theme);
    await setScale(page, 150);
    const r = await new AxeBuilder({ page }).include('header[data-site-header]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', '))).toEqual([]);
  }
});
