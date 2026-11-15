/**
 * Public, deterministic and read-only Q&A over the published evidence index. Isomorphic: the
 * browser workspace and the optional Cloudflare function run the same code.
 *
 * Every statement carries its own status: CANON_OBSERVED and CANON_DERIVED values come from
 * production main; Spatial 3D values come from remodeling main and are PROPOSED; narrative
 * matches are SOURCE_MATCH and candidate links are CANDIDATE. A question about a statistic the
 * index does not hold gets INSUFFICIENT_DATA, never a nearby number. Nothing here calls a model,
 * writes canon or reads private drafts.
 *
 * Calculator tools: a scenario question is parsed into a typed request and evaluated by the same
 * engine as /calculator (src/domain/calculator.ts). No arithmetic is repeated here, a missing
 * parameter is asked for instead of assumed, and a user assumption always yields SCENARIO.
 */
import { formatBac } from './calendar.ts';
import { PLANET_ID, RUBRIC, SCENARIO_NAMES, evaluate, modeOf, show, type CalcMode, type CalcRequest, type CalcResult, type ScenarioIndicator, type SourceAnchor, type SourceRef } from './calculator.ts';
import type { Composition, ShareRow } from './composition.ts';

export type EvidenceStatus = 'CANON_OBSERVED' | 'CANON_DERIVED' | 'MODEL_ESTIMATE' | 'SCENARIO' | 'PROPOSED' | 'INSUFFICIENT_DATA' | 'SOURCE_MATCH' | 'CANDIDATE';
export type AnswerIntent = 'ANCESTRY' | 'SPATIAL' | 'INDICATOR' | 'NARRATIVE' | 'ROUTE' | 'UNSUPPORTED' | 'EMPTY' | 'CALCULATOR';

export interface AgentFact {
  entity_id: string;
  entity: string;
  indicator: string;
  label: string;
  value: number;
  unit: string;
  display: string;
  status: 'CANON_OBSERVED' | 'CANON_DERIVED';
  source: { repository: string; commit_sha: string; path: string; pointer: string | null };
}
export interface AgentNarrative {
  id: string; name: string; kind: string; summary: string; side: string; canon_status: string;
  source: { repository: string; commit_sha: string; path: string; line: number | null; quote: string };
}
export interface AgentRelation {
  id: string; type: string; source_id: string; target_id: string;
  verification: 'VERIFIED_SOURCE_GROUNDED' | 'DECLARED_PROVENANCE';
  causal_class: string; rationale: string;
  source: { repository: string; commit_sha: string; path: string; line: number | null; quote: string };
}
export interface AgentIndex {
  schema_version: 'reltroner-agent-index.v2';
  production_sha: string;
  remodeling_sha: string | null;
  composition: Composition;
  indicators: Array<{ id: string; label: string; unit: string }>;
  facts: AgentFact[];
  narrative: AgentNarrative[];
  relations: AgentRelation[];
  /** Candidate (co-occurrence) relationships per entity. Counted, never presented as verified. */
  candidate_counts: Record<string, number>;
  routes: Array<{ title: string; href: string; summary: string }>;
  /** Source values at years other than Year 0, with their own status. Additive: older v2 indexes omit it. */
  anchors?: SourceAnchor[];
  /** Sovereign foundation year (BAC) by entity id. Additive. */
  foundations?: Record<string, number>;
}
export interface AgentCitation { title: string; url: string; detail: string }
export interface AgentStatement { text: string; status: EvidenceStatus; cite: number | null }
export interface AgentAnswer {
  mode: 'DETERMINISTIC_EVIDENCE';
  intent: AnswerIntent;
  status: EvidenceStatus | 'MIXED';
  question: string;
  heading: string;
  statements: AgentStatement[];
  citations: AgentCitation[];
  limitations: string[];
  suggested_routes: string[];
  /** On calculator answers: the validated request (for the hand-off to /calculator) and the shared result. */
  calculator?: { mode: CalcMode; request: CalcRequest | null; result: CalcResult | null };
}

export const STATUS_EXPLANATIONS: Readonly<Record<EvidenceStatus, string>> = Object.freeze({
  CANON_OBSERVED: 'Assigned directly in production main, the authoritative published source.',
  CANON_DERIVED: 'Arithmetic on canonical production values (for example population × share / 100).',
  MODEL_ESTIMATE: 'Output of a statistical model of this observatory. Never canon.',
  SCENARIO: 'Conditional on an assumption supplied with the question (a growth rate, a what-if share). Never canon.',
  PROPOSED: 'From remodeling main: creator-ratified in the remodeling workspace, not published production canon.',
  INSUFFICIENT_DATA: 'The index holds no source value for this. Nothing is estimated in its place.',
  SOURCE_MATCH: 'A ranked match in source-grounded narrative evidence, not a synthesis of every passage.',
  CANDIDATE: 'A co-occurrence or candidate link that has not been verified; never a causal claim.',
});

const MAX_QUESTION = 500;
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const num = (v: number, places = 2) => v.toLocaleString('en-US', { maximumFractionDigits: places, minimumFractionDigits: 0 });
const pct = (v: number) => `${num(v, 4)}%`;
const blobUrl = (r: { repository: string; commit_sha: string; path: string }, line?: number | null) => `https://github.com/${r.repository}/blob/${r.commit_sha}/${r.path}${line ? `#L${line}` : ''}`;
const has = (text: string, terms: readonly string[]) => terms.some((t) => new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(text));

