import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { watchConsole } from './helpers.ts';

/**
 * RS-REPORT-UI-COLLISION-006. The Report Center form and its sticky "Export plan" panel share one
 * grid. A fieldset is as wide as its widest unbreakable content unless told otherwise, so a long
 * finding title once pushed the form under the panel while the page itself did not overflow. These
 * tests therefore measure element rectangles and hit-test the centres of real controls, at several
 * scroll positions and states; a document-overflow check alone cannot see this defect.
 */

/** The finding in the owner's screenshot (/reports/?id=OPP-0296F531F526, 2026-11-18). */
const REPORTED_ID = 'OPP-0296F531F526';
/** Sub-pixel rounding tolerated between rectangles. */
const SLACK = 1;
const WIDE_FONTS = ':root{--font-sans:Verdana,"DejaVu Sans",sans-serif!important;--font-display:Verdana,"DejaVu Sans",sans-serif!important;--font-mono:"Courier New","DejaVu Sans Mono",monospace!important}';
const POSITIONS = ['top', 'legend', 'select', 'middle', 'end'] as const;
type Position = (typeof POSITIONS)[number];

interface Finding { id: string; title: string }
function publishedFindings(): Finding[] {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'dist', 'data', 'findings.json'), 'utf8')) as { findings: Finding[]; creative_findings?: Finding[]; decision_findings?: Finding[] };
  return [...raw.findings, ...(raw.creative_findings ?? []), ...(raw.decision_findings ?? [])];
}
/** Deterministic worst case from the published data: the finding with the longest title. */
function longestTitle(): Finding {
  return [...publishedFindings()].sort((a, b) => b.title.length - a.title.length || a.id.localeCompare(b.id))[0]!;
}

interface Box { left: number; top: number; right: number; bottom: number }
interface Probe {
  mode: 'columns' | 'stacked';
  vw: number; vh: number; scrollY: number; headerBottom: number;
  doc: { scrollWidth: number; clientWidth: number };
  outer: Box; form: Box; aside: Box; list: Box | null;
  sticky: { position: string; top: number };
  left: Array<[string, Box]>;
  right: Array<[string, Box]>;
  rows: Array<[string, Box]>;
  clipped: string[];
  hits: Record<string, string>;
}

