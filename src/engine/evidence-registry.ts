/**
 * Evidence-anchored extraction rules for statistics that the production source states only in
 * prose. A rule never carries a value: it carries a pattern, and every number is parsed from the
 * matched text of the pinned production blob. When the text no longer matches, the rule reports
 * NOT_FOUND and contributes nothing.
 */
import type { EpistemicStatus } from '../domain/status.ts';

export type EvidenceOutput =
  | { kind: 'observation'; entity: 'planet' | string; indicator: string; value: number; unit: string; year_bac: number; status: EpistemicStatus; note: string | null }
  | { kind: 'interval'; entity: 'planet' | string; indicator: string; value: number; unit: string; start_bac: number; end_bac: number; status: EpistemicStatus; note: string | null }
  | { kind: 'range'; entity: string; indicator: string; low: number; high: number; unit: string; timing: string; status: EpistemicStatus };

export interface EvidenceRule {
  id: string;
  path: string;
  pattern: RegExp;
  build(m: RegExpExecArray): EvidenceOutput[];
}

const num = (s: string | undefined): number => {
  const v = Number(String(s).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(v)) throw new Error(`Unparseable number in evidence: ${s}`);
  return v;
};
/** Percent text → ratio without binary float noise ("0.45" → 0.0045). */
const pct = (s: string | undefined): number => Number((num(s) / 100).toPrecision(12));
const TIMELINE = 'content/events/history-timeline.md';