const ANCESTRY_TERMS = ['ancestry', 'ancestries', 'keturunan', 'leluhur', 'asal-usul', 'asal usul', 'species', 'spesies', 'ras', 'etnis', 'ethnicity', 'primary ancestry', 'demographic composition', 'komposisi penduduk'];
const CATEGORY_TERMS: Readonly<Record<string, readonly string[]>> = {
  depeisit: ['depeisit'], cistheta: ['cistheta'], cosmeilian: ['cosmeilian', 'cosmeilia'], native: ['native asthorteran', 'native', 'penduduk asli', 'asli asthortera'],
  phantomkind: ['phantomkind', 'spiritual hybrid', 'hibrida spiritual'], other: ['other ancestry', 'lainnya'],
};
const SPATIAL_TERMS = ['spatial', 'spasial', '3d', 'habitat', 'habitats', 'hunian', 'tempat tinggal', 'footprint', 'jejak', 'tata ruang', 'land surface', 'permukaan tanah', 'terrestrial', 'daratan', 'underground', 'bawah tanah', 'underwater', 'bawah air', 'floating', 'mengapung', 'terapung', 'urban active', 'dormant', 'built urban', 'surface footprint'];
const SURFACE_TERMS = ['footprint', 'jejak', 'terrestrial', 'daratan', 'land use', 'penggunaan lahan', 'surface class', 'urban active', 'dormant', 'built urban', 'natural low-intervention', 'lahan'];
const HABITAT_TERMS = ['habitat', 'habitats', 'hunian', 'tempat tinggal', 'underground', 'bawah tanah', 'underwater', 'bawah air', 'floating', 'mengapung', 'terapung', 'live', 'tinggal', 'residents live'];
const HABITAT_CATEGORY: Readonly<Record<string, readonly string[]>> = {
  surface_land: ['land surface', 'permukaan tanah', 'di permukaan'], underground: ['underground', 'bawah tanah'], underwater: ['underwater', 'bawah air'], floating: ['floating', 'mengapung', 'terapung'],
};
const INDICATOR_TERMS: Readonly<Record<string, readonly string[]>> = {
  population: ['population', 'populasi', 'penduduk', 'jumlah penduduk', 'residents', 'warga', 'inhabitants'],
  sdi: ['sdi', 'sentient development index', 'indeks pembangunan', 'development index'],
  sdi_individual: ['sdi individual', 'individual component', 'komponen individu'],
  sdi_institution: ['sdi institution', 'institution component', 'komponen institusi'],
  gdp_usd: ['gdp', 'pdb', 'nominal gdp', 'produk domestik bruto'],
  gdp_per_capita: ['gdp per capita', 'pdb per kapita', 'per capita'],
  gdp_share: ['gdp share', 'share of planetary gdp', 'pangsa pdb'],
  real_gdp_growth: ['growth', 'gdp growth', 'pertumbuhan', 'pertumbuhan ekonomi'],
  inflation: ['inflation', 'inflasi'],
  unemployment: ['unemployment', 'pengangguran'],
  debt_to_gdp: ['debt', 'utang', 'government debt'],
  gini: ['gini', 'inequality', 'ketimpangan'],
  urbanization: ['urbanization', 'urbanisation', 'urbanisasi'],
  median_age: ['median age', 'usia median', 'umur median'],
  life_expectancy: ['life expectancy', 'harapan hidup', 'angka harapan hidup'],
  tfr: ['fertility', 'tfr', 'fertilitas', 'kesuburan'],
  education_access: ['education', 'pendidikan'],
  carbon_per_capita: ['carbon', 'karbon', 'emission', 'emisi', 'carbon per capita'],
  // Not a canonical Year 0 indicator; listed so that "population growth" never maps to population or GDP growth.
  population_growth: ['population growth', 'pertumbuhan penduduk'],
  land_area: ['land area', 'luas wilayah', 'luas daratan', 'area of'],
  fx_usd_per_local: ['exchange rate', 'kurs', 'nilai tukar'],
  specialization_factor: ['specialization', 'spesialisasi'],
};
const STAT_INTENT = ['berapa', 'how many', 'how much', 'what is the', "what's the", 'what was the', 'rate', 'index', 'indeks', 'level', 'tingkat', 'jumlah', 'number of', 'percentage', 'persentase', 'value of', 'nilai', 'ratio', 'rasio', 'statistic', 'statistik', 'total'];
const NARRATIVE_INTENT = ['evidence', 'bukti', 'source', 'sumber', 'say about', 'tell me about', 'who is', 'what is', 'siapa', 'apa itu', 'explain', 'jelaskan', 'ceritakan', 'history', 'sejarah'];
const STOP = new Set(['yang', 'dengan', 'untuk', 'berapa', 'what', 'about', 'tell', 'dari', 'the', 'and', 'adalah', 'dalam', 'compare', 'bandingkan', 'does', 'say', 'says', 'verified', 'evidence', 'source', 'sources', 'apa', 'itu', 'tentang', 'ini', 'dan', 'atau', 'which', 'who', 'how', 'are', 'was', 'were', 'is', 'of', 'in', 'di', 'ke', 'me', 'please', 'tolong']);

/**
 * Capitalized names in the question that match no nation, ancestry group or narrative entity of the
 * index (for example "Atlantis"). A question about an unknown entity must not fall back to the planet.
 */
function unknownNames(index: AgentIndex, question: string): string[] {
  const known = new Set<string>();
  const add = (text: string) => { for (const w of norm(text).match(/[\p{L}\p{N}]+/gu) ?? []) known.add(w); };
  for (const c of index.composition.ancestry.countries) add(c.name);
  for (const c of index.composition.spatial.countries) add(c.name);
  for (const r of index.composition.ancestry.planet.rows) add(r.label);
  for (const n of index.narrative) add(n.name);
  for (const i of index.indicators) add(i.label);
  add('Asthortera Year BAC Spatial Statistics Reltroner Studio Remodeling Production');
  const tokens = [...question.matchAll(/(?<![\p{L}\p{N}])(\p{Lu}[\p{Ll}]{2,})(?![\p{L}\p{N}])/gu)];
  return [...new Set(tokens.filter((m) => (m.index ?? 0) > 0 && !known.has(norm(m[1]!))).map((m) => m[1]!))];
}

