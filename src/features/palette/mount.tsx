import { createRoot } from 'react-dom/client';
import CommandPalette from './CommandPalette.tsx';

let mounted = false;

/** Loaded on the first Ctrl+K or search click, so pages without islands never download React up front. */
export function mountPalette(): void {
  if (mounted) return;
  mounted = true;
  const host = document.createElement('div');
  host.id = 'rs-palette-root';
  document.body.appendChild(host);
  createRoot(host).render(<CommandPalette />);
}
