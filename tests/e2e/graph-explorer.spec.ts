/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R4: the Graph Explorer draws real, source-backed relationships legibly.
 * Every expectation is derived from /data/graph.json with the explorer's own view rules (default filters,
 * deterministic focus, induced subgraph), so nothing here hardcodes a node, an edge or a count.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { GraphEdge, GraphNode, KnowledgeGraph } from '../../src/domain/graph.ts';
import { focusSubgraph, initialFocus } from '../../src/features/graph/graph-view.ts';
import { setTheme, watchConsole } from './helpers.ts';

const DEFAULT_TYPES = new Set(['entity', 'indicator', 'dataset', 'observation', 'revision', 'document']);
async function model(page: Page) {
  const g = (await (await page.request.get('/data/graph.json')).json()) as KnowledgeGraph;
  const nodes = g.nodes.filter((n) => DEFAULT_TYPES.has(n.type) && (n.type !== 'document' || (n.group ?? 'other') === 'statistics'));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = g.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const focus = initialFocus(nodes, edges)!;
  return { g, nodes, edges, focus, sub: focusSubgraph(nodes, edges, focus, 1) };
}

async function openGraph(page: Page) {
  await page.goto('/graph');
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 20_000 });
}

/** Rendered DOM: node ids, edge ids, zoom, and per-edge geometry/style measured on screen. */
async function rendered(page: Page) {
  // Measure with the whole canvas on screen: hit tests and pixel crops are meaningless below the fold.
  await page.evaluate(() => document.querySelector('.rs-graph')!.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const canvas = document.querySelector('.rs-graph')!.getBoundingClientRect();
    const vp = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')!).transform);
    const nodeRect = new Map([...document.querySelectorAll('.react-flow__node')].map((n) => [n.getAttribute('data-id')!, n.getBoundingClientRect()]));
    const edges = [...document.querySelectorAll<SVGGElement>('.react-flow__edge')].map((g) => {
      const path = g.querySelector<SVGPathElement>('.react-flow__edge-path')!;
      const len = path.getTotalLength();
      const ctm = path.getScreenCTM()!;
      const at = (l: number) => { const p = path.getPointAtLength(l).matrixTransform(ctm); return { x: p.x, y: p.y }; };
      const cs = getComputedStyle(path);
      const mid = at(len / 2);
      const hit = document.elementFromPoint(mid.x, mid.y);
      return {
        id: g.getAttribute('data-id')!, d: path.getAttribute('d') ?? '', len, start: at(0), end: at(len), mid,
        midInCanvas: mid.x > canvas.left && mid.x < canvas.right && mid.y > canvas.top && mid.y < canvas.bottom,
        occludedByNode: !!hit?.closest('.react-flow__node'), stroke: cs.stroke, width: parseFloat(cs.strokeWidth), opacity: parseFloat(cs.opacity),
        dash: cs.strokeDasharray, marker: path.getAttribute('marker-end'), aria: g.getAttribute('aria-label'),
      };
    });
    const bg = getComputedStyle(document.querySelector('.react-flow')!).backgroundColor;
    const label = document.querySelector('.rs-gnode-label');
    return { zoom: vp.a, nodes: [...nodeRect.keys()], rects: Object.fromEntries([...nodeRect].map(([k, r]) => [k, { left: r.left, right: r.right, top: r.top, bottom: r.bottom }])), edges, bg, labelPx: label ? parseFloat(getComputedStyle(label).fontSize) * vp.a : 0, canvas: { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom } };
  });
}