function words(text: string): string[] {
  return (norm(text).match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w));
}

class Builder {
  readonly a: AgentAnswer;
  constructor(question: string, intent: AnswerIntent, heading: string) {
    this.a = { mode: 'DETERMINISTIC_EVIDENCE', intent, status: 'INSUFFICIENT_DATA', question, heading, statements: [], citations: [], limitations: [], suggested_routes: ['/statistics', '/methodology'] };
  }
  cite(c: AgentCitation): number {
    const i = this.a.citations.findIndex((x) => x.url === c.url && x.detail === c.detail);
    if (i >= 0) return i;
    this.a.citations.push(c);
    return this.a.citations.length - 1;
  }
  say(text: string, status: EvidenceStatus, cite: number | null = null): this {
    this.a.statements.push({ text, status, cite });
    return this;
  }
  done(routes?: string[]): AgentAnswer {
    if (routes) this.a.suggested_routes = routes;
    const statuses = [...new Set(this.a.statements.map((s) => s.status))];
    this.a.status = statuses.length === 1 ? statuses[0]! : statuses.length === 0 ? 'INSUFFICIENT_DATA' : 'MIXED';
    return this.a;
  }
}

function countriesIn(index: AgentIndex, q: string): Array<{ id: string; name: string }> {
  const seen = new Map<string, { id: string; name: string; at: number }>();
  for (const c of [...index.composition.ancestry.countries, ...index.composition.spatial.countries]) {
    const at = q.search(new RegExp(`(?<![\\p{L}])${norm(c.name)}(?![\\p{L}])`, 'u'));
    if (at >= 0 && !seen.has(c.id)) seen.set(c.id, { id: c.id, name: c.name, at });
  }
  return [...seen.values()].sort((x, y) => x.at - y.at).map(({ id, name }) => ({ id, name }));
}

function ancestryAnswer(index: AgentIndex, question: string, q: string, named: Array<{ id: string; name: string }>): AgentAnswer {
  const comp = index.composition;
  const src = comp.sources.production;
  const b = new Builder(question, 'ANCESTRY', 'Primary ancestry · NCCM V6.5 Year 0 (production main)');
  const categories = Object.entries(CATEGORY_TERMS).filter(([, terms]) => has(q, terms)).map(([k]) => k);
  const pick = (rows: ShareRow[]) => (categories.length ? rows.filter((r) => categories.includes(r.key)) : rows);
  if (!named.length) {
    const c = b.cite({ title: 'NCCM V6.5 · production main', url: blobUrl(src), detail: `${comp.ancestry.planet.pointer} · ${src.commit_sha.slice(0, 12)}` });
    b.say(`Asthortera (representative benchmark of the 14 profiled nations, reference ${num(comp.ancestry.planet.reference_population_billion, 0)} B): ${pick(comp.ancestry.planet.rows).map((r) => `${r.label} ${pct(r.pct)}`).join('; ')}.`, 'CANON_OBSERVED', c);
    b.say(`Representative headcounts at ${num(comp.ancestry.planet.population_billion, 0)} B residents: ${pick(comp.ancestry.planet.rows).map((r) => `${r.label} ${num(r.absolute_billion)} B`).join('; ')}.`, 'CANON_DERIVED', c);
    b.say(`National shares are assigned for ${comp.ancestry.coverage.assigned} nations; ${comp.ancestry.coverage.not_assigned} nations have none, and ${comp.ancestry.coverage.residual_states} states are one combined aggregate.`, 'CANON_OBSERVED', c);
    b.a.limitations.push(`The planetary shares are a creator-ratified benchmark of the 14 profiled nations, not a census of all ${comp.ancestry.planet.sovereign_states} states.`);
  }
  const assignedRows: Array<{ name: string; rows: ShareRow[]; population: number }> = [];
  for (const n of named) {
    const c = comp.ancestry.countries.find((x) => x.id === n.id);
    if (!c) {
      b.say(`${n.name}: not a nation of the production ancestry record.`, 'INSUFFICIENT_DATA');
      continue;
    }
    const cite = b.cite({ title: `${c.name} · NCCM V6.5 production main`, url: blobUrl(src), detail: `${c.pointer}.ancestry_primary_pct · ${src.commit_sha.slice(0, 12)}` });
    if (c.status !== 'ASSIGNED') {
      b.say(`${c.name}: national primary ancestry shares are not assigned in production main (unknown, not zero). Population: ${num(c.population_billion)} B.`, 'INSUFFICIENT_DATA', cite);
      continue;
    }
    const rows = pick(c.rows);
    b.say(`${c.name} (${num(c.population_billion)} B residents): ${rows.map((r) => `${r.label} ${pct(r.pct)}`).join('; ')}.`, 'CANON_OBSERVED', cite);
    b.say(`${c.name} residents by ancestry (population × share / 100): ${rows.map((r) => `${r.label} ${num(r.absolute_billion)} B`).join('; ')}.`, 'CANON_DERIVED', cite);
    assignedRows.push({ name: c.name, rows, population: c.population_billion });
    if (c.remodeling.status === 'DIFFERENT') b.say(`Remodeling main proposes different shares for ${c.name}; they are proposals and are not used here.`, 'PROPOSED');
  }
  if (assignedRows.length >= 2) {
    const [x, y] = assignedRows as [typeof assignedRows[number], typeof assignedRows[number]];
    const diffs = x.rows.map((r) => {
      const other = y.rows.find((o) => o.key === r.key)!;
      const d = r.pct - other.pct;
      return `${r.label} ${d > 0 ? '+' : d < 0 ? '−' : '±'}${num(Math.abs(d))} pp`;
    });
    b.say(`${x.name} minus ${y.name}, in percentage points of each nation's own residents: ${diffs.join('; ')}.`, 'CANON_DERIVED');
  }
  b.a.limitations.push('Primary ancestry is not a confirmed biological species classification.');
  return b.done(['/statistics/species', '/countries']);
}

