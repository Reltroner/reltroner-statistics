/**
 * Default view settings that live inside React components (which a Node build step cannot import).
 * They are repeated here for the page mirrors, and a unit test reads the component sources and
 * fails if a value here ever differs from the component. Nothing here changes what ships to users.
 */
import { DEFAULT_IMPACT_TYPES, traverseImpact, type GraphSide, type KnowledgeGraph } from '../../domain/graph.ts';

/** src/features/graph/ImpactExplorer.tsx: PRESETS, useState(4), sides without remodeling. */
export const IMPACT_UI = Object.freeze({
  presets: Object.freeze(['indicator:population', 'document:content/events/history-timeline.md', 'dataset:data/asthortera/nccm-v6-active-cross-domain.json']),
  depth: 4,
  sides: Object.freeze(['production', 'both']) as readonly GraphSide[],
});

/** src/features/statistics/ScatterExplorer.tsx: useState defaults for x, y, size and cohort. */
export const SCATTER_UI = Object.freeze({ x: 'gdp_per_capita', y: 'sdi', size: 'population', cohort: 'ALL' });

/** src/features/creative/CanonRemodelLab.tsx: useState default origin. */
export const REMODEL_UI = Object.freeze({ origin: 'nar:nation:reltronland' });

/** The traversal ImpactExplorer runs for an origin with its default settings. */
export function impactDefault(g: KnowledgeGraph, origin: string) {
  return traverseImpact(g.edges, origin, { types: DEFAULT_IMPACT_TYPES, maxDepth: IMPACT_UI.depth, sides: IMPACT_UI.sides });
}
