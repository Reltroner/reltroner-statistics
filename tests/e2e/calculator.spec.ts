import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { RUBRIC } from '../../src/domain/calculator.ts';
import { CalcResultSchema } from '../../src/domain/calculator-schemas.ts';
import { CSV_HEADER } from '../../src/engine/calculator/export.ts';
import { HANDOFF_KEY } from '../../src/engine/calculator/handoff.ts';
import { expectContainedText, expectNoHorizontalOverflow, hydrated, setTheme, watchConsole } from './helpers.ts';

const WIDE_FONTS = ':root{--font-sans:Verdana,"DejaVu Sans",sans-serif!important;--font-display:Verdana,"DejaVu Sans",sans-serif!important;--font-mono:"Courier New","DejaVu Sans Mono",monospace!important}';
const HEADER_FONTS_LINUX = 'header[data-site-header], header[data-site-header] a, header[data-site-header] button { font-family: "Liberation Sans", "DejaVu Sans", Verdana, Arial, sans-serif !important; }';

async function readDownloadText(page: Page, trigger: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const filePath = await download.path();
  expect(filePath, 'download should have a temporary file path').toBeTruthy();
  return { filename: download.suggestedFilename(), text: fs.readFileSync(filePath!, 'utf8') };
}

test('CALC-07 navbar discoverability & desktop header non-clipping (including 1280px Linux fallback fonts) @responsive', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/');
  const width = page.viewportSize()?.width ?? 1440;
  if (width >= 1280) {
    const navLink = page.locator('nav[aria-label="Primary"] a[href="/calculator"]');
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveText('Calculator');
    await navLink.click();
  } else {
    const toggle = page.locator('[data-menu-toggle]');
    await toggle.click();
    const mobileLink = page.locator('#mobile-nav a[href="/calculator"]');
    await expect(mobileLink).toBeVisible();
    await mobileLink.click();
  }
  await expect(page).toHaveURL(/\/calculator\/?$/);
  await hydrated(page.locator('[data-calculator]'));
  await expectNoHorizontalOverflow(page);

  if (width >= 1280) {
    for (const fonts of ['default', 'linux'] as const) {
      if (fonts === 'linux') await page.addStyleTag({ content: HEADER_FONTS_LINUX });
      const check = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Primary"]');
        const header = document.querySelector('header[data-site-header]');
        if (!nav || !header) return { ok: false, reason: 'missing header/nav', items: [] as string[] };
        const items = [...nav.querySelectorAll('a, button')].map((el) => {
          const r = el.getBoundingClientRect();
          return { text: (el.textContent ?? '').trim().slice(0, 24), x: r.x, right: r.right, y: r.y, bottom: r.bottom, height: r.height };
        });
        const hr = header.getBoundingClientRect();
        const clipped = items.filter((i) => i.height === 0 || i.right > hr.right + 1 || i.bottom > hr.bottom + 1 || i.x < hr.x - 1);
        const overlaps: string[] = [];
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            const a = items[i]!;
            const b = items[j]!;
            const hOverlap = Math.min(a.right, b.right) - Math.max(a.x, b.x);
            const vOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
            if (hOverlap > 1 && vOverlap > 1) overlaps.push(`${a.text} vs ${b.text}`);
          }
        }
        return { ok: clipped.length === 0 && overlaps.length === 0, clipped, overlaps };
      });
      expect(check, `header geometry (${width}px, ${fonts} fonts)`).toMatchObject({ ok: true, clipped: [], overlaps: [] });
    }
  }
  watch.expectClean();
});

