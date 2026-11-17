/**
 * Visualization semantics for page mirrors. Each shaper reads the props Astro serialized for one
 * island (the exact data that island renders from) or, for islands that fetch their data, the same
 * published artifact they fetch, and returns typed tables with units, denominators, statuses, null
 * policy and pinned sources. Nothing is inferred from pixels or canvases.
 *
 * A shaper says whether the component's default view is reproduced. Anything computed in the
 * browser that is not reproduced here is named in `not_reproduced`, never implied.
 */
import type { DataSource, PageData, PageSnapshot } from '../../contracts/page-schemas.ts';
import { CALC_MODES, FORMULAS, LIMITS as CALC_LIMITS } from '../../domain/calculator.ts';
import type { Composition, CompositionSource } from '../../domain/composition.ts';
import type { KnowledgeGraph } from '../../domain/graph.ts';
import { IMPACT_UI, REMODEL_UI, SCATTER_UI, impactDefault } from './ui-defaults.ts';

export const DATA_ROW_CAP = 600;
type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;

export interface ReportFile { href: string; bytes: number }
/** Published artifacts for islands that fetch their data instead of receiving props. */
export interface ArtifactAccess {
  graph(): KnowledgeGraph;
  findings(): Array<Record<string, unknown>>;
  reportFiles(): ReportFile[];
  pdfCount(): number;
  indicatorRows(indicatorId: string): Row[] | null;
  datasetPath: string;
}
export interface ShapeContext { page_id: string; snapshot: PageSnapshot; access: ArtifactAccess }
export interface Shaped {
  data: PageData[];
  default_view: string | null;
  default_view_reproduced: boolean;
  not_reproduced: string[];
  known_unknowns?: string[];
}
export type Shaper = (props: Record<string, unknown>, ctx: ShapeContext) => Shaped;

const PROD_REPO = 'Reltroner/reltroner-studio';
/** Immutable GitHub blob URL at a pinned commit. */
const pinnedBlobUrl = (repository: string, commit: string, path: string) => `https://github.com/${repository}/blob/${commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : v === null || v === undefined ? null : String(v));
const cell = (v: unknown): Cell => (v === null || v === undefined ? null : typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' ? v : JSON.stringify(v));
const arr = <T = Record<string, unknown>>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const col = (key: string, label: string, unit: string | null = null) => ({ key, label, unit });

function data(d: Omit<PageData, 'rows_total' | 'truncated' | 'rows'> & { rows: Row[] }): PageData {
  return { ...d, rows: d.rows.slice(0, DATA_ROW_CAP), rows_total: d.rows.length, truncated: d.rows.length > DATA_ROW_CAP };
}
const productionDataset = (ctx: ShapeContext, pointer: string | null = null): DataSource => ({
  role: 'production', repository: PROD_REPO, commit_sha: ctx.snapshot.production_source_sha, path: ctx.access.datasetPath, pointer, line: null,
  url: ctx.snapshot.production_source_sha ? pinnedBlobUrl(PROD_REPO, ctx.snapshot.production_source_sha, ctx.access.datasetPath) : null,
});
const compositionSource = (s: CompositionSource, pointer: string | null): DataSource => ({ role: s.side, repository: s.repository, commit_sha: s.commit_sha, path: s.path, pointer, line: null, url: pinnedBlobUrl(s.repository, s.commit_sha, s.path) });
const analysis = (ctx: ShapeContext, path: string): DataSource => ({ role: 'analysis', repository: null, commit_sha: ctx.snapshot.statistics_commit, path, pointer: null, line: null, url: null });
const NULL_UNKNOWN = 'null means the source assigns no value: unknown, not zero.';

// ---------------------------------------------------------------- composition
const spatial: Shaper = (props) => {
  const c = props.data as Composition;
  const s = c.spatial;
  const src = c.sources.remodeling;
  const sources = (pointer: string | null) => (src ? [compositionSource(src, pointer)] : []);
  const surface: Row[] = []; const habitat: Row[] = []; const geometry: Row[] = [];
  for (const n of s.countries) {
    for (const r of n.surface) surface.push({ country_id: n.id, country: n.name, cohort: n.cohort, class: r.key, label: r.label, share_pct: r.pct, area_million_km2: r.area_million_km2, land_area_million_km2: n.land_area_million_km2, source_pointer: `${n.pointer}.spatial_3d_canon.land_surface_pct.${r.key}` });
    if (n.surface_status !== 'ASSIGNED') surface.push({ country_id: n.id, country: n.name, cohort: n.cohort, class: null, label: 'Not assigned', share_pct: null, area_million_km2: null, land_area_million_km2: n.land_area_million_km2, source_pointer: `${n.pointer}.spatial_3d_canon` });
    for (const r of n.habitats) habitat.push({ country_id: n.id, country: n.name, cohort: n.cohort, habitat: r.key, label: r.label, share_pct: r.pct, residents_billion: r.absolute_billion, population_billion: n.population_billion, source_pointer: `${n.pointer}.spatial_3d_canon.principal_habitat_pct.${r.key}` });
    if (n.habitat_status !== 'ASSIGNED') habitat.push({ country_id: n.id, country: n.name, cohort: n.cohort, habitat: null, label: 'Not assigned', share_pct: null, residents_billion: null, population_billion: n.population_billion, source_pointer: `${n.pointer}.spatial_3d_canon` });
    for (const g of n.geometry) geometry.push({ country_id: n.id, country: n.name, field: g.key, label: g.label, status: g.status === 'UNASSIGNED' ? 'INSUFFICIENT_DATA' : g.status, value: null });
  }
  const notMixed = 'Surface shares are of national terrestrial land area; habitat shares are of unique usual residents. The two have different denominators and must never be added, compared as one quantity or converted into km³.';
  return {
    default_view: 'The server renders the component\'s default selection (its first national record and the comparison nation); those headings and tables are in the sections of this mirror.',
    default_view_reproduced: true,
    not_reproduced: [],
    known_unknowns: c.unknowns,
    data: [
      data({
        data_id: 'data-spatial-surface-footprint', title: 'Terrestrial surface footprint by nation', component: 'SpatialExplorer', status: s.status, source_role: 'remodeling',
        description: `Share of each nation's terrestrial land in each surface class, and the implied area. From remodeling main (${s.authority}); production main carries ${s.production_spatial_records} spatial records.`,
        denominator: 'National terrestrial land area of the same remodeling record (land_area_million_km2).',
        columns: [col('country_id', 'Country id'), col('country', 'Country'), col('cohort', 'Cohort'), col('class', 'Surface class'), col('label', 'Label'), col('share_pct', 'Share of national land', '%'), col('area_million_km2', 'Area', 'million km²'), col('land_area_million_km2', 'National land area', 'million km²'), col('source_pointer', 'Source pointer')],
        rows: surface, null_policy: NULL_UNKNOWN, transforms: 'area = national land area × share ÷ 100 (the page\'s own derivation).', default_view: null, sources: sources(null), notes: [notMixed],
      }),
      data({
        data_id: 'data-spatial-home-habitat', title: 'Principal home habitat by nation', component: 'SpatialExplorer', status: s.status, source_role: 'remodeling',
        description: 'Share of each nation\'s unique usual residents by principal home habitat (surface land, underground, underwater, floating), and the implied residents.',
        denominator: 'Unique usual residents of the same remodeling record (population_billion).',
        columns: [col('country_id', 'Country id'), col('country', 'Country'), col('cohort', 'Cohort'), col('habitat', 'Habitat'), col('label', 'Label'), col('share_pct', 'Share of residents', '%'), col('residents_billion', 'Residents', 'billion'), col('population_billion', 'Unique usual residents', 'billion'), col('source_pointer', 'Source pointer')],
        rows: habitat, null_policy: NULL_UNKNOWN, transforms: 'residents = population × share ÷ 100 (the page\'s own derivation).', default_view: null, sources: sources(null), notes: [notMixed, 'Not land area, not density and not the urbanization rate.'],
      }),
      data({
        data_id: 'data-spatial-geometry', title: '3D geometry and volumes', component: 'SpatialExplorer', status: 'INSUFFICIENT_DATA', source_role: 'remodeling',
        description: 'Geometric fields the page lists per nation. Unassigned fields have no value in any source.',
        denominator: null, columns: [col('country_id', 'Country id'), col('country', 'Country'), col('field', 'Field'), col('label', 'Label'), col('status', 'Status'), col('value', 'Value')],
        rows: geometry, null_policy: 'Every value is null because the source assigns none; null is unknown, not zero. No polygon, km³ or capacity is estimated.', transforms: null, default_view: null, sources: sources(null), notes: [],
      }),
    ],
  };
};