async function open(page: Page, url: string, opts: { width: number; height: number; theme: 'dark' | 'light'; textScale?: number; wideFonts?: boolean }) {
  await page.setViewportSize({ width: opts.width, height: opts.height });
  await page.addInitScript((t) => { try { localStorage.setItem('rs-theme', t); } catch { /* ignore */ } }, opts.theme);
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('data-theme', opts.theme);
  // client:only island: the radios exist only once React has rendered with the loaded data.
  await expect(page.getByRole('radio', { name: 'One finding' })).toBeVisible({ timeout: 20_000 });
  if (opts.textScale) await page.evaluate((s) => { document.documentElement.style.fontSize = `${s * 100}%`; }, opts.textScale);
  if (opts.wideFonts) await page.addStyleTag({ content: WIDE_FONTS });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Two animation frames: layout and paint have caught up with the last change. */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function scrollTo(page: Page, pos: Position) {
  await page.evaluate((p) => {
    const headerH = document.querySelector('header[data-site-header]')!.getBoundingClientRect().height;
    const aside = document.querySelector('astro-island aside')!;
    const outer = aside.parentElement!.getBoundingClientRect();
    const docTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
    const legend = [...document.querySelectorAll('astro-island legend')].find((l) => l.textContent?.includes('What to export'))!;
    const select = document.querySelector('astro-island select');
    const y = {
      top: 0,
      // The owner's screenshot: "1 · What to export" just below the sticky header.
      legend: docTop(legend) - headerH - 8,
      // The "Report family" selector in view near the top, next to the stuck panel.
      select: select ? docTop(select) - headerH - 120 : docTop(legend) - headerH + 300,
      middle: outer.top + window.scrollY + outer.height * 0.6 - window.innerHeight / 2,
      // The end of the grid: the panel leaves its stuck position here.
      end: outer.bottom + window.scrollY - window.innerHeight + 40,
    }[p];
    window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
  }, pos);
  await settle(page);
}

async function probe(page: Page): Promise<Probe> {
  await settle(page);
  return page.evaluate(() => {
    const box = (el: Element) => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
    const shown = (el: Element) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const aside = document.querySelector('astro-island aside')!;
    const outer = aside.parentElement!;
    const form = outer.firstElementChild!;
    const header = document.querySelector('header[data-site-header]')!.getBoundingClientRect();
    const headerBottom = Math.max(0, header.bottom);
    const list = form.querySelector('ul[aria-label="Findings to export"]');

    const left: Array<[string, Element]> = [];
    form.querySelectorAll(':scope > fieldset').forEach((el, i) => left.push([`fieldset ${i + 1}`, el]));
    for (const el of form.querySelectorAll('label, button, select, input[type="search"]')) {
      if (list?.contains(el) || !shown(el)) continue;
      const kind = el.tagName === 'LABEL' ? 'option' : el.tagName === 'BUTTON' ? 'button' : el.tagName === 'SELECT' ? 'select' : 'search';
      left.push([`${kind} "${text(el) || (el as HTMLInputElement).placeholder?.slice(0, 30) || ''}"`, el]);
    }
    if (list) left.push(['findings list', list]);
    const right: Array<[string, Element]> = [];
    const card = aside.querySelector(':scope > .rs-card');
    if (card) right.push(['Export plan card', card]);
    aside.querySelectorAll(':scope > p, :scope button, :scope [role="alert"], :scope [aria-live]').forEach((el) => right.push([el.tagName === 'BUTTON' ? `button "${text(el)}"` : `panel text "${text(el)}"`, el]));

    // Text must stay inside the visible box of its own option or button (cf. expectContainedText).
    const clipped: string[] = [];
    const range = document.createRange();
    for (const el of form.querySelectorAll('label.rs-card, button')) {
      if (list?.contains(el) || !shown(el)) continue;
      const own = el.getBoundingClientRect();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!(n.textContent ?? '').trim()) continue;
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        if (r.width && (r.right > own.right + 1 || r.left < own.left - 1)) clipped.push(`"${(n.textContent ?? '').trim().slice(0, 30)}" x ${r.left.toFixed(1)}–${r.right.toFixed(1)} leaves its control x ${own.left.toFixed(1)}–${own.right.toFixed(1)}`);
      }
    }

    const hit = (el: Element | null | undefined) => {
      if (!el) return 'ABSENT';
      const b = el.getBoundingClientRect();
      const x = b.left + b.width / 2;
      const y = b.top + b.height / 2;
      if (x < 0 || x > window.innerWidth || y <= headerBottom + 1 || y >= window.innerHeight - 1) return 'OFFSCREEN';
      const h = document.elementFromPoint(x, y);
      const own = !!h && (h === el || el.contains(h) || (el instanceof HTMLInputElement && !!el.closest('label')?.contains(h)));
      if (own) return 'OWN';
      const where = h?.closest('aside') ? ' in the Export plan panel' : h?.closest('header') ? ' in the site header' : h?.closest('fieldset') ? ' in the form' : '';
      return `BLOCKED at (${x.toFixed(1)}, ${y.toFixed(1)}) by <${h?.tagName.toLowerCase() ?? 'nothing'}>${where} "${h ? text(h) : ''}"`;
    };
    const scope = [...document.querySelectorAll<HTMLInputElement>('astro-island input[name="scope"]')];
    const sticky = getComputedStyle(aside);
    const rows = list ? [...list.querySelectorAll(':scope > li > label')].slice(0, 12).map((el) => [text(el), box(el)] as [string, ReturnType<typeof box>]) : [];
    return {
      mode: getComputedStyle(outer).gridTemplateColumns.split(' ').length > 1 ? 'columns' as const : 'stacked' as const,
      vw: window.innerWidth, vh: window.innerHeight, scrollY: Math.round(window.scrollY), headerBottom,
      doc: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      outer: box(outer), form: box(form), aside: box(aside), list: list ? box(list) : null,
      sticky: { position: sticky.position, top: parseFloat(sticky.top) || 0 },
      left: left.map(([n, el]) => [n, box(el)] as [string, ReturnType<typeof box>]),
      right: right.map(([n, el]) => [n, box(el)] as [string, ReturnType<typeof box>]),
      rows,
      clipped,
      hits: {
        'All findings option': hit(scope[2]?.closest('label')),
        'All findings radio': hit(scope[2]),
        'Report family select': hit(document.querySelector('astro-island select')),
        'Find findings search': hit(document.querySelector('astro-island input[type="search"]')),
        'Download button': hit(aside.querySelector('button')),
      },
    };
  });
}

