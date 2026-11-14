/** Public, deterministic and read-only Q&A. No model call, unapproved canon writes or inferred missing values. */
import type { Composition } from './composition.ts';

export interface AgentFact {
  entity: string; indicator: string; label: string; value: number; unit: string; status: string;
  source: { repository: string; commit_sha: string; path: string; pointer: string | null };
}
export interface AgentNarrative {
  id: string; name: string; kind: string; summary: string; side: string; canon_status: string;
  source: { repository: string; commit_sha: string; path: string; line: number | null };
}
export interface AgentIndex {
  schema_version: 'reltroner-agent-index.v1';
  production_sha: string;
  composition: Composition;
  facts: AgentFact[];
  narrative: AgentNarrative[];
  routes: Array<{ title: string; href: string; summary: string }>;
}
export interface AgentCitation { title: string; url: string; detail: string }
export interface AgentAnswer {
  mode: 'DETERMINISTIC_EVIDENCE';
  status: 'CANON_SOURCE' | 'DERIVED_FROM_CANON' | 'SOURCE_MATCH' | 'INSUFFICIENT_DATA';
  question: string; heading: string; paragraphs: string[];
  citations: AgentCitation[]; limitations: string[];
  suggested_routes: string[];
}
const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 4 });
const url = (r: { repository: string; commit_sha: string; path: string }, line?: number | null) =>
  'https://github.com/' + r.repository + '/blob/' + r.commit_sha + '/' + r.path + (line ? '#L' + line : '');
const nl = (s: string) => s.toLowerCase().normalize('NFKD');
const has = (s: string, ...terms: string[]) => terms.some((term) => nl(s).includes(nl(term)));
const words = (text: string) => (nl(text).match(/[\p{L}\p{N}]+/gu) ?? [])
  .filter((w) => w.length > 2 && !new Set(['yang', 'dengan', 'untuk', 'berapa', 'what', 'about', 'tell', 'dari', 'the', 'and', 'adalah', 'dalam', 'compare', 'bandingkan', 'population', 'populasi']).has(w));
const citation = (index: AgentIndex, pointer: string): AgentCitation => ({
  title: 'NCCM V6.5 · pinned production source',
  url: url(index.composition.source),
  detail: pointer + ' · ' + index.production_sha.slice(0, 12),
});
const base = (q: string): AgentAnswer => ({
  mode: 'DETERMINISTIC_EVIDENCE', status: 'INSUFFICIENT_DATA', question: q,
  heading: 'Insufficient evidence to answer this precisely', paragraphs: [],
  citations: [], limitations: [], suggested_routes: ['/statistics', '/creative/explore', '/methodology'],
});