export const EVIDENCE_RULES: readonly EvidenceRule[] = Object.freeze([
  {
    id: 'EV-1010-ANCHORS',
    path: TIMELINE,
    pattern: /The creator-defined 1010 BAC anchors are \*\*Asthortera nominal GDP USD ([\d.]+) trillion\*\* and \*\*Reltronland GDP REL ([\d.]+) trillion\*\* with the historical nominal reference \*\*1 REL = USD ([\d.]+)\*\*\. Thus Reltronland produced \*\*USD ([\d.]+) trillion\*\*, or \*\*([\d.]+)%\*\* of planetary GDP, with \*\*([\d.]+) billion sentients\*\*/,
    build: (m) => [
      { kind: 'observation', entity: 'planet', indicator: 'gdp_usd_nominal_historical', value: num(m[1]) * 1e12, unit: 'USD per year', year_bac: 1010, status: 'CANON_OBSERVED', note: 'Creator-defined 1010 BAC nominal anchor.' },
      { kind: 'observation', entity: 'Reltronland', indicator: 'gdp_usd_nominal_historical', value: num(m[4]) * 1e12, unit: 'USD per year', year_bac: 1010, status: 'CANON_DERIVED', note: `REL ${m[2]} trillion at USD ${m[3]} per REL.` },
      { kind: 'observation', entity: 'Reltronland', indicator: 'gdp_share_historical', value: pct(m[5]), unit: 'ratio', year_bac: 1010, status: 'CANON_DERIVED', note: 'Derived in source from the two 1010 BAC GDP anchors.' },
      { kind: 'observation', entity: 'Reltronland', indicator: 'population', value: num(m[6]), unit: 'billion sentients', year_bac: 1010, status: 'CANON_OBSERVED', note: 'Creator-defined 1010 BAC anchor.' },
    ],
  },
  {
    id: 'EV-1010-REAL-GROWTH',
    path: TIMELINE,
    pattern: /The \*\*(\d+(?:\.\d+)?)% real planetary GDP growth\*\* of 1010 BAC is a year-specific narrative anchor/,
    build: (m) => [{ kind: 'observation', entity: 'planet', indicator: 'real_gdp_growth', value: pct(m[1]), unit: 'ratio per year', year_bac: 1010, status: 'CANON_OBSERVED', note: 'Year-specific narrative anchor; not a long-term compound average.' }],
  },
  {
    id: 'EV-950-REAL-GROWTH-PEAK',
    path: TIMELINE,
    pattern: /The planetary \*\*annual real GDP growth rate reached (\d+(?:\.\d+)?)%\*\*, compared with \*\*(\d+(?:\.\d+)?)% in 1010 BAC\*\*/,
    build: (m) => [{ kind: 'observation', entity: 'planet', indicator: 'real_gdp_growth', value: pct(m[1]), unit: 'ratio per year', year_bac: 950, status: 'CANON_OBSERVED', note: 'Peak planetary real economic growth.' }],
  },
  {
    id: 'EV-1010-SDI',
    path: TIMELINE,
    pattern: /\*\*SDI was still (0\.\d+) in 1010 BAC\*\*/,
    build: (m) => [{ kind: 'observation', entity: 'planet', indicator: 'sdi', value: num(m[1]), unit: 'index (0–1)', year_bac: 1010, status: 'CANON_OBSERVED', note: null }],
  },
  {
    id: 'EV-1010-POPULATION-SCENARIO',
    path: TIMELINE,
    pattern: /\*\*conditional 1010 BAC population of approximately ([\d.]+) billion\*\*/,
    build: (m) => [{ kind: 'observation', entity: 'planet', indicator: 'population', value: num(m[1]), unit: 'billion sentients', year_bac: 1010, status: 'SCENARIO', note: 'Calculated scenario from a 0.4% CAGR, not an ancient census.' }],
  },
  {
    id: 'EV-POPULATION-GROWTH-SIMULATION-V1',
    path: TIMELINE,
    pattern: /population-growth reconstruction is: \*\*([^*]+)\*\*\. All intermediate values are \*\*simulation V1\*\*/,
    build: (m) => {
      const out: EvidenceOutput[] = [];
      const re = /~?(\d+(?:\.\d+)?)% \((\d+)–(\d+|Year 0)(?: BAC)?\)/g;
      let x: RegExpExecArray | null;
      while ((x = re.exec(m[1]!))) {
        out.push({
          kind: 'interval', entity: 'planet', indicator: 'population_growth', value: pct(x[1]), unit: 'ratio per year',
          start_bac: num(x[2]), end_bac: x[3] === 'Year 0' ? 0 : num(x[3]), status: 'SCENARIO',
          note: 'Simulation V1 interval average; explicitly not an observational record.',
        });
      }
      if (out.length < 2) throw new Error('Simulation V1 interval list did not parse');
      return out;
    },
  },
  {
    id: 'EV-RELTRONLAND-RECONSTRUCTION-GROWTH-RANGE',
    path: 'content/factions/reltronland.md',
    pattern: /Post-war growth occasionally surged \*\*(\d+(?:\.\d+)?)% to (\d+(?:\.\d+)?)% YoY\*\* during \*\*short-lived transitional reconstruction episodes\*\*/,
    build: (m) => [{
      kind: 'range', entity: 'Reltronland', indicator: 'real_gdp_growth', low: pct(m[1]), high: pct(m[2]), unit: 'ratio per year',
      timing: 'Short-lived post-war reconstruction episodes; the source does not state which years.', status: 'CANON_OBSERVED',
    }],
  },
]);

export interface EvidenceMatch {
  rule: EvidenceRule;
  status: 'VERIFIED' | 'NOT_FOUND' | 'SOURCE_MISSING';
  line: number | null;
  quote: string | null;
  outputs: EvidenceOutput[];
}

export function applyEvidenceRule(rule: EvidenceRule, text: string | null): EvidenceMatch {
  if (text === null) return { rule, status: 'SOURCE_MISSING', line: null, quote: null, outputs: [] };
  const lf = text.replace(/\r\n?/g, '\n');
  const m = rule.pattern.exec(lf);
  if (!m) return { rule, status: 'NOT_FOUND', line: null, quote: null, outputs: [] };
  const line = lf.slice(0, m.index).split('\n').length;
  const quote = m[0].length > 600 ? `${m[0].slice(0, 599)}…` : m[0];
  return { rule, status: 'VERIFIED', line, quote, outputs: rule.build(m) };
}
