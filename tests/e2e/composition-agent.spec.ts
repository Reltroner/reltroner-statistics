import { expect, test, type Page } from '@playwright/test';
import { expectContainedText, expectNoHorizontalOverflow, hydrated, setTheme, watchConsole } from './helpers.ts';

/** The figure of the active theme: only one of the two variants is displayed. */
const visibleFigure = (page: Page, id: string) => page.locator(`figure[data-figure="${id}"] img.rs-fig:visible`);

test('R1 Species & ancestry: production shares, derived residents, comparison, matrix filter and coverage @responsive', async ({ page }) => {
  const watch = watchConsole(page);
  await setTheme(page, 'dark');
  await page.goto('/statistics/species');
  await hydrated(page.locator('#ancestry-country'));
  await expect(page.getByRole('heading', { level: 1, name: 'Species & ancestry demographics' })).toBeVisible();
  await expect(visibleFigure(page, 'species-planet')).toHaveAttribute('src', '/reports/figures/species-planet-dark.svg');
  await expect(visibleFigure(page, 'species-planet')).toBeVisible();
  const svg = await page.request.get('/reports/figures/species-planet.svg');
  expect(svg.status()).toBe(200);
  expect(svg.headers()['content-type']).toMatch(/svg/);

  await page.locator('#ancestry-country').selectOption('country:beluftner');
  await expect(page.getByRole('heading', { name: 'Beluftner · primary ancestry' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Primary ancestry of Beluftner' });
  await expect(table.getByRole('row', { name: /Phantomkind \/ Spiritual Hybrid 6\.00% 5\.46/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Native Asthorteran 90\.30% 82\.17/ })).toBeVisible();
  await expect(page.getByText('Shares: CANON_OBSERVED')).toBeVisible();
  await expect(visibleFigure(page, 'species-country-beluftner')).toBeVisible();

  await page.locator('#ancestry-compare').selectOption('country:reltronland');
  const compare = page.getByRole('table', { name: 'Primary ancestry of Beluftner and Reltronland' });
  await expect(compare.getByRole('row', { name: /^Depeisit/ })).toContainText('−63.80 pp');

  await page.locator('#ancestry-country').selectOption('country:calespia');
  await expect(page.getByText(/Not assigned: production main records no national ancestry shares for Calespia/)).toBeVisible();
  await expect(page.locator('#ancestry-country option[value="country:scenrepolia"]')).toContainText('ancestry not assigned');

  await page.getByRole('searchbox', { name: 'Filter nations' }).fill('lund');
  await expect(page.getByText(/of 19 nations shown/)).toContainText('0 of 19');
  await page.getByRole('searchbox', { name: 'Filter nations' }).fill('land');
  const matrix = page.getByRole('table', { name: 'Primary ancestry by nation' });
  await expect(matrix.getByRole('row', { name: /^Reltronland/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Filter nations' }).fill('');
  await expect(matrix.getByRole('row', { name: /18 deferred states \(one aggregate\)/ })).toContainText('NOT ALLOCATED');

  await page.getByLabel('Residents (billion)').check();
  await expect(visibleFigure(page, 'species-stacked-billions')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectContainedText(page);
  watch.expectClean();
});

test('Spatial 3D: 58/15/14/13 of land and 70/22/2/6 of residents with separate denominators @responsive', async ({ page }) => {
  const watch = watchConsole(page);
  await setTheme(page, 'light');
  await page.goto('/statistics/spatial');
  await hydrated(page.locator('#spatial-country'));
  await expect(page.getByRole('heading', { name: /Reltronland · Spatial 3D composition/ })).toBeVisible();
  const surface = page.getByRole('table', { name: 'Terrestrial surface footprint of Reltronland' });
  for (const [label, pct, area] of [['Natural low-intervention', '58.00%', '60.32'], ['Active built urban', '15.00%', '15.60'], ['Operational low / biological-zero built urban', '14.00%', '14.56'], ['Dormant built urban', '13.00%', '13.52']] as const) {
    await expect(surface.getByRole('row', { name: new RegExp(`^${label.replace(/[/]/g, '\\/')} ${pct.replace('.', '\\.')} ${area.replace('.', '\\.')}$`) })).toBeVisible();
  }
  const habitats = page.getByRole('table', { name: 'Principal home habitats of Reltronland' });
  for (const [label, pct, residents] of [['Land surface', '70.00%', '598.50'], ['Underground', '22.00%', '188.10'], ['Underwater', '2.00%', '17.10'], ['Floating', '6.00%', '51.30']] as const) {
    await expect(habitats.getByRole('row', { name: new RegExp(`^${label} ${pct.replace('.', '\\.')} ${residents.replace('.', '\\.')}$`) })).toBeVisible();
  }
  await expect(habitats.locator('tfoot')).toContainText('855.00');
  await expect(page.getByText(/104\.00 million km² of national terrestrial land/)).toBeVisible();
  await expect(page.getByText(/855\.00 billion unique usual residents/)).toBeVisible();
  await expect(visibleFigure(page, 'spatial-surface-reltronland')).toHaveAttribute('src', '/reports/figures/spatial-surface-reltronland.svg');
  await expect(page.getByText('UNASSIGNED · not zero').first()).toBeVisible();
  await expect(page.getByText('PROPOSED in this observatory')).toBeVisible();

  // Beluftner: production and remodeling land areas are both shown and never mixed.
  const differ = page.getByRole('table', { name: 'Land areas that differ between production and remodeling' });
  await expect(differ.getByRole('row', { name: /^Beluftner 88\.00 363\.00/ })).toBeVisible();
  await page.locator('#spatial-country').selectOption('country:beluftner');
  await expect(page.getByRole('table', { name: 'Terrestrial surface footprint of Beluftner' }).locator('tfoot')).toContainText('363.00');

  await page.getByLabel('Quantity (million km² · billion residents)').check();
  await expect(visibleFigure(page, 'spatial-surface-area')).toBeVisible();
  await expect(visibleFigure(page, 'spatial-habitat-residents')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectContainedText(page);
  watch.expectClean();
});

interface FlowIds { inspect: string; compare: string; metric: string; nationHeading: string; compareHeading: string }

/**
 * Explorer control flow: the inspection block holds only the nation picker and sits directly above
 * the inspected-nation heading; the comparison block (compare picker + metric) is a separate,
 * visibly secondary block directly above the comparison heading.
 */
async function expectControlFlow(page: Page, ids: FlowIds) {
  const inspect = page.locator('[data-controls="inspect"]');
  const compare = page.locator('[data-controls="compare"]');
  await expect(inspect).toHaveCount(1);
  await expect(compare).toHaveCount(1);
  await expect(inspect.locator(ids.inspect)).toHaveCount(1);
  await expect(inspect.locator(`${ids.compare}, input[name="${ids.metric}"]`)).toHaveCount(0);
  await expect(compare.locator(ids.compare)).toHaveCount(1);
  await expect(compare.locator(`input[name="${ids.metric}"]`)).toHaveCount(2);
  await expect(compare.locator(ids.inspect)).toHaveCount(0);
  const layout = await page.evaluate(({ nationHeading, compareHeading }) => {
    const ins = document.querySelector('[data-controls="inspect"]')!;
    const cmp = document.querySelector('[data-controls="compare"]')!;
    const hN = document.querySelector(nationHeading)!;
    const hC = document.querySelector(compareHeading)!;
    const r = (el: Element) => el.getBoundingClientRect();
    // "Directly above": the next element after the block is the section that opens with the heading.
    const opens = (block: Element, h: Element) => block.nextElementSibling?.firstElementChild === h;
    const escaping = [ins, cmp].flatMap((block) => [...block.querySelectorAll('select, input, label, legend, p')]
      .filter((el) => r(el).width > 0 && (r(el).left < r(block).left - 1 || r(el).right > r(block).right + 1))
      .map((el) => `${el.tagName.toLowerCase()} in ${block.getAttribute('data-controls')}`));
    return {
      nested: ins.contains(cmp) || cmp.contains(ins),
      inspectOpensNation: opens(ins, hN),
      compareOpensComparison: opens(cmp, hC),
      gaps: [r(hN).top - r(ins).bottom, r(hC).top - r(cmp).bottom],
      order: [r(ins).top, r(hN).top, r(cmp).top, r(hC).top],
      borders: [getComputedStyle(ins).borderTopStyle, getComputedStyle(cmp).borderTopStyle],
      escaping,
    };
  }, ids);
  expect(layout.nested, 'inspection and comparison blocks are not nested').toBe(false);
  expect(layout.inspectOpensNation, 'inspection controls directly above the inspected-nation heading').toBe(true);
  expect(layout.compareOpensComparison, 'comparison controls directly above the comparison heading').toBe(true);
  for (const gap of layout.gaps) {
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(40);
  }
  expect([...layout.order].sort((x, y) => x - y), 'inspect → nation → compare → comparison').toEqual(layout.order);
  expect(layout.borders, 'step 1 solid, step 2 dashed (secondary)').toEqual(['solid', 'dashed']);
  expect(layout.escaping, 'controls stay inside their block').toEqual([]);
}

const SPECIES_FLOW: FlowIds = { inspect: '#ancestry-country', compare: '#ancestry-compare', metric: 'ancestry-metric', nationHeading: '#country-ancestry-h', compareHeading: '#ancestry-compare-h' };
const SPATIAL_FLOW: FlowIds = { inspect: '#spatial-country', compare: '#spatial-compare', metric: 'spatial-metric', nationHeading: '#spatial-national-h', compareHeading: '#spatial-compare-h' };

for (const theme of ['dark', 'light'] as const) {
  test(`Explorer layout (${theme}): inspection and comparison controls are separate blocks above their sections @responsive`, async ({ page }) => {
    const watch = watchConsole(page);
    await setTheme(page, theme);
    for (const [path, ids] of [['/statistics/species', SPECIES_FLOW], ['/statistics/spatial', SPATIAL_FLOW]] as const) {
      await page.goto(path);
      await hydrated(page.locator(ids.inspect));
      await expectControlFlow(page, ids);
      // The comparison picker drives the comparison only; the inspected nation stays put.
      await page.locator(ids.compare).selectOption('country:beluftner');
      await expect(page.locator(ids.compareHeading)).toHaveText('Reltronland compared with Beluftner');
      await expect(page.locator(ids.nationHeading)).toContainText('Reltronland ·');
      await expectControlFlow(page, ids);
    }

    // Spatial: the two side-by-side panels are distinguishable and each names its own denominator.
    const land = page.locator('.rs-panel[data-dimension="land"]');
    const residents = page.locator('.rs-panel[data-dimension="residents"]');
    await expect(land.getByRole('heading', { name: 'Terrestrial surface footprint', exact: true })).toBeVisible();
    await expect(land.getByRole('table', { name: 'Terrestrial surface footprint of Reltronland' })).toBeVisible();
    await expect(land).toContainText('Land area');
    await expect(land).toContainText('104.00 million km² of national terrestrial land');
    await expect(residents.getByRole('heading', { name: 'Principal home habitats', exact: true })).toBeVisible();
    await expect(residents.getByRole('table', { name: 'Principal home habitats of Reltronland' })).toBeVisible();
    await expect(residents).toContainText('Residents');
    await expect(residents).toContainText('855.00 billion unique usual residents');
    const accents = await page.locator('.rs-panel').evaluateAll((els) => els.map((e) => getComputedStyle(e).borderTopColor));
    expect(accents).toHaveLength(2);
    expect(new Set(accents).size, 'distinct accent per panel').toBe(2);

    // Narrow widths: the stacked layout keeps the same order without overflow or clipped text.
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, ids] of [['/statistics/species', SPECIES_FLOW], ['/statistics/spatial', SPATIAL_FLOW]] as const) {
        await page.goto(path);
        await hydrated(page.locator(ids.inspect));
        await expectControlFlow(page, ids);
        await expectNoHorizontalOverflow(page);
        await expectContainedText(page);
      }
    }
    watch.expectClean();
  });
}

test('composition exports carry units, statuses and immutable source identity', async ({ request }) => {
  const species = await (await request.get('/data/species.csv')).text();
  const lines = species.replace(/^﻿/, '').trim().split('\r\n');
  expect(lines[0]).toContain('share_pct,residents_billion,share_status,residents_status');
  const bel = lines.find((l) => l.startsWith('country:beluftner,Beluftner,country,PROFILED_14,91,phantomkind'));
  expect(bel, 'Beluftner phantomkind row').toBeTruthy();
  expect(bel).toContain(',6,5.46,CANON_OBSERVED,CANON_DERIVED,');
  expect(bel).toMatch(/PRODUCTION_MAIN,Reltroner\/reltroner-studio,[0-9a-f]{40},[0-9a-f]{40},data\/asthortera\/nccm-v6-active-cross-domain\.json,countries_14\[\d+\]\.ancestry_primary_pct/);
  expect(lines.some((l) => l.startsWith('country:calespia,Calespia,country,DEVELOPMENT_5,') && l.includes('NOT_ASSIGNED'))).toBe(true);
  const spatial = await (await request.get('/data/spatial.csv')).text();
  const rows = spatial.replace(/^﻿/, '').trim().split('\r\n');
  const under = rows.find((l) => l.startsWith('country:reltronland,Reltronland,PROFILED_14,principal_home_habitat,underground'));
  expect(under).toContain(',22,unique usual residents,855,billion residents,188.1,billion residents,PROPOSED,REMODELING_MAIN_CREATOR_RATIFIED_NOT_PRODUCTION,Reltroner/reltroner-studio-remodeling,');
  const nature = rows.find((l) => l.startsWith('country:reltronland,Reltronland,PROFILED_14,surface_footprint,nature_minimal_intervention'));
  expect(nature).toContain(',58,national terrestrial land area,104,million km²,60.32,million km²,PROPOSED,');
  expect(rows.some((l) => l.includes(',geometry,habitable_volume_km3,') && l.includes(',UNASSIGNED,'))).toBe(true);
  const json = await (await request.get('/data/composition.json')).json();
  expect(json.schema_version).toBe('reltroner-composition.v2');
  expect(json.ancestry.authority).toBe('PRODUCTION_MAIN');
  expect(json.spatial.authority).toBe('REMODELING_MAIN_CREATOR_RATIFIED_NOT_PRODUCTION');
});

test('R2 Statistics Assistant: statuses, citations, insufficient data and a fail-closed optional explanation @responsive', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/assistant');
  await hydrated(page.locator('textarea#assistant-question'));
  const ask = async (q: string) => {
    await page.locator('textarea#assistant-question').fill(q);
    await page.getByRole('button', { name: 'Answer from evidence' }).click();
    await expect(page.locator('[data-answer-intent]')).toBeVisible();
  };
  await ask('Berapa Phantomkind di Beluftner?');
  const answer = page.locator('[data-answer-intent]');
  await expect(answer).toHaveAttribute('data-answer-intent', 'ANCESTRY');
  await expect(answer.locator('[data-statement-status="CANON_OBSERVED"]').first()).toContainText('Phantomkind / Spiritual Hybrid 6%');
  await expect(answer.locator('[data-statement-status="CANON_DERIVED"]').first()).toContainText('5.46 B');
  await expect(answer.getByRole('link', { name: /Beluftner · NCCM V6\.5 production main/ })).toHaveAttribute('href', /^https:\/\/github\.com\/Reltroner\/reltroner-studio\/blob\/[0-9a-f]{40}\//);
  await expect(page.getByRole('status')).toContainText('No external AI service was called');

  await ask('Spatial 3D composition Reltronland.');
  await expect(answer).toHaveAttribute('data-answer-status', 'PROPOSED');
  await expect(answer).toContainText('Underground 22% (188.1 B)');
  await expect(answer.getByRole('link', { name: /Reltronland · NCCM V6\.5 remodeling main/ })).toHaveAttribute('href', /reltroner-studio-remodeling\/blob\/[0-9a-f]{40}\//);

  await ask('What is the SDI of Reltronland?');
  await expect(answer).toContainText('Reltronland · Sentient Development Index: 0.984');
  await ask('Berapa populasi Reltronland?');
  await expect(answer).toContainText('Reltronland · Population: 855 billion.');
  await ask('What does the verified evidence say about Henchoway?');
  await expect(answer).toHaveAttribute('data-answer-intent', 'NARRATIVE');
  await expect(answer.locator('[data-statement-status="CANDIDATE"]')).toContainText('not verified');
  await ask('What is the volcanic activity index of Reltronland?');
  await expect(answer).toHaveAttribute('data-answer-status', 'INSUFFICIENT_DATA');
  await expect(answer.getByRole('heading', { name: 'Pinned sources' })).toHaveCount(0);

  await expect(page.getByRole('checkbox', { name: /Request a generated explanation/ })).toBeDisabled();
  const fn = await page.request.post('/api/assistant', { data: { question: 'What is the SDI of Reltronland?' } });
  expect([404, 405, 503]).toContain(fn.status());
  const index = await (await page.request.get('/data/assistant-index.json')).json();
  expect(index.schema_version).toBe('reltroner-agent-index.v2');
  expect(index.relations.every((r: { verification: string }) => r.verification !== 'CANDIDATE_HYPOTHESIS')).toBe(true);
  expect(JSON.stringify(index)).not.toMatch(/PRIVATE_LOCAL_SESSION|OPENAI_API_KEY/);
  await expectNoHorizontalOverflow(page);
  await expectContainedText(page);
  watch.expectClean();
});