function spatialAnswer(index: AgentIndex, question: string, q: string, named: Array<{ id: string; name: string }>): AgentAnswer {
  const comp = index.composition;
  const src = comp.sources.remodeling;
  const b = new Builder(question, 'SPATIAL', 'Spatial 3D composition · Year 0 (remodeling main)');
  if (!src || !comp.spatial.countries.length) {
    b.say('The index holds no Spatial 3D records: the pinned remodeling source carries none.', 'INSUFFICIENT_DATA');
    return b.done(['/statistics/spatial']);
  }
  const wantsSurface = has(q, SURFACE_TERMS);
  const wantsHabitat = has(q, HABITAT_TERMS);
  const both = wantsSurface === wantsHabitat;
  const habitatKeys = Object.entries(HABITAT_CATEGORY).filter(([, t]) => has(q, t)).map(([k]) => k);
  const targets = named.length ? named : [];
  if (!targets.length) {
    b.say(`Spatial 3D composition is assigned for ${comp.spatial.coverage.surface_assigned} nations (surface footprint) and ${comp.spatial.coverage.habitat_assigned} nations (home habitats). Name a nation for its values.`, 'PROPOSED',
      b.cite({ title: 'NCCM V6.5 · remodeling main', url: blobUrl(src), detail: `countries_14 / countries_5 .spatial_3d_canon · ${src.commit_sha.slice(0, 12)}` }));
  }
  for (const n of targets) {
    const c = comp.spatial.countries.find((x) => x.id === n.id);
    if (!c) {
      b.say(`${n.name}: no remodeling record.`, 'INSUFFICIENT_DATA');
      continue;
    }
    const cite = b.cite({ title: `${c.name} · NCCM V6.5 remodeling main`, url: blobUrl(src), detail: `${c.pointer}.spatial_3d_canon · ${src.commit_sha.slice(0, 12)}` });
    if (both || wantsSurface) {
      if (c.surface_status !== 'ASSIGNED') b.say(`${c.name}: the terrestrial surface footprint is not assigned (not zero).`, 'INSUFFICIENT_DATA', cite);
      else b.say(`${c.name} terrestrial surface footprint, share of ${c.land_area_million_km2 === null ? 'national land (area not assigned)' : `${num(c.land_area_million_km2)} million km² of national land`}: ${c.surface.map((r) => `${r.label} ${pct(r.pct)}${r.area_million_km2 === null ? '' : ` (${num(r.area_million_km2)} million km²)`}`).join('; ')}.`, 'PROPOSED', cite);
    }
    if (both || wantsHabitat) {
      const rows = habitatKeys.length ? c.habitats.filter((r) => habitatKeys.includes(r.key)) : c.habitats;
      if (c.habitat_status !== 'ASSIGNED') b.say(`${c.name}: principal home habitats are not assigned (not zero).`, 'INSUFFICIENT_DATA', cite);
      else b.say(`${c.name} principal home habitats, share of ${num(c.population_billion)} B unique usual residents: ${rows.map((r) => `${r.label} ${pct(r.pct)} (${num(r.absolute_billion)} B)`).join('; ')}.`, 'PROPOSED', cite);
    }
    if (c.production_land_area_million_km2 !== null && c.land_area_million_km2 !== null && c.production_land_area_million_km2 !== c.land_area_million_km2) {
      b.say(`${c.name}'s land area is ${num(c.production_land_area_million_km2)} million km² in production main and ${num(c.land_area_million_km2)} million km² in remodeling main; spatial areas use the remodeling value only.`, 'PROPOSED', cite);
    }
  }
  b.a.limitations.push('Spatial 3D values are creator-ratified inside remodeling main and not published to Studio production.');
  b.a.limitations.push('Surface shares use national terrestrial land; habitat shares use unique usual residents; neither is urbanization. Polygons, km³ volumes, marine residence by depth and habitat capacity are unassigned, not zero.');
  return b.done(['/statistics/spatial', '/statistics/species']);
}

function indicatorAnswer(index: AgentIndex, question: string, indicators: string[], named: Array<{ id: string; name: string }>, planet: boolean): AgentAnswer {
  const b = new Builder(question, 'INDICATOR', 'Statistical observations · Year 0 (production main)');
  const entities = [...named.map((n) => ({ id: n.id, name: n.name })), ...(planet || !named.length ? [{ id: 'planet:asthortera', name: 'Asthortera' }] : [])];
  if (!named.length && !planet) b.say('No nation was named, so the planetary value of Asthortera is shown.', 'CANON_OBSERVED');
  for (const e of entities) {
    for (const ind of indicators) {
      const f = index.facts.find((x) => x.entity_id === e.id && x.indicator === ind);
      const label = index.indicators.find((i) => i.id === ind)?.label ?? ind;
      if (!f) {
        b.say(`${e.name} · ${label}: no assigned Year 0 value in production main. Nothing is estimated in its place.`, 'INSUFFICIENT_DATA');
        continue;
      }
      b.say(`${e.name} · ${f.label}: ${f.display}.`, f.status, b.cite({ title: `${e.name} · ${f.label}`, url: blobUrl(f.source), detail: `${f.source.pointer ?? f.source.path} · ${f.source.commit_sha.slice(0, 12)}` }));
    }
  }
  b.a.limitations.push('Only assigned production values are reported; unassigned values are not imputed and remodeling proposals are not used.');
  return b.done(['/statistics', '/countries', '/methodology']);
}

