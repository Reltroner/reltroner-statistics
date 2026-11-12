import fs from 'node:fs';
import { chromium, type Browser } from '@playwright/test';

/**
 * Launch Chromium for printing and browser tests. Order: PW_CHANNEL override, Playwright's bundled
 * Chromium if installed, otherwise the system Edge (Windows) or Chrome. Nothing is downloaded here.
 */
export async function launchChromium(): Promise<{ browser: Browser; engine: string }> {
  const override = process.env.PW_CHANNEL;
  const candidates: Array<string | undefined> = override ? [override] : [];
  let bundled = false;
  try { bundled = fs.existsSync(chromium.executablePath()); } catch { bundled = false; }
  if (!override) {
    if (bundled) candidates.push(undefined);
    candidates.push(process.platform === 'win32' ? 'msedge' : 'chrome', 'chrome');
  }
  let lastError: unknown;
  for (const channel of candidates) {
    try {
      const browser = await chromium.launch(channel ? { channel } : {});
      return { browser, engine: `${channel ?? 'chromium'} ${browser.version()}` };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`No Chromium engine available (set PW_CHANNEL or run "npx playwright install chromium"): ${String((lastError as Error)?.message ?? lastError).slice(0, 200)}`);
}
