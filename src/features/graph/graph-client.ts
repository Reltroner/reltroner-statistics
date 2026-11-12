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
  entity: 'Entity', indicator: 'Indicator', dataset: 'Dataset', document: 'Document', observation: 'Observation', revision: 'Revision',
};