const ancestry: Shaper = (props) => {
  const c = props.data as Composition;
  const a = c.ancestry;
  const prod = c.sources.production;
  const national: Row[] = []; const missing: Row[] = []; const remodel: Row[] = [];
  for (const n of a.countries) {
    if (n.status === 'ASSIGNED') for (const r of n.rows) national.push({ country_id: n.id, country: n.name, cohort: n.cohort, category: r.key, label: r.label, share_pct: r.pct, residents_billion: r.absolute_billion, population_billion: n.population_billion, source_pointer: `${n.pointer}.ancestry_primary_pct.${r.key}` });
    else missing.push({ country_id: n.id, country: n.name, cohort: n.cohort, population_billion: n.population_billion, status: 'INSUFFICIENT_DATA', source_pointer: `${n.pointer}.ancestry_primary_pct` });
    if (n.remodeling.status === 'DIFFERENT') for (const r of n.remodeling.rows) remodel.push({ country_id: n.id, country: n.name, category: r.key, label: r.label, share_pct: r.pct, residents_billion: r.absolute_billion, status: 'PROPOSED' });
  }
  const notSpecies = 'Primary ancestry is not a biological species classification; the source records no species taxonomy.';
  const blocks: PageData[] = [
    data({
      data_id: 'data-ancestry-planet-benchmark', title: 'Planetary primary ancestry benchmark', component: 'AncestryExplorer', status: a.pct_status, source_role: 'production',
      description: `${a.planet.method}: shares of the ${a.planet.population_billion} billion residents. ${a.planet.provenance_note}`,
      denominator: `Reference population of ${a.planet.reference_population_billion} billion (the 14 profiled nations), not a census of all ${a.planet.sovereign_states} states.`,
      columns: [col('category', 'Category'), col('label', 'Label'), col('share_pct', 'Share', '%'), col('residents_billion', 'Residents', 'billion')],
      rows: a.planet.rows.map((r) => ({ category: r.key, label: r.label, share_pct: r.pct, residents_billion: r.absolute_billion })), null_policy: NULL_UNKNOWN,
      transforms: `Residents: ${a.absolute_formula} (status ${a.absolute_status}); headcount source ${a.planet.headcount_source}.`, default_view: null, sources: [compositionSource(prod, a.planet.pointer)], notes: [notSpecies],
    }),
    data({
      data_id: 'data-ancestry-national', title: 'National primary ancestry shares', component: 'AncestryExplorer', status: a.pct_status, source_role: 'production',
      description: `Six shares per nation that assign them (${a.coverage.assigned} nations), closing to 100% each.`, denominator: 'Residents of the same nation (population_billion, production main, Year 0).',
      columns: [col('country_id', 'Country id'), col('country', 'Country'), col('cohort', 'Cohort'), col('category', 'Category'), col('label', 'Label'), col('share_pct', 'Share', '%'), col('residents_billion', 'Residents', 'billion'), col('population_billion', 'Population', 'billion'), col('source_pointer', 'Source pointer')],
      rows: national, null_policy: NULL_UNKNOWN, transforms: `Residents: ${a.absolute_formula} (status ${a.absolute_status}). Not enumerated headcounts.`, default_view: null, sources: [compositionSource(prod, null)], notes: [notSpecies],
    }),
    data({
      data_id: 'data-ancestry-not-assigned', title: 'Nations without national ancestry shares', component: 'AncestryExplorer', status: 'INSUFFICIENT_DATA', source_role: 'production',
      description: `${a.coverage.not_assigned} nations without national shares; ${a.coverage.residual_states} further states form one aggregate of ${a.coverage.residual_population_billion} billion residents, not separate records.`,
      denominator: null, columns: [col('country_id', 'Country id'), col('country', 'Country'), col('cohort', 'Cohort'), col('population_billion', 'Population', 'billion'), col('status', 'Status'), col('source_pointer', 'Source pointer')],
      rows: missing, null_policy: 'Missing shares are unknown, not zero, and are not filled from the planetary benchmark.', transforms: null, default_view: null, sources: [compositionSource(prod, null)], notes: [],
    }),
  ];
  if (remodel.length && c.sources.remodeling) {
    blocks.push(data({
      data_id: 'data-ancestry-remodeling-differences', title: 'Remodeling proposals that differ from production', component: 'AncestryExplorer', status: 'PROPOSED', source_role: 'remodeling',
      description: 'National shares that remodeling main records differently. Proposals, never canon.', denominator: null,
      columns: [col('country_id', 'Country id'), col('country', 'Country'), col('category', 'Category'), col('label', 'Label'), col('share_pct', 'Share', '%'), col('residents_billion', 'Residents', 'billion'), col('status', 'Status')],
      rows: remodel, null_policy: NULL_UNKNOWN, transforms: null, default_view: null, sources: [compositionSource(c.sources.remodeling, null)], notes: [],
    }));
  }
  return { default_view: 'The server renders the component\'s default selection; its headings and tables are in the sections of this mirror.', default_view_reproduced: true, not_reproduced: [], known_unknowns: c.unknowns, data: blocks };
};