const fmt = (b: Box) => `[x ${b.left.toFixed(1)}–${b.right.toFixed(1)}, y ${b.top.toFixed(1)}–${b.bottom.toFixed(1)}]`;

/**
 * No form element leaves its track, nothing in the two tracks overlaps, and every visible control
 * centre is its own. `scope: 'report-center'` replaces the page-wide overflow check with "the Report
 * Center lies inside the viewport"; it is used only with enlarged text, where the shared site header
 * is known to overflow on every page, which is outside this component.
 */
function expectNoCollision(p: Probe, where: string, scope: 'page' | 'report-center' = 'page') {
  const problems: string[] = [];
  if (p.outer.left < -SLACK || p.outer.right > p.doc.clientWidth + SLACK) problems.push(`Report Center ${fmt(p.outer)} leaves the ${p.doc.clientWidth}px viewport`);
  const formTrack = p.mode === 'columns' ? p.form : p.outer;
  const panelTrack = p.mode === 'columns' ? p.aside : p.outer;
  for (const [n, b] of p.left) if (b.left < formTrack.left - SLACK || b.right > formTrack.right + SLACK) problems.push(`${n} ${fmt(b)} leaves the form track ${fmt(formTrack)}`);
  for (const [n, b] of p.right) if (b.left < panelTrack.left - SLACK || b.right > panelTrack.right + SLACK) problems.push(`${n} ${fmt(b)} leaves the panel track ${fmt(panelTrack)}`);
  for (const [ln, lb] of p.left) for (const [rn, rb] of p.right) {
    const x = Math.min(lb.right, rb.right) - Math.max(lb.left, rb.left);
    const y = Math.min(lb.bottom, rb.bottom) - Math.max(lb.top, rb.top);
    if (x > SLACK && y > SLACK) problems.push(`${ln} ${fmt(lb)} overlaps ${rn} ${fmt(rb)} by ${x.toFixed(1)} × ${y.toFixed(1)} px`);
  }
  if (p.mode === 'stacked' && p.aside.top < p.form.bottom - SLACK) problems.push(`stacked panel ${fmt(p.aside)} starts above the end of the form ${fmt(p.form)}`);
  if (p.list) for (const [n, b] of p.rows) if (b.left < p.list.left - SLACK || b.right > p.list.right + SLACK) problems.push(`finding row "${n}" ${fmt(b)} leaves the list ${fmt(p.list)}`);
  if (scope === 'page' && p.doc.scrollWidth > p.doc.clientWidth + SLACK) problems.push(`document overflows horizontally: ${p.doc.scrollWidth}px > ${p.doc.clientWidth}px`);
  for (const c of p.clipped) problems.push(`clipped text: ${c}`);
  for (const [n, h] of Object.entries(p.hits)) if (h.startsWith('BLOCKED')) problems.push(`${n}: ${h}`);
  expect(problems, `${where} — ${p.vw}×${p.vh}, scrollY ${p.scrollY}, ${p.mode} layout\n${problems.join('\n')}`).toEqual([]);
}