test('CALC-07 desktop 1280px navbar keeps every link unclipped under wide Linux fallback fonts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/calculator');
  await page.addStyleTag({ content: HEADER_FONTS_LINUX });
  await expectNoHorizontalOverflow(page);
  const issues = await page.evaluate(() => {
    const header = document.querySelector('header[data-site-header]')!.getBoundingClientRect();
    const els = [...document.querySelectorAll('nav[aria-label="Primary"] a, nav[aria-label="Primary"] button')];
    return els.flatMap((el) => {
      const r = el.getBoundingClientRect();
      return r.right > header.right + 1 || r.x < header.x - 1 || el.scrollWidth > el.clientWidth + 2
        ? [`${(el.textContent ?? '').trim()} (${Math.round(r.x)}..${Math.round(r.right)} vs ${Math.round(header.right)})`]
        : [];
    });
  });
  expect(issues).toEqual([]);
});

test('CALC-01..07 mode switching, Spatial 27%, 4-way 100% reallocation, 105% rejection & reset', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/calculator');
  await hydrated(page.locator('[data-calculator]'));

  // Default Calculate mode shows initial PROPOSED Spatial 3D calculation with pinned remodeling link.
  const initialResult = page.locator('section[data-calc-result="calculate"]');
  await expect(initialResult).toHaveAttribute('data-result-status', 'PROPOSED');
  await expect(initialResult.locator('[data-result-value]')).toContainText('188.10 billion residents');
  await expect(initialResult.locator('[data-pinned-source]').first()).toHaveAttribute('href', /^https:\/\/github\.com\/Reltroner\/reltroner-studio-remodeling\/blob\/[0-9a-f]{40}\//);

  // Mode tabs render only relevant fields & support ArrowRight / Home keyboard navigation.
  const calcTab = page.locator('#calc-tab-calculate');
  await calcTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#calc-tab-future')).toBeFocused();
  await expect(page.locator('form#calc-panel')).toHaveAttribute('data-calc-mode', 'future');
  await expect(page.locator('#calc-calculate-share')).toHaveCount(0);
  await expect(page.locator('#calc-future-rate')).toHaveValue('');
  await page.keyboard.press('Home');
  await expect(calcTab).toBeFocused();
  await expect(page.locator('form#calc-panel')).toHaveAttribute('data-calc-mode', 'calculate');

  // What-if 27% underground: 855 * 27% = 230.85 billion residents, SCENARIO status, retains remodeling limitations.
  await page.locator('#calc-calculate-share').fill('27');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.locator('section[data-calc-result="calculate"]')).toHaveAttribute('data-result-status', 'SCENARIO');
  await expect(page.locator('[data-result-value]')).toContainText('230.85 billion residents');
  await expect(page.locator('[data-limitations]')).toContainText('105.00%');
  await expect(page.locator('[data-limitations]')).toContainText('remodeling main');

  // Switch to weighted_composition: 65 / 27 / 2 / 6 = 100% accepted; 70 / 27 / 2 / 6 = 105% rejected cleanly.
  await page.locator('#calc-calculate-formula').selectOption('weighted_composition');
  await page.locator('#calc-calculate-share-surface_land').fill('65');
  await page.locator('#calc-calculate-share-underground').fill('27');
  await page.locator('#calc-calculate-share-underwater').fill('2');
  await page.locator('#calc-calculate-share-floating').fill('6');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.locator('section[data-calc-result="calculate"]')).toHaveAttribute('data-result-status', 'SCENARIO');
  await expect(page.locator('[data-table="reallocation"]')).toContainText('230.85');

  await page.locator('#calc-calculate-share-surface_land').fill('70');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.locator('section[data-calc-failure="COMPOSITION_NOT_CLOSED"]')).toHaveAttribute('data-result-status', 'INVALID_INPUT');
  await expect(page.locator('section[data-calc-failure="COMPOSITION_NOT_CLOSED"]')).toContainText('105%');

  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('#calc-calculate-formula')).toHaveValue('population_x_habitat_share');
  await expect(page.locator('[data-result-value]')).toContainText('188.10 billion residents');
  watch.expectClean();
});