function narrativeAnswer(index: AgentIndex, question: string, q: string): AgentAnswer | null {
  const qw = words(question);
  const degree = (id: string) => index.relations.filter((r) => r.source_id === id || r.target_id === id).length + (index.candidate_counts[id] ?? 0);
  const scored = index.narrative.map((n) => {
    const name = norm(n.name);
    const exact = name.length > 3 && q.includes(name) ? 10 : 0;
    return { n, degree: degree(n.id), score: exact + qw.reduce((s, w) => s + (name.split(/[^\p{L}\p{N}]+/u).includes(w) ? 4 : 0) + (norm(n.summary).includes(w) ? 1 : 0), 0) };
  }).filter((x) => x.score >= 4)
    // Better-connected entities first among equal matches, so the dossier with evidence leads.
    .sort((x, y) => y.score - x.score || y.degree - x.degree || (x.n.id < y.n.id ? -1 : 1)).slice(0, 3);
  if (!scored.length) return null;
  const b = new Builder(question, 'NARRATIVE', 'Source-grounded worldbuilding evidence');
  const byId = new Map(index.narrative.map((n) => [n.id, n]));
  const lead = norm(scored[0]!.n.name);
  // Entities that share the leading name (for example a faction dossier and an organization dossier) are one subject.
  const subject = new Set(scored.filter((x) => norm(x.n.name) === lead).map((x) => x.n.id));
  for (const { n } of scored) {
    b.say(`${n.name} (${n.kind}, ${n.canon_status === 'CANON_OBSERVED' ? 'production canon' : `${n.canon_status.toLowerCase()}, ${n.side}`}): ${n.summary}`, 'SOURCE_MATCH',
      b.cite({ title: n.name, url: blobUrl(n.source, n.source.line), detail: `${n.source.path}${n.source.line ? `:${n.source.line}` : ''}` }));
  }
  const ORDER = ['CONFLICTS_WITH', 'DEFINES', 'CONSTRAINED_BY', 'MOTIVATED_BY', 'DERIVED_FROM', 'PARTICIPATES_IN', 'LOCATED_IN', 'THEMATICALLY_RELATED', 'PROPOSES_CHANGE_TO', 'APPEARS_IN'];
  const rank = (t: string) => (ORDER.indexOf(t) < 0 ? ORDER.length : ORDER.indexOf(t));
  // Substantive statements first; name appearances last. Production-verified before remodeling-declared.
  const rels = index.relations.filter((r) => subject.has(r.source_id) || subject.has(r.target_id))
    .sort((x, y) => (x.verification === y.verification ? 0 : x.verification === 'VERIFIED_SOURCE_GROUNDED' ? -1 : 1) || rank(x.type) - rank(y.type) || (x.id < y.id ? -1 : 1)).slice(0, 6);
  for (const r of rels) {
    const name = (id: string) => byId.get(id)?.name ?? id;
    const thematic = r.causal_class === 'THEMATIC_ONLY' || r.type === 'THEMATICALLY_RELATED';
    b.say(`${name(r.source_id)} ${r.type.replaceAll('_', ' ').toLowerCase()} ${name(r.target_id)}${thematic ? ' (a thematic relation only, not a causal claim)' : ''}: “${r.source.quote}”`,
      r.verification === 'DECLARED_PROVENANCE' ? 'PROPOSED' : 'SOURCE_MATCH', b.cite({ title: `${r.type} · ${r.source.path}`, url: blobUrl(r.source, r.source.line), detail: `${r.source.path}${r.source.line ? `:${r.source.line}` : ''} · ${r.verification}` }));
  }
  const candidates = [...subject].reduce((n, id) => n + (index.candidate_counts[id] ?? 0), 0);
  const subjectName = scored[0]!.n.name;
  if (candidates) b.say(`${candidates} further link${candidates === 1 ? '' : 's'} of ${subjectName} ${candidates === 1 ? 'is a candidate co-occurrence' : 'are candidate co-occurrences'} in the knowledge graph. They are not verified and are not causal claims.`, 'CANDIDATE');
  b.a.limitations.push('These are ranked evidence matches, not a synthesis of every passage. A mention is not proof of causality, and proposals are not canon.');
  return b.done(['/creative/explore', '/graph', '/creative/decisions']);
}

// ---------------------------------------------------------------- calculator tools (shared engine, bounded parsing)
const WHAT_IF = ['if', 'jika', 'kalau', 'seandainya', 'andai', 'suppose', 'would', 'hypothetical', 'hipotetis', 'assuming', 'changed to', 'berubah menjadi', 'menjadi'];
const GROWTH = ['grow', 'grows', 'grew', 'growing', 'growth', 'tumbuh', 'bertumbuh', 'pertumbuhan', 'increase', 'increases', 'naik', 'meningkat', 'annually', 'annual', 'per year', 'per tahun', 'tahunan', 'setiap tahun'];
const DECLINE = ['shrink', 'shrinks', 'decline', 'declines', 'decrease', 'decreases', 'turun', 'menyusut', 'berkurang'];
const PAST = ['before year 0', 'years before', 'years earlier', 'years ago', 'sebelum tahun 0', 'tahun sebelum', 'tahun yang lalu', 'tahun lalu', 'backcast'];
const SWEEP = ['sensitivity', 'sensitivitas', 'sweep'];
const COOPERATION = ['cooperation', 'cooperate', 'kerja sama', 'kerjasama', 'bekerja sama'];
const NOT_CANON_SUBJECT = ['backcast', 'backcasting', 'reconstruction', 'rekonstruksi', 'projection', 'proyeksi', 'scenario', 'skenario'];
const SCENARIO_TERMS: Readonly<Record<ScenarioIndicator, readonly string[]>> = {
  gdp_per_capita: ['gdp per capita', 'pdb per kapita', 'per capita', 'per kapita'],
  gdp_usd: ['gdp', 'pdb', 'nominal gdp', 'produk domestik bruto'],
  population: ['population', 'populasi', 'populasinya', 'penduduk', 'penduduknya', 'residents', 'warga', 'inhabitants'],
};
/** Indicators that are not a compound-scenario baseline. Naming one yields INSUFFICIENT_DATA, never a substitute. */
const NOT_PROJECTED = Object.keys(INDICATOR_TERMS).filter((id) => !['population', 'gdp_usd', 'gdp_per_capita', 'gdp_share', 'real_gdp_growth', 'population_growth'].includes(id));

