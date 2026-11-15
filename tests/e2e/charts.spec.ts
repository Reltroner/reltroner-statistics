import { expect, test, type Locator, type Page } from '@playwright/test';
import { hydrated, setTheme, watchConsole } from './helpers.ts';

interface Rect { left: number; right: number; top: number; bottom: number; width: number; height: number }

/** Geometry of every rendered SVG text of a chart, with the chart's SVG viewport and its card. */
async function chartGeometry(frame: Locator) {
  return frame.evaluate((host) => {
    const rect = (el: Element): { left: number; right: number; top: number; bottom: number; width: number; height: number } => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const svg = host.querySelector('svg')!;
    const labels = [...svg.querySelectorAll('text')]
      .filter((t) => (t.textContent ?? '').trim() && getComputedStyle(t).display !== 'none' && getComputedStyle(t).visibility !== 'hidden' && t.getAttribute('opacity') !== '0')
      .map((t) => ({ text: (t.textContent ?? '').trim(), ...rect(t) }));
    return { svg: rect(svg), card: rect(host.closest('.rs-card') ?? host), labels };
  });
}

const inside = (inner: Rect, outer: Rect, tol = 1) => inner.left >= outer.left - tol && inner.right <= outer.right + tol && inner.top >= outer.top - tol && inner.bottom <= outer.bottom + tol;
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** The select inside the label whose caption is exactly this text (a wrapping label's accessible name includes the selected option). */
const control = (page: Page, caption: string) => page.locator('label', { has: page.locator('.rs-label', { hasText: new RegExp(`^${caption}$`) }) }).locator('select');

async function configureScatter(page: Page) {
  await page.goto('/statistics/scatter');
  const frame = page.locator('.rs-chart-frame').first();
  await hydrated(frame);
  await control(page, 'X axis').selectOption({ label: 'SDI individual component' });
  await control(page, 'Y axis').selectOption({ label: 'Sentient Development Index' });
  await control(page, 'Bubble size').selectOption({ label: 'Population' });
  await control(page, 'Nations').selectOption({ label: 'All 19 modeled nations' });
  await control(page, 'Color by').selectOption({ label: 'Cohort' });
  await expect(frame.locator('svg text', { hasText: /^Reltronland$/ })).toHaveCount(1);
  // Let the merge animation settle before measuring.
  await page.waitForTimeout(900);
  return frame;
}

for (const theme of ['dark', 'light'] as const) {
  test(`R4 scatter: the complete Reltronland label and every point label stay inside the chart (${theme}) @responsive`, async ({ page }) => {
    await setTheme(page, theme);
    const watch = watchConsole(page);
    const frame = await configureScatter(page);
    const geo = await chartGeometry(frame);
    const nations = await page.locator('details table tbody tr td:first-child').allTextContents();
    expect(nations.length).toBe(19);
    const rel = geo.labels.find((l) => l.text === 'Reltronland');
    expect(rel, 'Reltronland label rendered').toBeTruthy();
    expect(rel!.width).toBeGreaterThan(30);
    expect(inside(rel!, geo.svg), `Reltronland label ${JSON.stringify(rel)} must fit the chart viewport ${JSON.stringify(geo.svg)}`).toBe(true);
    const pointLabels = geo.labels.filter((l) => nations.includes(l.text));
    expect(pointLabels.length).toBeGreaterThanOrEqual(10);
    for (const l of pointLabels) {
      expect(inside(l, geo.svg), `label "${l.text}" escapes the chart viewport`).toBe(true);
      expect(inside(l, geo.card), `label "${l.text}" escapes its card`).toBe(true);
    }
    for (let i = 0; i < pointLabels.length; i++) {
      for (let j = i + 1; j < pointLabels.length; j++) {
        expect(overlap(pointLabels[i]!, pointLabels[j]!), `labels "${pointLabels[i]!.text}" and "${pointLabels[j]!.text}" overlap`).toBeLessThan(4);
      }
    }
    // The data stay available without a pointer: the table lists every plotted value.
    await page.getByText('Table view of plotted values').click();
    await expect(page.locator('details table tbody tr', { hasText: 'Reltronland' })).toHaveCount(1);
    watch.expectClean();
  });
}

test('R5 GDP treemap: every entry is named with its exact share, inside its tile or in the visible rail @responsive', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/statistics');
  const map = page.locator('[data-gdp-treemap]');
  await map.scrollIntoViewIfNeeded();
  await hydrated(map);
  await expect(map.locator('[data-tile]').first()).toBeVisible();
  const result = await map.evaluate((root) => {
    const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const tiles = [...root.querySelectorAll('[data-tile]')].map((g) => {
      const box = rect(g.querySelector('rect')!);
      const texts = [...g.querySelectorAll('text')].map((t) => ({ text: (t.textContent ?? '').trim(), ...rect(t) })).filter((t) => t.text);
      return { id: g.getAttribute('data-tile')!, name: g.getAttribute('data-name')!, share: g.getAttribute('data-share')!, mode: g.getAttribute('data-label-mode')!, marker: g.getAttribute('data-marker'), box, texts };
    });
    const rail = [...root.querySelectorAll('[data-rail-item]')].map((li) => ({ id: li.getAttribute('data-rail-item')!, text: (li.textContent ?? '').replace(/\s+/g, ' ').trim(), visible: (li as HTMLElement).offsetParent !== null }));
    return { tiles, rail };
  });
  expect(result.tiles.length).toBe(20);
  expect(result.tiles.filter((t) => t.id === 'aggregate:deferred-18').length, 'the residual stays one tile').toBe(1);
  for (const t of result.tiles) {
    if (t.mode === 'inside') {
      expect(t.texts.map((x) => x.text).join(' '), `${t.name} tile shows its name and share`).toContain(t.share);
      for (const x of t.texts) expect(x.left >= t.box.left - 0.5 && x.right <= t.box.right + 0.5 && x.top >= t.box.top - 0.5 && x.bottom <= t.box.bottom + 0.5, `text "${x.text}" stays inside ${t.name}`).toBe(true);
    } else {
      const item = result.rail.find((r) => r.id === t.id);
      expect(item, `${t.name} is listed in the label rail`).toBeTruthy();
      expect(item!.visible, `${t.name} rail entry is visible without interaction`).toBe(true);
      expect(item!.text).toContain(t.name);
      expect(item!.text).toContain(t.share);
      if (t.marker) expect(item!.text).toContain(t.marker);
    }
  }
  // Shares are the source values, not rescaled: they sum to 100% of planetary GDP.
  const sum = result.tiles.reduce((s, t) => s + Number(t.share.replace('%', '')), 0);
  expect(Math.abs(sum - 100)).toBeLessThan(0.6);
  watch.expectClean();
});
