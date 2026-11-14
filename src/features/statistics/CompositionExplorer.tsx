import { useMemo, useState } from 'react';
import type { Composition } from '../../domain/composition.ts';

type Mode = 'ancestry' | 'spatial';
type Metric = 'pct' | 'absolute';
type Country = Composition['countries'][number];

const format = (n: number, places = 2) => n.toLocaleString('en-US', { maximumFractionDigits: places, minimumFractionDigits: places });
const chart = (id: string) => '/reports/figures/' + id + '.svg';
const cell = 'border-b border-line px-3 py-3 text-left text-sm tabular-nums';
const head = 'border-b border-line bg-surface-2 px-3 py-3 text-left text-xs font-semibold text-ink-2';
const tableWrap = 'rs-table-wrap mt-4 overflow-x-auto';
const sourceLink = (d: Composition) => 'https://github.com/' + d.source.repository + '/blob/' + d.source.commit_sha + '/' + d.source.path;

function Figure({ id, title, alt }: { id: string; title: string; alt: string }) {
  return <figure className="rs-card min-w-0 p-4 sm:p-5">
    <figcaption className="mb-3 font-semibold text-ink">{title}</figcaption>
    <img className="mx-auto h-auto w-full max-w-5xl" src={chart(id)} alt={alt} loading="lazy" />
  </figure>;
}

function ModeChoice({ value, onChange, id }: { value: Metric; onChange: (v: Metric) => void; id: string }) {
  return <fieldset className="flex flex-wrap items-center gap-3">
    <legend className="mb-2 text-sm font-semibold text-ink">Comparison metric</legend>
    <label className="flex items-center gap-2 text-sm"><input id={id + '-pct'} type="radio" name={id} checked={value === 'pct'} onChange={() => onChange('pct')} /> Percent of denominator</label>
    <label className="flex items-center gap-2 text-sm"><input id={id + '-absolute'} type="radio" name={id} checked={value === 'absolute'} onChange={() => onChange('absolute')} /> Quantitative absolute</label>
  </fieldset>;
}

function CountryPicker({ data, current, onChange, id }: { data: Composition; current: Country; onChange: (c: Country) => void; id: string }) {
  return <label className="block max-w-lg text-sm font-semibold text-ink" htmlFor={id}>
    Inspect a nation's composition
    <select className="mt-2 block w-full rounded-xl border border-line bg-surface-2 px-3 py-3 text-ink"
      id={id} value={current.id} onChange={(e) => {
        const match = data.countries.find((c) => c.id === e.target.value);
        if (match) onChange(match);
      }}>
      {data.countries.map((c) => <option key={c.id} value={c.id}>{c.name}{c.ancestry_status === 'ASSIGNED' ? '' : ' (ancestry unassigned)'}</option>)}
    </select>
  </label>;
}

