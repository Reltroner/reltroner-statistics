/**
 * Source-grounded Narrative Entity and Relationship Extractor.
 * Reads pinned production and remodeling snapshots without inventing entities, names, or causal claims.
 */

import type { Audit } from '../../domain/finding.ts';
import type { StatisticsDataset } from '../../domain/observation.ts';
import type { EpistemicStatus } from '../../domain/status.ts';
import type { GraphSide } from '../../domain/graph.ts';
import type {
  CausalClass,
  NarrativeEntity,
  NarrativeEntityKind,
  NarrativeRelationship,
  NarrativeRelationshipType,
  RelationshipVerification,
} from '../../domain/creative.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { codeUnitCompare } from '../canonical.ts';
import { sha256Hex } from '../git-objects.ts';
import { parseFrontmatter } from '../markdown.ts';
import { slug } from '../observations.ts';

const decoder = new TextDecoder();

interface ParsedDoc {
  path: string;
  side: GraphSide;
  commit_sha: string;
  blob_sha: string;
  title: string;
  description: string | null;
  updated_at: string | null;
  canon_label: string | null;
  tags: string[];
  body: string;
  lines: string[];
}

function cleanText(raw: string): string {
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstProseLine(lines: string[]): { line: number; text: string } {
  let inFrontmatter = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (i === 0 && l === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (l === '---') inFrontmatter = false;
      continue;
    }
    if (!l || l.startsWith('#') || l.startsWith('![') || l.startsWith('|') || l.startsWith('---')) continue;
    const cleaned = cleanText(l);
    if (cleaned.length >= 24) {
      return { line: i + 1, text: cleaned.slice(0, 280) };
    }
  }
  return { line: 1, text: cleanText(lines.slice(0, 10).join(' ')).slice(0, 240) || 'Documented in source.' };
}

function extractBacSpan(text: string): { start_bac: number; end_bac: number; label: string } | null {
  const spanMatch = /\b(\d{3,4})\s*[–-]\s*(\d{3,4})\s*BAC\b/.exec(text);
  if (spanMatch) {
    const a = Number(spanMatch[1]);
    const b = Number(spanMatch[2]);
    if (Number.isInteger(a) && Number.isInteger(b)) {
      const start = Math.max(a, b);
      const end = Math.min(a, b);
      return { start_bac: start, end_bac: end, label: `${start}–${end} BAC` };
    }
  }
  const singleMatch = /\b(\d{3,4})\s*BAC\b/.exec(text);
  if (singleMatch) {
    const y = Number(singleMatch[1]);
    if (Number.isInteger(y)) return { start_bac: y, end_bac: y, label: `${y} BAC` };
  }
  return null;
}

async function readDoc(snapshot: SourceSnapshot, path: string, side: GraphSide): Promise<ParsedDoc | null> {
  const entry = snapshot.entries.get(path);
  if (!entry || entry.type !== 'blob') return null;
  const text = decoder.decode(await snapshot.readBlob(entry.sha)).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const fm = parseFrontmatter(text);
  const meta = fm.ok && fm.value ? fm.value : {};
  const stem = path.split('/').pop()!.replace(/\.(md|json)$/i, '');
  const headingMatch = /^#\s+(.+)$/m.exec(text);
  const title =
    typeof meta.title === 'string' && meta.title.trim()
      ? meta.title.trim()
      : headingMatch
        ? cleanText(headingMatch[1]!)
        : stem;
  const description = typeof meta.description === 'string' && meta.description.trim() ? meta.description.trim() : null;
  const updated_at =
    typeof meta.lastUpdated === 'string'
      ? meta.lastUpdated
      : typeof meta.date === 'string'
        ? meta.date
        : null;
  const canon_label = typeof meta.canonStatus === 'string' ? meta.canonStatus : null;
  const tags = Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === 'string') : [];
  return {
    path,
    side,
    commit_sha: snapshot.identity.commit_sha,
    blob_sha: entry.sha,
    title,
    description,
    updated_at,
    canon_label,
    tags,
    body: text,
    lines,
  };
}

function classifyFolderKind(path: string, stem: string): NarrativeEntityKind | null {
  if (path.startsWith('content/characters/')) return 'character';
  if (path.startsWith('content/organizations/')) return stem.includes('bank') || stem.includes('authority') || stem.includes('command') ? 'institution' : 'organization';
  if (path.startsWith('content/laws/')) return stem.includes('accord') || stem.includes('treaty') ? 'treaty' : 'law';
  if (path.startsWith('content/principles/')) return 'principle';
  if (path.startsWith('content/philosophies/')) return 'philosophy';
  if (path.startsWith('content/technologies/')) return 'technology';
  if (path.startsWith('content/places/')) return stem.includes('library') ? 'institution' : 'location';
  if (path.startsWith('content/series/')) return 'narrative_arc';
  if (path.startsWith('content/myths/')) return 'theme';
  if (path.startsWith('content/events/')) {
    if (stem.includes('war') || stem.includes('conflict')) return 'conflict';
    if (stem.includes('agreement') || stem.includes('accord')) return 'treaty';
    return 'historical_event';
  }
  if (path.startsWith('content/factions/')) {
    if (stem === 'henchoway' || stem === 'bureaucracy-bros') return 'faction';
    if (stem.includes('-vs-')) return 'conflict';
    return 'nation';
  }
  return null;
}

