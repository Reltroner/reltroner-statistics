import type { Cohort, Entity, EntityKind, Observation, ObservationSource, StatisticsDataset, TimelineEvent, RangeAnnotation } from '../domain/observation.ts';
import type { EpistemicStatus } from '../domain/status.ts';
import { INDICATORS, PLANET_INDICATORS, indicatorUnit } from '../domain/indicators.ts';
import { intervalPeriod, pointPeriod, type Period } from '../domain/calendar.ts';
import type { SourceSnapshot } from './comparator.ts';
import { sha256Hex } from './git-objects.ts';
import { applyEvidenceRule, EVIDENCE_RULES } from './evidence-registry.ts';
import { codeUnitCompare } from './canonical.ts';

export const NCCM_DATASET_PATH = 'data/asthortera/nccm-v6-active-cross-domain.json';
const decoder = new TextDecoder();

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

export function slug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function get(obj: unknown, dotted: string): { state: 'ASSIGNED' | 'NULL' | 'MISSING'; value: unknown } {
  let cur: unknown = obj;
  for (const part of dotted.split('.')) {
    if (!isObj(cur) || !(part in cur)) return { state: 'MISSING', value: undefined };
    cur = cur[part];
  }
  return cur === null ? { state: 'NULL', value: null } : { state: 'ASSIGNED', value: cur };
}

async function readText(s: SourceSnapshot | null, path: string): Promise<{ text: string; blob: string } | null> {
  const e = s?.entries.get(path);
  if (!s || !e || e.type !== 'blob') return null;
  return { text: decoder.decode(await s.readBlob(e.sha)), blob: e.sha };
}

const isCanon = (label: unknown) => typeof label === 'string' && /^C(\b|_|$)/.test(label);

function obsId(role: string, entity: string, indicator: string, period: Period, model: string | null): string {
  return `OBS-${sha256Hex(`${role}|${entity}|${indicator}|${period.label}|${model ?? ''}`).slice(0, 12).toUpperCase()}`;
}

