/** Epistemic and classification vocabularies shared by Node, Python (via JSON Schema) and the browser. */

export const EPISTEMIC_STATUSES = Object.freeze([
  'CANON_OBSERVED',
  'CANON_DERIVED',
  'MODEL_ESTIMATE',
  'SCENARIO',
  'PROPOSED',
  'ARCHIVED',
  'INSUFFICIENT_DATA',
] as const);
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];

export const EPISTEMIC_DESCRIPTIONS: Readonly<Record<EpistemicStatus, string>> = Object.freeze({
  CANON_OBSERVED: 'Value assigned directly in a creator-ratified production source.',
  CANON_DERIVED: 'Value computed inside a ratified production source from other canonical values.',
  MODEL_ESTIMATE: 'Exploratory statistical output produced by Reltroner Statistics. Never canon.',
  SCENARIO: 'Conditional reconstruction or simulation explicitly labeled as such by its source.',
  PROPOSED: 'Remodeling-workspace value. A proposal, not a public statistic.',
  ARCHIVED: 'Superseded value retained for provenance.',
  INSUFFICIENT_DATA: 'The source does not assign a value or coverage is inadequate for the method.',
});

export const FILE_CLASSIFICATIONS = Object.freeze(['IDENTICAL', 'CHANGED', 'PRODUCTION_ONLY', 'DRAFT_ONLY'] as const);
export type FileClassification = (typeof FILE_CLASSIFICATIONS)[number];

export const FINDING_CLASSIFICATIONS = Object.freeze([
  'CHANGED',
  'PRODUCTION_ONLY',
  'DRAFT_ONLY',
  'SCHEMA_DRIFT',
  'VALUE_DRIFT',
  'SEMANTIC_REVIEW_CANDIDATE',
] as const);
export type FindingClassification = (typeof FINDING_CLASSIFICATIONS)[number];

export const FINDING_LEVELS = Object.freeze(['FILE', 'FIELD', 'FRONTMATTER', 'SECTION'] as const);
export type FindingLevel = (typeof FINDING_LEVELS)[number];

export const CHANGE_TYPES = Object.freeze([
  'ADDED',
  'REMOVED',
  'VALUE_CHANGED',
  'TYPE_CHANGED',
  'UNASSIGNED_TO_ASSIGNED',
  'ASSIGNED_TO_UNASSIGNED',
  'SECTION_ADDED',
  'SECTION_REMOVED',
  'SECTION_CHANGED',
  'CONTENT_CHANGED',
  'FORMAT_ONLY',
  'INVALID_SOURCE',
  'FILE_ADDED',
  'FILE_REMOVED',
] as const);
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const REVIEW_STATUSES = Object.freeze([
  'REVIEW_CANDIDATE',
  'PROPOSAL',
  'DETERMINISTIC_CONTRADICTION',
  'INFORMATIONAL',
] as const);
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const CONTENT_CHANGE_NATURES = Object.freeze([
  'CONTENT',
  'TRAILING_NEWLINE_ONLY',
  'LINE_ENDINGS_ONLY',
  'WHITESPACE_ONLY',
  'JSON_FORMAT_ONLY',
] as const);
export type ContentChangeNature = (typeof CONTENT_CHANGE_NATURES)[number];

export const REVIEW_DESCRIPTIONS: Readonly<Record<ReviewStatus, string>> = Object.freeze({
  REVIEW_CANDIDATE: 'A difference that needs human review. Not proof that either side is wrong.',
  PROPOSAL: 'Content that exists only in the remodeling workspace. Not a production defect.',
  DETERMINISTIC_CONTRADICTION: 'A validated mathematical rule proves an internal inconsistency.',
  INFORMATIONAL: 'Byte-level difference with no semantic content change.',
});
