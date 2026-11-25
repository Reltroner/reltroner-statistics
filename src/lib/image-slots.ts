/**
 * Image slot registry. Approved slots load immutable WebP editorial illustrations from the
 * dedicated resource repository pinned to an exact 40-character commit SHA via jsDelivr.
 * Unapproved slots render an intentional branded placeholder preserving their aspect ratio.
 * Checksums recorded here are catalog provenance; browsers do not enforce SRI on <img>.
 */
export type SlotMotif =
  | 'orbital'
  | 'contour'
  | 'lattice'
  | 'chronology'
  | 'clusters'
  | 'network'
  | 'twin-orbits'
  | 'documents'
  | 'constellation'
  | 'prism'
  | 'scales'
  | 'blueprint'
  | 'ripples'
  | 'branching';

export const ILLUSTRATION_CDN_ORIGIN = 'https://cdn.jsdelivr.net' as const;
export const ILLUSTRATION_RESOURCE_REPO = 'Reltroner/reltroner-statistics-resource' as const;
export const ILLUSTRATION_RESOURCE_COMMIT = 'd9fff7d30ca9d977328d1120c3b638c48046ff9c' as const;

const FULL_COMMIT_SHA_RE = /^[0-9a-f]{40}$/;
const RESOURCE_IMAGE_PATH_RE = /^images\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/;
const PINNED_CDN_URL_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\/Reltroner\/reltroner-statistics-resource@[0-9a-f]{40}\/images\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/;

export function pinnedIllustrationUrl(
  assetPath: string,
  commitSha: string = ILLUSTRATION_RESOURCE_COMMIT,
): string {
  if (!FULL_COMMIT_SHA_RE.test(commitSha)) {
    throw new Error(`Illustration resource commit must be a full 40-char lowercase hex SHA, got: ${commitSha}`);
  }
  if (!RESOURCE_IMAGE_PATH_RE.test(assetPath)) {
    throw new Error(`Invalid illustration asset path: ${assetPath}`);
  }
  return `${ILLUSTRATION_CDN_ORIGIN}/gh/${ILLUSTRATION_RESOURCE_REPO}@${commitSha}/${assetPath}`;
}

export interface ImageSlot {
  id: string;
  aspect: '16 / 9' | '3 / 2' | '4 / 3';
  width: number;
  height: number;
  motif: SlotMotif;
  purpose: string;
  approved: boolean;
  src: string | null;
  alt: string;
  resourcePath: string | null;
  sha256: string | null;
}

function approvedSlot(input: {
  id: string;
  aspect: '16 / 9' | '3 / 2' | '4 / 3';
  width: number;
  height: number;
  motif: SlotMotif;
  purpose: string;
  resourcePath: string;
  sha256: string;
  alt: string;
}): ImageSlot {
  return {
    id: input.id,
    aspect: input.aspect,
    width: input.width,
    height: input.height,
    motif: input.motif,
    purpose: input.purpose,
    approved: true,
    src: pinnedIllustrationUrl(input.resourcePath),
    alt: input.alt,
    resourcePath: input.resourcePath,
    sha256: input.sha256,
  };
}

function pendingSlot(input: {
  id: string;
  aspect: '16 / 9' | '3 / 2' | '4 / 3';
  width: number;
  height: number;
  motif: SlotMotif;
  purpose: string;
}): ImageSlot {
  return {
    ...input,
    approved: false,
    src: null,
    alt: '',
    resourcePath: null,
    sha256: null,
  };
}