/** In two columns the panel is sticky below the header; when stuck and short enough it is fully visible, and it is always reachable. */
function expectUsablePanel(p: Probe, pos: Position, where: string) {
  if (p.mode === 'stacked') {
    expect(p.sticky.position, `${where}: stacked panel is in normal flow`).toBe('static');
    return;
  }
  expect(p.sticky.position, where).toBe('sticky');
  const stuck = Math.abs(p.aside.top - p.sticky.top) <= SLACK;
  if (stuck) {
    expect(p.aside.top, `${where}: stuck panel ${fmt(p.aside)} clears the header (bottom ${p.headerBottom.toFixed(1)})`).toBeGreaterThanOrEqual(p.headerBottom - SLACK);
    const height = p.aside.bottom - p.aside.top;
    if (height <= p.vh - p.sticky.top) expect(p.aside.bottom, `${where}: stuck panel ${fmt(p.aside)} fits the ${p.vh}px viewport`).toBeLessThanOrEqual(p.vh + SLACK);
  }
  if (pos === 'end') expect(p.aside.bottom, `${where}: the end of the panel ${fmt(p.aside)} is reachable by scrolling`).toBeLessThanOrEqual(p.vh + SLACK);
}

/** Walk the scroll positions of one loaded state and check every invariant at each. */
async function sweep(page: Page, where: string, required: Partial<Record<Position, readonly string[]>> = {}, scope: 'page' | 'report-center' = 'page') {
  for (const pos of POSITIONS) {
    await scrollTo(page, pos);
    const p = await probe(page);
    const label = `${where} @ ${pos}`;
    expectNoCollision(p, label, scope);
    expectUsablePanel(p, pos, label);
    for (const control of required[pos] ?? []) expect(p.hits[control], `${label}: ${control} must be on screen and hit itself`).toBe('OWN');
  }
}

/** At the owner's scroll positions the named controls must actually be tested, not skipped as off-screen. */
const REQUIRED_TWO_COLUMN = { legend: ['All findings option', 'All findings radio', 'Download button'], select: ['Report family select', 'Download button'] } as const;
const required = (p: Page) => ((p.viewportSize()?.width ?? 0) >= 1024 ? { ...REQUIRED_TWO_COLUMN } : { legend: ['All findings option', 'All findings radio'], select: ['Report family select'] });

test('owner reproduction: /reports/?id=OPP-0296F531F526 at 1688×864, form and Export plan never overlap (both themes)', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const watch = watchConsole(page);
  for (const theme of ['dark', 'light'] as const) {
    await open(page, `/reports/?id=${REPORTED_ID}`, { width: 1688, height: 864, theme });
    await sweep(page, `${theme} 1688×864`, required(page));
    await scrollTo(page, 'legend');
    await testInfo.attach(`reports-${REPORTED_ID}-1688x864-${theme}-legend.png`, { body: await page.screenshot(), contentType: 'image/png' });
  }
  watch.expectClean();
});

test('@responsive report center at the project viewport: no form/panel collision at any scroll position', async ({ page }) => {
  test.setTimeout(120_000);
  const vp = page.viewportSize()!;
  for (const theme of ['dark', 'light'] as const) {
    await open(page, `/reports/?id=${REPORTED_ID}`, { ...vp, theme });
    await sweep(page, `${theme} project viewport`, required(page));
  }
});

for (const [group, sizes] of [
  ['two-column', [[1920, 1080], [1440, 900], [1280, 800], [1350, 691], [1125, 576], [1024, 768]]],
  ['stacked', [[1023, 768], [768, 1024], [390, 844], [375, 812], [320, 700]]],
] as const) {
  test(`${group} sweep: ${sizes.map(([w, h]) => `${w}×${h}`).join(', ')} in both themes`, async ({ page }) => {
    test.setTimeout(180_000);
    const watch = watchConsole(page);
    for (const [width, height] of sizes) for (const theme of ['dark', 'light'] as const) {
      await open(page, `/reports/?id=${REPORTED_ID}`, { width, height, theme });
      expect((await probe(page)).mode, `${width}px uses the ${group} layout`).toBe(group === 'two-column' ? 'columns' : 'stacked');
      // At normal text size the scope options keep their design: one row of three from 640px, stacked below.
      const rows = await page.locator('astro-island input[name="scope"]').evaluateAll((inputs) => new Set(inputs.map((i) => Math.round(i.closest('label')!.getBoundingClientRect().top))).size);
      expect(rows, `${width}px scope option rows`).toBe(width >= 640 ? 1 : 3);
      await sweep(page, `${theme} ${width}×${height}`, required(page));
    }
    watch.expectClean();
  });
}