test('CALC-02..04,06,07 future +1%/100y, compare handoff, sweep, backcast, rubric, ECharts & JSON/CSV exports', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/calculator');
  await hydrated(page.locator('[data-calculator]'));

  // Future scenario: empty rate refused cleanly on submit without inventing defaults.
  await page.locator('#calc-tab-future').click();
  await expect(page.locator('#calc-future-rate')).toHaveValue('');
  await page.getByRole('button', { name: 'Run scenario' }).click();
  await expect(page.locator('#calc-future-rate-error')).toContainText('assumed annual rate');

  // Out-of-range rate rejected, never clamped.
  await page.locator('#calc-future-rate').fill('500');
  await page.getByRole('button', { name: 'Run scenario' }).click();
  await expect(page.locator('section[data-calc-failure="RATE_OUT_OF_RANGE"]')).toHaveAttribute('data-result-status', 'INVALID_INPUT');

  // Reltronland +1% 100y = 2,312.62 billion sentients + INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST + SVG EChart.
  await page.locator('#calc-future-rate').fill('1');
  await page.locator('#calc-future-horizon').fill('100');
  await page.getByRole('button', { name: 'Run scenario' }).click();
  const futureResult = page.locator('section[data-calc-result="projectScenario"]');
  await expect(futureResult).toHaveAttribute('data-result-status', 'SCENARIO');
  await expect(futureResult.locator('[data-result-value]')).toContainText('2,312.62 billion sentients');
  await expect(futureResult.locator('[data-summary-status="INSUFFICIENT_DATA"]')).toContainText('INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST');
  await expect(futureResult.locator('[data-result-chart="ELAPSED_YEARS"] svg')).toBeVisible();
  await expect(futureResult.locator('[data-table-details="trajectory"]')).toBeVisible();
  await expect(futureResult.locator('[data-pinned-source]').first()).toHaveAttribute('href', /^https:\/\/github\.com\/Reltroner\/reltroner-studio\/blob\/[0-9a-f]{40}\//);

  // Download JSON & CSV exports and verify schema + formula-injection neutralization.
  const jsonDownload = await readDownloadText(page, () => page.getByRole('button', { name: 'Export JSON' }).click());
  expect(jsonDownload.filename).toMatch(/^reltroner-calculator-projectScenario-calc-[0-9a-f]{8}\.json$/);
  const parsedJson = CalcResultSchema.parse(JSON.parse(jsonDownload.text));
  expect(parsedJson.result_status).toBe('SCENARIO');
  expect(parsedJson.formula_version).toBe('1.0.0');

  // Compare handoff button from Future scenario copies rate & moves to Compare tab.
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.locator('form#calc-panel')).toHaveAttribute('data-calc-mode', 'compare');
  await expect(page.locator('#calc-compare-rate-1')).toHaveValue('1');
  await page.locator('#calc-compare-label-0').fill('=CMD("calc")');
  await page.locator('#calc-compare-rate-0').fill('0.5');
  await page.locator('#calc-compare-rate-2').fill('2');
  await page.getByRole('button', { name: 'Run scenario' }).click();
  await expect(page.locator('section[data-calc-result="compareScenarios"]')).toHaveAttribute('data-result-status', 'SCENARIO');
  await expect(page.locator('[data-result-chart="ELAPSED_YEARS"] svg')).toBeVisible();

  const csvDownload = await readDownloadText(page, () => page.getByRole('button', { name: 'Export CSV' }).click());
  expect(csvDownload.filename).toMatch(/^reltroner-calculator-compareScenarios-calc-[0-9a-f]{8}\.csv$/);
  expect(csvDownload.text.startsWith(`${CSV_HEADER.join(',')}\r\n`)).toBe(true);
  expect(csvDownload.text).toContain("'=CMD(\"\"calc\"\")");

  // Rate sweep sensitivity mode.
  await page.getByRole('radio', { name: 'Rate sweep (sensitivity)' }).check();
  await page.locator('#calc-compare-min').fill('0');
  await page.locator('#calc-compare-max').fill('2');
  await page.locator('#calc-compare-steps').fill('11');
  await page.getByRole('button', { name: 'Run scenario' }).click();
  await expect(page.locator('section[data-calc-result="analyzeSensitivity"] [data-result-chart="RATE_PCT"] svg')).toBeVisible();
  await expect(page.locator('[data-table="sweep"] tbody tr')).toHaveCount(11);

  // Historical backcast: Depcutland 300 BAC @ +0.4% = 103.56 billion sentients.
  await page.locator('#calc-tab-backcast').click();
  await page.locator('#calc-backcast-entity').selectOption('country:depcutland');
  await page.locator('#calc-backcast-target').fill('300');
  await page.locator('#calc-backcast-rate').fill('0.4');
  await page.getByRole('button', { name: 'Run scenario' }).click();
  const backcast = page.locator('section[data-calc-result="reconstructScenario"]');
  await expect(backcast.locator('[data-result-value]')).toContainText('103.56 billion sentients');
  await expect(backcast.locator('[data-result-chart="BAC_AXIS"] svg')).toBeVisible();
  await expect(backcast.locator('[data-limitations]')).toContainText('not Earth BCE');
  await backcast.locator('[data-table-details="backcast"] summary').click();
  await expect(backcast.locator('[data-table="backcast"]')).toContainText('CANON_OBSERVED');
  await expect(backcast.locator('[data-table="backcast"]')).toContainText('Not observed');

  // Reltronland 1010 BAC displays sparse CANON_OBSERVED anchor (1.52 billion) alongside modeled curve.
  await page.locator('#calc-backcast-entity').selectOption('country:reltronland');
  await page.locator('#calc-backcast-target').fill('1010');
  await page.getByRole('button', { name: 'Run scenario' }).click();
  await expect(page.locator('section[data-calc-result="reconstructScenario"]')).toContainText('1.52 billion sentients for 1010 BAC');

  // Qualitative rubric: all scores empty initially; empty run stays INSUFFICIENT_DATA; scoring A only keeps B & C incomplete.
  await page.locator('#calc-tab-qualitative').click();
  for (const select of await page.locator('form#calc-panel select').all()) {
    await expect(select).toHaveValue('');
  }
  await page.getByRole('button', { name: 'Run scenario' }).click();
  await expect(page.locator('section[data-calc-result="evaluateQualitativeScenario"]')).toHaveAttribute('data-result-status', 'INSUFFICIENT_DATA');
  await expect(page.locator('[data-result-value]')).toHaveText('Not computed');

  for (const c of RUBRIC.criteria) {
    await page.locator(`#calc-qualitative-score-A-${c.id}`).selectOption('4');
  }
  await page.locator('#calc-qualitative-note').fill('Manual test note.');
  await page.getByRole('button', { name: 'Run scenario' }).click();
  const qualResult = page.locator('section[data-calc-result="evaluateQualitativeScenario"]');
  await expect(qualResult).toHaveAttribute('data-result-status', 'SCENARIO');
  await expect(qualResult.locator('[data-result-label]')).toContainText('A');
  await expect(qualResult.locator('[data-summary-status="INSUFFICIENT_DATA"]')).toHaveCount(2);
  await expect(qualResult.locator('[data-limitations]')).toContainText('not a measured probability');
  watch.expectClean();
});