export default function CompositionExplorer({ mode, data }: { mode: Mode; data: Composition }) {
  const [countryId, setCountryId] = useState('country:reltronland');
  const [metric, setMetric] = useState<Metric>('pct');
  const chosen = useMemo(() => data.countries.find((c) => c.id === countryId) ?? data.countries[0]!, [data, countryId]);
  const slug = chosen.id.split(':')[1]!;
  const ancestry = mode === 'ancestry';
  const dim = ancestry ? chosen.ancestry : chosen.habitats;
  const pointer = chosen.source_pointer;
  return <div className="space-y-9">
    <section aria-label="Comparison controls" className="rs-card grid gap-5 p-5 lg:grid-cols-2 lg:items-end">
      <CountryPicker id={'composition-' + mode + '-country'} data={data} current={chosen} onChange={(c) => setCountryId(c.id)} />
      <ModeChoice id={'composition-' + mode + '-metric'} value={metric} onChange={setMetric} />
    </section>
    {ancestry ? <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Figure id="species-planet" title="Planet Asthortera · six primary ancestry groups"
          alt="Pie chart of the creator-ratified representative six-category planetary ancestry model, not a measured 37-country census" />
        <div className="rs-card min-w-0 p-5">
          <h2 className="rs-h3">Planetary representative breakdown</h2>
          <p className="mt-2 text-sm text-ink-2">Year 0 · {format(data.planet.population_billion, 0)} billion unique residents · reference denominator {format(data.planet.ancestry_reference_population_billion, 0)} billion.</p>
          <div className={tableWrap} tabIndex={0}><table className="rs-table w-full text-sm">
            <thead><tr><th>Primary ancestry</th><th className="num">Percent</th><th className="num">Model-derived billion</th></tr></thead>
            <tbody>{data.planet.ancestry.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num">{format(r.pct)}%</td><td className="num">{r.absolute_billion === null ? 'Unassigned' : format(r.absolute_billion)}</td></tr>)}</tbody>
          </table></div>
          <p className="mt-3 text-xs text-ink-3">Model-derived figures use canonical representative percentages × the planetary population. They are not 37-country enumerated headcounts.</p>
        </div>
      </div>
      <Figure id={metric === 'pct' ? 'species-stacked-percent' : 'species-stacked-billions'}
        title={metric === 'pct' ? '14 national ancestry profiles · 100% stacked comparison' : '14 national ancestry profiles · absolute numbers (billion people)'}
        alt={metric === 'pct' ? '14-country horizontal stacked bar chart of primary ancestry shares' : '14-country stacked bar chart of absolute primary ancestry populations in billions'} />
      <section aria-labelledby="country-ancestry-h">
        <h2 className="rs-h2" id="country-ancestry-h">{chosen.name} · primary ancestry</h2>
        <p className="mt-2 text-sm text-ink-2">Population: {format(chosen.population_billion, 2)} billion · source: {pointer}. {chosen.ancestry_status === 'NOT_ASSIGNED' ? 'Country-specific composition is not ratified. No imputation.' : 'Six mutually exclusive categories sum to 100%.'}</p>
        {chosen.ancestry_status === 'ASSIGNED' ? <>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Figure id={'species-country-' + slug} title="Within-country ancestry percentage" alt={'Pie chart of primary ancestry composition in ' + chosen.name} />
            <div className="rs-card p-5"><h3 className="rs-h3">Quantitative country breakdown</h3>
              <div className={tableWrap} tabIndex={0}><table className="rs-table w-full">
                <thead><tr><th>Primary ancestry</th><th className="num">Share</th><th className="num">Residents (billion)</th></tr></thead>
                <tbody>{chosen.ancestry.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num">{format(r.pct)}%</td><td className="num">{format(r.absolute_billion!)}</td></tr>)}</tbody>
                <tfoot><tr><th>Total</th><th className="num">100%</th><th className="num">{format(chosen.population_billion)}</th></tr></tfoot>
              </table></div>
            </div>
          </div>
        </> : <p role="status" className="rs-notice mt-4">NOT_ASSIGNED: a national composition is not available in the pinned source, not zero.</p>}
      </section>
      <section aria-labelledby="ancestry-matrix-h">
        <h2 id="ancestry-matrix-h" className="rs-h2">Country × ancestry summary matrix</h2>
        <p className="mt-2 text-sm text-ink-2">{metric === 'pct' ? 'Share of each national population (%)' : 'Derived number of people (billion)'}. All 19 modeled nations are shown; the deferred 18 remain one unallocated aggregate, not invented country rows.</p>
        <div className={tableWrap} tabIndex={0}><table className="rs-table min-w-[930px]">
          <thead><tr><th>Country</th><th className="num">Population (B)</th>{data.planet.ancestry.map((r) => <th key={r.key} className="num">{r.label}</th>)}</tr></thead>
          <tbody>{data.countries.map((c) => <tr key={c.id}><th>{c.name}</th><td className="num">{format(c.population_billion)}</td>
            {data.planet.ancestry.map((p) => { const r = c.ancestry.find((a) => a.key === p.key); return <td key={p.key} className="num">{!r ? '—' : metric === 'pct' ? format(r.pct) + '%' : format(r.absolute_billion!)}</td>; })}
          </tr>)}</tbody>
        </table></div>
      </section>
    </> : <>
      <section aria-labelledby="surface-h">
        <h2 id="surface-h" className="rs-h2">Terrestrial surface footprint · national land area</h2>
        <p className="mt-2 text-sm text-ink-2">Four categories partition the terrestrial land footprint, not constructed / occupied / habitable cubic kilometers. Natural low-intervention land is not a deserted operational city.</p>
        <div className="mt-4"><Figure id={metric === 'pct' ? 'spatial-surface-percent' : 'spatial-surface-area'}
          title={metric === 'pct' ? 'Cross-country terrestrial footprint percentages' : 'Cross-country terrestrial footprint area (million km²)'}
          alt="Horizontal stacked bar chart comparing national land footprint classes across countries" /></div>
      </section>
      <section aria-labelledby="habitat-h">
        <h2 id="habitat-h" className="rs-h2">Principal home habitats · unique residents</h2>
        <p className="mt-2 text-sm text-ink-2">Four mutually exclusive usual-home assignments: land surface, underground, underwater, floating. Resident share is not urbanization, and does not measure land area.</p>
        <div className="mt-4"><Figure id={metric === 'pct' ? 'spatial-habitat-percent' : 'spatial-habitat-residents'}
          title={metric === 'pct' ? 'Cross-country principal habitat percentages' : 'Cross-country resident counts by principal habitat (billion)'}
          alt="Horizontal stacked bar chart comparing unique residents by principal home habitat across countries" /></div>
      </section>
      <section aria-labelledby="spatial-national-h">
        <h2 id="spatial-national-h" className="rs-h2">{chosen.name} · spatial 3D composition (Year 0)</h2>
        <p className="mt-2 text-sm text-ink-2">Terrestrial land: {chosen.land_area_million_km2 === null ? 'Unassigned' : format(chosen.land_area_million_km2) + ' million km²'} · Unique residents: {format(chosen.population_billion)} billion. Both distributions are distinct from missing 3D geometric measurements.</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div className="min-w-0">
            {chosen.surface_status === 'ASSIGNED' && <Figure id={'spatial-surface-' + slug} title="Surface footprint · percent land" alt={'Pie chart of terrestrial surface classes in ' + chosen.name} />}
            <div className={tableWrap} tabIndex={0}><table className="rs-table w-full">
              <thead><tr><th>Surface class</th><th className="num">Share</th><th className="num">Million km²</th></tr></thead>
              <tbody>{chosen.surface.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num">{format(r.pct)}%</td><td className="num">{r.area_million_km2 === null ? 'Unassigned' : format(r.area_million_km2)}</td></tr>)}</tbody>
            </table></div>
          </div>
          <div className="min-w-0">
            {chosen.habitat_status === 'ASSIGNED' && <Figure id={'spatial-habitat-' + slug} title="Principal home habitat · residents" alt={'Pie chart of primary home habitats in ' + chosen.name} />}
            <div className={tableWrap} tabIndex={0}><table className="rs-table w-full">
              <thead><tr><th>Home habitat</th><th className="num">Share</th><th className="num">Billion residents</th></tr></thead>
              <tbody>{chosen.habitats.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num">{format(r.pct)}%</td><td className="num">{format(r.absolute_billion!)}</td></tr>)}</tbody>
            </table></div>
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-ink-2">{chosen.spatial_note}</p>
      </section>
      <section aria-labelledby="spatial-matrix-h">
        <h2 id="spatial-matrix-h" className="rs-h2">National spatial comparison & coverage</h2>
        <p className="mt-2 text-sm text-ink-2">Country comparisons are structured by one land-area denominator and a separate resident denominator; values are never added across incompatible units.</p>
        <div className={tableWrap} tabIndex={0}><table className="rs-table min-w-[820px]">
          <thead><tr><th>Country</th><th className="num">Land (M km²)</th><th className="num">Population (B)</th><th>Surface categories</th><th>Habitat categories</th><th>3D geometry</th></tr></thead>
          <tbody>{data.countries.map((c) => <tr key={c.id}><th>{c.name}</th><td className="num">{c.land_area_million_km2 === null ? '—' : format(c.land_area_million_km2)}</td><td className="num">{format(c.population_billion)}</td><td>{c.surface_status}</td><td>{c.habitat_status}</td><td>{c.geometry_status}</td></tr>)}</tbody>
        </table></div>
      </section>
    </>}
    <section className="rs-card p-5">
      <h2 className="rs-h3">Source, denominators & limitations</h2>
      <p className="mt-2 text-sm text-ink-2">Source: <a href={sourceLink(data)} target="_blank" rel="noopener noreferrer">Pinned production GitHub NCCM ledger (opens in a new tab)</a> at <code>{data.source.commit_sha.slice(0, 12)}</code>.</p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-2">
        {data.unknowns.map((u, i) => <li key={i}>{u}</li>)}
      </ul>
      <p className="mt-3 text-xs text-ink-3">All percentages, population counts and land areas are sourced or computed from a named pinned ledger. Derived values are reproducible; they are not newly observed canon.</p>
    </section>
  </div>;
}
