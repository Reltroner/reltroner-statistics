import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { expectNoHorizontalOverflow, hydrated, watchConsole } from './helpers.ts';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

test('decision intelligence UI: interactive branching, backtracking, expand/collapse, unknowns, review guardrail, private isolation and outline', async ({ page }) => {
  const watch = watchConsole(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/creative/decisions');

  await expect(page.locator('h1')).toHaveText(/Creative & editorial decision trees/);
  await expect(page.locator('[data-image-slot="CREATIVE_DECISION_TREE"]')).toBeVisible();
  await expect(page.getByText(/Evaluation:/)).toBeVisible();

  // Select Beluftner remodeling tree (has condition nodes + pending decision)
  const beluftnerBtn = page.getByRole('button', { name: /Beluftner land area/i });
  await hydrated(beluftnerBtn);
  await beluftnerBtn.click();
  await expect(page.getByText('Evaluation: AWAITING_CHOICE')).toBeVisible();

  // Branch selection & backtracking
  const optKeep = page.getByRole('button', { name: /Keep .* million km²/i }).first();
  await optKeep.click();
  await expect(page.getByText('Evaluation: RESOLVED')).toBeVisible();
  await page.getByRole('button', { name: /Backtrack one step/ }).click();
  await expect(page.getByText('Evaluation: AWAITING_CHOICE')).toBeVisible();

  // Unknown simulation must route explicitly to INSUFFICIENT_DATA, never FALSE
  const simUnknownBtn = page.getByRole('button', { name: /qa_land_bound_remodeling:/ });
  await simUnknownBtn.click();
  await expect(page.getByText('Evaluation: INSUFFICIENT_DATA')).toBeVisible();
  await expect(page.getByText(/Insufficient \/ Unknown Condition Handling:/)).toBeVisible();
  await page.getByRole('button', { name: 'Reset path' }).click();
  await expect(page.getByText('Evaluation: AWAITING_CHOICE')).toBeVisible();

  // Expand / collapse subtree
  const collapseBtn = page.getByRole('button', { name: 'Collapse subtree' }).first();
  await expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');
  await collapseBtn.click();
  await expect(page.getByRole('button', { name: 'Expand subtree' }).first()).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Expand subtree' }).first().click();

  // Switch to Accessible Outline View
  await page.getByRole('button', { name: 'Outline (accessible)' }).click();
  await expect(page.getByRole('list', { name: 'Decision tree outline' })).toBeVisible();
  await page.getByRole('button', { name: 'Diagram view' }).click();

  // Select Reltronland / Depcutland cooperation tree to test constraint blocking
  await page.getByRole('button', { name: /Reltronland and Depcutland: responding to a shared threat/i }).click();
  await page.getByRole('button', { name: /Cooperate publicly/i }).first().click();
  const formalAllianceOpt = page.getByRole('button', { name: /Permanent alliance or merged command/i }).first();
  await expect(formalAllianceOpt).toContainText('BLOCKED');
  await formalAllianceOpt.click();
  await expect(page.getByText(/Blocked by Canon Constraint:/)).toBeVisible();

  // Creator review guardrail & private local note isolation
  await page.getByRole('button', { name: 'RATIFIED_EXTERNALLY' }).click();
  await expect(page.getByRole('status')).toContainText(/cannot move from PROPOSED to RATIFIED_EXTERNALLY/);
  await page.getByRole('button', { name: 'APPROVED_FOR_AUTHORING' }).click();
  await expect(page.getByRole('status')).toContainText(/Canon status remains .* \(UNRATIFIED\)/);
  await page.getByRole('button', { name: 'RATIFIED_EXTERNALLY' }).click();
  await expect(page.getByRole('status')).toContainText(/requires verified publication evidence in Reltroner\/reltroner-studio/);
  await page.getByPlaceholder(/Record private author notes/).fill('SECRET PRIVATE DECISION NOTE 99');
  await page.getByRole('button', { name: /Save Private Note/ }).click();
  await expect(page.getByRole('status')).toContainText(/PRIVATE_LOCAL_SESSION only/);

  const publicDecisions = await (await page.request.get('/data/decisions.json')).text();
  expect(publicDecisions).not.toContain('SECRET PRIVATE DECISION NOTE 99');
  const searchIndex = await (await page.request.get('/data/search-index.json')).text();
  expect(searchIndex).not.toContain('SECRET PRIVATE DECISION NOTE 99');

  await page.getByRole('button', { name: 'Discard private notes' }).click();
  await expect(page.getByRole('status')).toContainText(/Cleared local session review state/);

  // Direct Tree export download (.json)
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Tree .json' }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^DT-[0-9A-F]{12}\.json$/);
  const downloaded = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(downloaded.findings[0].id).toMatch(/^DT-[0-9A-F]{12}$/);

  await expectNoHorizontalOverflow(page);
  watch.expectClean();
});

test('statistical decision trees page: truthful insufficiency, rejected targets and synthetic parity inspector', async ({ page }) => {
  const watch = watchConsole(page);
  await page.goto('/statistics/decision-trees');
  await expect(page.locator('h1')).toHaveText(/Supervised decision trees/);
  await expect(page.locator('[data-image-slot="STATISTICAL_DECISION_TREE"]')).toBeVisible();
  await expect(page.getByText(/Canonical Supervised Gate Status: INSUFFICIENT_LABELED_DATA/)).toBeVisible();
  await expect(page.getByText('REJECTED_TARGET').first()).toBeVisible();
  await expect(page.getByText(/DATA ORIGIN: SYNTHETIC_FIXTURE \(Method Verification Only\)/)).toBeVisible();

  // Interactive missing split feature guard test
  const missingBtn = page.getByRole('button', { name: /Simulate missing split feature/ });
  await hydrated(missingBtn);
  await missingBtn.click();
  await expect(page.getByText(/INSUFFICIENT_DATA — no default branch/)).toBeVisible();

  await expectNoHorizontalOverflow(page);
  watch.expectClean();
});

test('unified report center exports Decision Intelligence bundle (CSV + XML + XSD)', async ({ page }) => {
  test.setTimeout(90_000);
  const watch = watchConsole(page);
  await page.goto('/reports?family=DECISION_ALL');
  const center = page.locator('astro-island').filter({ hasText: 'What to export' });
  await expect(center.getByRole('button', { name: /Decision Intelligence \(\d+\)/ })).toBeVisible({ timeout: 15_000 });
  for (const f of ['CSV', 'XML']) await center.getByText(f, { exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    center.getByRole('button', { name: 'Download' }).click(),
  ]);
  const files = unzipSync(new Uint8Array(fs.readFileSync(await download.path())));
  const names = Object.keys(files);
  const sums = names.find((n) => n.endsWith('/SHA256SUMS.txt'))!;
  for (const line of strFromU8(files[sums]!).trim().split('\n')) {
    const [hash, p] = line.split('  ');
    expect(sha(files[p!]!), p).toBe(hash);
  }
  const manifest = JSON.parse(strFromU8(files[names.find((n) => n.endsWith('/MANIFEST.json'))!]!));
  const dtId = manifest.selection.finding_ids.find((id: string) => id.startsWith('DT-')) as string | undefined;
  expect(dtId).toBeTruthy();
  expect(manifest.selection.finding_ids.some((id: string) => id.startsWith('DTS-'))).toBe(true);
  expect(names.some((n) => n.endsWith('/schemas/report.xsd'))).toBe(true);

  const pdfIndex = await page.request.get('/reports/pdf/index.json');
  expect(pdfIndex.ok()).toBe(true);
  const indexJson = (await pdfIndex.json()) as { files: Record<string, unknown> };
  expect(indexJson.files[dtId!]).toBeTruthy();
  const pdfResp = await page.request.get(`/reports/pdf/${dtId}.pdf`);
  expect(pdfResp.headers()['content-type']).toBe('application/pdf');
  expect((await pdfResp.body()).subarray(0, 5).toString()).toBe('%PDF-');
  watch.expectClean();
});