test('CALC-05 Assistant Q1–Q7 (English + Indonesian), bidirectional handoff, bad storage resilience & disabled external AI', async ({ page }) => {
  const watch = watchConsole(page);

  // Assistant UI keeps optional external AI switch disabled.
  await page.goto('/assistant');
  await hydrated(page.locator('#assistant-question'));
  await expect(page.getByRole('checkbox', { name: /Request a generated explanation/ })).toBeDisabled();

  // Indonesian Q1 on Assistant, then click Open in Calculator -> carries request and clears session key.
  await page.locator('#assistant-question').fill('Jika Reltronland tumbuh 1% per tahun selama 100 tahun, berapa populasinya?');
  await page.getByRole('button', { name: 'Answer from evidence' }).click();
  const answer = page.locator('section[data-answer-intent="CALCULATOR"]');
  await expect(answer).toHaveAttribute('data-answer-status', 'SCENARIO');
  await expect(answer).toContainText('2,312.62 billion sentients');

  // Seed an unrelated session key and verify Open in Calculator leaves it untouched.
  await page.evaluate(() => sessionStorage.setItem('rs-private-draft', 'kept'));
  await page.locator('[data-calculator-handoff] a', { hasText: 'Open in Calculator' }).click();
  await expect(page).toHaveURL(/\/calculator\/?$/);
  await hydrated(page.locator('[data-calculator]'));
  await expect(page.locator('[data-calc-notice]')).toContainText('Inputs received from the Assistant');
  await expect(page.locator('form#calc-panel')).toHaveAttribute('data-calc-mode', 'future');
  await expect(page.locator('[data-result-value]')).toContainText('2,312.62 billion sentients');
  expect(await page.evaluate((k) => sessionStorage.getItem(k), HANDOFF_KEY)).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('rs-private-draft'))).toBe('kept');

  // Navigate back to Assistant via Explain with Assistant -> single-use handoff recomputes in Assistant.
  await page.getByRole('link', { name: 'Explain with Assistant' }).click();
  await expect(page).toHaveURL(/\/assistant\/?$/);
  await expect(page.locator('section[data-answer-intent="CALCULATOR"]')).toContainText('2,312.62 billion sentients');
  expect(await page.evaluate((k) => sessionStorage.getItem(k), HANDOFF_KEY)).toBeNull();

  // Check remaining Q2..Q7 coverage cleanly on Assistant.
  for (const [q, expected] of [
    ['Compare Reltronland population growth at 0.5%, 1% and 2% over 50 years.', /3 conditional scenarios/i],
    ['Berapa populasi hipotetis Depcutland 300 tahun sebelum Tahun 0 jika pertumbuhan tahunan 0,4%?', /103\.56 billion sentients in 300 BAC/],
    ['How many Reltronland residents would be underground if the share changed to 27%?', /230\.85 billion residents/],
    ['Compare limited versus broader cooperation between Reltronland and Depcutland.', /War of Conscience/],
    ['Why is this backcast not canon?', /1\.52 billion sentients in 1010 BAC/],
    ['What is the SDI of Reltronland?', /Sentient Development Index/],
  ] as const) {
    await page.locator('#assistant-question').fill(q);
    await page.getByRole('button', { name: 'Answer from evidence' }).click();
    await expect(page.locator('section[aria-labelledby="answer-h"]')).toContainText(expected);
  }

  // Malformed handoff payload on /calculator load is discarded cleanly without breaking the workspace.
  await page.evaluate((k) => {
    sessionStorage.setItem(k, '{"schema_version":"bad"');
    sessionStorage.setItem('rs-private-draft', 'still-kept');
  }, HANDOFF_KEY);
  await page.goto('/calculator');
  await hydrated(page.locator('[data-calculator]'));
  await expect(page.locator('section[data-calc-result="calculate"]')).toBeVisible();
  expect(await page.evaluate((k) => sessionStorage.getItem(k), HANDOFF_KEY)).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('rs-private-draft'))).toBe('still-kept');

  // Blocked sessionStorage triggers graceful inline fallback instead of throwing.
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'QuotaExceededError'); };
  });
  await page.getByRole('link', { name: 'Explain with Assistant' }).click();
  await expect(page).toHaveURL(/\/calculator/);
  await expect(page.locator('[data-handoff-fallback]')).toBeVisible();

  await page.goto('/assistant');
  await hydrated(page.locator('#assistant-question'));
  await page.locator('#assistant-question').fill('If Reltronland grows by 1% annually for 100 years, what is the population?');
  await page.getByRole('button', { name: 'Answer from evidence' }).click();
  await expect(page.locator('section[data-answer-intent="CALCULATOR"]')).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'QuotaExceededError'); };
  });
  await page.locator('[data-calculator-handoff] a', { hasText: 'Open in Calculator' }).click();
  await expect(page.locator('[data-handoff-fallback]')).toBeVisible();
  await expect(page.locator('section[data-answer-intent="CALCULATOR"]')).toContainText('2,312.62 billion sentients');

  watch.expectClean();
});