test('text scale 125 % and 150 %, wide fallback fonts and reduced motion keep the form and panel apart', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[1688, 864], [1024, 768], [375, 812], [320, 700]] as const) {
    for (const textScale of [1.25, 1.5]) {
      await open(page, `/reports/?id=${REPORTED_ID}`, { width, height, theme: textScale === 1.25 ? 'dark' : 'light', textScale });
      // Enlarged text makes shared page chrome wider than the screen on every page (pre-existing,
      // outside the Report Center): the header's desktop navigation at 1688 px with Linux fonts, the
      // header and page intro on phones. Here the Report Center itself must still fit; at normal text
      // size, including the wide-font runs below, the whole page is checked.
      await sweep(page, `${width}×${height} text ${textScale * 100}%`, {}, 'report-center');
    }
    await open(page, `/reports/?id=${REPORTED_ID}`, { width, height, theme: 'dark', wideFonts: true });
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily), 'wide font override applied').toMatch(/^Verdana/);
    await sweep(page, `${width}×${height} wide fonts`, required(page));
  }
});

test('query hydration: the reported id selects that published finding, an unknown id falls back to the default view', async ({ page }) => {
  const published = publishedFindings();
  await open(page, `/reports/?id=${REPORTED_ID}`, { width: 1440, height: 900, theme: 'dark' });
  const center = page.locator('astro-island').filter({ hasText: 'What to export' });
  if (published.some((f) => f.id === REPORTED_ID)) {
    await expect(center.getByRole('radio', { name: 'One finding' })).toBeChecked();
    await center.getByText('JSON', { exact: true }).click();
    await expect(center.locator('aside dd').filter({ hasText: `${REPORTED_ID}.json` })).toBeVisible();
    await expect(center.getByRole('button', { name: 'Download' })).toBeEnabled();
  } else {
    // Truthful NOT_FOUND behaviour: the component ignores an id it does not publish.
    await expect(center.getByRole('radio', { name: /^All \d+ findings$/ })).toBeChecked();
  }
  let unknown = 'CRD-000000000000';
  while (published.some((f) => f.id === unknown)) unknown = `${unknown}0`;
  await open(page, `/reports/?id=${unknown}`, { width: 1440, height: 900, theme: 'dark' });
  await expect(center.getByRole('radio', { name: /^All \d+ findings$/ })).toBeChecked();
  await expect(center.getByRole('combobox', { name: 'Report family' })).toHaveCount(0);
});

