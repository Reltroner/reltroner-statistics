/** Header interactions without a framework: theme, mobile menu, ecosystem disclosure, palette hand-off. */

const THEME_KEY = 'rs-theme';

function currentTheme(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: 'dark' | 'light', persist: boolean) {
  document.documentElement.dataset.theme = theme;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage may be blocked */ }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((b) => {
    const next = theme === 'dark' ? 'light' : 'dark';
    b.setAttribute('aria-label', `Switch to ${next} theme`);
    b.dataset.current = theme;
  });
  window.dispatchEvent(new CustomEvent('rs:themechange', { detail: { theme } }));
}

function setupTheme() {
  applyTheme(currentTheme(), false);
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((b) => {
    b.addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true));
  });
  const mql = window.matchMedia('(prefers-color-scheme: light)');
  mql.addEventListener('change', (e) => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
    if (!stored) applyTheme(e.matches ? 'light' : 'dark', false);
  });
}

function setupDisclosure(button: HTMLButtonElement, panel: HTMLElement, opts: { focusFirst?: boolean; closeOnOutside?: boolean; onToggle?: (open: boolean) => void } = {}) {
  const setOpen = (open: boolean, returnFocus = false) => {
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    opts.onToggle?.(open);
    if (open && opts.focusFirst) panel.querySelector<HTMLElement>('a, button, input')?.focus();
    if (!open && returnFocus) button.focus();
  };
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') setOpen(false, true);
  });
  if (opts.closeOnOutside) {
    document.addEventListener('pointerdown', (e) => {
      if (button.getAttribute('aria-expanded') !== 'true') return;
      const t = e.target as Node;
      if (!panel.contains(t) && !button.contains(t)) setOpen(false);
    });
  }
  panel.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false);
  });
  return setOpen;
}

function setupMenus() {
  const menuBtn = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
  const menu = document.getElementById('mobile-nav');
  if (menuBtn && menu) {
    const setOpen = setupDisclosure(menuBtn, menu, { focusFirst: true, onToggle: (open) => document.body.classList.toggle('overflow-hidden', open) });
    window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }
  const ecoBtn = document.querySelector<HTMLButtonElement>('[data-ecosystem-toggle]');
  const eco = document.getElementById('ecosystem-menu');
  if (ecoBtn && eco) setupDisclosure(ecoBtn, eco, { closeOnOutside: true });
}

let paletteReady: Promise<void> | null = null;

function setupPalette() {
  const open = () => {
    (window as unknown as { __rsPaletteRequested?: boolean }).__rsPaletteRequested = true;
    paletteReady ??= import('../features/palette/mount.tsx').then((m) => m.mountPalette());
    void paletteReady.then(() => window.dispatchEvent(new CustomEvent('rs:palette:open')));
  };
  document.querySelectorAll('[data-palette-open]').forEach((b) => b.addEventListener('click', open));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open();
    }
  });
}

setupTheme();
setupMenus();
setupPalette();
