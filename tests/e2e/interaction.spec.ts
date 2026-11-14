import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, hydrated, setTheme, watchConsole } from './helpers.ts';

test('skip link moves focus to main content', async ({ page }) => {
  await page.goto('/statistics');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('Ctrl+K palette: search, keyboard selection, Escape restores focus', async ({ page }) => {
  await page.goto('/');
  const trigger = page.locator('button[data-palette-open]:visible').first();
  await trigger.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search the observatory' });
  await expect(dialog).toBeVisible();
  await page.keyboard.type('beluftner');
  await expect(dialog.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('methodology');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/methodology/);
});

test('mobile menu is a keyboard-operable disclosure @mobile', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-375', 'mobile layout only');
  await page.goto('/');
  const toggle = page.locator('[data-menu-toggle]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#mobile-nav')).toBeVisible();
  await expect(page.locator('#mobile-nav a').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#mobile-nav')).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('Studio Contact is directly accessible from the responsive navbar @responsive', async ({ page }) => {
  await page.goto('/');
  const target = 'https://www.reltroner.com/contact';
  const width = page.viewportSize()?.width ?? 1440;
  const desktopLink = page.locator('nav[aria-label="Primary"] a[data-studio-contact-link]');
  const mobileLink = page.locator('nav[aria-label="Mobile"] a[data-studio-contact-link]');

  await expect(desktopLink).toHaveAttribute('href', target);
  await expect(mobileLink).toHaveAttribute('href', target);
  for (const link of [desktopLink, mobileLink]) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener noreferrer/);
    await expect(link).toContainText('Contact');
  }

  if (width >= 1280) {
    await expect(desktopLink).toBeVisible();
    await expect(mobileLink).toBeHidden();
    await expect(page.locator('[data-menu-toggle]')).toBeHidden();
  } else {
    await expect(desktopLink).toBeHidden();
    const toggle = page.locator('[data-menu-toggle]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(mobileLink).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(mobileLink).toBeHidden();
    await expect(toggle).toBeFocused();
  }
  await expectNoHorizontalOverflow(page);
});

test('theme toggle switches, persists across navigation and re-themes charts', async ({ page }) => {
  await setTheme(page, 'dark');
  const watch = watchConsole(page);
  await page.goto('/statistics');
  await hydrated(page.locator('.rs-chart-frame'));
  await page.locator('.rs-chart-frame svg').first().waitFor();
  await page.locator('[data-theme-toggle]').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/drift');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  watch.expectClean();
});

test('reduced motion disables reveals and chart animation', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/statistics');
  const animation = await page.locator('h1.rs-reveal').evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
  await hydrated(page.locator('.rs-chart-frame'));
  await page.locator('.rs-chart-frame svg').first().waitFor();
  await context.close();
});

for (const path of ['/', '/statistics', '/statistics/decision-trees', '/drift', '/reports', '/methodology', '/history', '/qa', '/creative', '/creative/ideas', '/creative/audit', '/creative/decisions']) {
  for (const theme of ['dark', 'light'] as const) {
    test(`accessibility: no serious or critical axe violations on ${path} (${theme})`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('.rs-chart-frame').analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
}

test('responsive viewports (360, 390, 768, 1024, 1280, 1440px) and Linux fallback font simulation at 360px/1024px have zero horizontal overflow', async ({ page }) => {
  for (const width of [360, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/creative');
    if (width === 1024) {
      // Simulate wider Ubuntu Linux fallback fonts (Liberation Sans / DejaVu Sans) to verify header safety margin
      await page.addStyleTag({
        content: 'body, header, nav, a, button { font-family: "Liberation Sans", "DejaVu Sans", Arial, sans-serif !important; letter-spacing: 0.02em; }',
      });
    }
    const metrics = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(metrics.scroll, `viewport width ${width}px`).toBeLessThanOrEqual(metrics.client + 1);
  }
  for (const route of ['/creative/refactor', '/creative/decisions', '/statistics/decision-trees']) {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(route);
    await page.addStyleTag({
      content: 'body, h1, h2, h3, p, span, a, button, code { font-family: "Liberation Sans", "DejaVu Sans", Arial, sans-serif !important; letter-spacing: 0.03em; }',
    });
    const metrics = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(metrics.scroll, `mobile Linux fallback font on ${route}`).toBeLessThanOrEqual(metrics.client + 1);
  }
});