// ---------------------------------------------------------------- indicator table islands
interface IndicatorMeta { id: string; label: string; unit: string; group: string; derivation: string }
interface NationRow { id: string; name: string; cohort: string; values: Record<string, number | null>; states: Record<string, string> }
function nationValues(rows: NationRow[], indicators: IndicatorMeta[], ctx: ShapeContext, component: string): PageData {
  const states = [...new Set(rows.flatMap((r) => Object.values(r.states ?? {})))].sort();
  return data({
    data_id: 'data-nation-values', title: 'Year 0 values by nation', component, status: 'CANON_OBSERVED', source_role: 'production',
    description: `Production main values at Year 0 for ${rows.length} nations and ${indicators.length} indicators. Per-value states in the source: ${states.join(', ') || 'none'}.`,
    denominator: null,
    columns: [col('id', 'Entity id'), col('name', 'Nation'), col('cohort', 'Cohort'), ...indicators.map((i) => col(i.id, i.label, i.unit))],
    rows: rows.map((r) => ({ id: r.id, name: r.name, cohort: r.cohort, ...Object.fromEntries(indicators.map((i) => [i.id, num(r.values?.[i.id])])) })),
    null_policy: NULL_UNKNOWN, transforms: null, default_view: null, sources: [productionDataset(ctx)], notes: ['Derived indicators (derivation DERIVED) are CANON_DERIVED; assigned ones are CANON_OBSERVED. See each indicator page for per-value status and pointer.'],
  });
}
const distribution: Shaper = (props, ctx) => {
  const indicators = arr<IndicatorMeta>(props.indicators);
  const desc = obj(props.descriptive);
  const rows: Row[] = [];
  for (const i of indicators) for (const cohort of ['PROFILED_14', 'ALL_19']) {
    const d = obj(obj(desc[i.id])[cohort]);
    if (!Object.keys(d).length) continue;
    rows.push({ indicator: i.id, label: i.label, unit: i.unit, cohort, status: str(d.status), n: num(d.n), n_missing: num(d.n_missing), mean: num(d.mean), median: num(d.median), std: num(d.std), min: num(d.min), q1: num(d.q1), q3: num(d.q3), max: num(d.max), outliers: arr(d.outliers).map((o) => str(obj(o).entity_id)).join(' ') || null, reason: str(d.reason) });
  }
  return {
    default_view: 'Distribution charts per indicator and cohort, drawn in the browser from these values.', default_view_reproduced: true, not_reproduced: [],
    data: [nationValues(arr<NationRow>(props.rows), indicators, ctx, 'DistributionExplorer'), data({
      data_id: 'data-descriptive-statistics', title: 'Descriptive statistics by indicator and cohort', component: 'DistributionExplorer', status: 'MODEL_ESTIMATE', source_role: 'statistics_generated',
      description: 'Computed by the Statistics analytics step from the Year 0 values. Exploratory analysis, not canon.', denominator: null,
      columns: [col('indicator', 'Indicator'), col('label', 'Label'), col('unit', 'Unit'), col('cohort', 'Cohort'), col('status', 'Status'), col('n', 'n'), col('n_missing', 'Missing'), col('mean', 'Mean'), col('median', 'Median'), col('std', 'Std'), col('min', 'Min'), col('q1', 'Q1'), col('q3', 'Q3'), col('max', 'Max'), col('outliers', 'Outlier entities'), col('reason', 'Reason')],
      rows, null_policy: 'null where the statistic is not computed (see status and reason).', transforms: 'Sample statistics; quartiles by the analytics step\'s method.', default_view: null, sources: [analysis(ctx, '/ai/manifest.json')], notes: [],
    })],
  };
};
const treemap: Shaper = (props, ctx) => ({
  default_view: 'Treemap of each entity\'s share of planetary GDP.', default_view_reproduced: true, not_reproduced: [],
  data: [data({
    data_id: 'data-gdp-shares', title: 'Share of planetary GDP', component: 'GdpTreemap', status: 'CANON_OBSERVED', source_role: 'production', description: 'Share of planetary GDP at Year 0, production main.', denominator: 'Planetary nominal GDP.',
    columns: [col('id', 'Entity id'), col('name', 'Entity'), col('share', 'Share', 'ratio of planetary GDP'), col('cohort', 'Cohort')],
    rows: arr(props.items).map((i) => ({ id: str(i.id), name: str(i.name), share: num(i.share), cohort: str(i.cohort) })), null_policy: NULL_UNKNOWN, transforms: null, default_view: null, sources: [productionDataset(ctx)], notes: [],
  })],
});
const correlation: Shaper = (props, ctx) => {
  const features = arr<string>(props.features);
  const labels = arr<string>(props.labels);
  const pearson = arr<number[]>(props.pearson); const spearman = arr<number[]>(props.spearman); const n = arr<number[]>(props.pairwise_n);
  const rows: Row[] = [];
  features.forEach((a, i) => features.forEach((b, j) => { if (j >= i) rows.push({ feature_a: a, feature_b: b, label_a: labels[i] ?? a, label_b: labels[j] ?? b, pearson: num(pearson[i]?.[j]), spearman: num(spearman[i]?.[j]), pairwise_n: num(n[i]?.[j]) }); }));
  return {
    default_view: 'Correlation heatmap of the listed features.', default_view_reproduced: true, not_reproduced: [],
    data: [data({
      data_id: 'data-correlations', title: 'Correlation matrix (upper triangle)', component: 'CorrelationHeatmap', status: 'MODEL_ESTIMATE', source_role: 'statistics_generated',
      description: `Status ${str(props.status)}, cohort ${str(props.cohort)}, n ${num(props.n)}, minimum pairwise n ${num(props.min_pairwise_n)}. A correlation is not a cause.`, denominator: null,
      columns: [col('feature_a', 'Feature A'), col('feature_b', 'Feature B'), col('label_a', 'Label A'), col('label_b', 'Label B'), col('pearson', 'Pearson r'), col('spearman', 'Spearman ρ'), col('pairwise_n', 'Pairwise n')],
      rows, null_policy: 'null where a coefficient is undefined.', transforms: 'Pearson and Spearman coefficients over pairwise-complete cases.', default_view: null, sources: [analysis(ctx, '/ai/manifest.json')], notes: [],
    })],
  };
};
const scatter: Shaper = (props, ctx) => {
  const rows = arr<NationRow>(props.rows);
  const indicators = arr<IndicatorMeta>(props.indicators);
  const label = (id: string) => indicators.find((i) => i.id === id);
  const points = rows.map((r) => ({ id: r.id, name: r.name, cohort: r.cohort, x: num(r.values?.[SCATTER_UI.x]), y: num(r.values?.[SCATTER_UI.y]), size: num(r.values?.[SCATTER_UI.size]) }));
  return {
    default_view: `x = ${SCATTER_UI.x}, y = ${SCATTER_UI.y}, point size = ${SCATTER_UI.size}, cohort ${SCATTER_UI.cohort}.`, default_view_reproduced: true, not_reproduced: [],
    data: [
      data({
        data_id: 'data-scatter-default-view', title: 'Default scatter view', component: 'ScatterExplorer', status: 'CANON_OBSERVED', source_role: 'production', description: 'The points the explorer plots before any axis is changed.', denominator: null,
        columns: [col('id', 'Entity id'), col('name', 'Nation'), col('cohort', 'Cohort'), col('x', label(SCATTER_UI.x)?.label ?? SCATTER_UI.x, label(SCATTER_UI.x)?.unit ?? null), col('y', label(SCATTER_UI.y)?.label ?? SCATTER_UI.y, label(SCATTER_UI.y)?.unit ?? null), col('size', label(SCATTER_UI.size)?.label ?? SCATTER_UI.size, label(SCATTER_UI.size)?.unit ?? null)],
        rows: points, null_policy: `${NULL_UNKNOWN} A nation with a null coordinate is not plotted.`, transforms: null, default_view: `x=${SCATTER_UI.x}; y=${SCATTER_UI.y}; size=${SCATTER_UI.size}; cohort=${SCATTER_UI.cohort}`, sources: [productionDataset(ctx)], notes: ['A visual association is not a cause.'],
      }),
      nationValues(rows, indicators, ctx, 'ScatterExplorer'),
    ],
  };
};
const countryCompare: Shaper = (props, ctx) => {
  const rows = arr<NationRow>(props.rows);
  const indicators = arr<IndicatorMeta>(props.indicators);
  const initial = arr<string>(props.initial);
  const pick = initial.map((id) => rows.find((r) => r.id === id)).filter((r): r is NationRow => !!r);
  return {
    default_view: `Side-by-side comparison of ${pick.map((r) => r.name).join(' and ')}.`, default_view_reproduced: true, not_reproduced: [],
    data: [
      data({
        data_id: 'data-country-compare-default', title: `Default comparison: ${pick.map((r) => r.name).join(' versus ')}`, component: 'CountryCompare', status: 'CANON_OBSERVED', source_role: 'production', description: 'The comparison the page opens with, one row per indicator.', denominator: null,
        columns: [col('indicator', 'Indicator'), col('label', 'Label'), col('unit', 'Unit'), ...pick.map((r) => col(r.id, r.name))],
        rows: indicators.map((i) => ({ indicator: i.id, label: i.label, unit: i.unit, ...Object.fromEntries(pick.map((r) => [r.id, num(r.values?.[i.id])])) })), null_policy: NULL_UNKNOWN, transforms: null, default_view: initial.join(' vs '), sources: [productionDataset(ctx)], notes: [],
      }),
      nationValues(rows, indicators, ctx, 'CountryCompare'),
    ],
  };
};
const history: Shaper = (props, ctx) => ({
  default_view: 'Sparse historical anchors on a BAC timeline; nothing is interpolated between them.', default_view_reproduced: true, not_reproduced: [],
  data: [
    data({
      data_id: 'data-history-anchors', title: 'Historical source values', component: 'HistoryExplorer', status: 'MIXED', source_role: 'production', description: 'Values the source states at years before Year 0, each with its own status and quoted line.', denominator: null,
      columns: [col('entity_id', 'Entity id'), col('entity', 'Entity'), col('indicator', 'Indicator'), col('label', 'Label'), col('year_bac', 'Year', 'BAC'), col('value', 'Value'), col('unit', 'Unit'), col('status', 'Status'), col('path', 'Source path'), col('line', 'Line'), col('commit', 'Commit')],
      rows: arr(props.points).map((p) => ({ entity_id: str(p.entity_id), entity: str(p.entity), indicator: str(p.indicator), label: str(p.label), year_bac: num(p.year), value: num(p.value), unit: str(p.unit), status: str(p.status), path: str(p.path), line: num(p.line), commit: str(p.commit) })),
      null_policy: NULL_UNKNOWN, transforms: null, default_view: null, sources: [{ role: 'production', repository: PROD_REPO, commit_sha: ctx.snapshot.production_source_sha, path: null, pointer: null, line: null, url: null }], notes: ['A value with status SCENARIO is a source-labeled scenario, not an observation.', 'Years between anchors carry no observations.'],
    }),
    data({
      data_id: 'data-history-timeline', title: 'Timeline periods', component: 'HistoryExplorer', status: 'CANON_OBSERVED', source_role: 'production', description: 'Named periods and events the timeline draws.', denominator: null,
      columns: [col('id', 'Id'), col('label', 'Label'), col('start_bac', 'Start', 'BAC'), col('end_bac', 'End', 'BAC'), col('kind', 'Kind'), col('entity_id', 'Entity id')],
      rows: arr(props.timeline).map((t) => ({ id: str(t.id), label: str(t.label), start_bac: num(t.start), end_bac: num(t.end), kind: str(t.kind), entity_id: str(t.entity_id) })), null_policy: NULL_UNKNOWN, transforms: null, default_view: null, sources: [productionDataset(ctx)], notes: [],
    }),
  ],
});
const cluster: Shaper = (props, ctx) => {
  const c = obj(props.clustering);
  const names = obj(props.names);
  const km = obj(c.kmeans);
  const k = num(km.recommended_k);
  const run = arr(km.runs).find((r) => num(r.k) === k);
  const kLabels = obj(run?.labels);
  const db = arr(obj(c.dbscan).labels);
  const ids = [...new Set([...Object.keys(kLabels), ...db.map((l) => str(l.entity_id) ?? '')])].filter(Boolean).sort();
  return {
    default_view: `K-Means with the recommended k = ${k ?? 'n/a'} and DBSCAN labels.`, default_view_reproduced: true, not_reproduced: [],
    data: [data({
      data_id: 'data-clustering', title: 'Cluster assignments', component: 'ClusterLab', status: 'MODEL_ESTIMATE', source_role: 'statistics_generated',
      description: `Status ${str(c.status)}, cohort ${str(c.cohort)}, n ${num(c.n)}, scaling ${str(c.scaling)}. Seeded exploratory clustering, not canon.`, denominator: null,
      columns: [col('entity_id', 'Entity id'), col('name', 'Name'), col('kmeans_cluster', `K-Means cluster (k=${k ?? 'n/a'})`), col('dbscan_label', 'DBSCAN label')],
      rows: ids.map((id) => ({ entity_id: id, name: str(names[id]) ?? id, kmeans_cluster: cell(kLabels[id]), dbscan_label: cell(db.find((l) => l.entity_id === id)?.label) })),
      null_policy: 'null where an entity was not clustered.', transforms: `K-Means random_state ${num(km.random_state)}, n_init ${num(km.n_init)}; selection: ${str(km.selection_rule)}.`, default_view: null, sources: [analysis(ctx, '/ai/manifest.json')], notes: [],
    })],
  };
};
const mlTrees: Shaper = (props, ctx) => {
  const d = obj(props.decisionTrees);
  return {
    default_view: 'Supervised decision tree tasks with their sufficiency gates.', default_view_reproduced: true, not_reproduced: [],
    data: [data({
      data_id: 'data-ml-decision-tree-tasks', title: 'Supervised decision tree tasks', component: 'DecisionTreeAnalyticsView', status: 'MODEL_ESTIMATE', source_role: 'statistics_generated',
      description: `Overall status ${str(d.status)}. Policy: ${str(obj(d.policy).rule) ?? ''}`, denominator: null,
      columns: [col('task_id', 'Task'), col('kind', 'Kind'), col('target', 'Target'), col('cohort', 'Cohort'), col('n_rows', 'Rows'), col('n_complete', 'Complete rows'), col('status', 'Status'), col('reasons', 'Reasons'), col('model', 'Model')],
      rows: arr(d.tasks).map((t) => ({ task_id: str(t.task_id), kind: str(t.kind), target: str(t.target), cohort: str(t.cohort), n_rows: num(t.n_rows), n_complete: num(t.n_complete), status: str(t.status), reasons: arr<string>(t.reasons).join(' '), model: t.model ? 'trained' : null })),
      null_policy: 'model is null when the sufficiency gate refused training.', transforms: null, default_view: null, sources: [analysis(ctx, '/ai/manifest.json')], notes: [],
    })],
  };
};

