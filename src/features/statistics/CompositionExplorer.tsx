/**
 * Interactive explorers for the composition artifact. AncestryExplorer reads production values;
 * SpatialExplorer reads remodeling values. Each table states its denominator, every Matplotlib
 * figure ships in the light and the dark theme, and unassigned values are shown as such.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  ANCESTRIES,
  HABITATS,
  SURFACES,
  countrySlug,
  fmt,
  pinnedUrl,
  type AncestryCountry,
  type Composition,
  type ShareRow,
  type SpatialCountry,
} from '../../domain/composition.ts';

type Metric = 'pct' | 'absolute';
export type FigureDims = Record<string, [number, number]>;

const figureUrl = (id: string, dark = false) => `/reports/figures/${id}${dark ? '-dark' : ''}.svg`;
const pp = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v))} pp`;

/** One Matplotlib figure in both themes. Only the variant of the active theme is displayed (and therefore loaded). */
export function Figure({ id, title, alt, dims, wide = false }: { id: string; title: string; alt: string; dims: FigureDims; wide?: boolean }) {
  const [w, h] = dims[id] ?? [640, 640];
  return (
    <figure className="rs-card min-w-0 p-4 sm:p-5" data-figure={id}>
      <figcaption className="mb-3 font-semibold text-ink">{title}</figcaption>
      <div className={wide ? 'rs-figure-scroll' : ''} tabIndex={wide ? 0 : undefined} aria-label={wide ? `${title} (scroll horizontally on narrow screens)` : undefined}>
        <img className={`rs-fig rs-fig-light mx-auto h-auto w-full ${wide ? 'rs-fig-wide' : 'max-w-xl'}`} src={figureUrl(id)} alt={alt} width={w} height={h} loading="lazy" decoding="async" />
        <img className={`rs-fig rs-fig-dark mx-auto h-auto w-full ${wide ? 'rs-fig-wide' : 'max-w-xl'}`} src={figureUrl(id, true)} alt={alt} width={dims[`${id}-dark`]?.[0] ?? w} height={dims[`${id}-dark`]?.[1] ?? h} loading="lazy" decoding="async" />
      </div>
      <p className="mt-3 text-xs text-ink-3">
        Download: <a href={figureUrl(id)} download>SVG, light</a> · <a href={figureUrl(id, true)} download>SVG, dark</a>
      </p>
    </figure>
  );
}

function Picker<T extends { id: string; name: string }>({ id, label, items, value, onChange, note }: { id: string; label: string; items: T[]; value: string; onChange: (id: string) => void; note: (item: T) => string }) {
  return (
    <label className="block min-w-0 text-sm font-semibold text-ink" htmlFor={id}>
      {label}
      <select id={id} className="rs-select mt-2 w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        {items.map((c) => <option key={c.id} value={c.id}>{c.name}{note(c)}</option>)}
      </select>
    </label>
  );
}

function MetricChoice({ id, value, onChange, labels }: { id: string; value: Metric; onChange: (m: Metric) => void; labels: [string, string] }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-ink">Comparison metric</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="inline-flex items-center gap-2 text-sm text-ink-2"><input type="radio" name={id} checked={value === 'pct'} onChange={() => onChange('pct')} />{labels[0]}</label>
        <label className="inline-flex items-center gap-2 text-sm text-ink-2"><input type="radio" name={id} checked={value === 'absolute'} onChange={() => onChange('absolute')} />{labels[1]}</label>
      </div>
    </fieldset>
  );
}

