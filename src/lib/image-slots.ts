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
export const ILLUSTRATION_RESOURCE_COMMIT = 'b0af79b50adde0d8641edb994a5523e4a86ebf62' as const;

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
  CREATIVE_NARRATIVE_GRAPH: approvedSlot({
    id: 'CREATIVE_NARRATIVE_GRAPH',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'network',
    purpose: 'Narrative relationship graph',
    resourcePath: 'images/creative-narrative-graph.webp',
    sha256: '13969ec87d478ca38a41ce734594f21229df6d83fe827e24e707a155481c193c',
    alt: 'Editorial illustration of an isometric ring of cobalt, cyan, and ice-white narrative nodes connected by crisp perimeter edges around a central warm-ember node with subtler cross-links',
  }),
  CREATIVE_IDEATION_WORKSPACE: approvedSlot({
    id: 'CREATIVE_IDEATION_WORKSPACE',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'prism',
    purpose: 'Story brainstorming and ideation',
    resourcePath: 'images/creative-ideation-workspace.webp',
    sha256: 'efad23baf37283efc97e9e02577fc5579ea270a0f95c31d453dfa92c22c0b8b4',
    alt: 'Editorial illustration of a single ice-white beam entering a triangular optical prism framed by fine calibration rings and emerging as three distinct cobalt, cyan, and warm-ember beams',
  }),
  CREATIVE_CONSISTENCY_AUDIT: approvedSlot({
    id: 'CREATIVE_CONSISTENCY_AUDIT',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'scales',
    purpose: 'Narrative consistency findings',
    resourcePath: 'images/creative-consistency-audit.webp',
    sha256: '19375aa32eacb07cc4b28267396a3a7b8380dc44beca5e510d1e4f35a980fb8f',
    alt: 'Editorial illustration of a level neutral balance with a thin vertical axis, warm-ember fulcrum, and two equal isometric pans each holding an identical cobalt-and-cyan polyhedron',
  }),
  CREATIVE_STORY_REFACTOR: approvedSlot({
    id: 'CREATIVE_STORY_REFACTOR',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'blueprint',
    purpose: 'Story restructuring and refactoring',
    resourcePath: 'images/creative-story-refactor.webp',
    sha256: 'ba398d94796d0a7e933eaeb4ff832685d8b1037e92331446b8497ede06fd45f3',
    alt: 'Editorial isometric blueprint illustration showing one tall vertical module on the left routed through cyan and warm-ember paths into two smaller stacked modules on the right',
  }),
  CREATIVE_CANON_REMODEL: approvedSlot({
    id: 'CREATIVE_CANON_REMODEL',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'twin-orbits',
    purpose: 'Canon remodeling and scenarios',
    resourcePath: 'images/creative-canon-remodel.webp',
    sha256: '2943f16de4138e8da6f8960483764b06c7c7a79c527a968918b9143a8bc47539',
    alt: 'Editorial illustration of two equal-weight overlapping orbital rings, one cool cobalt and one warm ember, linked across their shared intersection by neutral ice-white comparison rungs',
  }),
  CREATIVE_IMPACT_EXPLORER: approvedSlot({
    id: 'CREATIVE_IMPACT_EXPLORER',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'ripples',
    purpose: 'Consequence and impact explorer',
    resourcePath: 'images/creative-impact-explorer.webp',
    sha256: '4e7f53fe2a4876582b88df9848d93a2931f22273c80b58da8b62691ce767b235',
    alt: 'Editorial illustration of concentric isometric ripples radiating from a small warm-ember core, transitioning from solid cyan inner rings to finely dashed outer uncertainty rings',
  }),
  CREATIVE_DEVELOPMENT_ROADMAP: approvedSlot({
    id: 'CREATIVE_DEVELOPMENT_ROADMAP',
    aspect: '16 / 9',
    width: 1280,
    height: 720,
    motif: 'chronology',
    purpose: 'Creative roadmap and opportunities',
    resourcePath: 'images/creative-development-roadmap.webp',
    sha256: '0b27aaefb3d3575c8de949c6cb19ec4c7232138e1372bee67516db33880a54c5',
    alt: 'Editorial wide illustration of a gently sweeping primary arc lined with evenly spaced circular markers and short parallel cyan and warm-ember arcs representing alternative tracks',
  }),
  CREATIVE_DECISION_TREE: approvedSlot({
    id: 'CREATIVE_DECISION_TREE',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'branching',
    purpose: 'Interactive creative and editorial decision trees',
    resourcePath: 'images/creative-decision-tree.webp',
    sha256: '4c340b90b6104261f0a4fb79f80331b6b7e0b2107f5f0028706a7928e117c6e6',
    alt: 'Editorial illustration of a neutral branching decision tree moving from one root circle through a split node and three cyan diamond decision gates to four equal-sized terminal nodes',
  }),
  STATISTICAL_DECISION_TREE: approvedSlot({
    id: 'STATISTICAL_DECISION_TREE',
    aspect: '3 / 2',
    width: 1200,
    height: 800,
    motif: 'branching',
    purpose: 'Guarded supervised decision trees',
    resourcePath: 'images/statistical-decision-tree.webp',
    sha256: '45b3a84cb402cc27664638fa1fddfa89e703cea8c0abd5bde9d05c1872e97c15',
    alt: 'Editorial isometric illustration of a guarded branching decision structure where one root node splits through three wireframe shield constraints and three diamond gates into four equal terminal nodes',
  }),
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