test('CALC-07 theme persistence, ECharts re-theme & reduced motion on /calculator', async ({ browser, page }) => {
  await setTheme(page, 'dark');
  const watch = watchConsole(page);
  await page.goto('/calculator');
  await hydrated(page.locator('[data-calculator]'));
  await page.locator('#calc-tab-future').click();
  await page.locator('#calc-future-rate').fill('1');
  await page.getByRole('button', { name: 'Run scenario' }).click();
  await expect(page.locator('[data-result-chart="ELAPSED_YEARS"] svg')).toBeVisible();

  await page.locator('[data-theme-toggle]').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-result-chart="ELAPSED_YEARS"] svg')).toBeVisible();
  await page.goto('/assistant');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  watch.expectClean();

  const reduced = await browser.newContext({ reducedMotion: 'reduce' });
  const rPage = await reduced.newPage();
  const rWatch = watchConsole(rPage);
  await rPage.goto('/calculator');
  await hydrated(rPage.locator('[data-calculator]'));
  const animation = await rPage.locator('h1.rs-reveal').evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
  await rPage.locator('#calc-tab-future').click();
  await rPage.locator('#calc-future-rate').fill('1');
  await rPage.getByRole('button', { name: 'Run scenario' }).click();
  await expect(rPage.locator('[data-result-chart="ELAPSED_YEARS"] svg')).toBeVisible();
  rWatch.expectClean();
  await reduced.close();
});

