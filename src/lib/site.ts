/** Route registry and navigation. Every route listed here must exist (verified by route tests). */

export interface RouteDef {
  path: string;
  title: string;
  section: SectionId;
  summary: string;
}

export type SectionId = 'overview' | 'statistics' | 'analysis' | 'drift' | 'knowledge' | 'reports' | 'methodology';

export const SECTIONS: ReadonlyArray<{ id: SectionId; label: string; href: string }> = [
  { id: 'statistics', label: 'Statistics', href: '/statistics' },
  { id: 'analysis', label: 'Analysis', href: '/clustering' },
  { id: 'drift', label: 'Drift', href: '/drift' },
  { id: 'knowledge', label: 'Graph', href: '/graph' },
  { id: 'reports', label: 'Reports', href: '/reports' },
  { id: 'methodology', label: 'Methodology', href: '/methodology' },
];

export const ROUTES: readonly RouteDef[] = [
  { path: '/', title: 'Observatory overview', section: 'overview', summary: 'Source authority, headline canon indicators and entry points.' },
  { path: '/statistics', title: 'Statistical dashboard', section: 'statistics', summary: 'Production canon indicators, distributions and correlations.' },
  { path: '/statistics/scatter', title: 'Scatter explorer', section: 'statistics', summary: 'Compare any two indicators across nations.' },
  { path: '/countries', title: 'Countries', section: 'statistics', summary: 'Catalog and side-by-side comparison of modeled nations.' },
  { path: '/history', title: 'Historical dynamics', section: 'statistics', summary: 'Sparse canonical anchors from 1010 BAC to Year 0, never interpolated.' },
  { path: '/clustering', title: 'Clustering laboratory', section: 'analysis', summary: 'Seeded K-Means and DBSCAN with sufficiency gates.' },
  { path: '/anomalies', title: 'Anomalies and outliers', section: 'analysis', summary: 'Robust outlier review. An outlier is not a canon error.' },
  { path: '/qa', title: 'Quality assurance', section: 'analysis', summary: 'Deterministic invariants, evidence checks and source-declared issues.' },
  { path: '/drift', title: 'Source drift', section: 'drift', summary: 'Production versus remodeling, file and field level.' },
  { path: '/compare', title: 'Production versus remodeling', section: 'drift', summary: 'Proposed value changes side by side with production canon.' },
  { path: '/graph', title: 'Knowledge graph', section: 'knowledge', summary: 'Typed, evidence-backed relationships between sources and statistics.' },
  { path: '/impact', title: 'Impact explorer', section: 'knowledge', summary: 'Direct and transitive impact of a change.' },
  { path: '/reports', title: 'Report center', section: 'reports', summary: 'Eight equally selectable export formats with ZIP integrity.' },
  { path: '/releases', title: 'Analysis releases', section: 'reports', summary: 'Versioned, checksummed analysis outputs.' },
  { path: '/methodology', title: 'Methodology', section: 'methodology', summary: 'Definitions, statuses, rules and statistical methods.' },
];

export const SECTION_PAGES: Readonly<Record<SectionId, ReadonlyArray<{ href: string; label: string }>>> = {
  overview: [],
  statistics: [
    { href: '/statistics', label: 'Dashboard' },
    { href: '/statistics/scatter', label: 'Scatter' },
    { href: '/countries', label: 'Countries' },
    { href: '/history', label: 'History' },
  ],
  analysis: [
    { href: '/clustering', label: 'Clustering' },
    { href: '/anomalies', label: 'Anomalies' },
    { href: '/qa', label: 'QA' },
  ],
  drift: [
    { href: '/drift', label: 'Overview' },
    { href: '/compare', label: 'Compare' },
  ],
  knowledge: [
    { href: '/graph', label: 'Graph' },
    { href: '/impact', label: 'Impact' },
  ],
  reports: [
    { href: '/reports', label: 'Report center' },
    { href: '/releases', label: 'Releases' },
  ],
  methodology: [],
};

export const ECOSYSTEM = [
  { label: 'Reltroner Studio', href: 'https://reltroner.com', description: 'The fictional world of Asthortera and the systems behind it.' },
  { label: 'Reltroner Learning Academy', href: 'https://lms.reltroner.com', description: 'Courses and guided learning across the ecosystem.' },
] as const;

export function sectionFor(pathname: string): SectionId {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return 'overview';
  if (clean.startsWith('/statistics') || clean.startsWith('/countries') || clean.startsWith('/history')) return 'statistics';
  if (clean.startsWith('/clustering') || clean.startsWith('/anomalies') || clean.startsWith('/qa')) return 'analysis';
  if (clean.startsWith('/drift') || clean.startsWith('/compare')) return 'drift';
  if (clean.startsWith('/graph') || clean.startsWith('/impact')) return 'knowledge';
  if (clean.startsWith('/reports') || clean.startsWith('/releases')) return 'reports';
  if (clean.startsWith('/methodology')) return 'methodology';
  return 'overview';
}

export function isActive(pathname: string, href: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return href === '/' ? clean === '/' : clean === href || (href !== '/statistics' && clean.startsWith(`${href}/`));
}

/** File stem of the precomputed consolidated report of every finding. */
export const ALL_REPORT_STEM = 'reltroner-statistics-all-findings';