for (const [width, height] of [[1024, 768], [1688, 864], [390, 844]] as const) {
  test(`state changes keep the form and panel apart at ${width}×${height}: scopes, presets, search, selection, formats, layout, download outcome`, async ({ page }) => {
    test.setTimeout(150_000);
    const watch = watchConsole(page);
    const worst = longestTitle();
    await open(page, `/reports/?id=${REPORTED_ID}`, { width, height, theme: 'dark' });
    const center = page.locator('astro-island').filter({ hasText: 'What to export' });
    const check = (state: string) => sweep(page, `${width}×${height} ${state}`);
    const download = center.getByRole('button', { name: 'Download' });

    await expect(download).toBeDisabled(); // no format chosen: disabled by design, not part of the defect
    await check('single, no format');
    await center.getByRole('searchbox', { name: 'Find findings' }).fill(worst.id);
    await center.locator('ul[aria-label="Findings to export"] label').filter({ hasText: worst.id }).click();
    await check(`single, longest title ${worst.id} shown and picked`);
    await center.getByText('JSON', { exact: true }).click();
    await expect(center.locator('aside dd').filter({ hasText: `${worst.id}.json` })).toBeVisible();
    await check('single, one format (direct file)');
    const [direct] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(direct.suggestedFilename()).toBe(`${worst.id}.json`);
    await expect(center.getByText(`Saved ${worst.id}.json`)).toBeVisible();
    await check('single, direct download outcome shown');

    await center.getByText('CSV', { exact: true }).click();
    await center.getByText('PDF', { exact: true }).click();
    await check('single, three formats (ZIP) with PDF');
    await center.getByRole('radio', { name: 'Selected findings' }).check();
    await center.getByRole('button', { name: /^Opportunities \(OPP\)$/ }).click();
    await check('OPP preset');
    // A family with exactly one finding switches the preset to single scope; continue as a selection.
    await center.getByRole('radio', { name: 'Selected findings' }).check();
    await center.getByRole('searchbox', { name: 'Find findings' }).fill('');
    await center.getByRole('combobox', { name: 'Report family' }).selectOption('ALL_UNIFIED');
    await center.getByRole('button', { name: /^Select \d+ shown$/ }).click();
    await check('selected, every finding shown selected');
    await center.getByText('Consolidated', { exact: true }).click();
    await check('selected, consolidated layout');
    await center.getByRole('button', { name: /^Clear \(\d+\)$/ }).click();
    await expect(download).toBeDisabled();
    await check('selected, cleared (plan error shown)');
    await center.getByRole('combobox', { name: 'Report family' }).selectOption('DECISION_ALL');
    await center.getByRole('button', { name: /^Select \d+ shown$/ }).click();
    await center.getByText('PDF', { exact: true }).click();
    await center.getByText('Per finding', { exact: true }).click();
    await check('selected, decision family, per finding, JSON + CSV');
    const [zip] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), download.click()]);
    expect(zip.suggestedFilename()).toMatch(/^reltroner-statistics_REPORT-CENTER_[0-9a-f]{12}_[0-9a-f]{12}\.zip$/);
    await expect(center.getByText(/entries checksummed/)).toBeVisible();
    await check('selected, ZIP outcome shown');
    await center.getByRole('radio', { name: /^All \d+ findings$/ }).check();
    await check('all findings');
    watch.expectClean();
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`accessibility and keyboard on /reports/?id=${REPORTED_ID} (${theme}): no serious axe violations, labelled controls, visible and unobstructed focus`, async ({ page }) => {
    // 1024 px is the narrowest two-column width; it is where the old overlap hid focused presets.
    await open(page, `/reports/?id=${REPORTED_ID}`, { width: 1024, height: 768, theme });
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);

    const center = page.locator('astro-island').filter({ hasText: 'What to export' });
    await expect(center.getByRole('group', { name: '1 · What to export' })).toBeVisible();
    await expect(center.getByRole('combobox', { name: 'Report family' })).toBeVisible();
    await expect(center.getByRole('searchbox', { name: 'Find findings' })).toBeVisible();
    await scrollTo(page, 'legend');
    // Keyboard: the scope radios, the presets, the search box and the family selector take focus in
    // order, show a focus indicator, and nothing paints over the focused control.
    await center.getByRole('radio', { name: 'One finding' }).focus();
    const stops: string[] = [];
    for (let i = 0; i < 16; i++) {
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        const header = document.querySelector('header[data-site-header]')!.getBoundingClientRect().bottom;
        const onScreen = b.top + b.height / 2 > header && b.top + b.height / 2 < innerHeight;
        return { name: `${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') ?? el.textContent ?? (el as HTMLInputElement).placeholder ?? '').trim().slice(0, 30)}`, onScreen, ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, own: onScreen === false || (!!top && (top === el || el.contains(top) || !!el.closest('label')?.contains(top))) };
      });
      if (!state) break;
      if (state.onScreen) stops.push(state.name);
      expect(state.ring, `focus ring on ${state.name}`).toBe(true);
      expect(state.own, `focused ${state.name} is not covered`).toBe(true);
      await page.keyboard.press('Tab');
    }
    // The radio group, all twelve presets, the search box and the family selector were checked on screen.
    expect(stops.length, stops.join(' | ')).toBeGreaterThanOrEqual(15);
    expect(stops.some((s) => s.startsWith('select'))).toBe(true);
  });
}