// ---------------------------------------------------------------- creative and decisions
interface Entity { id: string; kind: string; name: string; canon_status: string; source_side: string; source_path: string; evidence_line: number | null }
interface Relationship { type: string; verification: string }
function entityTable(entities: Entity[], component: string, ctx: ShapeContext): PageData {
  return data({
    data_id: 'data-narrative-entities', title: 'Narrative entities', component, status: 'MIXED', source_role: 'mixed', description: 'Source-grounded narrative entities with their canon status and source locator.', denominator: null,
    columns: [col('id', 'Entity id'), col('kind', 'Kind'), col('name', 'Name'), col('canon_status', 'Status'), col('source_side', 'Source side'), col('source_path', 'Source path'), col('line', 'Line')],
    rows: entities.map((e) => ({ id: e.id, kind: e.kind, name: e.name, canon_status: e.canon_status, source_side: e.source_side, source_path: e.source_path, line: e.evidence_line })), null_policy: 'line is null when the source is a dataset pointer, not a line.', transforms: null, default_view: null,
    sources: [{ role: 'production', repository: PROD_REPO, commit_sha: ctx.snapshot.production_source_sha, path: null, pointer: null, line: null, url: null }], notes: ['Entities on the remodeling side are proposals.'],
  });
}
function relationshipCounts(rels: Relationship[], component: string, ctx: ShapeContext): PageData {
  const counts = new Map<string, number>();
  for (const r of rels) counts.set(`${r.type}|${r.verification}`, (counts.get(`${r.type}|${r.verification}`) ?? 0) + 1);
  return data({
    data_id: 'data-relationship-counts', title: 'Relationships by type and verification', component, status: 'MIXED', source_role: 'mixed', description: 'CANDIDATE_HYPOTHESIS links come from name co-occurrence and are review leads, not relationships.', denominator: null,
    columns: [col('type', 'Type'), col('verification', 'Verification'), col('count', 'Count')],
    rows: [...counts].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, n]) => ({ type: k.split('|')[0]!, verification: k.split('|')[1]!, count: n })), null_policy: 'Not applicable.', transforms: 'Counted from the component\'s relationship list.', default_view: null,
    sources: [analysis(ctx, '/data/creative.json')], notes: ['A mention or co-occurrence is not a cause.'],
  });
}
const narrativeExplorer: Shaper = (props, ctx) => ({
  default_view: 'Entity list with the first entity\'s details; the multi-layer graph is drawn in the browser.', default_view_reproduced: true, not_reproduced: ['Graph layout and positions are computed in the browser.'],
  data: [entityTable(arr<Entity>(props.entities), 'NarrativeGraphExplorer', ctx), relationshipCounts(arr<Relationship>(props.relationships), 'NarrativeGraphExplorer', ctx)],
});
const auditExplorer: Shaper = (props, ctx) => ({
  default_view: 'All narrative audit findings, filterable by classification.', default_view_reproduced: true, not_reproduced: [],
  data: [data({
    data_id: 'data-audit-findings', title: 'Narrative audit findings', component: 'ConsistencyAuditExplorer', status: 'MIXED', source_role: 'mixed', description: 'Classified review candidates. INTENTIONAL_AMBIGUITY and UNRELIABLE_NARRATOR_POSSIBILITY are storytelling choices, not defects; only is_defect marks a problem.', denominator: null,
    columns: [col('id', 'Finding id'), col('category', 'Category'), col('classification', 'Classification'), col('severity', 'Severity'), col('is_defect', 'Is defect'), col('title', 'Title'), col('affected_entities', 'Affected entities'), col('first_passage', 'First passage')],
    rows: arr(props.findings).map((f) => { const p = obj(arr(f.passages)[0]); return { id: str(f.id), category: str(f.category), classification: str(f.classification), severity: str(f.severity), is_defect: f.is_defect === true, title: str(f.title), affected_entities: arr<string>(f.affected_entities).join(' '), first_passage: p.path ? `${str(p.path)}${p.line ? `:${num(p.line)}` : ''}` : null }; }),
    null_policy: 'Not applicable.', transforms: null, default_view: null, sources: [analysis(ctx, '/data/creative.json')], notes: ['Trace a passage with trace_evidence using <finding id>#<position>.'],
  })],
});
const refactorWorkspace: Shaper = (props, ctx) => ({
  default_view: 'Refactoring plans with before/after structure; the first plan is selected.', default_view_reproduced: true, not_reproduced: [],
  data: [data({
    data_id: 'data-refactoring-plans', title: 'Story refactoring plans', component: 'StoryRefactorWorkspace', status: 'PROPOSED', source_role: 'mixed', description: 'Non-destructive restructuring proposals for the creator. None is applied.', denominator: null,
    columns: [col('id', 'Plan id'), col('operation', 'Operation'), col('title', 'Title'), col('decision_status', 'Decision status'), col('canon_status', 'Canon status'), col('affected_documents', 'Affected documents'), col('affected_entities', 'Affected entities')],
    rows: arr(props.plans).map((p) => ({ id: str(p.id), operation: str(p.operation), title: str(p.title), decision_status: str(p.decision_status), canon_status: str(p.canon_status), affected_documents: arr(p.affected_documents).length, affected_entities: arr<string>(p.affected_entities).join(' ') })),
    null_policy: 'Not applicable.', transforms: null, default_view: null, sources: [analysis(ctx, '/data/creative.json')], notes: [],
  })],
});
const ideation: Shaper = (props, ctx) => ({
  default_view: 'Evidence-grounded opportunities and seed proposals; nothing is focused until an entity is chosen.', default_view_reproduced: false,
  not_reproduced: ['Brainstorm suggestions the workspace composes in the browser.', 'Private proposals kept in this browser\'s session storage.'],
  data: [
    data({
      data_id: 'data-opportunities', title: 'Worldbuilding opportunities', component: 'IdeationWorkspace', status: 'HYPOTHESIS', source_role: 'mixed', description: 'Opportunities anchored to quoted source passages. Hypotheses for the creator, not canon.', denominator: null,
      columns: [col('id', 'Opportunity id'), col('category', 'Category'), col('title', 'Title'), col('narrative_question', 'Question'), col('affected_entities', 'Affected entities'), col('anchors', 'Anchors')],
      rows: arr(props.opportunities).map((o) => ({ id: str(o.id), category: str(o.category), title: str(o.title), narrative_question: str(o.narrative_question), affected_entities: arr<string>(o.affected_entities).join(' '), anchors: arr(o.canon_anchors).length })),
      null_policy: 'Not applicable.', transforms: null, default_view: null, sources: [analysis(ctx, '/data/creative.json')], notes: ['Every item is HYPOTHESIS / UNRATIFIED. Only the creator changes canon.'],
    }),
    data({
      data_id: 'data-seed-proposals', title: 'Seed proposals', component: 'IdeationWorkspace', status: 'PROPOSED', source_role: 'mixed', description: 'Proposals generated from scenarios, opportunities and audit findings, with their review and canon status.', denominator: null,
      columns: [col('proposal_id', 'Proposal id'), col('title', 'Title'), col('proposal_type', 'Type'), col('review_status', 'Review status'), col('canon_status', 'Canon status'), col('originating_entities', 'Originating entities')],
      rows: arr(props.seedProposals).map((p) => ({ proposal_id: str(p.proposal_id), title: str(p.title), proposal_type: str(p.proposal_type), review_status: str(p.review_status), canon_status: str(p.canon_status), originating_entities: arr<string>(p.originating_entities).join(' ') })),
      null_policy: 'Not applicable.', transforms: null, default_view: null, sources: [analysis(ctx, '/data/creative.json')], notes: [],
    }),
  ],
});
const remodelLab: Shaper = (props, ctx) => {
  const scenarios = arr(props.scenarios);
  const mode = str(props.defaultMode) ?? 'remodel';
  return {
    default_view: `Mode ${mode}; scenario ${str(scenarios[0]?.id) ?? 'none'} selected; origin ${REMODEL_UI.origin}.`,
    default_view_reproduced: false,
    not_reproduced: ['Comparison panels and the impact simulation computed in the browser for the selected scenario and origin.'],
    data: [data({
      data_id: 'data-remodel-scenarios', title: 'Remodeling scenarios', component: 'CanonRemodelLab', status: 'PROPOSED', source_role: 'mixed', description: 'Isolated comparisons between production canon, remodeling candidates and hypotheses. None is applied.', denominator: null,
      columns: [col('id', 'Scenario id'), col('title', 'Title'), col('question', 'Question'), col('canon_status', 'Canon status'), col('focus_entities', 'Focus entities'), col('production_baseline', 'Production baseline'), col('remodeling_candidate', 'Remodeling candidate')],
      rows: scenarios.map((s) => ({ id: str(s.id), title: str(s.title), question: str(s.question), canon_status: str(s.canon_status), focus_entities: arr<string>(s.focus_entities).join(' '), production_baseline: str(obj(s.production_baseline).summary), remodeling_candidate: str(obj(s.remodeling_candidate).summary) })),
      null_policy: 'null where a scenario has no remodeling candidate summary.', transforms: null, default_view: `selected=${str(scenarios[0]?.id) ?? 'none'}`, sources: [analysis(ctx, '/data/creative.json')], notes: ['Scenario outcomes are hypotheses, not events.'],
    })],
  };
};
const decisionWorkspace: Shaper = (props, ctx) => {
  const trees = [...arr(props.trees), ...arr(props.modelTrees)];
  const first = trees[0];
  const paths = arr(props.paths);
  return {
    default_view: `Tree ${str(first?.tree_id) ?? 'none'} selected; no branch chosen.`, default_view_reproduced: true, not_reproduced: [],
    data: [
      data({
        data_id: 'data-decision-trees', title: 'Decision trees', component: 'DecisionTreeWorkspace', status: 'MIXED', source_role: 'mixed', description: 'Source-grounded review aids. An outcome is a recommendation for a reviewer; no canon is changed.', denominator: null,
        columns: [col('tree_id', 'Tree id'), col('tree_type', 'Type'), col('title', 'Title'), col('question', 'Question'), col('nodes', 'Nodes'), col('branches', 'Branches'), col('paths', 'Precomputed paths'), col('creator_review_status', 'Review status'), col('canon_status', 'Canon status')],
        rows: trees.map((t) => ({ tree_id: str(t.tree_id), tree_type: str(t.tree_type), title: str(t.title), question: str(t.question), nodes: arr(t.nodes).length, branches: arr(t.branches).length, paths: paths.filter((p) => p.tree_id === t.tree_id).length, creator_review_status: str(t.creator_review_status), canon_status: str(t.canon_status) })),
        null_policy: 'Not applicable.', transforms: null, default_view: null, sources: [analysis(ctx, '/data/decisions.json')], notes: ['Walk a tree with evaluate_decision_tree; a creator choice is never a system recommendation.'],
      }),
      data({
        data_id: 'data-decision-default-tree', title: `Nodes of the default tree ${str(first?.tree_id) ?? ''}`.trim(), component: 'DecisionTreeWorkspace', status: str(first?.canon_status) ?? 'MIXED', source_role: 'mixed', description: str(first?.question) ?? '', denominator: null,
        columns: [col('id', 'Node id'), col('type', 'Node type'), col('label', 'Label'), col('question', 'Question')],
        rows: arr(first?.nodes).map((n) => ({ id: str(n.id), type: str(n.type ?? n.node_type), label: str(n.label), question: str(n.question) })), null_policy: 'null where a node has no question.', transforms: null, default_view: 'selected tree', sources: [analysis(ctx, '/data/decisions.json')], notes: [],
      }),
    ],
  };
};