const NUMBER_START = '(?:^|[^\\p{L}\\p{N}.])';
/** Percentages in order of appearance; a decimal comma is accepted ("0,5%"). */
function percents(q: string): number[] {
  return [...q.matchAll(new RegExp(`${NUMBER_START}([+\\-−]?)(\\d+(?:[.,]\\d+)?)\\s?(?:%|percent|persen)`, 'gu'))].map((m) => (m[1] === '-' || m[1] === '−' ? -1 : 1) * Number(m[2]!.replace(',', '.')));
}
function firstInt(q: string, unit: string): number | null {
  const m = new RegExp(`${NUMBER_START}(\\d{1,5})\\s?-?\\s?(?:${unit})(?![\\p{L}\\p{N}])`, 'u').exec(q);
  return m ? Number(m[1]) : null;
}

function calculationAnswer(index: AgentIndex, question: string, request: CalcRequest): AgentAnswer {
  const outcome = evaluate(index, request);
  if (!outcome.ok) {
    const b = new Builder(question, 'CALCULATOR', 'Calculator · not evaluated').say(outcome.message, 'INSUFFICIENT_DATA');
    b.a.limitations.push(outcome.status === 'INSUFFICIENT_DATA' ? 'No value is estimated, filled in or borrowed from another entity or indicator.' : 'The request is outside the supported range. Nothing is clamped or adjusted silently.');
    const a = b.done(['/calculator', '/methodology']);
    a.calculator = { mode: modeOf(request), request: null, result: null };
    return a;
  }
  const r = outcome.result;
  const b = new Builder(question, 'CALCULATOR', `Calculator · ${r.title}`);
  const cite = (s: SourceRef | null) => (s ? b.cite({ title: `${s.role === 'production' ? 'Production main' : 'Remodeling main'} · ${s.path}`, url: s.url, detail: `${s.pointer ?? s.path} · ${s.commit_sha.slice(0, 12)}` }) : null);
  for (const s of r.summary) b.say(s.text, s.status, cite(s.source));
  for (const e of r.evidence) b.say(`${e.label}: ${e.text}`, e.state === 'SOURCE_PASSAGE' ? 'SOURCE_MATCH' : 'INSUFFICIENT_DATA', cite(e.source));
  b.say(`Method: ${r.formula_expression} (formula ${r.formula_id}, version ${r.formula_version}). ${r.assumptions.map((x) => x.text).join(' ')}`.trim(), r.result_status);
  b.a.limitations.push(...r.limitations);
  const a = b.done(['/calculator', '/methodology']);
  // A computed value is as strong as its result status; an unscored rubric keeps its mix of passages and gaps.
  if (r.result_value !== null) a.status = r.result_status;
  a.calculator = { mode: modeOf(request), request, result: r };
  return a;
}

/** Explains a request handed over by /calculator. The result is recomputed here; stored numbers are never trusted. */
export function answerCalculation(index: AgentIndex, request: CalcRequest): AgentAnswer {
  return calculationAnswer(index, '', request);
}

function inputsNeeded(question: string, mode: CalcMode, missing: string[]): AgentAnswer {
  const b = new Builder(question, 'CALCULATOR', 'Calculator · inputs needed');
  b.say(`This reads as a scenario, but it cannot be evaluated as asked. Missing or ambiguous: ${missing.join('; ')}. Nothing is assumed in its place.`, 'INSUFFICIENT_DATA');
  b.a.limitations.push('A scenario is evaluated only when every parameter is stated. Enter the inputs in the Calculator to run it.');
  const a = b.done(['/calculator', '/methodology']);
  a.calculator = { mode, request: null, result: null };
  return a;
}

function whyNotCanon(index: AgentIndex, question: string): AgentAnswer {
  const b = new Builder(question, 'CALCULATOR', 'Why a backcast or projection is not canon');
  const anchors = index.anchors ?? [];
  b.say('A backcast divides a Year 0 source value by an assumed growth factor (past = anchor ÷ (1 + rate)^elapsed years); a projection multiplies by it. The rate is an assumption supplied with the question, so the output is a SCENARIO: conditional on that rate and observed by no source.', 'SCENARIO');
  b.say(`Canon is only what production main assigns (CANON_OBSERVED) or computes from its own values (CANON_DERIVED). The source holds sparse values, not an annual series: one Year 0 value per indicator and ${anchors.length} earlier value${anchors.length === 1 ? '' : 's'} in this index. The years between them are not observed and are never interpolated.`, 'INSUFFICIENT_DATA');
  const observed = anchors.find((x) => x.status === 'CANON_OBSERVED' && x.indicator === 'population') ?? anchors.find((x) => x.status === 'CANON_OBSERVED');
  if (observed) {
    b.say(`By contrast, this value is canon because the source states it: ${observed.entity} · ${observed.label} was ${show(observed.value, observed.unit)} in ${formatBac(observed.year_bac)}.`, 'CANON_OBSERVED',
      b.cite({ title: `${observed.entity} · ${observed.label} · ${formatBac(observed.year_bac)}`, url: blobUrl(observed.source, observed.source.line), detail: `${observed.source.path}${observed.source.line ? `:${observed.source.line}` : ''} · ${observed.source.commit_sha.slice(0, 12)}` }));
  }
  b.say('Nothing the Calculator or this Assistant computes is written to a source or ratified. Only the creator changes canon, in the source repositories.', 'SCENARIO');
  b.a.limitations.push('A conditional historical backcast must not be read as a historical population or statistic.', 'An empirical forecast would need many observed points; with these sparse values it stays INSUFFICIENT_DATA_FOR_EMPIRICAL_FORECAST.');
  const a = b.done(['/calculator', '/history', '/methodology']);
  a.status = 'SCENARIO';
  a.calculator = { mode: 'backcast', request: null, result: null };
  return a;
}