export const IMAGE_SLOTS = Object.freeze({
  STATS_HOME_HERO: approvedSlot({
    id: 'STATS_HOME_HERO',
    aspect: '16 / 9',
    width: 1280,
    height: 720,
    motif: 'orbital',
    purpose: 'Main observatory illustration',
    resourcePath: 'images/stats-home-hero.webp',
    sha256: 'd55e9e5cf5158a07f972cb0d0c49ffdf9b7c7e93c5b8ccedd424e2945549a4cd',
    alt: 'Editorial observatory illustration showing an abstract concentric sphere, tilted translucent observation planes, and geometric archive slabs resting on a plinth',
  }),
  STATS_WORLD_OVERVIEW: approvedSlot({
    id: 'STATS_WORLD_OVERVIEW',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'contour',
    purpose: 'Planetary statistics introduction',
    resourcePath: 'images/stats-world-overview.webp',
    sha256: 'c02a3c9c26661247b58f75a5816910f5cd929db143db50c37acd8e804a38c1fb',
    alt: 'Editorial illustration of an abstract planetary sphere formed from thin concentric contour rings orbited by a small geometric observation module',
  }),
  STATS_COUNTRY_COMPARISON: approvedSlot({
    id: 'STATS_COUNTRY_COMPARISON',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'lattice',
    purpose: 'Cross-country comparison',
    resourcePath: 'images/stats-country-comparison.webp',
    sha256: 'b795eb12d57681bf120bf4a2bd55d4800dda253b10e99b4099e5571778175a68',
    alt: 'Editorial illustration of a neutral isometric measurement lattice intersected by two parallel translucent vertical reference planes with luminous comparison nodes',
  }),
  STATS_HISTORICAL_DYNAMICS: approvedSlot({
    id: 'STATS_HISTORICAL_DYNAMICS',
    aspect: '16 / 9',
    width: 1280,
    height: 720,
    motif: 'chronology',
    purpose: 'BAC historical timeline',
    resourcePath: 'images/stats-historical-dynamics.webp',
    sha256: '67cb670456809d1602e745880c20f313d90f6c017a64238f39df2f5fca48e437',
    alt: 'Editorial illustration of two sweeping chronological arcs carrying sparse geometric archive fragments and open intervals above a hairline baseline',
  }),
  STATS_CLUSTERING_LAB: approvedSlot({
    id: 'STATS_CLUSTERING_LAB',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'clusters',
    purpose: 'Clustering concept',
    resourcePath: 'images/stats-clustering-lab.webp',
    sha256: '5007a050913663f50b64a446c9f3168a16adb9d457023c43eabc44e9459a81ed',
    alt: 'Editorial illustration of three loose groups of geometric polyhedra inside overlapping dashed concentric envelopes with ungrouped forms in the boundary spaces',
  }),
  STATS_DEPENDENCY_GRAPH: approvedSlot({
    id: 'STATS_DEPENDENCY_GRAPH',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'network',
    purpose: 'Data relationships',
    resourcePath: 'images/stats-dependency-graph.webp',
    sha256: '31e64766f6d87b16cbce9ca7054e0fd8fbff9216b4df537cc034f55bee9b01e2',
    alt: 'Editorial illustration of an elevated modular ring of geometric blocks linked by fine hairline threads converging onto a solid archive plinth',
  }),
  STATS_SOURCE_DRIFT: approvedSlot({
    id: 'STATS_SOURCE_DRIFT',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'twin-orbits',
    purpose: 'Production and remodeling comparison',
    resourcePath: 'images/stats-source-drift.webp',
    sha256: '8f4fd5613b9b41d4ea56a2d6e8d4c46234b3ef3d654afbe937e02691a5d6ccbc',
    alt: 'Editorial illustration of two overlapping orbital rings of equal weight, one cool cobalt and one warm ember, linked at their intersection by neutral comparison rungs',
  }),
  STATS_REPORT_CENTER: approvedSlot({
    id: 'STATS_REPORT_CENTER',
    aspect: '4 / 3',
    width: 1152,
    height: 864,
    motif: 'documents',
    purpose: 'Report and export preview',
    resourcePath: 'images/stats-report-center.webp',
    sha256: '7ff2fceaa0302c37ed3a7c5897599150415f27c7de1477ce39681a7a5d67bf51',
    alt: 'Editorial illustration of one luminous geometric source node feeding parallel conduits into four identical document slabs of equal weight',
  }),
  CREATIVE_HOME_HERO: approvedSlot({
    id: 'CREATIVE_HOME_HERO',
    aspect: '16 / 9',
    width: 1280,
    height: 720,
    motif: 'constellation',
    purpose: 'Creative Intelligence overview',
    resourcePath: 'images/creative-home-hero.webp',
    sha256: 'da0e78d607cdacf65c0a310b5d11af211e79b85b4cf418e8695eb9a4b4b1345b',
    alt: 'Editorial illustration of two translucent luminous fields joined by a geometric polyline of crystalline nodes meeting at a warm ember junction above an archive plane',
  }),
  CREATIVE_NARRATIVE_GRAPH: pendingSlot({ id: 'CREATIVE_NARRATIVE_GRAPH', aspect: '3 / 2', width: 1200, height: 800, motif: 'network', purpose: 'Narrative relationship graph' }),
  CREATIVE_IDEATION_WORKSPACE: pendingSlot({ id: 'CREATIVE_IDEATION_WORKSPACE', aspect: '3 / 2', width: 1200, height: 800, motif: 'prism', purpose: 'Story brainstorming and ideation' }),
  CREATIVE_CONSISTENCY_AUDIT: pendingSlot({ id: 'CREATIVE_CONSISTENCY_AUDIT', aspect: '3 / 2', width: 1200, height: 800, motif: 'scales', purpose: 'Narrative consistency findings' }),
  CREATIVE_STORY_REFACTOR: pendingSlot({ id: 'CREATIVE_STORY_REFACTOR', aspect: '3 / 2', width: 1200, height: 800, motif: 'blueprint', purpose: 'Story restructuring and refactoring' }),
  CREATIVE_CANON_REMODEL: pendingSlot({ id: 'CREATIVE_CANON_REMODEL', aspect: '3 / 2', width: 1200, height: 800, motif: 'twin-orbits', purpose: 'Canon remodeling and scenarios' }),
  CREATIVE_IMPACT_EXPLORER: pendingSlot({ id: 'CREATIVE_IMPACT_EXPLORER', aspect: '3 / 2', width: 1200, height: 800, motif: 'ripples', purpose: 'Consequence and impact explorer' }),
  CREATIVE_DEVELOPMENT_ROADMAP: pendingSlot({ id: 'CREATIVE_DEVELOPMENT_ROADMAP', aspect: '16 / 9', width: 1280, height: 720, motif: 'chronology', purpose: 'Creative roadmap and opportunities' }),
  CREATIVE_DECISION_TREE: pendingSlot({ id: 'CREATIVE_DECISION_TREE', aspect: '3 / 2', width: 1200, height: 800, motif: 'branching', purpose: 'Interactive creative and editorial decision trees' }),
  STATISTICAL_DECISION_TREE: pendingSlot({ id: 'STATISTICAL_DECISION_TREE', aspect: '3 / 2', width: 1200, height: 800, motif: 'branching', purpose: 'Guarded supervised decision trees' }),
} satisfies Record<string, ImageSlot>);

export type ImageSlotId = keyof typeof IMAGE_SLOTS;

export function validateSlot(slot: ImageSlot): ImageSlot {
  if (slot.approved) {
    if (!slot.src || !slot.alt.trim()) {
      throw new Error(`Approved slot ${slot.id} requires src and meaningful alt text`);
    }
    if (!PINNED_CDN_URL_RE.test(slot.src)) {
      throw new Error(`Approved slot ${slot.id} src must be a full 40-char commit-pinned jsDelivr resource URL: ${slot.src}`);
    }
  }
  return slot;
}

export function resolveSlot(id: ImageSlotId): ImageSlot {
  return validateSlot(IMAGE_SLOTS[id]);
}