export function answerQuestion(index: AgentIndex, rawQuestion: string): AgentAnswer {
  const question = rawQuestion.trim().slice(0, 500);
  const ans = base(question);
  if (question.length < 3) {
    ans.paragraphs.push('Enter a question of at least three characters. You can ask about a country, a primary ancestry group, spatial composition, an indicator, or worldbuilding evidence.');
    return ans;
  }
  const data = index.composition;
  const lower = nl(question);
  const countries = data.countries.filter((c) => lower.includes(nl(c.name)));
  const asksSpatial = has(lower, 'spatial', 'habitat', 'underwater', 'underground', 'floating', 'land surface', 'land footprint', 'terrestrial', 'area built', 'urban active', 'permukaan tanah', 'bawah tanah', 'bawah air', 'mengapung', 'tata ruang', 'ruang 3d', '3d composition', 'urbanisasi spasial');
  const asksSurface = has(lower, 'land footprint', 'terrestrial', 'surface class', 'land area', 'lahan', 'luas', 'urban active', 'built', 'natural', 'dormant', 'nature');
  const asksHabitat = has(lower, 'habitat', 'underground', 'underwater', 'floating', 'home', 'bawah tanah', 'bawah air', 'mengapung', 'hunian', 'tempat tinggal');
  const explicitAncestry = data.planet.ancestry.find((r) =>
    has(lower, r.key, r.label, ...(r.key === 'native' ? ['asthorteran'] : [])));
  const asksAncestry = !!explicitAncestry || has(lower, 'species', 'spesies', 'ancestry', 'keturunan', 'komposisi penduduk', 'asal-usul', 'ras', 'phantomkind');
  if (asksSpatial && (countries.length > 0 || has(lower, 'spatial 3d', 'spatial', 'habitat'))) {
    ans.status = 'DERIVED_FROM_CANON';
    ans.heading = 'Spatial composition · Year 0';
    const inspected = countries.length ? countries : [data.countries.find((c) => c.name === 'Reltronland')!];
    for (const c of inspected) {
      ans.paragraphs.push(c.name + ': ' + fmt(c.population_billion) + ' billion residents; national terrestrial land area ' + (c.land_area_million_km2 === null ? 'unassigned' : fmt(c.land_area_million_km2) + ' million km²') + '.');
      if (!asksHabitat || asksSurface) {
        ans.paragraphs.push('Terrestrial footprint (% of LAND): ' + (c.surface.length ? c.surface.map((r) => r.label + ' ' + fmt(r.pct) + '%' + (r.area_million_km2 === null ? '' : ' (' + fmt(r.area_million_km2) + ' million km²)')).join('; ') : 'NOT_ASSIGNED'));
      }
      if (!asksSurface || asksHabitat) {
        ans.paragraphs.push('Principal home habitats (% of UNIQUE RESIDENTS): ' + (c.habitats.length ? c.habitats.map((r) => r.label + ' ' + fmt(r.pct) + '% (' + fmt(r.absolute_billion!) + ' billion)').join('; ') : 'NOT_ASSIGNED'));
      }
      ans.citations.push(citation(index, c.source_pointer + '.spatial_3d_canon'));
    }
    ans.limitations.push('Land footprint, usual home habitat and urbanization use different denominators. Country polygons, constructed/habitable km³ and marine residence by depth remain UNASSIGNED—not zero.');
    ans.suggested_routes = ['/statistics/spatial', '/countries'];
    return ans;
  }
  if (asksAncestry) {
    ans.status = 'DERIVED_FROM_CANON';
    ans.heading = 'Primary ancestry · NCCM V6.5 Year 0';
    if (!countries.length) {
      ans.paragraphs.push('Planet Asthortera: ' + fmt(data.planet.population_billion) + ' billion unique residents. Six-category creator-ratified planetary representative model: ' + data.planet.ancestry.map((r) => r.label + ' ' + fmt(r.pct) + '%').join('; ') + '.');
      ans.limitations.push('Planet shares are a creator-ratified representative 14-country model (3,288 billion reference), NOT a fully enumerated 37-country ancestry census.');
      ans.paragraphs.push('National breakdown coverage: ' + data.coverage.complete_ancestry + ' countries assigned, ' + data.coverage.national_ancestry_unassigned + ' development countries unassigned, and ' + data.coverage.residual_states + ' other sovereign states represented as one aggregate.');
      ans.citations.push(citation(index, 'planet.ancestry_primary_pct_representative_14_country_weighted'));
    }
    for (const c of countries) {
      if (!c.ancestry.length) {
        ans.paragraphs.push(c.name + ': national primary ancestry distribution is NOT_ASSIGNED; national population is ' + fmt(c.population_billion) + ' billion.');
        ans.status = 'INSUFFICIENT_DATA';
      } else {
        const rows = explicitAncestry ? c.ancestry.filter((r) => r.key === explicitAncestry.key) : c.ancestry;
        ans.paragraphs.push(c.name + ' (' + fmt(c.population_billion) + ' billion total): ' + rows.map((r) => r.label + ' ' + fmt(r.pct) + '% = ' + fmt(r.absolute_billion!) + ' billion').join('; ') + '.');
      }
      ans.citations.push(citation(index, c.source_pointer + '.ancestry_primary_pct'));
    }
    ans.limitations.push('These labels describe mutually exclusive PRIMARY ANCESTRY, not confirmed biological species. Absolute numbers = national population × share / 100.');
    ans.suggested_routes = ['/statistics/species', '/countries'];
    return ans;
  }
  if (countries.length && has(lower, 'populasi', 'population', 'jumlah penduduk', 'jumlah warga') && !has(lower, 'gdp')) {
    ans.status = 'CANON_SOURCE';
    ans.heading = 'National populations · Year 0';
    for (const c of countries) {
      ans.paragraphs.push(c.name + ': ' + fmt(c.population_billion) + ' billion unique residents.');
      ans.citations.push(citation(index, c.source_pointer + '.population_billion'));
    }
    ans.suggested_routes = ['/countries', '/statistics/species'];
    return ans;
  }
  const qwords = words(question);
  const indicatorTokens = ['sdi', 'gdp', 'inflation', 'fertility', 'tfr', 'urbanization', 'unemployment', 'debt', 'life expectancy', 'median age', 'carbon', 'luas', 'ekonomi', 'pertumbuhan'];
  const asksMetric = indicatorTokens.some((t) => lower.includes(t)) || has(lower, 'statistik', 'statistics');
  if (asksMetric) {
    const queryIndicators = index.facts.filter((f) => {
      if (countries.length && !countries.some((c) => nl(c.name) === nl(f.entity))) return false;
      const indicator = nl(f.indicator), label = nl(f.label);
      return qwords.some((w) => indicator.includes(w) || label.includes(w)) ||
        (has(lower, 'ekonomi') && has(indicator, 'gdp', 'growth')) ||
        (has(lower, 'pertumbuhan') && has(indicator, 'growth'));
    }).slice(0, 8);
    if (queryIndicators.length > 0) {
      ans.status = 'CANON_SOURCE'; ans.heading = 'Canonical statistical observations · Year 0';
      for (const f of queryIndicators) {
        ans.paragraphs.push(f.entity + ' · ' + f.label + ': ' + fmt(f.value) + ' ' + f.unit + ' (' + f.status + ').');
        ans.citations.push({ title: f.entity + ' · ' + f.label, url: url(f.source), detail: f.source.pointer ?? f.source.path });
      }
      ans.limitations.push('Values are restricted to assigned, source-backed observations; no missing values are imputed.');
      ans.suggested_routes = ['/statistics', '/countries', '/methodology'];
      return ans;
    }
  }
  // Grounded narrative and route retrieval. This deliberately does NOT generate a new fictional event.
  const hits = index.narrative.map((n) => ({
    n,
    score: qwords.reduce((sum, w) => sum + (nl(n.name).includes(w) ? 5 : 0) + (nl(n.summary).includes(w) ? 1 : 0), 0),
  })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || (a.n.id < b.n.id ? -1 : 1)).slice(0, 5);
  if (hits.length) {
    ans.status = 'SOURCE_MATCH';
    ans.heading = 'Relevant source-grounded worldbuilding entries';
    for (const { n } of hits) {
      ans.paragraphs.push(n.name + ' (' + n.kind + ', ' + n.canon_status + ', ' + n.side + '): ' + n.summary);
      ans.citations.push({ title: n.name, url: url(n.source, n.source.line), detail: n.source.path });
    }
    ans.limitations.push('These are ranked evidence matches, not a comprehensive synthesis of every source passage. An entity mention is not proof of causality, and proposals are not canon.');
    ans.suggested_routes = ['/creative/explore', '/graph', '/creative/ideas'];
    return ans;
  }
  const links = index.routes.filter((r) => qwords.some((w) => nl(r.title + ' ' + r.summary).includes(w))).slice(0, 3);
  if (links.length) {
    ans.status = 'SOURCE_MATCH'; ans.heading = 'Relevant Statistics sections';
    ans.paragraphs.push('No directly supported numeric or narrative answer was found. Review the matched pages: ' + links.map((r) => r.title).join(', ') + '.');
    ans.suggested_routes = links.map((r) => r.href);
  } else ans.paragraphs.push('The current pinned public index cannot verify an exact answer to this question. Try a named country, NCCM Year 0 indicator, primary ancestry group, spatial habitat or narrative entity.');
  ans.limitations.push('No invented canon, artificial census completeness, LLM guess or undocumented calculations are substituted for missing evidence.');
  return ans;
}