/** Null unless the question is one of the bounded calculator patterns; every other question keeps its existing answer. */
function calculatorAnswer(index: AgentIndex, question: string, q: string, named: Array<{ id: string; name: string }>, planet: boolean): AgentAnswer | null {
  if (has(q, NOT_CANON_SUBJECT) && has(q, ['canon', 'canonical', 'kanon']) && has(q, ['why', 'mengapa', 'kenapa', 'not', 'bukan'])) return whyNotCanon(index, question);
  if (has(q, COOPERATION) && ['country:reltronland', 'country:depcutland'].every((id) => named.some((n) => n.id === id))) {
    const weights = Object.fromEntries(RUBRIC.criteria.map((c) => [c.id, 1])) as Extract<CalcRequest, { operation: 'evaluateQualitativeScenario' }>['weights'];
    return calculationAnswer(index, question, { operation: 'evaluateQualitativeScenario', weights, scores: { A: {}, B: {}, C: {} } });
  }
  let rates = percents(q);
  const years = firstInt(q, 'years?|yrs?|tahun');
  const bac = firstInt(q, 'bac');
  const whatIf = has(q, WHAT_IF);
  const growth = has(q, GROWTH) || has(q, DECLINE);
  const past = has(q, PAST) || bac !== null;
  const habitat = Object.entries(HABITAT_CATEGORY).filter(([, t]) => has(q, t)).map(([k]) => k);
  const ancestry = Object.entries(CATEGORY_TERMS).filter(([, t]) => has(q, t)).map(([k]) => k);
  const shareIntent = whatIf && !growth && rates.length > 0 && habitat.length + ancestry.length > 0;
  const scenarioIntent = (growth && (rates.length > 0 || years !== null) && (whatIf || years !== null || past)) || (past && rates.length > 0);
  if (!shareIntent && !scenarioIntent) return null;

  const unknown = named.length || planet ? [] : unknownNames(index, question);
  if (unknown.length) {
    const b = new Builder(question, 'CALCULATOR', 'Calculator · not an entity of the evidence index');
    b.say(`${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not a nation or entity of the evidence index, so there is no source value to start from. No other nation and no planetary value is substituted.`, 'INSUFFICIENT_DATA');
    const a = b.done(['/calculator', '/countries']);
    a.calculator = { mode: shareIntent ? 'calculate' : past ? 'backcast' : 'future', request: null, result: null };
    return a;
  }
  if (shareIntent) {
    const categories = [...habitat, ...ancestry];
    if (named.length !== 1 || rates.length !== 1 || categories.length !== 1) return inputsNeeded(question, 'calculate', ['exactly one nation, one category and one share in percent']);
    return calculationAnswer(index, question, { operation: 'calculate', formula: habitat.length ? 'population_x_habitat_share' : 'population_x_ancestry_share', entity_id: named[0]!.id, category: categories[0]!, share_pct: rates[0]! });
  }

  const mode: CalcMode = past ? 'backcast' : rates.length > 1 ? 'compare' : 'future';
  let indicators = (Object.keys(SCENARIO_TERMS) as ScenarioIndicator[]).filter((id) => has(q, SCENARIO_TERMS[id]));
  if (indicators.includes('gdp_per_capita')) indicators = indicators.filter((id) => id !== 'gdp_usd');
  if (!indicators.length && NOT_PROJECTED.some((id) => has(q, INDICATOR_TERMS[id]!))) {
    const b = new Builder(question, 'CALCULATOR', 'Calculator · indicator not supported for scenarios');
    b.say('Compound scenarios start from population, nominal GDP or GDP per capita. No scenario is computed for another indicator, and no other indicator is substituted.', 'INSUFFICIENT_DATA');
    const a = b.done(['/calculator', '/statistics']);
    a.calculator = { mode, request: null, result: null };
    return a;
  }
  const entity = named.length === 1 ? named[0]!.id : !named.length && planet ? PLANET_ID : null;
  const missing = [
    ...(entity ? [] : ['one nation (or Asthortera)']),
    ...(indicators.length === 1 ? [] : ['one indicator: population, nominal GDP or GDP per capita']),
    ...(rates.length ? [] : ['an annual rate in percent']),
    ...(past ? ((bac ?? years) === null ? ['how many years before Year 0, or a BAC year'] : rates.length > 1 ? ['a single annual rate'] : []) : years === null ? ['a horizon in years'] : []),
  ];
  if (missing.length || !entity) return inputsNeeded(question, mode, missing);
  if (has(q, DECLINE)) rates = rates.map((r) => (r > 0 ? -r : r));
  const base = { entity_id: entity, indicator: indicators[0]! };
  if (past) return calculationAnswer(index, question, { operation: 'reconstructScenario', ...base, target_bac: (bac ?? years)!, annual_rate_pct: rates[0]!, label: 'Assistant backcast' });
  if (rates.length === 1) return calculationAnswer(index, question, { operation: 'projectScenario', ...base, annual_rate_pct: rates[0]!, horizon_years: years!, label: 'Assistant scenario' });
  if (rates.length === 2 && has(q, SWEEP)) {
    return calculationAnswer(index, question, { operation: 'analyzeSensitivity', ...base, horizon_years: years!, rate_min_pct: Math.min(...rates), rate_max_pct: Math.max(...rates), steps: firstInt(q, 'steps?|samples?|langkah|sampel') ?? 11 });
  }
  const ordered = [...rates].sort((x, y) => x - y);
  const names = ordered.length === 3 ? SCENARIO_NAMES : ordered.length === 2 ? ['Lower rate', 'Higher rate'] : ordered.map((_, i) => `Scenario ${i + 1}`);
  return calculationAnswer(index, question, { operation: 'compareScenarios', ...base, horizon_years: years!, scenarios: ordered.map((r, i) => ({ label: names[i]!, annual_rate_pct: r })) });
}