const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
const lum = ([r, g, b]: number[]) => { const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!); };
/** Contrast of a stroke (with opacity) composited over the canvas background. */
const contrast = (stroke: string, opacity: number, bg: string) => {
  const s = rgb(stroke), b = rgb(bg);
  const mixed = s.slice(0, 3).map((v, i) => v * opacity + b[i]! * (1 - opacity));
  const [l1, l2] = [lum(mixed), lum(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
};
/** Each edge must start at its source's right port and end at its target's left port (direction kept). */
function expectEndpoints(dom: Awaited<ReturnType<typeof rendered>>, edges: GraphEdge[]) {
  for (const e of edges) {
    const el = dom.edges.find((x) => x.id === e.id)!;
    const s = dom.rects[e.source]!, t = dom.rects[e.target]!;
    const tol = 6 + 20 * dom.zoom;
    expect(Math.abs(el.start.x - s.right), `${e.id} starts at ${e.source}`).toBeLessThanOrEqual(tol);
    expect(el.start.y >= s.top - tol && el.start.y <= s.bottom + tol, `${e.id} start y`).toBe(true);
    expect(Math.abs(el.end.x - t.left), `${e.id} ends at ${e.target}`).toBeLessThanOrEqual(tol);
    expect(el.end.y >= t.top - tol && el.end.y <= t.bottom + tol, `${e.id} end y`).toBe(true);
  }
}

for (const theme of ['dark', 'light'] as const) {
  test(`initial view (${theme}): a readable, source-backed neighbourhood with visible DEPENDS_ON arrows`, async ({ page }) => {
    const watch = watchConsole(page);
    await setTheme(page, theme);
    const m = await model(page);
    let fetches = 0;
    page.on('request', (r) => { if (r.url().endsWith('/data/graph.json')) fetches++; });
    await openGraph(page);
    await expect(page.locator('[data-graph-summary]')).toHaveText(`Focused neighborhood of “${m.g.nodes.find((n) => n.id === m.focus)!.label}”: ${m.sub.nodes.length} nodes · ${m.sub.edges.length} relationships. Filtered graph: ${m.nodes.length} nodes · ${m.edges.length} relationships.`);
    await expect(page.locator('.react-flow__edge')).toHaveCount(m.sub.edges.length);
    await page.waitForTimeout(400);
    const dom = await rendered(page);
    expect(new Set(dom.nodes)).toEqual(new Set(m.sub.nodes.map((n) => n.id)));
    expect(new Set(dom.edges.map((e) => e.id))).toEqual(new Set(m.sub.edges.map((e) => e.id)));
    for (const e of dom.edges) { expect(e.d, e.id).toMatch(/^M[\d.\-]/); expect(e.d, e.id).not.toMatch(/NaN|Infinity/); expect(e.len, e.id).toBeGreaterThan(20); }
    expect(dom.zoom, 'opens at a readable zoom').toBeGreaterThanOrEqual(0.7);
    expect(dom.labelPx, 'labels stay legible').toBeGreaterThanOrEqual(8.4);
    expectEndpoints(dom, m.sub.edges);
    const deps = m.sub.edges.filter((e) => e.type === 'DEPENDS_ON' && (e.status === 'VERIFIED' || e.status === 'DECLARED'));
    expect(deps.length, 'the deterministic focus carries real dependency claims').toBeGreaterThan(0);
    for (const dep of deps) {
      const el = dom.edges.find((x) => x.id === dep.id)!;
      expect(el.midInCanvas, `${dep.id} visible in the frame`).toBe(true);
      expect(el.occludedByNode, `${dep.id} not hidden under a node`).toBe(false);
      expect(el.width).toBeGreaterThanOrEqual(2);
      expect(el.marker, `${dep.id} has an arrowhead`).toMatch(/arrowclosed/);
      expect(contrast(el.stroke, el.opacity, dom.bg), `${dep.id} contrast against the ${theme} canvas`).toBeGreaterThanOrEqual(3);
      expect(el.aria).toContain(`DEPENDS_ON (${dep.status}`);
    }
    // Pixels, not just DOM: the line must change what is painted. (A zero-width edge <svg> once kept every
    // path in the DOM with valid geometry while drawing nothing.)
    expect(await page.evaluate(() => Math.min(...[...document.querySelectorAll('.react-flow__edges svg')].map((s) => s.getBoundingClientRect().width))), 'edge layer has a painted width').toBeGreaterThan(0);
    for (const dep of deps) {
      const el = dom.edges.find((x) => x.id === dep.id)!;
      const clip = { x: Math.round(el.mid.x) - 6, y: Math.round(el.mid.y) - 6, width: 12, height: 12 };
      const withLine = await page.screenshot({ clip });
      const hide = await page.addStyleTag({ content: '.react-flow__edges{visibility:hidden!important}' });
      const without = await page.screenshot({ clip });
      await hide.evaluate((n) => n.remove());
      expect(withLine.equals(without), `${dep.id} paints visible pixels at its midpoint`).toBe(false);
    }
    expect(fetches).toBe(1);
    watch.expectClean();
  });
}

test('filtered graph: every visible relationship drawn exactly once, styled by its own type and status, never invented', async ({ page }) => {
  const m = await model(page);
  await openGraph(page);
  await page.getByRole('button', { name: 'Show filtered graph' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(m.edges.length, { timeout: 15_000 });
  await expect(page.locator('[data-graph-summary]')).toContainText(`Filtered graph: ${m.nodes.length} nodes · ${m.edges.length} relationships`);
  await page.waitForTimeout(500);
  const dom = await rendered(page);
  expect(new Set(dom.nodes)).toEqual(new Set(m.nodes.map((n) => n.id)));
  expect(new Set(dom.edges.map((e) => e.id))).toEqual(new Set(m.edges.map((e) => e.id)));
  const byId = new Map(m.edges.map((e) => [e.id, e]));
  for (const el of dom.edges) {
    const e = byId.get(el.id)!;
    if (e.status === 'CANDIDATE') expect(el.dash, `${e.id} CANDIDATE stays dashed`).toMatch(/6(px)?,?\s+4/);
    else expect(el.dash, e.id).toBe('none');
    if (e.type === 'MENTIONS') { expect(el.marker, `${e.id} MENTIONS has no arrow`).toBeNull(); expect(el.width).toBe(1); }
    else expect(el.marker, e.id).toMatch(/arrowclosed/);
    if (e.type !== 'DEPENDS_ON') expect(el.stroke, `${e.id} is not drawn as a dependency`).not.toBe(dom.edges.find((x) => byId.get(x.id)!.type === 'DEPENDS_ON')!.stroke);
  }
  expect(dom.zoom).toBeLessThan(0.55);
  await expect(page.locator('[data-graph-hint]')).toContainText(/Labels are too small to read/);
  const isolated = m.nodes.filter((n) => !m.edges.some((e) => e.source === n.id || e.target === n.id));
  expect(isolated.length, 'the data has isolated nodes to check').toBeGreaterThan(0);
});

test('selection emphasises only incident edges; inspector shows type, direction, status, side and evidence', async ({ page }) => {
  const m = await model(page);
  await openGraph(page);
  const dep = m.sub.edges.find((e) => e.type === 'DEPENDS_ON')!;
  const pick = dep.source === m.focus ? dep.target : dep.source;
  const pickNode = m.g.nodes.find((n) => n.id === pick) as GraphNode;
  await page.locator(`.react-flow__node[data-id="${pick}"]`).click();
  const inspector = page.getByRole('complementary', { name: 'Node inspector' });
  await expect(inspector.getByRole('heading', { name: pickNode.label })).toBeVisible();
  const incident = m.g.edges.filter((e) => e.source === pick || e.target === pick);
  await expect(inspector.getByRole('heading', { name: `Edges (${incident.length})` })).toBeVisible();
  await expect(inspector.getByText(dep.evidence, { exact: true })).toBeVisible();
  await expect(inspector.locator('li', { hasText: dep.evidence }).getByText(dep.side, { exact: true })).toBeVisible();
  await expect(inspector.locator('li', { hasText: dep.evidence }).getByText(dep.source === pick ? 'Outgoing' : 'Incoming')).toBeAttached();
  await page.mouse.move(5, 5);
  const dom = await rendered(page);
  for (const el of dom.edges) {
    const e = m.sub.edges.find((x) => x.id === el.id)!;
    const touches = e.source === pick || e.target === pick;
    if (touches) expect(el.opacity, `${e.id} incident`).toBeGreaterThanOrEqual(0.6);
    else expect(el.opacity, `${e.id} not incident`).toBeLessThanOrEqual(0.15);
  }
});

test('search, list, focus, fit and reset are reversible view states over the same data', async ({ page }) => {
  const m = await model(page);
  await openGraph(page);
  const dep = m.sub.edges.find((e) => e.type === 'DEPENDS_ON')!;
  const other = dep.source === m.focus ? dep.target : dep.source;
  const otherNode = m.g.nodes.find((n) => n.id === other)!;
  const expected = focusSubgraph(m.nodes, m.edges, other, 1);
  await page.getByRole('searchbox', { name: 'Find a node' }).fill(otherNode.label);
  await page.getByRole('button', { name: otherNode.label, exact: true }).first().click();
  await expect(page.locator('[data-graph-summary]')).toContainText(`Focused neighborhood of “${otherNode.label}”: ${expected.nodes.length} nodes · ${expected.edges.length} relationships`);
  await expect(page.locator('.react-flow__edge')).toHaveCount(expected.edges.length);
  await expect(page.locator(`.react-flow__node[data-id="${other}"] .rs-gnode`)).toHaveAttribute('data-focus', 'true');
  await page.getByRole('button', { name: 'Fit current view' }).click();
  await page.waitForTimeout(400);
  const fitted = await rendered(page);
  for (const r of Object.values(fitted.rects)) expect(r.left >= fitted.canvas.left - 1 && r.right <= fitted.canvas.right + 1 && r.top >= fitted.canvas.top - 1 && r.bottom <= fitted.canvas.bottom + 1).toBe(true);
  await page.getByRole('button', { name: 'List (accessible)' }).click();
  const list = page.getByRole('table', { name: /Every node of the filtered graph/ });
  await expect(list).toBeVisible();
  await expect(list.getByRole('row')).toHaveCount(m.nodes.length + 1);
  await list.getByRole('button', { name: m.g.nodes.find((n) => n.id === m.focus)!.label, exact: true }).click();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.locator('[data-graph-summary]')).toContainText(`Focused neighborhood of “${m.g.nodes.find((n) => n.id === m.focus)!.label}”`);
  await page.getByRole('checkbox', { name: 'Include 2 hops' }).check();
  const two = focusSubgraph(m.nodes, m.edges, m.focus, 2);
  await expect(page.locator('.react-flow__edge')).toHaveCount(two.edges.length);
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(m.sub.edges.length);
  await expect(page.getByRole('checkbox', { name: 'Include 2 hops' })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Focus connections' })).toHaveAttribute('aria-pressed', 'true');
});

test('filters: no-match empty state, isolated node and rapid toggles that never leave stale layouts', async ({ page }) => {
  const m = await model(page);
  await openGraph(page);
  const edgeTypes = page.getByRole('group', { name: 'Edge types' }).or(page.locator('fieldset', { hasText: 'Edge types' }));
  const boxes = edgeTypes.first().getByRole('checkbox');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).uncheck();
  await expect(page.locator('[data-graph-empty]')).toContainText('No relationships match the current filters.');
  await expect(page.locator('.react-flow')).toHaveCount(0);
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  // Rapid toggling: the last filter state must win even though layouts finish out of order.
  const mentions = edgeTypes.first().getByRole('checkbox', { name: 'MENTIONS' });
  for (let i = 0; i < 5; i++) await mentions.click({ delay: 0 });
  const withoutMentions = m.edges.filter((e) => e.type !== 'MENTIONS');
  const focus2 = initialFocus(m.nodes, withoutMentions)!;
  const sub2 = focusSubgraph(m.nodes, withoutMentions, focus2, 1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(sub2.edges.length, { timeout: 15_000 });
  await page.waitForTimeout(800);
  const dom = await rendered(page);
  expect(new Set(dom.edges.map((e) => e.id))).toEqual(new Set(sub2.edges.map((e) => e.id)));
  await expect(page.getByText('Laying out…')).toHaveCount(0);
  await mentions.check();
  const lonely = m.nodes.find((x) => !m.edges.some((e) => e.source === x.id || e.target === x.id))!;
  await page.getByRole('searchbox', { name: 'Find a node' }).fill(lonely.label);
  await page.getByRole('button', { name: lonely.label, exact: true }).first().click();
  await expect(page.locator('[data-graph-hint]')).toContainText(`“${lonely.label}” has no relationships under the current filters.`);
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
});

test('the 260-node interactive cap still applies to the full graph, and focus keeps working', async ({ page }) => {
  const m = await model(page);
  await openGraph(page);
  for (const label of ['Character', 'Faction / Nation', 'Organization', 'Historical Event', 'Location', 'Technology', 'Law / Treaty', 'Principle', 'Philosophy', 'Narrative Arc', 'Theme', 'Conflict']) {
    const box = page.locator('fieldset', { hasText: 'Node types' }).getByRole('checkbox', { name: new RegExp(`^${label.replace(/[/()]/g, '\\$&')} \\(`) });
    if (await box.count()) await box.check();
  }
  await page.getByRole('button', { name: 'Show filtered graph' }).click();
  await expect(page.getByText(/nodes exceed the 260-node interactive limit/)).toBeVisible();
  await page.getByRole('button', { name: 'Focus connections' }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('.react-flow__node').count()).toBeLessThanOrEqual(260);
  expect(m.g.nodes.length).toBeGreaterThan(260);
});

test('@responsive graph view: readable focus, 40 px controls, no page overflow, axe clean', async ({ page }) => {
  const m = await model(page);
  await openGraph(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(m.sub.edges.length);
  await page.waitForTimeout(400);
  const dom = await rendered(page);
  expect(dom.zoom).toBeGreaterThanOrEqual(0.7);
  expect(dom.edges.some((e) => e.midInCanvas), 'at least one relationship line is in the frame').toBe(true);
  const sizes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[aria-label="Graph view controls"] button, .react-flow__controls-button, [aria-label="View"] button')].map((b) => ({ t: b.textContent?.trim() || b.getAttribute('title') || b.getAttribute('aria-label'), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width })));
  for (const s of sizes) expect(Math.min(s.h, s.w), `${s.t} touch target`).toBeGreaterThanOrEqual(40);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const axe = await new AxeBuilder({ page }).include('section[aria-label="Graph canvas"]').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test('enlarged text (125–200 %) keeps the focused graph usable at 1440 and 1024 px', async ({ page }) => {
  for (const [width, scale] of [[1440, 125], [1440, 200], [1024, 150]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/graph');
    await page.addStyleTag({ content: `html{font-size:${scale}%!important}` });
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 20_000 });
    const controls = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[aria-label="Graph view controls"] button')].map((b) => { const r = b.getBoundingClientRect(); return { left: r.left, right: r.right, vw: document.documentElement.clientWidth }; }));
    for (const c of controls) expect(c.right <= c.vw + 1 && c.left >= 0, `${width}px ${scale}% control inside the viewport`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px ${scale}%`).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Reset view' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Focus connections' })).toHaveAttribute('aria-pressed', 'true');
  }
});
