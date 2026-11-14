import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, hydrated, watchConsole } from './helpers.ts';

test('Species & ancestry: planet chart, national coverage and per-country percentage/absolute comparison @responsive', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/statistics/species');
  await hydrated(page.locator('select[id="composition-ancestry-country"]'));
  await expect(page.getByRole('heading', { name: 'Species & ancestry demographics' })).toBeVisible();
  await expect(page.locator('img[src="/reports/figures/species-planet.svg"]')).toBeVisible();
  await expect(page.locator('img[src="/reports/figures/species-stacked-percent.svg"]')).toBeVisible();
  const response = await page.request.get('/reports/figures/species-planet.svg');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/svg/);
  await page.getByLabel(/Inspect a nation/).selectOption('country:beluftner');
  await expect(page.getByRole('heading', { name: 'Beluftner · primary ancestry' })).toBeVisible();
  await expect(page.getByText('90.30%').first()).toBeVisible();
  await expect(page.getByText('82.17').first()).toBeVisible();
  await expect(page.locator('option[value="country:scenrepolia"]')).toContainText('ancestry unassigned');
  await expectNoHorizontalOverflow(page);
  watch.expectClean();
});

test('Spatial composition: 58/15/14/13 land and 70/22/2/6 resident denominators @responsive', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/statistics/spatial');
  await hydrated(page.locator('select[id="composition-spatial-country"]'));
  await expect(page.getByRole('heading', { name: /Spatial 3D composition · Year 0/ }).first()).toBeVisible();
  await expect(page.getByText('598.50').first()).toBeVisible();
  await expect(page.getByText('60.32').first()).toBeVisible();
  await expect(page.getByText('58.00%').first()).toBeVisible();
  await expect(page.locator('img[src="/reports/figures/spatial-surface-reltronland.svg"]')).toBeVisible();
  await expect(page.locator('img[src="/reports/figures/spatial-habitat-reltronland.svg"]')).toBeVisible();
  await expect(page.getByText(/constructed \/ habitable km³/).first()).toBeVisible();
  await page.getByLabel(/Inspect a nation/).selectOption('country:beluftner');
  await expect(page.locator('img[src="/reports/figures/spatial-surface-beluftner.svg"]')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  watch.expectClean();
});

test('Statistics Assistant: deterministic result with source citation and absent optional model by default @responsive', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/assistant');
  await hydrated(page.locator('textarea#assistant-question'));
  const question = page.locator('textarea#assistant-question');
  await question.fill('Berapa Phantomkind di Beluftner?');
  await page.getByRole('button', { name: /Answer from evidence/ }).click();
  await expect(page.getByText(/Phantomkind \/ Spiritual Hybrid 6% = 5.46 billion/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pinned source evidence' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('No external AI call was made');
  const index = await page.request.get('/data/assistant-index.json');
  expect(index.status()).toBe(200);
  const data = await index.json();
  expect(data.schema_version).toBe('reltroner-agent-index.v1');
  expect(JSON.stringify(data)).not.toContain('Private Unreleased Season 32 Arc');
  await expectNoHorizontalOverflow(page);
  watch.expectClean();
});
