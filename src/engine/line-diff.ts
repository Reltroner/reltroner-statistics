/** Myers O(ND) line diff with an edit budget. Pure and deterministic. */

export interface LineDiffResult {
  added: number;
  removed: number;
  /** Bounded unified-style excerpt: lines prefixed with "+", "-" or " ". */
  excerpt: string[];
  truncated: boolean;
  budget_exceeded: boolean;
}

type Op = { kind: ' ' | '-' | '+'; line: string };

function myers(a: readonly string[], b: readonly string[], maxD: number): Op[] | null {
  const n = a.length, m = b.length, max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= Math.min(max, maxD); d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) x = v[offset + k + 1]!;
      else x = v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        const ops: Op[] = [];
        let cx = n, cy = m;
        for (let dd = d; dd > 0; dd--) {
          const pv = trace[dd]!;
          const kk = cx - cy;
          const prevK = kk === -dd || (kk !== dd && pv[offset + kk - 1]! < pv[offset + kk + 1]!) ? kk + 1 : kk - 1;
          const px = pv[offset + prevK]!;
          const py = px - prevK;
          while (cx > px && cy > py) { ops.push({ kind: ' ', line: a[cx - 1]! }); cx--; cy--; }
          if (cx === px) { ops.push({ kind: '+', line: b[cy - 1]! }); cy--; }
          else { ops.push({ kind: '-', line: a[cx - 1]! }); cx--; }
        }
        while (cx > 0 && cy > 0) { ops.push({ kind: ' ', line: a[cx - 1]! }); cx--; cy--; }
        return ops.reverse();
      }
    }
  }
  return null;
}

export function diffLines(
  a: readonly string[],
  b: readonly string[],
  opts: { maxEdits?: number; context?: number; maxExcerptLines?: number; maxLineChars?: number } = {},
): LineDiffResult {
  const { maxEdits = 4000, context = 1, maxExcerptLines = 40, maxLineChars = 240 } = opts;
  const clip = (s: string) => (s.length > maxLineChars ? `${s.slice(0, maxLineChars)}…` : s);
  const ops = myers(a, b, maxEdits);
  if (!ops) {
    const setB = new Set(b), setA = new Set(a);
    return {
      added: b.filter((l) => !setA.has(l)).length,
      removed: a.filter((l) => !setB.has(l)).length,
      excerpt: [],
      truncated: true,
      budget_exceeded: true,
    };
  }
  let added = 0, removed = 0;
  const keep = new Uint8Array(ops.length);
  ops.forEach((op, i) => {
    if (op.kind === ' ') return;
    if (op.kind === '+') added++; else removed++;
    for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) keep[j] = 1;
  });
  const excerpt: string[] = [];
  let truncated = false, last = -2;
  for (let i = 0; i < ops.length; i++) {
    if (!keep[i]) continue;
    if (excerpt.length >= maxExcerptLines) { truncated = true; break; }
    if (last >= 0 && i !== last + 1) excerpt.push('…');
    excerpt.push(`${ops[i]!.kind}${clip(ops[i]!.line)}`);
    last = i;
  }
  return { added, removed, excerpt, truncated, budget_exceeded: false };
}
