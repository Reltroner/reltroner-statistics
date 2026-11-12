import type { KnowledgeGraph } from '../../domain/graph.ts';

let cached: Promise<KnowledgeGraph> | null = null;

/** One fetch per page; the graph artifact is immutable for a given build. */
export function loadGraph(): Promise<KnowledgeGraph> {
  cached ??= fetch('/data/graph.json').then((r) => {
    if (!r.ok) throw new Error(`Graph data unavailable (${r.status})`);
    return r.json() as Promise<KnowledgeGraph>;
  });
  return cached;
}

export const TYPE_LABEL: Record<string, string> = {
  entity: 'Entity',
  indicator: 'Indicator',
  dataset: 'Dataset',
  document: 'Document',
  observation: 'Observation',
  revision: 'Revision',
  character: 'Character',
  faction: 'Faction / Nation',
  organization: 'Organization',
  event: 'Historical Event',
  location: 'Location',
  technology: 'Technology',
  law: 'Law / Treaty',
  principle: 'Principle',
  philosophy: 'Philosophy',
  narrative_arc: 'Narrative Arc',
  theme: 'Theme',
  conflict: 'Conflict',
};
