/**
 * Image slot registry. Every slot renders a branded placeholder until an approved asset is
 * assigned (set `src` to a file under public/ and `approved: true`, keeping the aspect ratio so
 * replacement causes no layout shift). Placeholders never reference missing files.
 */
export type SlotMotif = 'orbital' | 'contour' | 'lattice' | 'chronology' | 'clusters' | 'network' | 'twin-orbits' | 'documents';

export interface ImageSlot {
  id: string;
  aspect: '16 / 9' | '3 / 2' | '4 / 3';
  motif: SlotMotif;
  purpose: string;
  approved: boolean;
  src: string | null;
  alt: string;
}

export const IMAGE_SLOTS = Object.freeze({
  STATS_HOME_HERO: { id: 'STATS_HOME_HERO', aspect: '16 / 9', motif: 'orbital', purpose: 'Main observatory illustration', approved: false, src: null, alt: '' },
  STATS_WORLD_OVERVIEW: { id: 'STATS_WORLD_OVERVIEW', aspect: '3 / 2', motif: 'contour', purpose: 'Planetary statistics introduction', approved: false, src: null, alt: '' },
  STATS_COUNTRY_COMPARISON: { id: 'STATS_COUNTRY_COMPARISON', aspect: '3 / 2', motif: 'lattice', purpose: 'Cross-country comparison', approved: false, src: null, alt: '' },
  STATS_HISTORICAL_DYNAMICS: { id: 'STATS_HISTORICAL_DYNAMICS', aspect: '16 / 9', motif: 'chronology', purpose: 'BAC historical timeline', approved: false, src: null, alt: '' },
  STATS_CLUSTERING_LAB: { id: 'STATS_CLUSTERING_LAB', aspect: '3 / 2', motif: 'clusters', purpose: 'Clustering concept', approved: false, src: null, alt: '' },
  STATS_DEPENDENCY_GRAPH: { id: 'STATS_DEPENDENCY_GRAPH', aspect: '3 / 2', motif: 'network', purpose: 'Data relationships', approved: false, src: null, alt: '' },
  STATS_SOURCE_DRIFT: { id: 'STATS_SOURCE_DRIFT', aspect: '3 / 2', motif: 'twin-orbits', purpose: 'Production and remodeling comparison', approved: false, src: null, alt: '' },
  STATS_REPORT_CENTER: { id: 'STATS_REPORT_CENTER', aspect: '4 / 3', motif: 'documents', purpose: 'Report and export preview', approved: false, src: null, alt: '' },
} satisfies Record<string, ImageSlot>);

export type ImageSlotId = keyof typeof IMAGE_SLOTS;

export function resolveSlot(id: ImageSlotId): ImageSlot {
  const slot: ImageSlot = IMAGE_SLOTS[id];
  if (slot.approved && (!slot.src || !slot.alt)) throw new Error(`Approved slot ${id} requires src and meaningful alt text`);
  return slot;
}
