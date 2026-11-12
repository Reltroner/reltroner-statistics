/**
 * Centralized motion tokens (seconds, for Motion for React). CSS mirrors these as --motion-*.
 * Animation communicates state change only; reduced motion collapses every transition to 0.
 */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const DURATION = Object.freeze({
  control: 0.16, // navigation and controls: 140–220 ms
  content: 0.26, // content reveals: 180–320 ms
  chart: 0.36, // chart transitions: 250–450 ms
  graph: 0.26, // graph layout and focus: 180–350 ms
});

export function transition(kind: keyof typeof DURATION, reduced: boolean | null) {
  return reduced ? { duration: 0 } : { duration: DURATION[kind], ease: EASE };
}

export function revealVariants(reduced: boolean | null, distance = 10) {
  return reduced
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : { hidden: { opacity: 0, y: distance }, visible: { opacity: 1, y: 0, transition: transition('content', false) } };
}

/** Milliseconds for ECharts, which takes numbers instead of CSS tokens. */
export function chartAnimationMs(reduced: boolean): number {
  return reduced ? 0 : Math.round(DURATION.chart * 1000);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
