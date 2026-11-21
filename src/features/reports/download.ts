import { exportAbortError } from '../../export/abort.ts';
import type { PdfLoader } from '../../export/bundle.ts';
import type { Zippable } from 'fflate';

/** sessionStorage key carrying a drift-explorer selection to the Report Center. */
export const SELECTION_KEY = 'rs-export-selection';

/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R3 policy, from measurements of the 515-PDF export: serial retrieval
 * made the wall time grow with network latency (64 s at 60 ms, 131 s at 150 ms) while every CPU phase took
 * under half a second. PDFs are fetched six at a time; a request that receives no bytes for 30 s is
 * abandoned; transient failures of these idempotent GETs of immutable files get one more attempt; the whole
 * export stops after 15 minutes. Nothing is retried after a 404 or a response that is not a PDF.
 */
export const PDF_CONCURRENCY = 6;
export const PDF_STALL_TIMEOUT_MS = 30_000;
export const PDF_ATTEMPTS = 2;
export const EXPORT_DEADLINE_MS = 15 * 60_000;

class PdfRetrievalError extends Error {
  readonly transient: boolean;
  constructor(message: string, transient: boolean) { super(message); this.transient = transient; }
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
  const stop = () => { clearTimeout(t); reject(exportAbortError()); };
  signal?.addEventListener('abort', stop, { once: true });
});

interface PdfLoaderOptions { fetcher?: typeof fetch; stallTimeoutMs?: number; attempts?: number; backoffMs?: number }

/** Precomputed PDFs (printed from the same HTML at build time). 'ALL' is the consolidated full report. */
export function createPdfLoader(options: PdfLoaderOptions = {}): PdfLoader {
  const fetcher = options.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const stallMs = options.stallTimeoutMs ?? PDF_STALL_TIMEOUT_MS;
  const attempts = options.attempts ?? PDF_ATTEMPTS;
  const backoffMs = options.backoffMs ?? 600;

  const once = async (url: string, key: string, signal?: AbortSignal): Promise<Uint8Array | null> => {
    if (signal?.aborted) throw exportAbortError();
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let stalled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { stalled = true; controller.abort(); }, stallMs); };
    // Every wait races this, so a stall or cancellation ends the request even if a stream ignores the signal.
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    aborted.catch(() => {});
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      arm();
      const res = await Promise.race([fetcher(url, { signal: controller.signal, credentials: 'same-origin' }), aborted]);
      arm();
      if (res.status === 404) { void res.body?.cancel().catch(() => {}); return null; }
      if (!res.ok) {
        void res.body?.cancel().catch(() => {});
        throw new PdfRetrievalError(`The precomputed PDF for ${key} could not be retrieved (HTTP ${res.status})`, res.status >= 500 || res.status === 408 || res.status === 429);
      }
      const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
      if (type && type !== 'application/pdf') {
        void res.body?.cancel().catch(() => {});
        throw new PdfRetrievalError(`The server returned ${type === 'text/html' ? 'a web page' : type} instead of the precomputed PDF for ${key}`, false);
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      reader = res.body?.getReader();
      if (reader) {
        for (;;) {
          const { done, value } = await Promise.race([reader.read(), aborted]);
          if (done) break;
          arm();
          chunks.push(value);
          size += value.byteLength;
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d)) {
        throw new PdfRetrievalError(`The file received for ${key} is not a PDF`, false);
      }
      return bytes;
    } catch (error) {
      if (reader) void reader.cancel().catch(() => {});
      if (signal?.aborted) throw exportAbortError();
      if (error instanceof PdfRetrievalError) throw error;
      throw stalled
        ? new PdfRetrievalError(`No data arrived for ${Math.round(stallMs / 1000)} s while retrieving the PDF for ${key}`, true)
        : new PdfRetrievalError(`A network error interrupted the PDF for ${key}`, true);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };

  return async (key, signal) => {
    const name = key === 'ALL' ? 'all-findings' : key;
    if (!/^[A-Za-z0-9-]{3,128}$/.test(name)) return null;
    for (let attempt = 1; ; attempt++) {
      try {
        return await once(`/reports/pdf/${name}.pdf`, key, signal);
      } catch (error) {
        if (signal?.aborted) throw exportAbortError();
        if (!(error instanceof PdfRetrievalError) || !error.transient || attempt >= attempts) throw error;
        await sleep(backoffMs * attempt, signal);
      }
    }
  };
}

export const pdfLoader: PdfLoader = createPdfLoader();

/**
 * Runs the export's `zipSync` in a module worker so the page stays responsive and Cancel works during
 * compression. Entry buffers are transferred only after the worker reports it loaded; if it cannot load,
 * the same `zipSync` runs here instead, so the bytes never depend on where they were built.
 */
export function zipInWorker(files: Zippable, signal?: AbortSignal, fallback?: (files: Zippable) => Uint8Array): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    if (signal?.aborted) { reject(exportAbortError()); return; }
    const local = async () => {
      const { zipSync } = await import('fflate');
      return (fallback ?? zipSync)(files);
    };
    let worker: Worker;
    try {
      worker = new Worker(new URL('./zip-worker.ts', import.meta.url), { type: 'module' });
    } catch {
      local().then(resolve, reject);
      return;
    }
    let transferred = false;
    const finish = () => { worker.terminate(); signal?.removeEventListener('abort', onAbort); };
    const onAbort = () => { finish(); reject(exportAbortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<{ ready?: boolean; ok?: boolean; bytes?: Uint8Array; message?: string }>) => {
      if (event.data.ready) {
        const buffers = new Set<ArrayBuffer>();
        for (const value of Object.values(files)) {
          const u8 = (Array.isArray(value) ? value[0] : value) as Uint8Array;
          buffers.add(u8.buffer as ArrayBuffer);
        }
        transferred = true;
        worker.postMessage(files, [...buffers]);
        return;
      }
      finish();
      if (event.data.ok && event.data.bytes) resolve(event.data.bytes);
      else reject(new Error(`Compressing the ZIP failed: ${event.data.message ?? 'unknown error'}`));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      if (transferred) reject(new Error('Compressing the ZIP failed in the background worker'));
      else local().then(resolve, reject);
    };
  });
}

/** Hands the bytes to the browser's download manager. Success means the download was started, not saved. */
export function saveBytes(bytes: Uint8Array, filename: string, mime: string): void {
  let url: string;
  try {
    url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
  } catch (error) {
    throw new Error(`The browser could not prepare the download (${error instanceof Error ? error.name : 'error'}); try fewer findings or formats`);
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function humanBytes(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(2)} MB`;
}
