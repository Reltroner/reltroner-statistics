/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R3: the error a cancelled export rejects with. Kept in its own tiny
 * module so pages that only download files do not load the export engine to recognise a cancellation.
 */
export function exportAbortError(): Error {
  const e = new Error('Export cancelled');
  e.name = 'AbortError';
  return e;
}
