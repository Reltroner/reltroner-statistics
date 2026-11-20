/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R3: builds the export ZIP off the main thread. It runs the very same
 * fflate `zipSync` on the very same entries (paths, levels, fixed timestamps), so its bytes equal the
 * main-thread result; only the scheduling changes. It posts `ready` first so the page transfers the
 * entry buffers only to a worker that actually loaded.
 */
import { zipSync, type Zippable } from 'fflate';

const scope = self as unknown as { onmessage: ((event: MessageEvent<Zippable>) => void) | null; postMessage: (message: unknown, transfer?: Transferable[]) => void };
scope.onmessage = (event) => {
  try {
    const bytes = zipSync(event.data);
    scope.postMessage({ ok: true, bytes }, [bytes.buffer]);
  } catch (error) {
    scope.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
scope.postMessage({ ready: true });