function Table({ caption, children, minWidth }: { caption: string; children: ReactNode; minWidth?: number }) {
  return (
    <div className="rs-table-wrap mt-3" tabIndex={0} role="region" aria-label={caption}>
      <table className="rs-table" style={minWidth ? { minWidth } : undefined}>
        <caption className="rs-sr">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

function Status({ children, tone = 'unknown' }: { children: ReactNode; tone?: 'canon' | 'proposed' | 'unknown' }) {
  return <span className="rs-badge whitespace-nowrap" data-tone={tone}>{children}</span>;
}

function SourceBlock({ title, source, authority, pointer, children }: { title: string; source: Composition['sources']['production']; authority: string; pointer?: string; children?: ReactNode }) {
  return (
    <section className="rs-card p-5" aria-label={title}>
      <h2 className="rs-h3">{title}</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="text-ink-3">Repository</dt><dd className="m-0 min-w-0 break-words"><a href={pinnedUrl(source)} target="_blank" rel="noopener noreferrer">{source.repository}<span className="rs-sr"> (opens in a new tab)</span></a></dd>
        <dt className="text-ink-3">Commit</dt><dd className="m-0 min-w-0 break-all font-mono text-xs">{source.commit_sha}</dd>
        <dt className="text-ink-3">Blob</dt><dd className="m-0 min-w-0 break-all font-mono text-xs">{source.blob_sha}</dd>
        <dt className="text-ink-3">Path</dt><dd className="m-0 min-w-0 break-all font-mono text-xs">{source.path}{pointer ? ` → ${pointer}` : ''}</dd>
        <dt className="text-ink-3">Authority</dt><dd className="m-0 min-w-0">{authority}</dd>
      </dl>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ Ancestry

function ancestryCell(row: ShareRow | undefined, metric: Metric): string {
  if (!row) return 'Not assigned';
  return metric === 'pct' ? `${fmt(row.pct)}%` : fmt(row.absolute_billion);
}

export function AncestryExplorer({ data, dims }: { data: Composition; dims: FigureDims }) {
  const countries = data.ancestry.countries;
  const assigned = countries.filter((c) => c.status === 'ASSIGNED');
  const [aId, setA] = useState(assigned.find((c) => c.name === 'Reltronland')?.id ?? countries[0]!.id);
  const [bId, setB] = useState(assigned.find((c) => c.name === 'Depcutland')?.id ?? countries[1]?.id ?? countries[0]!.id);
  const [metric, setMetric] = useState<Metric>('pct');
  const [query, setQuery] = useState('');
  const [cohort, setCohort] = useState<'ALL' | 'PROFILED_14' | 'DEVELOPMENT_5'>('ALL');
  const a = countries.find((c) => c.id === aId) ?? countries[0]!;
  const b = countries.find((c) => c.id === bId) ?? countries[0]!;
  const planet = data.ancestry.planet;
  const prod = data.sources.production;
  const rows = useMemo(() => countries.filter((c) => (cohort === 'ALL' || c.cohort === cohort) && c.name.toLowerCase().includes(query.trim().toLowerCase())), [countries, cohort, query]);
  const note = (c: AncestryCountry) => (c.status === 'ASSIGNED' ? '' : ' (ancestry not assigned)');

  return (
    <div className="space-y-10">
      <section aria-label="Ancestry controls" className="rs-card grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <Picker id="ancestry-country" label="Inspect a nation" items={countries} value={a.id} onChange={setA} note={note} />
        <Picker id="ancestry-compare" label="Compare with" items={countries} value={b.id} onChange={setB} note={note} />
        <MetricChoice id="ancestry-metric" value={metric} onChange={setMetric} labels={['Share of residents (%)', 'Residents (billion)']} />
      </section>

      <section aria-labelledby="planet-ancestry-h" className="grid gap-5 lg:grid-cols-2">
        <Figure id="species-planet" dims={dims} title="Asthortera · primary ancestry (representative benchmark)"
          alt={`Pie chart of the representative planetary primary ancestry shares: ${planet.rows.map((r) => `${r.label} ${fmt(r.pct)}%`).join(', ')}.`} />
        <div className="rs-card min-w-0 p-5">
          <h2 id="planet-ancestry-h" className="rs-h3">Planetary representative breakdown</h2>
          <p className="mt-2 text-sm text-ink-2">
            Year 0 · {fmt(planet.population_billion, 0)} billion residents · shares are a creator-ratified benchmark of the 14 profiled nations
            (reference denominator {fmt(planet.reference_population_billion, 0)} billion), not a census of all {planet.sovereign_states} states.
          </p>
          <Table caption="Planetary primary ancestry shares and representative headcounts">
            <thead><tr><th scope="col">Primary ancestry</th><th scope="col" className="num">Share</th><th scope="col" className="num">Billion</th></tr></thead>
            <tbody>{planet.rows.map((r) => <tr key={r.key}><th scope="row">{r.label}</th><td className="num">{fmt(r.pct)}%</td><td className="num">{fmt(r.absolute_billion)}</td></tr>)}</tbody>
          </Table>
          <p className="mt-3 text-xs text-ink-3">
            {planet.headcount_source === 'SOURCE_STATED' ? 'Headcounts are stated by the source (share × planetary population).' : 'Headcounts are share × planetary population.'} They are representative model figures, not enumerated headcounts. <Status tone="canon">CANON_OBSERVED shares</Status>
          </p>
        </div>
      </section>

      <Figure wide id={metric === 'pct' ? 'species-stacked-percent' : 'species-stacked-billions'} dims={dims}
        title={metric === 'pct' ? `${assigned.length} nations · share of each national population` : `${assigned.length} nations · residents by primary ancestry (billion)`}
        alt={metric === 'pct' ? `Horizontal 100% stacked bars of primary ancestry shares for ${assigned.length} nations.` : `Horizontal stacked bars of residents by primary ancestry in billions for ${assigned.length} nations.`} />

      <section aria-labelledby="country-ancestry-h">
        <h2 id="country-ancestry-h" className="rs-h2">{a.name} · primary ancestry</h2>
        <p className="mt-2 text-sm text-ink-2">
          {fmt(a.population_billion)} billion unique residents · {a.cohort === 'PROFILED_14' ? 'profiled nation' : 'development nation'} · <span className="font-mono text-xs">{a.pointer}.ancestry_primary_pct</span>
        </p>
        {a.status === 'ASSIGNED' ? (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Figure id={`species-country-${countrySlug(a.id)}`} dims={dims} title={`${a.name} · share of residents`}
              alt={`Pie chart of primary ancestry in ${a.name}: ${a.rows.map((r) => `${r.label} ${fmt(r.pct)}%`).join(', ')}.`} />
            <div className="rs-card min-w-0 p-5">
              <h3 className="rs-h3">Residents by primary ancestry</h3>
              <p className="mt-2 text-sm text-ink-2">Denominator: {fmt(a.population_billion)} billion unique residents. Billions = population × share / 100.</p>
              <Table caption={`Primary ancestry of ${a.name}`}>
                <thead><tr><th scope="col">Primary ancestry</th><th scope="col" className="num">Share</th><th scope="col" className="num">Billion</th></tr></thead>
                <tbody>{a.rows.map((r) => <tr key={r.key}><th scope="row">{r.label}</th><td className="num">{fmt(r.pct)}%</td><td className="num">{fmt(r.absolute_billion)}</td></tr>)}</tbody>
                <tfoot><tr><th scope="row">Total</th><td className="num">{fmt(a.rows.reduce((s, r) => s + r.pct, 0))}%</td><td className="num">{fmt(a.population_billion)}</td></tr></tfoot>
              </Table>
              <p className="mt-3 flex flex-wrap gap-2 text-xs"><Status tone="canon">Shares: CANON_OBSERVED</Status><Status tone="canon">Billions: CANON_DERIVED</Status>
                <Status tone={a.remodeling.status === 'DIFFERENT' ? 'proposed' : 'unknown'}>Remodeling: {a.remodeling.status.replace('_', ' ').toLowerCase()}</Status></p>
            </div>
          </div>
        ) : (
          <p role="status" className="rs-notice mt-4">Not assigned: production main records no national ancestry shares for {a.name}. The value is unknown, not zero, and nothing is imputed.</p>
        )}
      </section>

      <section aria-labelledby="ancestry-compare-h">
        <h2 id="ancestry-compare-h" className="rs-h2">{a.name} compared with {b.name}</h2>
        {a.status === 'ASSIGNED' && b.status === 'ASSIGNED' ? (
          <Table caption={`Primary ancestry of ${a.name} and ${b.name}`} minWidth={640}>
            <thead><tr><th scope="col">Primary ancestry</th><th scope="col" className="num">{a.name} %</th><th scope="col" className="num">{b.name} %</th><th scope="col" className="num">Difference</th><th scope="col" className="num">{a.name} B</th><th scope="col" className="num">{b.name} B</th></tr></thead>
            <tbody>{ANCESTRIES.map((cat) => {
              const ra = a.rows.find((r) => r.key === cat.key)!;
              const rb = b.rows.find((r) => r.key === cat.key)!;
              return <tr key={cat.key}><th scope="row">{cat.label}</th><td className="num">{fmt(ra.pct)}%</td><td className="num">{fmt(rb.pct)}%</td><td className="num">{pp(ra.pct - rb.pct)}</td><td className="num">{fmt(ra.absolute_billion)}</td><td className="num">{fmt(rb.absolute_billion)}</td></tr>;
            })}</tbody>
            <tfoot><tr><th scope="row">Population</th><td className="num">100%</td><td className="num">100%</td><td /><td className="num">{fmt(a.population_billion)}</td><td className="num">{fmt(b.population_billion)}</td></tr></tfoot>
          </Table>
        ) : (
          <p role="status" className="rs-notice mt-3">A comparison needs assigned shares for both nations. {[a, b].filter((c) => c.status !== 'ASSIGNED').map((c) => c.name).join(' and ')} {[a, b].filter((c) => c.status !== 'ASSIGNED').length === 1 ? 'has' : 'have'} none in production main.</p>
        )}
        <p className="mt-2 text-xs text-ink-3">Differences are in percentage points (pp) of each nation’s own residents.</p>
      </section>

      <section aria-labelledby="ancestry-matrix-h">
        <h2 id="ancestry-matrix-h" className="rs-h2">Country × ancestry matrix</h2>
        <p className="mt-2 text-sm text-ink-2">{metric === 'pct' ? 'Share of each national population (%).' : 'Residents in billions (population × share / 100).'} The deferred states stay one aggregate row; no per-state values exist.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 text-sm font-semibold text-ink">Filter nations
            <input type="search" className="rs-input mt-2 w-full" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a nation name" />
          </label>
          <label className="min-w-[12rem] text-sm font-semibold text-ink">Cohort
            <select className="rs-select mt-2 w-full" value={cohort} onChange={(e) => setCohort(e.target.value as typeof cohort)}>
              <option value="ALL">All modeled nations</option><option value="PROFILED_14">Profiled nations</option><option value="DEVELOPMENT_5">Development nations</option>
            </select>
          </label>
          <p className="text-xs text-ink-3" aria-live="polite">{rows.length} of {countries.length} nations shown</p>
        </div>
        <Table caption="Primary ancestry by nation" minWidth={980}>
          <thead><tr><th scope="col">Nation</th><th scope="col" className="num">Population (B)</th>{ANCESTRIES.map((c) => <th key={c.key} scope="col" className="num">{c.label}</th>)}<th scope="col">Status</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}><th scope="row">{c.name}</th><td className="num">{fmt(c.population_billion)}</td>
                {ANCESTRIES.map((cat) => <td key={cat.key} className={`num ${c.status === 'ASSIGNED' ? '' : 'text-ink-3'}`}>{ancestryCell(c.rows.find((r) => r.key === cat.key), metric)}</td>)}
                <td>{c.status === 'ASSIGNED' ? <Status tone="canon">CANON_OBSERVED</Status> : <Status>NOT ASSIGNED</Status>}</td></tr>
            ))}
            {cohort === 'ALL' && !query.trim() && (
              <tr><th scope="row">{data.ancestry.coverage.residual_states} deferred states (one aggregate)</th><td className="num">{fmt(data.ancestry.coverage.residual_population_billion)}</td>
                <td colSpan={ANCESTRIES.length} className="text-ink-3">No per-state or aggregate ancestry composition is assigned.</td><td><Status>NOT ALLOCATED</Status></td></tr>
            )}
          </tbody>
        </Table>
      </section>

      <section aria-labelledby="ancestry-coverage-h" className="grid gap-4 md:grid-cols-3">
        <h2 id="ancestry-coverage-h" className="rs-sr">Coverage</h2>
        <div className="rs-card p-5"><p className="rs-eyebrow">Assigned</p><p className="mt-1 text-2xl font-bold text-ink">{data.ancestry.coverage.assigned}</p><p className="text-sm text-ink-2">nations with six shares closing to 100%</p></div>
        <div className="rs-card p-5"><p className="rs-eyebrow">Not assigned</p><p className="mt-1 text-2xl font-bold text-ink">{data.ancestry.coverage.not_assigned}</p><p className="text-sm text-ink-2">nations without national shares (unknown, not zero)</p></div>
        <div className="rs-card p-5"><p className="rs-eyebrow">Aggregate</p><p className="mt-1 text-2xl font-bold text-ink">{data.ancestry.coverage.residual_states} states</p><p className="text-sm text-ink-2">{fmt(data.ancestry.coverage.residual_population_billion, 0)} billion residents in one combined residual</p></div>
      </section>

      <SourceBlock title="Source and authority" source={prod} pointer={a.status === 'ASSIGNED' ? `${a.pointer}.ancestry_primary_pct` : planet.pointer}
        authority="Production main (Reltroner/reltroner-studio), the authoritative published source. Shares are CANON_OBSERVED; billions are CANON_DERIVED arithmetic on the same record.">
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-2">{data.unknowns.slice(0, 4).map((u) => <li key={u}>{u}</li>)}</ul>
      </SourceBlock>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Spatial

function spatialCell(c: SpatialCountry, kind: 'surface' | 'habitat', key: string, metric: Metric): string {
  if (kind === 'surface') {
    const r = c.surface.find((x) => x.key === key);
    if (!r) return 'Not assigned';
    return metric === 'pct' ? `${fmt(r.pct)}%` : r.area_million_km2 === null ? 'No land area' : fmt(r.area_million_km2);
  }
  const r = c.habitats.find((x) => x.key === key);
  if (!r) return 'Not assigned';
  return metric === 'pct' ? `${fmt(r.pct)}%` : fmt(r.absolute_billion);
}

export function SpatialExplorer({ data, dims }: { data: Composition; dims: FigureDims }) {
  const countries = data.spatial.countries;
  const draft = data.sources.remodeling;
  const [aId, setA] = useState(countries.find((c) => c.name === 'Reltronland')?.id ?? countries[0]?.id ?? '');
  const [bId, setB] = useState(countries.find((c) => c.name === 'Depcutland')?.id ?? countries[1]?.id ?? '');
  const [metric, setMetric] = useState<Metric>('pct');
  if (!countries.length || !draft) {
    return <p role="status" className="rs-notice">Spatial 3D composition is not available: the pinned remodeling source carries no spatial records. Nothing is shown in place of the missing values.</p>;
  }
  const a = countries.find((c) => c.id === aId) ?? countries[0]!;
  const b = countries.find((c) => c.id === bId) ?? countries[0]!;
  const slug = countrySlug(a.id);
  const note = (c: SpatialCountry) => (c.surface_status === 'ASSIGNED' || c.habitat_status === 'ASSIGNED' ? '' : ' (not assigned)');
  const landDiffers = countries.filter((c) => c.production_land_area_million_km2 !== null && c.land_area_million_km2 !== null && c.production_land_area_million_km2 !== c.land_area_million_km2);

  return (
    <div className="space-y-10">
      <section aria-label="Spatial controls" className="rs-card grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <Picker id="spatial-country" label="Inspect a nation" items={countries} value={a.id} onChange={setA} note={note} />
        <Picker id="spatial-compare" label="Compare with" items={countries} value={b.id} onChange={setB} note={note} />
        <MetricChoice id="spatial-metric" value={metric} onChange={setMetric} labels={['Share of denominator (%)', 'Quantity (million km² · billion residents)']} />
      </section>

      <section aria-labelledby="spatial-national-h">
        <h2 id="spatial-national-h" className="rs-h2">{a.name} · Spatial 3D composition{a.reference ? ` (${a.reference})` : ''}</h2>
        <p className="mt-2 text-sm text-ink-2">
          Remodeling record <span className="font-mono text-xs">{a.pointer}.spatial_3d_canon</span>{a.spatial_status_label ? <> · status label <span className="font-mono text-xs">{a.spatial_status_label}</span></> : null} · <Status tone="proposed">PROPOSED in this observatory</Status>
        </p>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            {a.surface_status === 'ASSIGNED' && <Figure id={`spatial-surface-${slug}`} dims={dims} title="Terrestrial surface footprint"
              alt={`Pie chart of the terrestrial surface footprint of ${a.name}: ${a.surface.map((r) => `${r.label} ${fmt(r.pct)}%`).join(', ')}.`} />}
            <div className="rs-card min-w-0 p-5">
              <h3 className="rs-h3">Surface footprint · share of national land</h3>
              <p className="mt-2 text-sm text-ink-2">Denominator: {a.land_area_million_km2 === null ? 'national land area (not assigned)' : `${fmt(a.land_area_million_km2)} million km² of national terrestrial land`}{a.surface_denominator ? ` (“${a.surface_denominator}”)` : ''}. Not built, constructed or habitable volume.</p>
              {a.surface_status === 'ASSIGNED' ? (
                <Table caption={`Terrestrial surface footprint of ${a.name}`}>
                  <thead><tr><th scope="col">Surface class</th><th scope="col" className="num">Share of land</th><th scope="col" className="num">Million km²</th></tr></thead>
                  <tbody>{a.surface.map((r) => <tr key={r.key}><th scope="row">{r.label}</th><td className="num">{fmt(r.pct)}%</td><td className="num">{r.area_million_km2 === null ? 'No land area' : fmt(r.area_million_km2)}</td></tr>)}</tbody>
                  <tfoot><tr><th scope="row">Total</th><td className="num">{fmt(a.surface.reduce((s, r) => s + r.pct, 0))}%</td><td className="num">{a.land_area_million_km2 === null ? '—' : fmt(a.land_area_million_km2)}</td></tr></tfoot>
                </Table>
              ) : <p role="status" className="rs-notice mt-3">Not assigned in the remodeling record; not zero.</p>}
            </div>
          </div>
          <div className="min-w-0 space-y-4">
            {a.habitat_status === 'ASSIGNED' && <Figure id={`spatial-habitat-${slug}`} dims={dims} title="Principal home habitats"
              alt={`Pie chart of the principal home habitats of ${a.name}: ${a.habitats.map((r) => `${r.label} ${fmt(r.pct)}%`).join(', ')}.`} />}
            <div className="rs-card min-w-0 p-5">
              <h3 className="rs-h3">Principal home habitat · share of residents</h3>
              <p className="mt-2 text-sm text-ink-2">Denominator: {fmt(a.population_billion)} billion unique usual residents{a.habitat_denominator ? ` (“${a.habitat_denominator}”)` : ''}. Not land area and not urbanization.</p>
              {a.habitat_status === 'ASSIGNED' ? (
                <Table caption={`Principal home habitats of ${a.name}`}>
                  <thead><tr><th scope="col">Home habitat</th><th scope="col" className="num">Share of residents</th><th scope="col" className="num">Billion residents</th></tr></thead>
                  <tbody>{a.habitats.map((r) => <tr key={r.key}><th scope="row">{r.label}</th><td className="num">{fmt(r.pct)}%</td><td className="num">{fmt(r.absolute_billion)}</td></tr>)}</tbody>
                  <tfoot><tr><th scope="row">Total</th><td className="num">{fmt(a.habitats.reduce((s, r) => s + r.pct, 0))}%</td><td className="num">{fmt(a.population_billion)}</td></tr></tfoot>
                </Table>
              ) : <p role="status" className="rs-notice mt-3">Not assigned in the remodeling record; not zero.</p>}
            </div>
          </div>
        </div>
        <div className="rs-card mt-5 p-5">
          <h3 className="rs-h3">3D geometry of {a.name}</h3>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {a.geometry.map((g) => <li key={g.key} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"><span className="min-w-0 text-ink-2">{g.label}</span><Status>{g.status === 'UNASSIGNED' ? 'UNASSIGNED · not zero' : 'PRESENT · not rendered'}</Status></li>)}
          </ul>
          <p className="mt-3 text-xs text-ink-3">No mesh, polygon or volume is drawn, because none is assigned in the source.</p>
        </div>
      </section>

      <section aria-labelledby="spatial-compare-h">
        <h2 id="spatial-compare-h" className="rs-h2">{a.name} compared with {b.name}</h2>
        <Table caption={`Spatial composition of ${a.name} and ${b.name}`} minWidth={680}>
          <thead><tr><th scope="col">Category</th><th scope="col">Denominator</th><th scope="col" className="num">{a.name}</th><th scope="col" className="num">{b.name}</th><th scope="col" className="num">Difference</th></tr></thead>
          <tbody>
            {SURFACES.map((cat) => {
              const ra = a.surface.find((r) => r.key === cat.key);
              const rb = b.surface.find((r) => r.key === cat.key);
              return <tr key={cat.key}><th scope="row">{cat.label}</th><td>Land</td><td className="num">{spatialCell(a, 'surface', cat.key, metric)}</td><td className="num">{spatialCell(b, 'surface', cat.key, metric)}</td>
                <td className="num">{ra && rb ? (metric === 'pct' ? pp(ra.pct - rb.pct) : ra.area_million_km2 !== null && rb.area_million_km2 !== null ? `${fmt(ra.area_million_km2 - rb.area_million_km2)} M km²` : '—') : '—'}</td></tr>;
            })}
            {HABITATS.map((cat) => {
              const ra = a.habitats.find((r) => r.key === cat.key);
              const rb = b.habitats.find((r) => r.key === cat.key);
              return <tr key={cat.key}><th scope="row">{cat.label}</th><td>Residents</td><td className="num">{spatialCell(a, 'habitat', cat.key, metric)}</td><td className="num">{spatialCell(b, 'habitat', cat.key, metric)}</td>
                <td className="num">{ra && rb ? (metric === 'pct' ? pp(ra.pct - rb.pct) : `${fmt(ra.absolute_billion - rb.absolute_billion)} B`) : '—'}</td></tr>;
            })}
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-ink-3">Land rows and resident rows have different denominators and are never added together.</p>
      </section>

      <section aria-labelledby="surface-h" className="space-y-4">
        <h2 id="surface-h" className="rs-h2">Terrestrial surface footprint across nations</h2>
        <Figure wide id={metric === 'pct' ? 'spatial-surface-percent' : 'spatial-surface-area'} dims={dims}
          title={metric === 'pct' ? 'Share of national terrestrial land' : 'Area of national terrestrial land (million km²)'}
          alt={`Horizontal stacked bars of the terrestrial surface footprint for ${data.spatial.coverage.surface_assigned} nations${metric === 'pct' ? ' in percent of national land' : ' in million km²'}.`} />
        <Table caption="Terrestrial surface footprint by nation" minWidth={900}>
          <thead><tr><th scope="col">Nation</th><th scope="col" className="num">Land (M km²)</th>{SURFACES.map((s) => <th key={s.key} scope="col" className="num">{s.label}</th>)}</tr></thead>
          <tbody>{countries.map((c) => <tr key={c.id}><th scope="row">{c.name}</th><td className="num">{c.land_area_million_km2 === null ? 'Not assigned' : fmt(c.land_area_million_km2)}</td>{SURFACES.map((s) => <td key={s.key} className="num">{spatialCell(c, 'surface', s.key, metric)}</td>)}</tr>)}</tbody>
        </Table>
      </section>

      <section aria-labelledby="habitat-h" className="space-y-4">
        <h2 id="habitat-h" className="rs-h2">Principal home habitats across nations</h2>
        <Figure wide id={metric === 'pct' ? 'spatial-habitat-percent' : 'spatial-habitat-residents'} dims={dims}
          title={metric === 'pct' ? 'Share of unique usual residents' : 'Unique usual residents (billion)'}
          alt={`Horizontal stacked bars of principal home habitats for ${data.spatial.coverage.habitat_assigned} nations${metric === 'pct' ? ' in percent of residents' : ' in billions of residents'}.`} />
        <Table caption="Principal home habitats by nation" minWidth={900}>
          <thead><tr><th scope="col">Nation</th><th scope="col" className="num">Residents (B)</th>{HABITATS.map((h) => <th key={h.key} scope="col" className="num">{h.label}</th>)}</tr></thead>
          <tbody>{countries.map((c) => <tr key={c.id}><th scope="row">{c.name}</th><td className="num">{fmt(c.population_billion)}</td>{HABITATS.map((h) => <td key={h.key} className="num">{spatialCell(c, 'habitat', h.key, metric)}</td>)}</tr>)}</tbody>
        </Table>
      </section>

      <section aria-labelledby="spatial-coverage-h">
        <h2 id="spatial-coverage-h" className="rs-h2">Coverage and source separation</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rs-card p-5"><p className="rs-eyebrow">Surface footprints</p><p className="mt-1 text-2xl font-bold text-ink">{data.spatial.coverage.surface_assigned} / {countries.length}</p><p className="text-sm text-ink-2">nations with four land classes</p></div>
          <div className="rs-card p-5"><p className="rs-eyebrow">Home habitats</p><p className="mt-1 text-2xl font-bold text-ink">{data.spatial.coverage.habitat_assigned} / {countries.length}</p><p className="text-sm text-ink-2">nations with four habitat classes</p></div>
          <div className="rs-card p-5"><p className="rs-eyebrow">Production main</p><p className="mt-1 text-2xl font-bold text-ink">{data.spatial.production_spatial_records}</p><p className="text-sm text-ink-2">spatial records in the published source</p></div>
        </div>
        {landDiffers.length > 0 && (
          <>
            <p className="mt-5 text-sm text-ink-2">Land areas that differ between the two sources. Spatial figures use the remodeling value of the same record; the production value is shown for comparison and is never mixed into a spatial calculation.</p>
            <Table caption="Land areas that differ between production and remodeling">
              <thead><tr><th scope="col">Nation</th><th scope="col" className="num">Production (M km²)</th><th scope="col" className="num">Remodeling (M km²)</th><th scope="col">Remodeling status label</th></tr></thead>
              <tbody>{landDiffers.map((c) => <tr key={c.id}><th scope="row">{c.name}</th><td className="num">{fmt(c.production_land_area_million_km2!)}</td><td className="num">{fmt(c.land_area_million_km2!)}</td><td className="break-all font-mono text-xs">{c.land_area_status_label ?? '—'}</td></tr>)}</tbody>
            </Table>
          </>
        )}
      </section>

      <SourceBlock title="Source and authority" source={draft} pointer={`${a.pointer}.spatial_3d_canon`}
        authority="Remodeling main (Reltroner/reltroner-studio-remodeling). Creator-ratified inside the remodeling workspace and not published to Studio production, so these values are PROPOSED here.">
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-2">{data.unknowns.slice(4).map((u) => <li key={u}>{u}</li>)}</ul>
      </SourceBlock>
    </div>
  );
}