export function answerQuestion(index: AgentIndex, rawQuestion: string): AgentAnswer {
  const question = rawQuestion.trim().slice(0, MAX_QUESTION);
  if (question.length < 3) {
    return new Builder(question, 'EMPTY', 'Ask a longer question').say('Enter at least three characters: a nation, an indicator, a primary ancestry group, a spatial habitat or a worldbuilding entity.', 'INSUFFICIENT_DATA').done();
  }
  const q = norm(question);
  const named = countriesIn(index, q);
  const planet = has(q, ['asthortera', 'planet', 'planetary', 'planeter', 'seluruh planet']);
  const calculated = calculatorAnswer(index, question, q, named, planet);
  if (calculated) return calculated;
  const unknown = named.length || planet ? [] : unknownNames(index, question);
  const category = Object.values(CATEGORY_TERMS).some((t) => has(q, t));
  const spatial = has(q, SPATIAL_TERMS);
  const ancestry = has(q, ANCESTRY_TERMS) || (category && (named.length > 0 || has(q, INDICATOR_TERMS.population!) || has(q, STAT_INTENT)));
  if (spatial) return spatialAnswer(index, question, q, named);
  if (ancestry) return ancestryAnswer(index, question, q, named);

  // Indicators: a more specific term wins over a shorter one it contains (e.g. "gdp per capita" over "gdp").
  const matches = Object.entries(INDICATOR_TERMS).flatMap(([id, terms]) => terms.filter((t) => has(q, [t])).map((t) => ({ id, t })));
  const indicators = [...new Set(matches.filter((m) => !matches.some((o) => o !== m && o.t.length > m.t.length && o.t.includes(m.t) && o.id !== m.id)).map((m) => m.id))]
    .filter((id) => index.indicators.some((i) => i.id === id));
  if (indicators.length && unknown.length) {
    const b = new Builder(question, 'UNSUPPORTED', 'Not an entity of the evidence index');
    b.say(`${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not a nation or entity of the evidence index, so no value can be reported. The planetary value is not substituted.`, 'INSUFFICIENT_DATA');
    b.a.limitations.push(`Nations in the index: ${index.composition.ancestry.countries.map((c) => c.name).join(', ')}; plus the planet Asthortera and one aggregate of deferred states.`);
    return b.done(['/countries', '/statistics']);
  }
  if (indicators.length) return indicatorAnswer(index, question, indicators, named, planet);

  const statIntent = has(q, STAT_INTENT);
  if (statIntent && (named.length || planet)) {
    const b = new Builder(question, 'UNSUPPORTED', 'No source value for this statistic');
    b.say(`The evidence index holds no statistic matching this question for ${[...named.map((n) => n.name), ...(planet ? ['Asthortera'] : [])].join(', ')}. No value is estimated or borrowed from another indicator.`, 'INSUFFICIENT_DATA');
    b.a.limitations.push(`Indexed Year 0 indicators: ${index.indicators.map((i) => i.label).join(', ')}; plus primary ancestry (production) and Spatial 3D composition (remodeling).`);
    return b.done(['/statistics', '/countries', '/methodology']);
  }
  const narrative = narrativeAnswer(index, question, q);
  if (narrative && (!statIntent || has(q, NARRATIVE_INTENT))) return narrative;
  if (statIntent) {
    const b = new Builder(question, 'UNSUPPORTED', 'No source value for this statistic');
    b.say('The evidence index holds no entity or indicator that matches this question. Nothing is estimated in its place.', 'INSUFFICIENT_DATA');
    b.a.limitations.push(`Indexed Year 0 indicators: ${index.indicators.map((i) => i.label).join(', ')}.`);
    return b.done(['/statistics', '/methodology']);
  }
  const qw = words(question);
  const links = index.routes.filter((r) => qw.some((w) => norm(`${r.title} ${r.summary}`).includes(w))).slice(0, 3);
  const b = new Builder(question, links.length ? 'ROUTE' : 'UNSUPPORTED', links.length ? 'Relevant Statistics sections' : 'Insufficient evidence to answer');
  if (links.length) b.say(`No numeric or narrative evidence answers this directly. Related pages: ${links.map((r) => r.title).join(', ')}.`, 'INSUFFICIENT_DATA');
  else b.say('The published evidence index cannot verify an answer. Try a nation, a Year 0 indicator, a primary ancestry group, a spatial habitat or a worldbuilding entity.', 'INSUFFICIENT_DATA');
  return b.done(links.length ? links.map((r) => r.href) : ['/statistics', '/creative/explore', '/methodology']);
}