// ---------------------------------------------------------------- drift, graph, reports, tools
const findingExport: Shaper = (props) => {
  const f = obj(props.finding);
  const prov = obj(f.provenance);
  const side = (k: 'production' | 'remodeling'): DataSource[] => { const p = obj(prov[k]); return p.commit_sha ? [{ role: k, repository: str(p.repository), commit_sha: str(p.commit_sha), path: str(p.path), pointer: str(f.locator), line: null, url: str(p.repository) && str(p.path) ? pinnedBlobUrl(str(p.repository)!, str(p.commit_sha)!, str(p.path)!) : null }] : []; };
  const value = (k: 'production' | 'remodeling') => { const v = obj(f[k]); return v.present ? cell(v.value) : null; };
  const rows: Row[] = [
    ...['id', 'level', 'classification', 'change_type', 'review_status', 'priority', 'title', 'file_path', 'file_kind', 'locator', 'field', 'unit', 'production_canon_status', 'content_nature', 'recommendation', 'rule'].map((k) => ({ field: k, value: cell(f[k]) })),
    { field: 'entity', value: f.entity ? `${str(obj(f.entity).kind)}: ${str(obj(f.entity).name)}` : null },
    { field: 'production.present', value: obj(f.production).present === true }, { field: 'production.value', value: value('production') },
    { field: 'remodeling.present', value: obj(f.remodeling).present === true }, { field: 'remodeling.value', value: value('remodeling') },
    { field: 'numeric_delta.absolute', value: num(obj(f.numeric_delta).absolute) }, { field: 'numeric_delta.relative', value: num(obj(f.numeric_delta).relative) },
  ];
  return {
    default_view: 'The finding page itself; the component offers exports of this finding.', default_view_reproduced: true, not_reproduced: [],
    data: [data({
      data_id: 'data-finding', title: `Finding ${str(f.id)}`, component: null, status: str(f.review_status) ?? 'UNKNOWN', source_role: 'mixed',
      description: 'Production main is canon; remodeling main is a proposal. A difference is a review candidate, not proof that either side is wrong.', denominator: null,
      columns: [col('field', 'Field'), col('value', 'Value')], rows, null_policy: 'null where the field is absent on that side; absent is not zero.', transforms: null, default_view: null,
      sources: [...side('production'), ...side('remodeling')], notes: ['Remodeling values are never promoted to canon here.'],
    })],
  };
};
const findingsExplorer: Shaper = (_props, ctx) => {
  const PRIORITY = (p: unknown) => (typeof p === 'string' ? p : 'P9');
  const findings = ctx.access.findings().map((f, i) => ({ f, i })).sort((a, b) => (PRIORITY(a.f.priority) < PRIORITY(b.f.priority) ? -1 : PRIORITY(a.f.priority) > PRIORITY(b.f.priority) ? 1 : a.i - b.i)).map((x) => x.f);
  return {
    default_view: 'All findings, sorted by priority (the explorer\'s default sort), no filter.', default_view_reproduced: true, not_reproduced: [],
    data: [data({
      data_id: 'data-findings', title: 'Source drift findings', component: 'FindingsExplorer', status: 'MIXED', source_role: 'mixed', description: 'Production versus remodeling findings as published in /data/findings.json, which the explorer loads in the browser.', denominator: null,
      columns: [col('id', 'Finding id'), col('priority', 'Priority'), col('level', 'Level'), col('classification', 'Classification'), col('review_status', 'Review status'), col('change_type', 'Change type'), col('file_path', 'File'), col('title', 'Title')],
      rows: findings.map((f) => ({ id: str(f.id), priority: str(f.priority), level: str(f.level), classification: str(f.classification), review_status: str(f.review_status), change_type: str(f.change_type), file_path: str(f.file_path), title: str(f.title) })),
      null_policy: 'Not applicable.', transforms: 'Stable sort by priority over the published order.', default_view: 'sort=priority ascending', sources: [analysis(ctx, '/data/findings.json')], notes: ['Each finding has its own page /drift/<id>/ and mirror.'],
    })],
  };
};
const graphExplorer: Shaper = (_props, ctx) => {
  const g = ctx.access.graph();
  const nodeTypes = new Map<string, number>(); const edgeTypes = new Map<string, number>();
  for (const n of g.nodes) nodeTypes.set(n.type, (nodeTypes.get(n.type) ?? 0) + 1);
  for (const e of g.edges) edgeTypes.set(`${e.type}|${e.status}|${e.side}`, (edgeTypes.get(`${e.type}|${e.status}|${e.side}`) ?? 0) + 1);
  return {
    default_view: 'Interactive graph loaded from /data/graph.json in the browser.', default_view_reproduced: false, not_reproduced: ['Node positions, layout and the interactive selection are computed in the browser; the graph itself is summarized here and readable through analyze_narrative_impact.'],
    data: [
      data({ data_id: 'data-graph-node-types', title: 'Graph nodes by type', component: 'GraphExplorer', status: 'MIXED', source_role: 'mixed', description: `${g.nodes.length} nodes.`, denominator: null, columns: [col('type', 'Node type'), col('count', 'Count')], rows: [...nodeTypes].sort(([a], [b]) => (a < b ? -1 : 1)).map(([type, count]) => ({ type, count })), null_policy: 'Not applicable.', transforms: null, default_view: null, sources: [analysis(ctx, '/data/graph.json')], notes: [] }),
      data({ data_id: 'data-graph-edge-types', title: 'Graph edges by type, status and side', component: 'GraphExplorer', status: 'MIXED', source_role: 'mixed', description: `${g.edges.length} edges. Only VERIFIED and DECLARED edges carry a dependency claim; CANDIDATE edges are review leads and MENTIONS edges are references.`, denominator: null, columns: [col('type', 'Edge type'), col('status', 'Status'), col('side', 'Side'), col('count', 'Count')], rows: [...edgeTypes].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, count]) => { const [type, status, side] = k.split('|'); return { type: type!, status: status!, side: side!, count }; }), null_policy: 'Not applicable.', transforms: null, default_view: null, sources: [analysis(ctx, '/data/graph.json')], notes: ['A mention is never a cause.'] }),
    ],
  };
};
const impactExplorer: Shaper = (_props, ctx) => {
  const g = ctx.access.graph();
  const origin = IMPACT_UI.presets.find((id) => g.nodes.some((n) => n.id === id)) ?? g.nodes[0]?.id ?? '';
  const r = impactDefault(g, origin);
  const label = new Map(g.nodes.map((n) => [n.id, n]));
  const hits = [...r.direct.map((h) => ({ ...h, scope: 'direct' })), ...r.transitive.map((h) => ({ ...h, scope: 'transitive' }))];
  return {
    default_view: `Origin ${origin}; default edge types; depth ${IMPACT_UI.depth}; production and shared edges.`, default_view_reproduced: true, not_reproduced: [],
    data: [data({
      data_id: 'data-impact-default', title: `Default impact traversal from ${label.get(origin)?.label ?? origin}`, component: 'ImpactExplorer', status: 'MIXED', source_role: 'mixed', description: `${r.direct.length} direct and ${r.transitive.length} transitive hits${r.truncated ? '; the traversal stopped at its depth or size bound' : ''}. Computed with the same traversal the page runs in the browser.`, denominator: null,
      columns: [col('node', 'Node id'), col('label', 'Label'), col('type', 'Node type'), col('scope', 'Scope'), col('depth', 'Depth'), col('via', 'Edge type'), col('strength', 'Strength')],
      rows: hits.map((h) => ({ node: h.node, label: label.get(h.node)?.label ?? h.node, type: label.get(h.node)?.type ?? null, scope: h.scope, depth: h.depth, via: h.via, strength: h.strength })), null_policy: 'Not applicable.', transforms: 'traverseImpact with the page\'s default settings.', default_view: `node=${origin}`, sources: [analysis(ctx, '/data/graph.json')], notes: ['An impact path follows typed edges; it is not a finding of cause.'],
    })],
  };
};
const reportCenter: Shaper = (_props, ctx) => ({
  default_view: 'The export bundle builder, loaded in the browser.', default_view_reproduced: false, not_reproduced: ['Bundles are assembled in the browser from the published report files.'],
  data: [data({
    data_id: 'data-report-files', title: 'Precomputed consolidated reports', component: 'ReportCenter', status: 'MIXED', source_role: 'mixed', description: `Consolidated report of every finding in each format; ${ctx.access.pdfCount()} PDFs are published under /reports/pdf/.`, denominator: null,
    columns: [col('href', 'File'), col('format', 'Format'), col('bytes', 'Size', 'bytes')],
    rows: ctx.access.reportFiles().map((f) => ({ href: f.href, format: f.href.split('.').pop()!, bytes: f.bytes })), null_policy: 'Not applicable.', transforms: null, default_view: null, sources: [analysis(ctx, '/reports/all/')], notes: [],
  })],
});
const calculator: Shaper = (_props, ctx) => ({
  default_view: 'Mode "calculate"; the first result is computed in the browser after the evidence index loads.', default_view_reproduced: false,
  not_reproduced: ['The default calculation and its inputs are set in the browser. Reproduce any calculation exactly with calculate_scenario.'],
  data: [
    data({ data_id: 'data-calculator-modes', title: 'Calculator modes', component: 'CalculatorWorkspace', status: 'NOT_APPLICABLE', source_role: 'statistics_generated', description: 'Modes of the calculator. A user assumption always yields SCENARIO, never canon.', denominator: null, columns: [col('id', 'Mode id'), col('label', 'Label'), col('summary', 'Summary')], rows: CALC_MODES.map((m) => ({ id: m.id, label: m.label, summary: m.summary })), null_policy: 'Not applicable.', transforms: null, default_view: 'calculate', sources: [analysis(ctx, 'src/domain/calculator.ts')], notes: [] }),
    data({ data_id: 'data-calculator-formulas', title: 'Allowlisted formulas', component: 'CalculatorWorkspace', status: 'NOT_APPLICABLE', source_role: 'statistics_generated', description: `Every formula the calculator may apply. Rates ${CALC_LIMITS.RATE_MIN_PCT} to ${CALC_LIMITS.RATE_MAX_PCT}% a year; horizons up to ${CALC_LIMITS.MAX_PERIODS} years.`, denominator: null, columns: [col('id', 'Formula id'), col('label', 'Label'), col('version', 'Version'), col('expression', 'Expression')], rows: Object.entries(FORMULAS).map(([id, f]) => ({ id, label: f.label, version: f.version, expression: f.expression })), null_policy: 'Not applicable.', transforms: null, default_view: null, sources: [analysis(ctx, 'src/domain/calculator.ts')], notes: ['A projection is conditional on the user-supplied rate; it is not a forecast.'] }),
  ],
});
const assistant: Shaper = () => ({ default_view: 'An empty question box.', default_view_reproduced: true, not_reproduced: ['Answers are produced on request in the browser. Use the REST or MCP tools for the same evidence.'], data: [] });

