/** Compact, serializable projections of artifacts for islands. Server-only (build time). */
import { INDICATORS, indicatorFormat, indicatorLabel, indicatorUnit, type IndicatorFormat } from '../domain/indicators.ts';
import { currentObservations, getAnalytics, getStats } from './data.ts';

export interface IndicatorMeta {
  id: string;
  label: string;
  short: string;
  unit: string;
  format: IndicatorFormat;
  group: string;
  log_scale: boolean;
  derivation: string;
}

export interface CountryRow {
  id: string;
  name: string;
  cohort: 'PROFILED_14' | 'DEVELOPMENT_5';
  values: Record<string, number | null>;
  states: Record<string, 'ASSIGNED' | 'NULL' | 'MISSING'>;
}

export function indicatorMetas(): IndicatorMeta[] {
  const present = new Set(getStats().observations.map((o) => o.indicator_id));
  return INDICATORS.filter((i) => present.has(i.id)).map((i) => ({
    id: i.id, label: i.label, short: i.short, unit: i.unit, format: i.format, group: i.group, log_scale: !!i.log_scale, derivation: i.derivation,
  }));
}

export function countryRows(): CountryRow[] {
  const stats = getStats();
  const rows = new Map<string, CountryRow>();
  for (const e of stats.entities) {
    if (e.kind !== 'country' || (e.cohort !== 'PROFILED_14' && e.cohort !== 'DEVELOPMENT_5')) continue;
    rows.set(e.id, { id: e.id, name: e.name, cohort: e.cohort, values: {}, states: {} });
  }
  for (const o of currentObservations()) {
    const r = rows.get(o.entity_id);
    if (!r) continue;
    r.values[o.indicator_id] = o.status === 'CANON_OBSERVED' || o.status === 'CANON_DERIVED' ? o.value : null;
    r.states[o.indicator_id] = o.value_state;
  }
  return [...rows.values()].sort((a, b) => (a.cohort === b.cohort ? (a.name < b.name ? -1 : 1) : a.cohort === 'PROFILED_14' ? -1 : 1));
}

export function residualRow() {
  const stats = getStats();
  const e = stats.entities.find((x) => x.kind === 'aggregate_residual');
  if (!e) return null;
  const values: Record<string, number | null> = {};
  for (const o of currentObservations()) if (o.entity_id === e.id) values[o.indicator_id] = o.value;
  return { id: e.id, name: e.name, states: e.represents_states, values };
}

export function planetValues() {
  const values: Record<string, { value: number | null; status: string; pointer: string | null }> = {};
  for (const o of currentObservations()) if (o.entity_kind === 'planet') values[o.indicator_id] = { value: o.value, status: o.status, pointer: o.source.pointer };
  return values;
}

export function clusteringView() {
  const a = getAnalytics();
  if (!a) return null;
  const names = Object.fromEntries(getStats().entities.map((e) => [e.id, e.name]));
  return { clustering: a.clustering, names, labels: Object.fromEntries(a.clustering.features.map((f) => [f.indicator_id, indicatorLabel(f.indicator_id)])) };
}

export function correlationView() {
  const a = getAnalytics();
  if (!a) return null;
  return { ...a.correlation, labels: a.correlation.features.map((f) => indicatorLabel(f)) };
}

export function historyView() {
  const stats = getStats();
  const points = stats.observations
    .filter((o) => (o.entity_kind === 'planet' || o.evidence) && o.value !== null && o.status !== 'ARCHIVED' && o.status !== 'INSUFFICIENT_DATA')
    .map((o) => ({
      id: o.id, entity: o.entity_name, entity_id: o.entity_id, indicator: o.indicator_id, label: indicatorLabel(o.indicator_id), unit: indicatorUnit(o.indicator_id),
      format: indicatorFormat(o.indicator_id), value: o.value as number, year: o.period.year_bac, interval: o.period.interval ?? null, status: o.status,
      quote: o.evidence?.quote ?? null, note: o.evidence?.note ?? null, path: o.source.path, line: o.source.line, pointer: o.source.pointer, commit: o.source.commit_sha,
    }));
  const seriesKeys = new Set(points.filter((p) => p.year > 0 || p.interval).map((p) => `${p.entity_id}|${p.indicator}`));
  return {
    points: points.filter((p) => seriesKeys.has(`${p.entity_id}|${p.indicator}`)),
    timeline: stats.timeline.map((t) => ({ id: t.id, label: t.label, start: t.start_bac, end: t.end_bac, kind: t.kind, note: t.note, entity_id: t.entity_id })),
    ranges: stats.ranges.map((r) => ({ ...r, entity: stats.entities.find((e) => e.id === r.entity_id)?.name ?? r.entity_id })),
  };
}
