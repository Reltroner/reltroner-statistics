/**
 * Verification for Requirements 1, 2, and 4 + visual evidence screenshots (stored in git-ignored
 * test-results/visual-req-check/):
 * - R1: Deterministic WCAG >= 4.5:1 text contrast on GDP treemap tiles (dark & light) + data-viz audit
 * - R2: All 225/225 cells shown in both Spearman and Pearson correlation heatmaps, >= 10px font,
 *       no truncation (scrollWidth <= clientWidth), WCAG >= 4.5:1 on every cell, sticky row labels at 390px
 * - R4: Custom <select> dropdown arrow inset >= 12px from right edge with safe padding-right across
 *       /calculator/, /creative/*, and all other select-bearing routes in dark & light modes
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { contrastRatio } from '../../src/features/charts/theme.ts';
import { expectNoHorizontalOverflow, hydrated, setTheme, watchConsole } from './helpers.ts';

const SCREENSHOT_DIR = path.resolve('test-results', 'visual-req-check');

function ensureScreenshotDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const SELECT_ROUTES = [
  '/calculator/',
  '/statistics/',
  '/statistics/scatter/',
  '/statistics/species/',
  '/statistics/spatial/',
  '/statistics/decision-trees/',
  '/history/',
  '/clustering/',
  '/drift/',
  '/graph/',
  '/reports/',
  '/creative/explore/',
  '/creative/ideas/',
  '/creative/audit/',
  '/creative/refactor/',
  '/creative/remodel/',
  '/creative/impact/',
  '/creative/decisions/',
] as const;

const NEW_ILLUSTRATION_ROUTES = [
  { route: '/creative/explore/', slug: 'creative-explore', slot: 'CREATIVE_NARRATIVE_GRAPH' },
  { route: '/creative/ideas/', slug: 'creative-ideas', slot: 'CREATIVE_IDEATION_WORKSPACE' },
  { route: '/creative/audit/', slug: 'creative-audit', slot: 'CREATIVE_CONSISTENCY_AUDIT' },
  { route: '/creative/refactor/', slug: 'creative-refactor', slot: 'CREATIVE_STORY_REFACTOR' },
  { route: '/creative/remodel/', slug: 'creative-remodel', slot: 'CREATIVE_CANON_REMODEL' },
  { route: '/creative/impact/', slug: 'creative-impact', slot: 'CREATIVE_IMPACT_EXPLORER' },
  { route: '/creative/roadmap/', slug: 'creative-roadmap', slot: 'CREATIVE_DEVELOPMENT_ROADMAP' },
  { route: '/creative/decisions/', slug: 'creative-decisions', slot: 'CREATIVE_DECISION_TREE' },
  { route: '/statistics/decision-trees/', slug: 'statistics-decision-trees', slot: 'STATISTICAL_DECISION_TREE' },
] as const;

async function parseSelectArrowGap(page: Page) {
  return page.evaluate(() => {
    const selects = [...document.querySelectorAll('select')].filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
    });
    return selects.map((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      // Chromium serializes `right 0.875rem center` as `calc(100% - 14px)` or an absolute px offset from left.
      const posX = s.backgroundPositionX;
      const sizeParts = s.backgroundSize.split(/\s+/);
      const iconW = parseFloat(sizeParts[0] || '0');
      const padRight = parseFloat(s.paddingRight || '0');
      const borderRight = parseFloat(s.borderRightWidth || '0');
      const innerWidth = r.width - parseFloat(s.borderLeftWidth || '0') - borderRight;
      let rightInsetPx = 0;
      const calcMatch = posX.match(/calc\(\s*100%\s*-\s*([\d.]+)px\s*\)/i);
      if (calcMatch) {
        rightInsetPx = parseFloat(calcMatch[1]!);
      } else if (posX.endsWith('px')) {
        rightInsetPx = innerWidth - parseFloat(posX) - iconW;
      }
      return {
        id: el.id || el.getAttribute('aria-label') || el.className,
        appearance: s.appearance,
        hasChevronSvg: s.backgroundImage.includes('data:image/svg+xml'),
        backgroundRepeat: s.backgroundRepeat,
        backgroundPositionX: posX,
        backgroundSize: s.backgroundSize,
        iconW,
        paddingRight: padRight,
        borderRight,
        rightInsetPx,
        borderEdgeToArrowPx: rightInsetPx + borderRight,
      };
    });
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`R1 GDP Treemap (${theme}): deterministic WCAG >= 4.5:1 contrast on every tile`, async ({ page }) => {
    ensureScreenshotDir();
    const reportRows: Array<{ mode: string; tile: string; fg: string; bg: string; ratio: number }> = [];

    await setTheme(page, theme);
    const watch = watchConsole(page);
    await page.goto('/statistics/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const map = page.locator('[data-gdp-treemap]');
    await hydrated(map);
    await expect(map.locator('[data-tile]').first()).toBeVisible();

    const tiles = await map.evaluate((root) => {
      return [...root.querySelectorAll('[data-tile]')].map((g) => {
        const rect = g.querySelector('rect')!;
        const texts = [...g.querySelectorAll('text')];
        return {
          id: g.getAttribute('data-tile')!,
          name: g.getAttribute('data-name')!,
          mode: g.getAttribute('data-label-mode')!,
          marker: g.getAttribute('data-marker'),
          bg: getComputedStyle(rect).fill,
          texts: texts.map((t) => ({
            text: (t.textContent ?? '').trim(),
            fg: getComputedStyle(t).fill,
          })),
        };
      });
    });

    expect(tiles.length).toBe(20);
    const labeledTiles = tiles.filter((t) => t.texts.length > 0);
    expect(labeledTiles.length).toBeGreaterThanOrEqual(16);

    for (const tile of labeledTiles) {
      for (const txt of tile.texts) {
        const ratio = contrastRatio(txt.fg, tile.bg);
        reportRows.push({ mode: theme, tile: `${tile.name} (${txt.text})`, fg: txt.fg, bg: tile.bg, ratio: Number(ratio.toFixed(2)) });
        expect(ratio, `${theme} ${tile.name} (${txt.text}): fg=${txt.fg} on bg=${tile.bg} ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }

    await map.screenshot({ path: path.join(SCREENSHOT_DIR, `r1-treemap-${theme}.png`), animations: 'disabled' });
    watch.expectClean();

    const uniquePairs = new Map<string, { mode: string; sample: string; fg: string; bg: string; ratio: number; count: number }>();
    for (const r of reportRows) {
      const key = `${r.mode}|${r.fg}|${r.bg}`;
      const prev = uniquePairs.get(key);
      if (prev) prev.count++;
      else uniquePairs.set(key, { mode: r.mode, sample: r.tile, fg: r.fg, bg: r.bg, ratio: r.ratio, count: 1 });
    }
    console.log(`R1_TREEMAP_CONTRAST_SUMMARY_${theme.toUpperCase()}=` + JSON.stringify([...uniquePairs.values()]));
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`R2 Correlation Heatmap (${theme}): all 225 cells shown for Spearman & Pearson, >= 4.5:1 contrast, no clipping`, async ({ page }) => {
    test.setTimeout(90_000);
    ensureScreenshotDir();
    const minContrastByKey: Record<string, { minRatio: number; sampleFg: string; sampleBg: string; count: number; minFontPx: number }> = {};

    await setTheme(page, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    const watch = watchConsole(page);
    await page.goto('/statistics/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const root = page.locator('[data-correlation-heatmap]');
    await hydrated(root);

    for (const method of ['spearman', 'pearson'] as const) {
      if (method === 'pearson') {
        await root.getByText('Pearson (linear, log for skewed)').click();
      }
      await expect(root).toHaveAttribute('data-correlation-heatmap', method);

      const cells = await root.evaluate((el) => {
        return [...el.querySelectorAll('[data-corr-cell]')].map((td) => {
          const s = getComputedStyle(td);
          return {
            pos: td.getAttribute('data-corr-cell')!,
            text: (td.textContent ?? '').trim(),
            fg: s.color,
            bg: s.backgroundColor,
            fontPx: parseFloat(s.fontSize),
            scrollW: td.scrollWidth,
            clientW: td.clientWidth,
          };
        });
      });

      expect(cells.length, `${theme} ${method} total cells`).toBe(225);
      let minRatio = Infinity;
      let sampleFg = '';
      let sampleBg = '';
      let minFontPx = Infinity;
      let negCount = 0;

      for (const c of cells) {
        expect(c.text, `${theme} ${method} cell ${c.pos}`).toMatch(/^-?\d\.\d{2}$/);
        expect(c.text, `${theme} ${method} cell ${c.pos} no -0.00`).not.toBe('-0.00');
        const [i, j] = c.pos.split('-').map(Number);
        if (i === j) expect(c.text, `${theme} ${method} diagonal ${c.pos}`).toBe('1.00');
        if (c.text.startsWith('-')) negCount++;
        expect(c.fontPx, `${theme} ${method} cell ${c.pos} font >= 10px`).toBeGreaterThanOrEqual(10);
        expect(c.scrollW, `${theme} ${method} cell ${c.pos} no horizontal clip`).toBeLessThanOrEqual(c.clientW);
        const ratio = contrastRatio(c.fg, c.bg);
        if (ratio < minRatio) {
          minRatio = ratio;
          sampleFg = c.fg;
          sampleBg = c.bg;
        }
        if (c.fontPx < minFontPx) minFontPx = c.fontPx;
        expect(ratio, `${theme} ${method} cell ${c.pos} fg=${c.fg} bg=${c.bg} ratio=${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(negCount, `${theme} ${method} has negative correlations`).toBeGreaterThan(20);
      minContrastByKey[`${theme}:${method}`] = {
        minRatio: Number(minRatio.toFixed(2)),
        sampleFg,
        sampleBg,
        count: cells.length,
        minFontPx,
      };

      await root.screenshot({ path: path.join(SCREENSHOT_DIR, `r2-heatmap-${method}-${theme}.png`), animations: 'disabled' });
    }
    watch.expectClean();
    console.log(`R2_HEATMAP_SUMMARY_${theme.toUpperCase()}=` + JSON.stringify(minContrastByKey));
  });
}

test('R2 Correlation Heatmap responsive geometry at 1440, 1024, and 390px with sticky row labels', async ({ page }) => {
  await setTheme(page, 'dark');
  for (const width of [1440, 1024, 390] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/statistics/');
    const root = page.locator('[data-correlation-heatmap]');
    await hydrated(root);
    await expectNoHorizontalOverflow(page);

    const check = await root.evaluate((el) => {
      const scroller = el.querySelector('[data-correlation-scroll]') as HTMLElement;
      const cells = [...el.querySelectorAll('[data-corr-cell]')];
      const clipped = cells.filter((c) => c.scrollWidth > c.clientWidth).length;
      const canScroll = scroller.scrollWidth > scroller.clientWidth;
      let stickyVisibleAfterScroll = true;
      if (canScroll) {
        scroller.scrollLeft = 260;
        const sr = scroller.getBoundingClientRect();
        const firstRowLabel = el.querySelector('[data-corr-row-label]')!.getBoundingClientRect();
        stickyVisibleAfterScroll = firstRowLabel.left >= sr.left - 1 && firstRowLabel.left <= sr.left + 8 && firstRowLabel.width > 40;
      }
      return { total: cells.length, clipped, canScroll, stickyVisibleAfterScroll };
    });

    expect(check.total).toBe(225);
    expect(check.clipped, `width ${width}px clipped cells`).toBe(0);
    if (width === 390) {
      expect(check.canScroll, '390px heatmap scrolls horizontally').toBe(true);
      expect(check.stickyVisibleAfterScroll, '390px sticky row label stays visible when scrolled').toBe(true);
    }
  }
});

for (const theme of ['dark', 'light'] as const) {
  test(`R4 Select dropdown arrow spacing >= 12px from right edge across all 18 select routes (${theme})`, async ({ page }) => {
    test.setTimeout(150_000);
    ensureScreenshotDir();
    const pageCounts: Array<{ route: string; selects: number; minRightInsetPx: number; minBorderEdgeToArrowPx: number; minPaddingRightPx: number }> = [];

    await setTheme(page, theme);
    const watch = watchConsole(page);

    for (const route of SELECT_ROUTES) {
      const targetUrl = route === '/drift/' ? '/drift/#explorer' : route;
      const res = await page.goto(targetUrl);
      expect(res?.status(), route).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.waitForLoadState('networkidle');

      // Hydrate lazy client:visible islands so their <select> controls mount cleanly.
      const islands = page.locator('main#main astro-island');
      const islandCount = await islands.count();
      for (let i = 0; i < islandCount; i++) {
        await islands.nth(i).scrollIntoViewIfNeeded();
      }
      if (route === '/reports/') {
        const selectedRadio = page.getByLabel('Selected findings');
        await expect(selectedRadio).toBeVisible({ timeout: 15_000 });
        await selectedRadio.check();
      }
      if (route === '/creative/decisions/') {
        const triageBtn = page.getByRole('button', { name: /triage|readiness/i }).first();
        await expect(triageBtn).toBeVisible({ timeout: 15_000 });
        await triageBtn.click();
      }
      const firstSelect = page.locator('select').first();
      await expect(firstSelect, `${theme} ${route} select mounted`).toBeVisible({ timeout: 15_000 });
      await firstSelect.scrollIntoViewIfNeeded();

      const items = await parseSelectArrowGap(page);
      expect(items.length, `${theme} ${route} has visible <select>`).toBeGreaterThan(0);

      let minRight = Infinity;
      let minBorderToArrow = Infinity;
      let minPadR = Infinity;
      for (const s of items) {
        expect(s.appearance, `${theme} ${route} ${s.id} appearance`).toBe('none');
        expect(s.hasChevronSvg, `${theme} ${route} ${s.id} custom chevron svg`).toBe(true);
        expect(s.backgroundRepeat, `${theme} ${route} ${s.id} no-repeat`).toBe('no-repeat');
        expect(s.rightInsetPx, `${theme} ${route} ${s.id} right inset >= 12px`).toBeGreaterThanOrEqual(12);
        expect(s.borderEdgeToArrowPx, `${theme} ${route} ${s.id} border-to-arrow >= 12px`).toBeGreaterThanOrEqual(12);
        expect(s.paddingRight, `${theme} ${route} ${s.id} padding-right avoids arrow overlap`).toBeGreaterThanOrEqual(s.rightInsetPx + s.iconW + 8);
        if (s.rightInsetPx < minRight) minRight = s.rightInsetPx;
        if (s.borderEdgeToArrowPx < minBorderToArrow) minBorderToArrow = s.borderEdgeToArrowPx;
        if (s.paddingRight < minPadR) minPadR = s.paddingRight;
      }

      pageCounts.push({
        route,
        selects: items.length,
        minRightInsetPx: Number(minRight.toFixed(1)),
        minBorderEdgeToArrowPx: Number(minBorderToArrow.toFixed(1)),
        minPaddingRightPx: Number(minPadR.toFixed(1)),
      });

      if (route === '/calculator/') {
        await page.locator('[data-calculator]').screenshot({ path: path.join(SCREENSHOT_DIR, `r4-calculator-${theme}.png`), animations: 'disabled' });
      }
      if (route === '/creative/audit/') {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `r4-creative-audit-${theme}.png`), animations: 'disabled', fullPage: false });
      }
    }
    watch.expectClean();

    console.log(`R4_SELECT_SUMMARY_${theme.toUpperCase()}=` + JSON.stringify({ totalPagesWithSelect: pageCounts.length, totalSelectsMeasured: pageCounts.reduce((a, b) => a + b.selects, 0), pages: pageCounts }));
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`Visual evidence screenshots (${theme}): all 9 newly filled illustration pages`, async ({ page }) => {
    test.setTimeout(120_000);
    ensureScreenshotDir();
    await setTheme(page, theme);
    const watch = watchConsole(page);
    for (const item of NEW_ILLUSTRATION_ROUTES) {
      await page.goto(item.route);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const img = page.locator(`[data-image-slot="${item.slot}"] img`);
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 20_000 }).toBe(true);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `r3-${item.slug}-${theme}.png`), animations: 'disabled', fullPage: false });
    }
    watch.expectClean();
  });
}