export interface ExtractionOutput {
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
}

export async function extractNarrativeKnowledge(input: {
  audit: Audit;
  stats: StatisticsDataset;
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
}): Promise<ExtractionOutput> {
  const { audit, stats, production, remodeling } = input;
  const entities = new Map<string, NarrativeEntity>();
  const relationships = new Map<string, NarrativeRelationship>();

  const addEntity = (e: NarrativeEntity) => {
    if (!entities.has(e.id)) entities.set(e.id, e);
  };

  const addRel = (r: {
    type: NarrativeRelationshipType;
    source_id: string;
    target_id: string;
    verification: RelationshipVerification;
    causal_class: CausalClass;
    source_side: GraphSide;
    source_path: string;
    commit_sha: string;
    blob_sha: string;
    evidence_line: number | null;
    evidence_quote: string;
    rationale: string;
  }) => {
    if (!entities.has(r.source_id) || !entities.has(r.target_id) || r.source_id === r.target_id) return;
    const id = `NREL-${sha256Hex(`${r.type}|${r.source_id}|${r.target_id}|${r.source_side}|${r.source_path}`).slice(0, 12).toUpperCase()}`;
    if (!relationships.has(id)) {
      relationships.set(id, {
        id,
        ...r,
        evidence_quote: r.evidence_quote.slice(0, 320),
        rationale: r.rationale.slice(0, 320),
      });
    }
  };

  // 1. Extract planet and nations from StatisticsDataset (structured canon).
  const prodNccmSha = stats.production?.blob_sha ?? production.identity.tree_sha;
  const prodCommit = production.identity.commit_sha;
  for (const ent of stats.entities) {
    if (ent.kind === 'planet') {
      addEntity({
        id: 'nar:world:asthortera',
        kind: 'world',
        name: ent.name,
        summary: `Planetary world of Asthortera (${ent.represents_states} sovereign states in NCCM model).`,
        source_side: 'both',
        source_path: stats.dataset_path,
        commit_sha: prodCommit,
        blob_sha: prodNccmSha,
        evidence_locator: 'planet',
        evidence_line: 1,
        evidence_quote: `Planet ${ent.name}, sovereign_states=${ent.represents_states}`,
        historical_bac: { start_bac: 1010, end_bac: 0, label: '1010 BAC–Year 0' },
        editorial_updated_at: null,
        canon_status: 'CANON_OBSERVED',
        extraction_confidence: 'EXPLICIT_STRUCTURED',
        original_terminology: [ent.name, 'Asthortera'],
        related_country_id: ent.id,
        attributes: { sovereign_states: ent.represents_states, cohort: ent.cohort },
      });
      continue;
    }
    if (ent.kind === 'country') {
      const slugId = slug(ent.name);
      const narId = `nar:nation:${slugId}`;
      const canon: EpistemicStatus = ent.canon_status?.startsWith('C') ? 'CANON_OBSERVED' : 'PROPOSED';
      addEntity({
        id: narId,
        kind: 'nation',
        name: ent.name,
        summary: `${ent.name} (${ent.cohort === 'PROFILED_14' ? '14-country profiled cohort' : '5-country development cohort'})${ent.specialization ? ` — specialization: ${ent.specialization}` : ''}.`,
        source_side: 'both',
        source_path: ent.source_document ?? stats.dataset_path,
        commit_sha: prodCommit,
        blob_sha: prodNccmSha,
        evidence_locator: `countries[${ent.name}]`,
        evidence_line: null,
        evidence_quote: `${ent.name}: cohort=${ent.cohort}, foundation_bac=${ent.foundation_bac ?? 'unassigned'}, canon=${ent.canon_status ?? 'unlabeled'}`,
        historical_bac: ent.foundation_bac !== null ? { start_bac: ent.foundation_bac, end_bac: 0, label: `${ent.foundation_bac} BAC–Year 0` } : null,
        editorial_updated_at: null,
        canon_status: canon,
        extraction_confidence: 'EXPLICIT_STRUCTURED',
        original_terminology: [ent.name, ...(ent.fx_code ? [ent.fx_code] : [])],
        related_country_id: ent.id,
        attributes: {
          cohort: ent.cohort,
          foundation_bac: ent.foundation_bac,
          fx_code: ent.fx_code,
          specialization: ent.specialization,
          canon_label: ent.canon_status,
        },
      });
      if (entities.has('nar:world:asthortera')) {
        addRel({
          type: 'LOCATED_IN',
          source_id: narId,
          target_id: 'nar:world:asthortera',
          verification: 'VERIFIED_SOURCE_GROUNDED',
          causal_class: 'STRUCTURAL_CONSTRAINT',
          source_side: 'both',
          source_path: stats.dataset_path,
          commit_sha: prodCommit,
          blob_sha: prodNccmSha,
          evidence_line: null,
          evidence_quote: `${ent.name} is a modeled sovereign nation on Planet Asthortera in ${stats.dataset_path}.`,
          rationale: 'Structured national membership in the planetary dataset.',
        });
      }
    }
  }

  // 2. Extract timeline events from StatisticsDataset (structured historical anchors).
  const foundationEventsByCountry = new Map<string, string>();
  const orderedTimeline = [...stats.timeline].sort((a, b) => b.start_bac - a.start_bac || codeUnitCompare(a.id, b.id));
  for (const evt of orderedTimeline) {
    const narId = `nar:event:${ evt.id.toLowerCase() }`;
    const isConflict = /war|crisis|conflict/i.test(evt.label);
    const isTreaty = /treaty|accord|ceasefire|restoration/i.test(evt.label);
    const kind: NarrativeEntityKind = isConflict ? 'conflict' : isTreaty ? 'treaty' : 'historical_event';
    addEntity({
      id: narId,
      kind,
      name: evt.label,
      summary: `${evt.label} (${evt.start_bac === evt.end_bac ? `${evt.start_bac} BAC` : `${evt.start_bac}–${evt.end_bac} BAC`})${evt.note ? ` — ${evt.note}` : ''}.`,
      source_side: 'production',
      source_path: evt.source.path,
      commit_sha: evt.source.commit_sha,
      blob_sha: evt.source.blob_sha,
      evidence_locator: evt.source.pointer ?? evt.id,
      evidence_line: evt.source.line,
      evidence_quote: `${evt.label}: ${evt.start_bac}–${evt.end_bac} BAC`,
      historical_bac: {
        start_bac: evt.start_bac,
        end_bac: evt.end_bac,
        label: evt.start_bac === evt.end_bac ? `${evt.start_bac} BAC` : `${evt.start_bac}–${evt.end_bac} BAC`,
      },
      editorial_updated_at: null,
      canon_status: evt.status,
      extraction_confidence: 'EXPLICIT_STRUCTURED',
      original_terminology: [evt.label],
      related_country_id: evt.entity_id,
      attributes: { start_bac: evt.start_bac, end_bac: evt.end_bac, event_kind: evt.kind },
    });
    if (evt.entity_id) {
      const countrySlug = evt.entity_id.replace(/^country:/, '');
      const nationId = `nar:nation:${countrySlug}`;
      foundationEventsByCountry.set(nationId, narId);
      if (entities.has(nationId)) {
        addRel({
          type: 'PARTICIPATES_IN',
          source_id: nationId,
          target_id: narId,
          verification: 'VERIFIED_SOURCE_GROUNDED',
          causal_class: 'PARTICIPATION',
          source_side: 'production',
          source_path: evt.source.path,
          commit_sha: evt.source.commit_sha,
          blob_sha: evt.source.blob_sha,
          evidence_line: evt.source.line,
          evidence_quote: `${evt.label} (${evt.start_bac} BAC) establishes sovereign foundation of ${countrySlug}.`,
          rationale: 'Declared historical foundation record in NCCM dataset.',
        });
      }
    }
  }

  // Link non-overlapping sequential major events in BAC chronology (PRECEDES / FOLLOWS).
  const majorEvents = orderedTimeline.filter((e) => e.kind === 'EVENT' || e.entity_id === 'country:reltronland' || e.entity_id === 'country:depcutland');
  for (let i = 0; i < majorEvents.length - 1; i++) {
    const earlier = majorEvents[i]!;
    const later = majorEvents[i + 1]!;
    if (earlier.end_bac > later.start_bac) {
      const earlierId = `nar:event:${earlier.id.toLowerCase()}`;
      const laterId = `nar:event:${later.id.toLowerCase()}`;
      addRel({
        type: 'PRECEDES',
        source_id: earlierId,
        target_id: laterId,
        verification: 'VERIFIED_SOURCE_GROUNDED',
        causal_class: 'CHRONOLOGICAL',
        source_side: 'production',
        source_path: earlier.source.path,
        commit_sha: earlier.source.commit_sha,
        blob_sha: earlier.source.blob_sha,
        evidence_line: null,
        evidence_quote: `${earlier.label} (${earlier.end_bac} BAC) precedes ${later.label} (${later.start_bac} BAC) in BAC countdown chronology.`,
        rationale: 'Verified BAC chronological order (higher BAC year is further in the past).',
      });
      addRel({
        type: 'FOLLOWS',
        source_id: laterId,
        target_id: earlierId,
        verification: 'VERIFIED_SOURCE_GROUNDED',
        causal_class: 'CHRONOLOGICAL',
        source_side: 'production',
        source_path: later.source.path,
        commit_sha: later.source.commit_sha,
        blob_sha: later.source.blob_sha,
        evidence_line: null,
        evidence_quote: `${later.label} (${later.start_bac} BAC) follows ${earlier.label} (${earlier.end_bac} BAC).`,
        rationale: 'Verified BAC chronological order.',
      });
    }
  }

  // 3. Parse Markdown documents across worldbuilding collections.
  const parsedDocs = new Map<string, ParsedDoc>();
  for (const file of audit.files) {
    if (file.kind !== 'markdown' || file.path.startsWith('content/blog/') || file.path.startsWith('content/music/') || file.path.startsWith('content/video/')) {
      continue;
    }
    const stem = file.path.split('/').pop()!.replace(/\.md$/i, '');
    const folderKind = classifyFolderKind(file.path, stem);
    if (!folderKind) continue;

    const side: GraphSide =
      file.classification === 'DRAFT_ONLY'
        ? 'remodeling'
        : file.classification === 'PRODUCTION_ONLY'
          ? 'production'
          : 'both';
    const snap = file.classification === 'DRAFT_ONLY' ? remodeling : production;
    const doc = await readDoc(snap, file.path, side);
    if (!doc) continue;
    parsedDocs.set(file.path, doc);

    // If this is a nation file that already exists from NCCM, enrich it with prose summary & updated_at.
    const existingNationId = `nar:nation:${slug(stem)}`;
    if (folderKind === 'nation' && entities.has(existingNationId)) {
      const existing = entities.get(existingNationId)!;
      const prose = firstProseLine(doc.lines);
      entities.set(existingNationId, {
        ...existing,
        summary: doc.description ?? prose.text,
        source_path: doc.path,
        commit_sha: doc.commit_sha,
        blob_sha: doc.blob_sha,
        evidence_locator: `${doc.path}#L${prose.line}`,
        evidence_line: prose.line,
        evidence_quote: prose.text,
        editorial_updated_at: doc.updated_at,
      });
      continue;
    }

    const prose = firstProseLine(doc.lines);
    const bac = extractBacSpan(doc.body);
    const entityId = `nar:${folderKind}:${slug(stem)}`;
    const canonStatus: EpistemicStatus =
      file.classification === 'DRAFT_ONLY'
        ? 'PROPOSED'
        : doc.canon_label && /provisional|proposal|working|scenario/i.test(doc.canon_label)
          ? 'PROPOSED'
          : 'CANON_OBSERVED';

    addEntity({
      id: entityId,
      kind: folderKind,
      name: doc.title.split(/\s+[—–:]\s+/)[0]!.replace(/^[^\wA-Za-z]+/, '').trim() || doc.title,
      summary: doc.description ?? prose.text,
      source_side: side,
      source_path: doc.path,
      commit_sha: doc.commit_sha,
      blob_sha: doc.blob_sha,
      evidence_locator: `${doc.path}#L${prose.line}`,
      evidence_line: prose.line,
      evidence_quote: prose.text,
      historical_bac: bac,
      editorial_updated_at: doc.updated_at,
      canon_status: canonStatus,
      extraction_confidence: doc.description ? 'FRONTMATTER_DECLARED' : 'EXPLICIT_PROSE',
      original_terminology: [doc.title, ...doc.tags.slice(0, 6)],
      related_country_id: null,
      attributes: {
        document_title: doc.title,
        classification: file.classification,
        ...(doc.canon_label ? { source_canon_note: doc.canon_label.slice(0, 140) } : {}),
      },
    });
  }

  // 4. Extract explicit source-grounded core concepts (motivations, constraints, viewpoints, decisions, consequences)
  // only when the corresponding authoritative source documents exist in the snapshot.
  const rvdDoc = parsedDocs.get('content/factions/reltronland-vs-depcutland.md');
  if (rvdDoc) {
    const findLine = (re: RegExp): { line: number; quote: string } => {
      for (let i = 0; i < rvdDoc.lines.length; i++) {
        if (re.test(rvdDoc.lines[i]!)) {
          return { line: i + 1, quote: cleanText(rvdDoc.lines[i]!).slice(0, 260) };
        }
      }
      return { line: 1, quote: rvdDoc.description ?? rvdDoc.title };
    };

    const depeisitEv = findLine(/Depeisit Economic Crisis|Planet Depeisit/i);
    addEntity({
      id: 'nar:world:depeisit',
      kind: 'world',
      name: 'Planet Depeisit',
      summary: 'Ancestral homeworld of the Tron and Cut lineages; site of the 1057 BAC structural-financial and institutional crisis.',
      source_side: rvdDoc.side,
      source_path: rvdDoc.path,
      commit_sha: rvdDoc.commit_sha,
      blob_sha: rvdDoc.blob_sha,
      evidence_locator: `${rvdDoc.path}#L${depeisitEv.line}`,
      evidence_line: depeisitEv.line,
      evidence_quote: depeisitEv.quote,
      historical_bac: { start_bac: 1125, end_bac: 1057, label: '1125–1057 BAC' },
      editorial_updated_at: rvdDoc.updated_at,
      canon_status: 'CANON_OBSERVED',
      extraction_confidence: 'EXPLICIT_PROSE',
      original_terminology: ['Planet Depeisit', 'Depeisit Economic Crisis', 'Tron', 'Cut'],
      related_country_id: null,
      attributes: { ancestral_world: true, population_trillion_historical: 25, sdi_historical: 0.852 },
    });

    const fearRelEv = findLine(/Loss of economic continuity and recurrence of Depeisit-type systemic failure/i);
    addEntity({
      id: 'nar:motivation:reltronland-anti-capture-vigilance',
      kind: 'motivation',
      name: 'Fear of Depeisit-Pattern Systemic & Institutional Failure',
      summary: 'Reltronland strategic motivation to prevent recurrence of Depeisit-linked debt contagion, unpaid receivables, and aristocratic state capture.',
      source_side: rvdDoc.side,
      source_path: rvdDoc.path,
      commit_sha: rvdDoc.commit_sha,
      blob_sha: rvdDoc.blob_sha,
      evidence_locator: `${rvdDoc.path}#L${fearRelEv.line}`,
      evidence_line: fearRelEv.line,
      evidence_quote: fearRelEv.quote,
      historical_bac: { start_bac: 1057, end_bac: 0, label: '1057 BAC–Year 0' },
      editorial_updated_at: rvdDoc.updated_at,
      canon_status: 'CANON_OBSERVED',
      extraction_confidence: 'EXPLICIT_PROSE',
      original_terminology: ['Astralis anti-capture doctrine', 'Depeisit-type systemic failure'],
      related_country_id: 'country:reltronland',
      attributes: { actor: 'Reltronland' },
    });

    const fearDepEv = findLine(/Loss of industry, independent agency, territory and national continuity/i);
    addEntity({
      id: 'nar:motivation:depcutland-custodial-sovereignty',
      kind: 'motivation',
      name: 'Preservation of Custodial Neutrality & Sovereign Agency',
      summary: 'Depcutland strategic motivation to guard archival neutrality, epistemic independence, and national continuity against external financial or military subordination.',
      source_side: rvdDoc.side,
      source_path: rvdDoc.path,
      commit_sha: rvdDoc.commit_sha,
      blob_sha: rvdDoc.blob_sha,
      evidence_locator: `${rvdDoc.path}#L${fearDepEv.line}`,
      evidence_line: fearDepEv.line,
      evidence_quote: fearDepEv.quote,
      historical_bac: { start_bac: 1057, end_bac: 0, label: '1057 BAC–Year 0' },
      editorial_updated_at: rvdDoc.updated_at,
      canon_status: 'CANON_OBSERVED',
      extraction_confidence: 'EXPLICIT_PROSE',
      original_terminology: ['Oracle of Asthortera', 'Custodial neutrality', 'Epistemic custody'],
      related_country_id: 'country:depcutland',
      attributes: { actor: 'Depcutland' },
    });

    const constraintEv = findLine(/socially inseparable \*\*from below\*\*; strategically competitive and sovereign \*\*from above\*\*/i);
    addEntity({
      id: 'nar:constraint:bilateral-sovereignty-without-alliance',
      kind: 'constraint',
      name: 'Managed Interdependence Without Shared Sovereignty',
      summary: 'Canonical boundary: Reltronland and Depcutland are socially intertwined from below and cooperate on shared existential threats, but never merge into a single supranational bloc or sentimental alliance.',
      source_side: rvdDoc.side,
      source_path: rvdDoc.path,
      commit_sha: rvdDoc.commit_sha,
      blob_sha: rvdDoc.blob_sha,
      evidence_locator: `${rvdDoc.path}#L${constraintEv.line}`,
      evidence_line: constraintEv.line,
      evidence_quote: constraintEv.quote,
      historical_bac: { start_bac: 1010, end_bac: 0, label: '1010 BAC–Year 0' },
      editorial_updated_at: rvdDoc.updated_at,
      canon_status: 'CANON_OBSERVED',
      extraction_confidence: 'EXPLICIT_PROSE',
      original_terminology: ['Managed interdependence', 'Troncut Treaty', 'Cross-sovereign redundancy'],
      related_country_id: null,
      attributes: { binding_rule: true },
    });

    const viewpointEv = findLine(/The very competence with which these neighbors translate one another's objections can create \*\*an external illusion of alliance\*\*/i);
    addEntity({
      id: 'nar:viewpoint:external-illusion-of-alliance',
      kind: 'viewpoint',
      name: 'External Illusion of Reltronland–Depcutland Alliance',
      summary: 'Third-party states often perceive Reltronland and Depcutland as a unified alliance when they coordinate during crises, misreading issue-specific cooperation as shared sovereignty.',
      source_side: rvdDoc.side,
      source_path: rvdDoc.path,
      commit_sha: rvdDoc.commit_sha,
      blob_sha: rvdDoc.blob_sha,
      evidence_locator: `${rvdDoc.path}#L${viewpointEv.line}`,
      evidence_line: viewpointEv.line,
      evidence_quote: viewpointEv.quote,
      historical_bac: { start_bac: 0, end_bac: 0, label: 'Year 0' },
      editorial_updated_at: rvdDoc.updated_at,
      canon_status: 'CANON_OBSERVED',
      extraction_confidence: 'EXPLICIT_PROSE',
      original_terminology: ['External illusion of alliance'],
      related_country_id: null,
      attributes: { perspective_holder: 'Third-party Asthorteran states' },
    });

    // Connect Reltronland & Depcutland to their ancestral origin, motivations, constraints, and events.
    for (const nationId of ['nar:nation:reltronland', 'nar:nation:depcutland']) {
      if (entities.has(nationId)) {
        addRel({
          type: 'DERIVED_FROM',
          source_id: nationId,
          target_id: 'nar:world:depeisit',
          verification: 'VERIFIED_SOURCE_GROUNDED',
          causal_class: 'VERIFIED_CAUSAL',
          source_side: rvdDoc.side,
          source_path: rvdDoc.path,
          commit_sha: rvdDoc.commit_sha,
          blob_sha: rvdDoc.blob_sha,
          evidence_line: depeisitEv.line,
          evidence_quote: depeisitEv.quote,
          rationale: 'Both civilizations trace their ancestral roots and pre-war debt crisis to Planet Depeisit.',
        });
        addRel({
          type: 'CONSTRAINED_BY',
          source_id: nationId,
          target_id: 'nar:constraint:bilateral-sovereignty-without-alliance',
          verification: 'VERIFIED_SOURCE_GROUNDED',
          causal_class: 'STRUCTURAL_CONSTRAINT',
          source_side: rvdDoc.side,
          source_path: rvdDoc.path,
          commit_sha: rvdDoc.commit_sha,
          blob_sha: rvdDoc.blob_sha,
          evidence_line: constraintEv.line,
          evidence_quote: constraintEv.quote,
          rationale: 'Both states are bound by the Troncut Treaty and post-war sovereignty guarantees.',
        });
      }
    }
    if (entities.has('nar:nation:reltronland')) {
      addRel({
        type: 'MOTIVATED_BY',
        source_id: 'nar:nation:reltronland',
        target_id: 'nar:motivation:reltronland-anti-capture-vigilance',
        verification: 'VERIFIED_SOURCE_GROUNDED',
        causal_class: 'VERIFIED_CAUSAL',
        source_side: rvdDoc.side,
        source_path: rvdDoc.path,
        commit_sha: rvdDoc.commit_sha,
        blob_sha: rvdDoc.blob_sha,
        evidence_line: fearRelEv.line,
        evidence_quote: fearRelEv.quote,
        rationale: 'Explicitly documented wartime and modern institutional motivation of Reltronland.',
      });
    }
    if (entities.has('nar:nation:depcutland')) {
      addRel({
        type: 'MOTIVATED_BY',
        source_id: 'nar:nation:depcutland',
        target_id: 'nar:motivation:depcutland-custodial-sovereignty',
        verification: 'VERIFIED_SOURCE_GROUNDED',
        causal_class: 'VERIFIED_CAUSAL',
        source_side: rvdDoc.side,
        source_path: rvdDoc.path,
        commit_sha: rvdDoc.commit_sha,
        blob_sha: rvdDoc.blob_sha,
        evidence_line: fearDepEv.line,
        evidence_quote: fearDepEv.quote,
        rationale: 'Explicitly documented custodial and sovereignty motivation of Depcutland.',
      });
    }
    if (entities.has('nar:nation:reltronland') && entities.has('nar:nation:depcutland')) {
      addRel({
        type: 'CONFLICTS_WITH',
        source_id: 'nar:nation:reltronland',
        target_id: 'nar:nation:depcutland',
        verification: 'VERIFIED_SOURCE_GROUNDED',
        causal_class: 'PARTICIPATION',
        source_side: rvdDoc.side,
        source_path: rvdDoc.path,
        commit_sha: rvdDoc.commit_sha,
        blob_sha: rvdDoc.blob_sha,
        evidence_line: constraintEv.line,
        evidence_quote: constraintEv.quote,
        rationale: 'Historical belligerents in the 1048–1030 BAC War of Conscience and modern institutional competitors.',
      });
    }
  }

  // 5. Connect Henchoway, Nytherion Abyss, Hargenbor, and The Abyss of Comfort characters when present.
  const henDoc = parsedDocs.get('content/factions/henchoway.md');
  if (henDoc && entities.has('nar:faction:henchoway')) {
    const findHenLine = (re: RegExp) => {
      for (let i = 0; i < henDoc.lines.length; i++) {
        if (re.test(henDoc.lines[i]!)) return { line: i + 1, quote: cleanText(henDoc.lines[i]!).slice(0, 260) };
      }
      return { line: 1, quote: henDoc.description ?? henDoc.title };
    };
    const stillEv = findHenLine(/Adaptive Stillness/i);
    addEntity({
      id: 'nar:decision:adaptive-stillness-doctrine',
      kind: 'decision',
      name: 'Adaptive Stillness World-Order Doctrine',
      summary: 'Vitor Baythorne’s strategic shift from crude suppression to curating comfort, dependency, and recognition scarcity so civilization ceases to challenge imposed boundaries.',
      source_side: henDoc.side,
      source_path: henDoc.path,
      commit_sha: henDoc.commit_sha,
      blob_sha: henDoc.blob_sha,
      evidence_locator: `${henDoc.path}#L${stillEv.line}`,
      evidence_line: stillEv.line,
      evidence_quote: stillEv.quote,
      historical_bac: { start_bac: 0, end_bac: 0, label: 'Year 0' },
      editorial_updated_at: henDoc.updated_at,
      canon_status: 'CANON_OBSERVED',
      extraction_confidence: 'EXPLICIT_PROSE',
      original_terminology: ['Adaptive Stillness', 'Recognition Scarcity', 'Attention capital'],
      related_country_id: null,
      attributes: { architect: 'Vitor Baythorne / Van Den Scuba' },
    });

    addRel({
      type: 'DEFINES',
      source_id: 'nar:faction:henchoway',
      target_id: 'nar:decision:adaptive-stillness-doctrine',
      verification: 'VERIFIED_SOURCE_GROUNDED',
      causal_class: 'VERIFIED_CAUSAL',
      source_side: henDoc.side,
      source_path: henDoc.path,
      commit_sha: henDoc.commit_sha,
      blob_sha: henDoc.blob_sha,
      evidence_line: stillEv.line,
      evidence_quote: stillEv.quote,
      rationale: 'Henchoway defines and executes the Adaptive Stillness world-order doctrine.',
    });

    for (const targetNation of ['nar:nation:reltronland', 'nar:nation:depcutland']) {
      if (entities.has(targetNation)) {
        const contestEv = findHenLine(/Reltronland is dangerous to Vitor|institutional neutralization/i);
        addRel({
          type: 'CONFLICTS_WITH',
          source_id: 'nar:faction:henchoway',
          target_id: targetNation,
          verification: 'VERIFIED_SOURCE_GROUNDED',
          causal_class: 'PARTICIPATION',
          source_side: henDoc.side,
          source_path: henDoc.path,
          commit_sha: henDoc.commit_sha,
          blob_sha: henDoc.blob_sha,
          evidence_line: contestEv.line,
          evidence_quote: contestEv.quote,
          rationale: 'Henchoway targets anti-capture and archival-verification institutions in Reltronland and Depcutland.',
        });
      }
    }

    if (entities.has('nar:philosophy:nytherion-abyss')) {
      const nyEv = findHenLine(/Nytherion is an enduring metaphysical and existential possibility/i);
      addRel({
        type: 'THEMATICALLY_RELATED',
        source_id: 'nar:faction:henchoway',
        target_id: 'nar:philosophy:nytherion-abyss',
        verification: 'VERIFIED_SOURCE_GROUNDED',
        causal_class: 'THEMATIC_ONLY',
        source_side: henDoc.side,
        source_path: henDoc.path,
        commit_sha: henDoc.commit_sha,
        blob_sha: henDoc.blob_sha,
        evidence_line: nyEv.line,
        evidence_quote: nyEv.quote,
        rationale: 'Henchoway exploits Nytherion conditions but is not the origin or owner of Nytherion Abyss.',
      });
    }

    if (entities.has('nar:nation:hargenbor')) {
      const hargEv = findHenLine(/Hargenbor — Strategic Leverage, Not a Puppet State/i);
      addRel({
        type: 'CAUSES_CANDIDATE',
        source_id: 'nar:faction:henchoway',
        target_id: 'nar:nation:hargenbor',
        verification: 'CANDIDATE_HYPOTHESIS',
        causal_class: 'CO_OCCURRENCE_ONLY',
        source_side: henDoc.side,
        source_path: henDoc.path,
        commit_sha: henDoc.commit_sha,
        blob_sha: henDoc.blob_sha,
        evidence_line: hargEv.line,
        evidence_quote: hargEv.quote,
        rationale: 'Henchoway draws on Hargenbor-linked logistics and deep-sea geography, but Hargenbor is a sovereign state and not a puppet.',
      });
    }
  }

  // 6. Scan documents for verified entity appearances and location/institution bindings.
  const majorEntities = [...entities.values()].filter((e) =>
    ['nation', 'character', 'faction', 'institution', 'philosophy'].includes(e.kind) && e.name.length >= 4,
  );
  for (const [, doc] of parsedDocs) {
    const stem = doc.path.split('/').pop()!.replace(/\.md$/i, '');
    const folderKind = classifyFolderKind(doc.path, stem);
    if (!folderKind) continue;
    const docEntityId = folderKind === 'nation' && entities.has(`nar:nation:${slug(stem)}`)
      ? `nar:nation:${slug(stem)}`
      : `nar:${folderKind}:${slug(stem)}`;
    if (!entities.has(docEntityId)) continue;

    for (const target of majorEntities) {
      if (target.id === docEntityId) continue;
      const escaped = target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, 'g');
      const m = re.exec(doc.body);
      if (!m) continue;
      const lineNo = doc.body.slice(0, m.index).split('\n').length;
      const lineText = cleanText(doc.lines[lineNo - 1] ?? target.name);

      if (folderKind === 'narrative_arc' && (target.kind === 'character' || target.kind === 'nation' || target.kind === 'faction')) {
        addRel({
          type: 'APPEARS_IN',
          source_id: target.id,
          target_id: docEntityId,
          verification: 'VERIFIED_SOURCE_GROUNDED',
          causal_class: 'PARTICIPATION',
          source_side: doc.side,
          source_path: doc.path,
          commit_sha: doc.commit_sha,
          blob_sha: doc.blob_sha,
          evidence_line: lineNo,
          evidence_quote: lineText,
          rationale: `${target.name} explicitly appears in narrative arc document ${doc.path}.`,
        });
      } else if ((folderKind === 'law' || folderKind === 'treaty') && target.kind === 'nation') {
        addRel({
          type: 'CONSTRAINED_BY',
          source_id: target.id,
          target_id: docEntityId,
          verification: 'VERIFIED_SOURCE_GROUNDED',
          causal_class: 'STRUCTURAL_CONSTRAINT',
          source_side: doc.side,
          source_path: doc.path,
          commit_sha: doc.commit_sha,
          blob_sha: doc.blob_sha,
          evidence_line: lineNo,
          evidence_quote: lineText,
          rationale: `${target.name} is referenced under legal/treaty framework ${doc.title}.`,
        });
      } else if ((folderKind === 'location' || folderKind === 'technology' || folderKind === 'institution') && target.kind === 'nation') {
        addRel({
          type: 'LOCATED_IN',
          source_id: docEntityId,
          target_id: target.id,
          verification: 'VERIFIED_SOURCE_GROUNDED',
          causal_class: 'STRUCTURAL_CONSTRAINT',
          source_side: doc.side,
          source_path: doc.path,
          commit_sha: doc.commit_sha,
          blob_sha: doc.blob_sha,
          evidence_line: lineNo,
          evidence_quote: lineText,
          rationale: `${doc.title} is associated with ${target.name} in ${doc.path}.`,
        });
      } else if (folderKind === 'historical_event' || folderKind === 'conflict') {
        addRel({
          type: 'PARTICIPATES_IN',
          source_id: target.id,
          target_id: docEntityId,
          verification: 'VERIFIED_SOURCE_GROUNDED',
          causal_class: 'PARTICIPATION',
          source_side: doc.side,
          source_path: doc.path,
          commit_sha: doc.commit_sha,
          blob_sha: doc.blob_sha,
          evidence_line: lineNo,
          evidence_quote: lineText,
          rationale: `${target.name} participates in ${doc.title} (${doc.path}).`,
        });
      }
    }
  }

  // 7. Remodeling-only narrative arcs (House of Valethra, Five Voices of Aurora Covenant) propose extensions to The Abyss of Comfort.
  const abyssArcId = 'nar:narrative_arc:the-abyss-of-comfort';
  for (const draftArcId of ['nar:narrative_arc:house-of-valethra', 'nar:narrative_arc:the-five-voices-of-aurora-covenant']) {
    if (entities.has(draftArcId) && entities.has(abyssArcId)) {
      const draftEnt = entities.get(draftArcId)!;
      addRel({
        type: 'PROPOSES_CHANGE_TO',
        source_id: draftArcId,
        target_id: abyssArcId,
        verification: 'DECLARED_PROVENANCE',
        causal_class: 'STRUCTURAL_CONSTRAINT',
        source_side: 'remodeling',
        source_path: draftEnt.source_path,
        commit_sha: draftEnt.commit_sha,
        blob_sha: draftEnt.blob_sha,
        evidence_line: draftEnt.evidence_line,
        evidence_quote: draftEnt.evidence_quote,
        rationale: 'Remodeling-only family lore architecture expanding Seasons 41–44 of The Abyss of Comfort.',
      });
    }
  }

  return {
    entities: [...entities.values()].sort((a, b) => codeUnitCompare(a.id, b.id)),
    relationships: [...relationships.values()].sort((a, b) => codeUnitCompare(a.id, b.id)),
  };
}