export const SHAPERS: Readonly<Record<string, Shaper>> = Object.freeze({
  SpatialExplorer: spatial, AncestryExplorer: ancestry,
  DistributionExplorer: distribution, GdpTreemap: treemap, CorrelationHeatmap: correlation, ScatterExplorer: scatter, CountryCompare: countryCompare, HistoryExplorer: history, ClusterLab: cluster, DecisionTreeAnalyticsView: mlTrees,
  NarrativeGraphExplorer: narrativeExplorer, ConsistencyAuditExplorer: auditExplorer, StoryRefactorWorkspace: refactorWorkspace, IdeationWorkspace: ideation, CanonRemodelLab: remodelLab, DecisionTreeWorkspace: decisionWorkspace,
  FindingExport: findingExport, FindingsExplorer: findingsExplorer, GraphExplorer: graphExplorer, ImpactExplorer: impactExplorer, ReportCenter: reportCenter, CalculatorWorkspace: calculator, AssistantWorkspace: assistant,
});

/** Data a page renders on the server from an artifact, typed for the mirror. Keyed by route pattern. */
export const PAGE_ADAPTERS: Readonly<Record<string, (pageId: string, ctx: ShapeContext) => PageData[]>> = Object.freeze({
  '/statistics/indicators/[id]/': (pageId: string, ctx: ShapeContext) => {
    const id = pageId.split('/').filter(Boolean).pop()!;
    const rows = ctx.access.indicatorRows(id);
    if (!rows) return [];
    return [data({
      data_id: 'data-indicator-values', title: `Year 0 values of ${id}`, component: null, status: 'MIXED', source_role: 'mixed', description: 'Every Year 0 value of this indicator the page shows: production canon with its status and pointer, and remodeling proposals labeled PROPOSED.', denominator: null,
      columns: [col('entity_id', 'Entity id'), col('entity', 'Entity'), col('entity_kind', 'Kind'), col('value', 'Value'), col('unit', 'Unit'), col('status', 'Status'), col('side', 'Side'), col('source_path', 'Source path'), col('source_pointer', 'Source pointer')],
      rows, null_policy: NULL_UNKNOWN, transforms: null, default_view: null, sources: [productionDataset(ctx)], notes: ['Remodeling values are proposals and never replace the production value.'],
    })];
  },
});
