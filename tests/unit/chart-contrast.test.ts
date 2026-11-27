import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastRatio,
  formatCorrelationCell,
  interpolateRampHex,
  mixHex,
  parseCssRgb,
  pickTextColor,
  relativeLuminance,
} from '../../src/features/charts/theme.ts';

test('WCAG relative luminance and pickTextColor guarantee >= 4.5:1 on every treemap tile fill in dark and light modes', () => {
  assert.deepEqual(parseCssRgb('#fff'), [255, 255, 255]);
  assert.deepEqual(parseCssRgb('rgb(42, 120, 214)'), [42, 120, 214]);
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#ffffff'), 1);
  assert.equal(Number(contrastRatio('#000000', '#ffffff').toFixed(2)), 21);

  const fills: Array<[string, string]> = [
    ['dark PROFILED_14 (--series-1)', '#3987e5'],
    ['dark DEVELOPMENT_5 (mix 0.68)', mixHex('#3987e5', '#0b1a33', 0.68)],
    ['dark RESIDUAL (--series-fold)', '#898781'],
    ['light PROFILED_14 (--series-1)', '#2a78d6'],
    ['light DEVELOPMENT_5 (mix 0.68)', mixHex('#2a78d6', '#ffffff', 0.68)],
    ['light RESIDUAL (--series-fold)', '#898781'],
  ];

  for (const [label, bg] of fills) {
    const fg = pickTextColor(bg);
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= 4.5, `${label} (${bg}) with ${fg} has ratio ${ratio.toFixed(2)} < 4.5`);
    const other = fg === '#000000' ? '#ffffff' : '#000000';
    assert.ok(ratio >= contrastRatio(other, bg), `${label} chose lower-contrast ink`);
  }
});

test('diverging correlation ramp + pickTextColor guarantee >= 4.5:1 across the entire [-1, 1] range in dark and light modes', () => {
  const ramps = {
    dark: ['#184f95', '#3987e5', '#6da7ec', '#383835', '#e88a89', '#e66767', '#a8302f'],
    light: ['#184f95', '#3987e5', '#9ec5f4', '#f0efec', '#f2a9a7', '#e34948', '#9d2b2b'],
  } as const;

  for (const [mode, stops] of Object.entries(ramps)) {
    for (let step = -100; step <= 100; step++) {
      const r = step / 100;
      const bg = interpolateRampHex(stops, r, -1, 1);
      const fg = pickTextColor(bg);
      const ratio = contrastRatio(fg, bg);
      assert.ok(ratio >= 4.5, `${mode} r=${r} (${bg}) with ${fg} has contrast ${ratio.toFixed(2)} < 4.5`);
    }
  }
});

test('formatCorrelationCell renders two decimals, preserves minus signs, avoids -0.00, and formats null honestly', () => {
  assert.equal(formatCorrelationCell(1), '1.00');
  assert.equal(formatCorrelationCell(-1), '-1.00');
  assert.equal(formatCorrelationCell(0), '0.00');
  assert.equal(formatCorrelationCell(-0.0004), '0.00');
  assert.equal(formatCorrelationCell(-0.842), '-0.84');
  assert.equal(formatCorrelationCell(0.126), '0.13');
  assert.equal(formatCorrelationCell(null), '—');
});