test('CALC-07 layout sweep across 320..1920px and wide fallback fonts on /calculator', async ({ page }) => {
  test.setTimeout(120_000);
  const watch = watchConsole(page);
  for (const theme of ['dark', 'light'] as const) {
    for (const width of [320, 375, 390, 768, 1024, 1280, 1440, 1920] as const) {
      await setTheme(page, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/calculator');
      await hydrated(page.locator('[data-calculator]'));
      await expectNoHorizontalOverflow(page);
      await expectContainedText(page);
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/calculator');
  await page.addStyleTag({ content: WIDE_FONTS });
  await hydrated(page.locator('[data-calculator]'));
  await expectNoHorizontalOverflow(page);
  await expectContainedText(page);
  watch.expectClean();
});

for (const theme of ['dark', 'light'] as const) {
  test(`CALC-07 accessibility: no serious or critical axe violations on /calculator & /assistant (${theme})`, async ({ page }) => {
    await setTheme(page, theme);
    await page.goto('/calculator');
    await hydrated(page.locator('[data-calculator]'));
    await page.locator('#calc-tab-future').click();
    await page.locator('#calc-future-rate').fill('1');
    await page.getByRole('button', { name: 'Run scenario' }).click();
    await expect(page.locator('[data-result-chart="ELAPSED_YEARS"] svg')).toBeVisible();
    const calcAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.rs-chart-frame').analyze();
    expect(calcAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);

    await page.goto('/assistant');
    await hydrated(page.locator('#assistant-question'));
    await page.locator('#assistant-question').fill('If Reltronland grows by 1% annually for 100 years, what is the population?');
    await page.getByRole('button', { name: 'Answer from evidence' }).click();
    await expect(page.locator('section[data-answer-intent="CALCULATOR"]')).toBeVisible();
    const asstAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(asstAxe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
}