function humanize(key: string): string {
  const s = key.replace(/_bac$/, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface Ctx {
  snapshot: SourceSnapshot;
  blob: string;
  path: string;
  model: string | null;
  proposals: boolean;
}

function source(ctx: Ctx, pointer: string | null, line: number | null = null): ObservationSource {
  return {
    role: ctx.snapshot.identity.role,
    repository: ctx.snapshot.identity.repository,
    commit_sha: ctx.snapshot.identity.commit_sha,
    path: ctx.path,
    blob_sha: ctx.blob,
    pointer,
    line,
  };
}

function makeObs(ctx: Ctx, o: {
  entity_id: string; entity_name: string; entity_kind: EntityKind; cohort: Cohort; indicator_id: string;
  raw: { state: 'ASSIGNED' | 'NULL' | 'MISSING'; value: unknown }; period: Period; canonStatus: EpistemicStatus;
  pointer: string; statusLabel?: string | null; model?: string | null;
}): Observation | null {
  const numeric = typeof o.raw.value === 'number' && Number.isFinite(o.raw.value);
  if (o.raw.state === 'ASSIGNED' && !numeric) return null; // non-numeric members are not statistics
  const value = numeric ? (o.raw.value as number) : null;
  const status: EpistemicStatus = ctx.proposals ? 'PROPOSED' : value === null ? 'INSUFFICIENT_DATA' : o.canonStatus;
  const model = o.model === undefined ? ctx.model : o.model;
  return {
    id: obsId(ctx.snapshot.identity.role, o.entity_id, o.indicator_id, o.period, model),
    entity_id: o.entity_id,
    entity_name: o.entity_name,
    entity_kind: o.entity_kind,
    cohort: o.cohort,
    indicator_id: o.indicator_id,
    value,
    value_state: o.raw.state,
    unit: indicatorUnit(o.indicator_id),
    period: o.period,
    status,
    source: source(ctx, o.pointer),
    model_version: model,
    source_status_label: o.statusLabel ?? null,
    evidence: null,
  };
}

function extractDataset(doc: Json, ctx: Ctx): { entities: Entity[]; observations: Observation[]; timeline: TimelineEvent[] } {
  const entities: Entity[] = [];
  const observations: Observation[] = [];
  const timeline: TimelineEvent[] = [];
  const datasetCanon = isCanon((doc.canon_ratification as Json | undefined)?.status);
  const year0 = pointPeriod(0);
  const foundations = new Map<string, number>();
  const hf = doc.historical_foundations as Json | undefined;
  if (Array.isArray(hf?.ordered_core)) {
    for (const f of hf.ordered_core as Json[]) {
      if (typeof f.name === 'string' && typeof f.bac === 'number') foundations.set(f.name, f.bac);
    }
  }
  const cohorts: Array<[string, Cohort]> = [['countries_14', 'PROFILED_14'], ['countries_5', 'DEVELOPMENT_5']];
  for (const [collection, cohort] of cohorts) {
    const list = doc[collection];
    if (!Array.isArray(list)) continue;
    for (const rec of list as Json[]) {
      if (typeof rec.name !== 'string') continue;
      const name = rec.name;
      const id = `country:${slug(name)}`;
      const recCanon = isCanon(rec.canon_status);
      entities.push({
        id, name, kind: 'country', cohort,
        source_document: typeof rec.source === 'string' ? rec.source : null,
        specialization: typeof rec.specialization === 'string' ? rec.specialization : null,
        fx_code: isObj(rec.fx) && typeof rec.fx.code === 'string' ? rec.fx.code : null,
        foundation_bac: foundations.get(name) ?? null,
        represents_states: 1,
        canon_status: typeof rec.canon_status === 'string' ? rec.canon_status : null,
      });
      for (const ind of INDICATORS) {
        const fields = ind.fields[cohort as 'PROFILED_14' | 'DEVELOPMENT_5'];
        let chosen = fields[0]!;
        let raw = get(rec, chosen);
        for (const f of fields) {
          const r = get(rec, f);
          if (r.state !== 'MISSING') { chosen = f; raw = r; break; }
        }
        const o = makeObs(ctx, {
          entity_id: id, entity_name: name, entity_kind: 'country', cohort, indicator_id: ind.id, raw, period: year0,
          canonStatus: recCanon ? (ind.derivation === 'DERIVED' ? 'CANON_DERIVED' : 'CANON_OBSERVED') : 'PROPOSED',
          pointer: `${collection}[${name}].${chosen}`,
          statusLabel: ind.status_field && typeof rec[ind.status_field] === 'string' ? (rec[ind.status_field] as string) : null,
        });
        if (o) observations.push(o);
      }
      if (!ctx.proposals) {
        for (const [field, indicator] of [['tfr_pre_rebase_v64', 'tfr'], ['real_gdp_growth_pre_rebase_v64', 'real_gdp_growth']] as const) {
          const raw = get(rec, field);
          if (raw.state !== 'ASSIGNED') continue;
          const o = makeObs(ctx, {
            entity_id: id, entity_name: name, entity_kind: 'country', cohort, indicator_id: indicator, raw, period: year0,
            canonStatus: 'ARCHIVED', pointer: `${collection}[${name}].${field}`, statusLabel: 'superseded V6.4 pre-rebase value', model: 'NCCM-V6.4-pre-rebase',
          });
          if (o) observations.push({ ...o, status: 'ARCHIVED' });
        }
      }
    }
  }
  const planet = doc.planet as Json | undefined;
  if (isObj(planet)) {
    entities.push({ id: 'planet:asthortera', name: 'Asthortera', kind: 'planet', cohort: 'PLANET', source_document: null, specialization: null, fx_code: null, foundation_bac: null, represents_states: typeof planet.sovereign_states === 'number' ? planet.sovereign_states : 0, canon_status: datasetCanon ? 'C' : null });
    const y0 = isObj(planet.year0) ? planet.year0 : {};
    const y0Canon = isCanon(y0.canon_status) || datasetCanon;
    for (const p of PLANET_INDICATORS) {
      const base = p.base === 'planet' ? planet : y0;
      const o = makeObs(ctx, {
        entity_id: 'planet:asthortera', entity_name: 'Asthortera', entity_kind: 'planet', cohort: 'PLANET', indicator_id: p.id,
        raw: get(base, p.field), period: year0,
        canonStatus: (p.base === 'planet' ? datasetCanon : y0Canon) ? ('derived' in p && p.derived ? 'CANON_DERIVED' : 'CANON_OBSERVED') : 'PROPOSED',
        pointer: `planet.${p.base === 'year0' ? 'year0.' : ''}${p.field}`,
      });
      if (o) observations.push(o);
    }
    const hist = planet.historical_1010_BAC;
    if (isObj(hist)) {
      const map: Record<string, string> = { median_age_years: 'median_age', urbanization_rate: 'urbanization', annual_inflation: 'inflation', life_expectancy_years: 'life_expectancy' };
      for (const [field, indicator] of Object.entries(map)) {
        const o = makeObs(ctx, {
          entity_id: 'planet:asthortera', entity_name: 'Asthortera', entity_kind: 'planet', cohort: 'PLANET', indicator_id: indicator,
          raw: get(hist, field), period: pointPeriod(1010), canonStatus: datasetCanon ? 'CANON_OBSERVED' : 'PROPOSED', pointer: `planet.historical_1010_BAC.${field}`,
        });
        if (o) observations.push(o);
      }
    }
  }
  const agg = doc.aggregate_remaining_18 as Json | undefined;
  if (isObj(agg)) {
    const count = typeof agg.state_count === 'number' ? agg.state_count : 18;
    const aggId = 'aggregate:deferred-18';
    const aggName = `Deferred ${count} states (combined residual)`;
    entities.push({ id: aggId, name: aggName, kind: 'aggregate_residual', cohort: 'DEFERRED_18_AGGREGATE', source_document: null, specialization: null, fx_code: null, foundation_bac: null, represents_states: count, canon_status: typeof agg.canon_status === 'string' ? agg.canon_status : null });
    const aggCanon = isCanon(agg.canon_status);
    const map: Array<[string, string]> = [
      ['population_billion', 'population'], ['sdi_population_weighted_required', 'sdi'], ['gdp_planet_share', 'gdp_share'],
      ['gdp_usd_annual_V6', 'gdp_usd'], ['gdp_per_capita_usd_V6', 'gdp_per_capita'], ['tfr_population_weighted_proxy_required', 'tfr'],
      ['real_gdp_growth_gdp_weighted_required', 'real_gdp_growth'],
    ];
    for (const [field, indicator] of map) {
      const o = makeObs(ctx, {
        entity_id: aggId, entity_name: aggName, entity_kind: 'aggregate_residual', cohort: 'DEFERRED_18_AGGREGATE', indicator_id: indicator,
        raw: get(agg, field), period: year0, canonStatus: aggCanon ? 'CANON_DERIVED' : 'PROPOSED', pointer: `aggregate_remaining_18.${field}`,
      });
      if (o) observations.push(o);
    }
  }
  if (!ctx.proposals && isObj(hf)) {
    if (Array.isArray(hf.ordered_core)) {
      for (const f of hf.ordered_core as Json[]) {
        if (typeof f.name !== 'string' || typeof f.bac !== 'number' || !Number.isInteger(f.bac)) continue;
        timeline.push({
          id: `EVT-FOUNDATION-${slug(f.name).toUpperCase()}`, label: `${f.name} sovereign foundation`, start_bac: f.bac, end_bac: f.bac, kind: 'FOUNDATION',
          entity_id: `country:${slug(f.name)}`, status: datasetCanon ? 'CANON_OBSERVED' : 'PROPOSED',
          source: source(ctx, `historical_foundations.ordered_core[${f.name}].bac`),
          note: typeof f.trigger === 'string' ? f.trigger : typeof f.status === 'string' ? `Source status: ${f.status}` : null,
        });
      }
    }
    if (isObj(hf.related_events)) {
      for (const [key, v] of Object.entries(hf.related_events).sort(([a], [b]) => codeUnitCompare(a, b))) {
        const range = Array.isArray(v) && v.length === 2 && v.every((x) => Number.isInteger(x)) ? (v as number[]) : Number.isInteger(v) ? [v as number, v as number] : null;
        if (!range) continue;
        timeline.push({
          id: `EVT-${slug(key).toUpperCase()}`, label: humanize(key), start_bac: Math.max(range[0]!, range[1]!), end_bac: Math.min(range[0]!, range[1]!), kind: 'EVENT',
          entity_id: null, status: datasetCanon ? 'CANON_OBSERVED' : 'PROPOSED', source: source(ctx, `historical_foundations.related_events.${key}`), note: null,
        });
      }
    }
  }
  return { entities, observations, timeline };
}

export async function extractStatistics(production: SourceSnapshot, remodeling: SourceSnapshot | null): Promise<StatisticsDataset> {
  const prodFile = await readText(production, NCCM_DATASET_PATH);
  const draftFile = await readText(remodeling, NCCM_DATASET_PATH);
  const empty: StatisticsDataset = {
    schema_version: 'reltroner-statistics-observations.v1', model_version: null, dataset_path: NCCM_DATASET_PATH,
    production: null, remodeling: null, entities: [], observations: [], proposals: [], timeline: [], ranges: [],
    migration: { flows: [], total_billion: null, status: 'INSUFFICIENT_DATA', source: null }, source_issues: [], evidence_checks: [], unknowns: [],
  };
  if (!prodFile) return empty;
  const doc = JSON.parse(prodFile.text) as Json;
  const model = typeof doc.schema_version === 'string' ? doc.schema_version : null;
  const ctx: Ctx = { snapshot: production, blob: prodFile.blob, path: NCCM_DATASET_PATH, model, proposals: false };
  const { entities, observations, timeline } = extractDataset(doc, ctx);

  let proposals: Observation[] = [];
  if (draftFile && remodeling) {
    const ddoc = JSON.parse(draftFile.text) as Json;
    const dctx: Ctx = { snapshot: remodeling, blob: draftFile.blob, path: NCCM_DATASET_PATH, model: typeof ddoc.schema_version === 'string' ? ddoc.schema_version : null, proposals: true };
    proposals = extractDataset(ddoc, dctx).observations.filter((o) => o.value_state === 'ASSIGNED');
  }

  // Prose evidence (production only).
  const ranges: RangeAnnotation[] = [];
  const evidenceChecks: StatisticsDataset['evidence_checks'] = [];
  const textCache = new Map<string, { text: string; blob: string } | null>();
  const entityByName = new Map(entities.map((e) => [e.name, e]));
  for (const rule of EVIDENCE_RULES) {
    if (!textCache.has(rule.path)) textCache.set(rule.path, await readText(production, rule.path));
    const file = textCache.get(rule.path)!;
    const match = applyEvidenceRule(rule, file?.text ?? null);
    evidenceChecks.push({ rule_id: rule.id, path: rule.path, status: match.status, line: match.line });
    if (match.status !== 'VERIFIED' || !file) continue;
    const tctx: Ctx = { snapshot: production, blob: file.blob, path: rule.path, model: null, proposals: false };
    for (const out of match.outputs) {
      const ent = out.entity === 'planet' ? entities.find((e) => e.kind === 'planet') : entityByName.get(out.entity);
      if (!ent) continue;
      if (out.kind === 'range') {
        ranges.push({
          id: `RNG-${sha256Hex(`${rule.id}|${ent.id}|${out.indicator}`).slice(0, 10).toUpperCase()}`,
          entity_id: ent.id, indicator_id: out.indicator, low: out.low, high: out.high, unit: out.unit, timing: out.timing,
          status: out.status, quote: match.quote!, source: source(tctx, null, match.line),
        });
        continue;
      }
      const period = out.kind === 'interval' ? intervalPeriod(out.start_bac, out.end_bac) : pointPeriod(out.year_bac);
      observations.push({
        id: obsId(production.identity.role, ent.id, out.indicator, period, `evidence:${rule.id}`),
        entity_id: ent.id, entity_name: ent.name, entity_kind: ent.kind, cohort: ent.cohort, indicator_id: out.indicator,
        value: out.value, value_state: 'ASSIGNED', unit: out.unit, period, status: out.status,
        source: source(tctx, null, match.line), model_version: null, source_status_label: null,
        evidence: { rule_id: rule.id, quote: match.quote!, note: out.note },
      });
    }
  }

  const mig = doc.migration_year0 as Json | undefined;
  const flows = Array.isArray(mig?.routes)
    ? (mig.routes as Json[]).filter((r) => typeof r.origin === 'string' && typeof r.destination === 'string' && typeof r.population_billion === 'number')
        .map((r) => ({ origin: r.origin as string, destination: r.destination as string, population_billion: r.population_billion as number, source_sdi_unchanged: typeof r.source_sdi_unchanged === 'number' ? r.source_sdi_unchanged : null }))
    : [];
  const issues = Array.isArray(doc.open_issues)
    ? (doc.open_issues as Json[]).filter((i) => typeof i.code === 'string').map((i) => ({
        code: i.code as string, severity: typeof i.severity === 'string' ? i.severity : 'UNSPECIFIED',
        description: typeof i.description === 'string' ? i.description : '', source: source(ctx, `open_issues[${i.code}]`),
      }))
    : [];
  const unknowns = Array.isArray((doc.canon_ratification as Json | undefined)?.unknowns_remain_unknown)
    ? ((doc.canon_ratification as Json).unknowns_remain_unknown as unknown[]).filter((u): u is string => typeof u === 'string')
    : [];
  const sortObs = (a: Observation, b: Observation) => codeUnitCompare(`${a.indicator_id}|${a.entity_id}|${String(a.period.year_bac).padStart(6, '0')}|${a.id}`, `${b.indicator_id}|${b.entity_id}|${String(b.period.year_bac).padStart(6, '0')}|${b.id}`);
  return {
    schema_version: 'reltroner-statistics-observations.v1',
    model_version: model,
    dataset_path: NCCM_DATASET_PATH,
    production: { commit_sha: production.identity.commit_sha, blob_sha: prodFile.blob },
    remodeling: draftFile && remodeling ? { commit_sha: remodeling.identity.commit_sha, blob_sha: draftFile.blob } : null,
    entities,
    observations: observations.sort(sortObs),
    proposals: proposals.sort(sortObs),
    timeline: timeline.sort((a, b) => b.start_bac - a.start_bac || codeUnitCompare(a.id, b.id)),
    ranges,
    migration: {
      flows,
      total_billion: typeof mig?.total_departures_billion === 'number' ? mig.total_departures_billion : null,
      status: flows.length ? 'CANON_OBSERVED' : 'INSUFFICIENT_DATA',
      source: flows.length ? source(ctx, 'migration_year0.routes') : null,
    },
    source_issues: issues,
    evidence_checks: evidenceChecks,
    unknowns,
  };
}
