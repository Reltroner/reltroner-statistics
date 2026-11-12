/**
 * Asthortera historical calendar. Source convention (historical_foundations.date_scale):
 * "BAC (higher value older)". Year 0 is the present modeling year. Observations are sparse:
 * the axis 1010 BAC → Year 0 has no implied annual coverage and nothing is interpolated.
 */

export const OBSERVATORY_WINDOW = Object.freeze({ start_bac: 1010, end_bac: 0 });
export const MAX_SUPPORTED_BAC = 10_000;

export function assertBacYear(bac: unknown, label = 'year_bac'): asserts bac is number {
  if (typeof bac !== 'number' || !Number.isInteger(bac) || bac < 0 || bac > MAX_SUPPORTED_BAC) {
    throw new Error(`${label} must be an integer between 0 and ${MAX_SUPPORTED_BAC}`);
  }
}

export function formatBac(bac: number): string {
  assertBacYear(bac);
  return bac === 0 ? 'Year 0' : `${bac.toLocaleString('en-US').replace(/,/g, '')} BAC`;
}

/** Chronological axis value: older years are further left (more negative). */
export function bacToAxis(bac: number): number {
  assertBacYear(bac);
  return bac === 0 ? 0 : -bac;
}

export function axisToBac(axis: number): number {
  const bac = axis === 0 ? 0 : -axis;
  assertBacYear(bac, 'axis');
  return bac;
}

/** Sort newest-last (chronological): 2882 BAC before 1010 BAC before Year 0. */
export function chronological(a: number, b: number): number {
  return b - a;
}

export function inWindow(bac: number, window = OBSERVATORY_WINDOW): boolean {
  return bac <= window.start_bac && bac >= window.end_bac;
}

export function yearsBetween(olderBac: number, newerBac: number): number {
  assertBacYear(olderBac);
  assertBacYear(newerBac);
  if (newerBac > olderBac) throw new Error('newerBac must not be older than olderBac');
  return olderBac - newerBac;
}

export interface Period {
  calendar: 'BAC';
  year_bac: number;
  label: string;
  /** Interval observations (e.g. scenario growth over 1010–995 BAC). */
  interval?: { start_bac: number; end_bac: number };
}

export function pointPeriod(bac: number): Period {
  return { calendar: 'BAC', year_bac: bac, label: formatBac(bac) };
}

export function intervalPeriod(startBac: number, endBac: number): Period {
  assertBacYear(startBac);
  assertBacYear(endBac);
  if (endBac > startBac) throw new Error('Interval must run from older to newer');
  return {
    calendar: 'BAC',
    year_bac: endBac,
    label: `${formatBac(startBac)} – ${formatBac(endBac)}`,
    interval: { start_bac: startBac, end_bac: endBac },
  };
}
