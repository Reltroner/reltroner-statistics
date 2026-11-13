/**
 * Source-grounded narrative entity and relationship extractor.
 *
 * Every prose citation is resolved by matching a pinned pattern against the pinned blob
 * (engine/evidence.ts). When a pattern does not match, the entity or relationship that depended
 * on it is not created: there is no fallback line, no paraphrase presented as a quote and no
 * hard-coded attribute.
 *
 * A name occurring in a document is a co-occurrence. Relationships inferred from an occurrence
 * (a nation named in a law, event or place document) are CANDIDATE_HYPOTHESIS and never count as
 * verified dependencies. Only relationships stated by the structured dataset or by an explicitly
 * matched source sentence are VERIFIED_SOURCE_GROUNDED.
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
import { findPassage, plainText, readLines, type Passage } from '../evidence.ts';
import { sha256Hex } from '../git-objects.ts';
import { parseFrontmatter } from '../markdown.ts';
import { slug } from '../observations.ts';

export const RVD_PATH = 'content/factions/reltronland-vs-depcutland.md';
export const HENCHOWAY_PATH = 'content/factions/henchoway.md';

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

/**
 * First line of running prose after the frontmatter; when a document has none, its first heading.
 * Markup-only lines (comments, tables, images, rules) are never quoted. Null when nothing is citable.
 */
function firstCitableLine(lines: string[]): { line: number; text: string } | null {
  let inFrontmatter = false;
  let heading: { line: number; text: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (i === 0 && l === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (l === '---') inFrontmatter = false; continue; }
    if (!l || l.startsWith('<') || l.startsWith('![') || l.startsWith('|') || l.startsWith('---')) continue;
    const text = plainText(l);
    if (l.startsWith('#')) { if (!heading && text) heading = { line: i + 1, text: text.slice(0, 280) }; continue; }
    if (text.length >= 24) return { line: i + 1, text: text.slice(0, 280) };
  }
  return heading;
}

function extractBacSpan(text: string): { start_bac: number; end_bac: number; label: string } | null {
  const spanMatch = /\b(\d{3,4})\s*[–-]\s*(\d{3,4})\s*BAC\b/.exec(text);
  if (spanMatch) {
    const a = Number(spanMatch[1]);
    const b = Number(spanMatch[2]);
    const start = Math.max(a, b);
    const end = Math.min(a, b);
    return { start_bac: start, end_bac: end, label: `${start}–${end} BAC` };
  }
  const singleMatch = /\b(\d{3,4})\s*BAC\b/.exec(text);
  if (singleMatch) {
    const y = Number(singleMatch[1]);
    return { start_bac: y, end_bac: y, label: `${y} BAC` };
  }
  return null;
}

async function readDoc(snapshot: SourceSnapshot, path: string, side: GraphSide): Promise<ParsedDoc | null> {
  const entry = snapshot.entries.get(path);
  const lines = await readLines(snapshot, path);
  if (!entry || !lines) return null;
  const text = lines.join('\n');
  const fm = parseFrontmatter(text);
  const meta = fm.ok && fm.value ? fm.value : {};
  const stem = path.split('/').pop()!.replace(/\.(md|json)$/i, '');
  const headingMatch = /^#\s+(.+)$/m.exec(text);
  const title = typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : headingMatch ? plainText(headingMatch[1]!) : stem;
  return {
    path,
    side,
    commit_sha: snapshot.identity.commit_sha,
    blob_sha: entry.sha,
    title,
    description: typeof meta.description === 'string' && meta.description.trim() ? meta.description.trim() : null,
    updated_at: typeof meta.lastUpdated === 'string' ? meta.lastUpdated : typeof meta.date === 'string' ? meta.date : null,
    canon_label: typeof meta.canonStatus === 'string' ? meta.canonStatus : null,
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === 'string') : [],
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

  const addRel = (r: Omit<NarrativeRelationship, 'id'>) => {
    if (!entities.has(r.source_id) || !entities.has(r.target_id) || r.source_id === r.target_id) return;
    const id = `NREL-${sha256Hex(`${r.type}|${r.source_id}|${r.target_id}|${r.source_side}|${r.source_path}`).slice(0, 12).toUpperCase()}`;
    if (!relationships.has(id)) relationships.set(id, { id, ...r, rationale: r.rationale.slice(0, 320) });
  };
  /** A relationship stated by a matched source sentence. */
  const stated = (type: NarrativeRelationshipType, source_id: string, target_id: string, p: Passage, causal_class: CausalClass, rationale: string,
    verification: RelationshipVerification = 'VERIFIED_SOURCE_GROUNDED') =>
    addRel({ type, source_id, target_id, verification, causal_class, source_side: p.side === 'remodeling' ? 'remodeling' : sideOf(p.path), source_path: p.path,
      commit_sha: p.commit_sha, blob_sha: p.blob_sha, evidence_line: p.line, evidence_quote: p.quote, rationale });
  const parsedDocs = new Map<string, ParsedDoc>();
  const sideOf = (path: string): GraphSide => parsedDocs.get(path)?.side ?? 'production';

  // 1. Planet and nations from the structured dataset. Dataset records are cited by pointer; no line is quoted.
  const prodNccmSha = stats.production?.blob_sha ?? null;
  const prodCommit = production.identity.commit_sha;
  if (prodNccmSha) {
    for (const ent of stats.entities) {
      if (ent.kind === 'planet') {
        addEntity({
          id: 'nar:world:asthortera', kind: 'world', name: ent.name,
          summary: `Planet ${ent.name}; the dataset models ${ent.represents_states} sovereign states.`,
          source_side: 'both', source_path: stats.dataset_path, commit_sha: prodCommit, blob_sha: prodNccmSha,
          evidence_locator: 'planet', evidence_line: null, evidence_quote: `planet.sovereign_states = ${ent.represents_states}`,
          historical_bac: null, editorial_updated_at: null, canon_status: 'CANON_OBSERVED', extraction_confidence: 'EXPLICIT_STRUCTURED',
          original_terminology: [ent.name], related_country_id: ent.id, attributes: { sovereign_states: ent.represents_states, cohort: ent.cohort },
        });
        continue;
      }
      if (ent.kind !== 'country') continue;
      const narId = `nar:nation:${slug(ent.name)}`;
      addEntity({
        id: narId, kind: 'nation', name: ent.name,
        summary: `${ent.name} (${ent.cohort === 'PROFILED_14' ? 'profiled nation' : 'development-cohort nation'})${ent.specialization ? `; specialization: ${ent.specialization}` : ''}.`,
        source_side: 'both', source_path: stats.dataset_path, commit_sha: prodCommit, blob_sha: prodNccmSha,
        evidence_locator: `countries[${ent.name}]`, evidence_line: null,
        evidence_quote: `${ent.name}: cohort=${ent.cohort}, foundation_bac=${ent.foundation_bac ?? 'unassigned'}, canon=${ent.canon_status ?? 'unlabeled'}`,
        historical_bac: ent.foundation_bac !== null ? { start_bac: ent.foundation_bac, end_bac: 0, label: `${ent.foundation_bac} BAC–Year 0` } : null,
        editorial_updated_at: null, canon_status: ent.canon_status?.startsWith('C') ? 'CANON_OBSERVED' : 'PROPOSED', extraction_confidence: 'EXPLICIT_STRUCTURED',
        original_terminology: [ent.name, ...(ent.fx_code ? [ent.fx_code] : [])], related_country_id: ent.id,
        attributes: { cohort: ent.cohort, foundation_bac: ent.foundation_bac, fx_code: ent.fx_code, specialization: ent.specialization, canon_label: ent.canon_status },
      });
      if (entities.has('nar:world:asthortera')) {
        addRel({
          type: 'LOCATED_IN', source_id: narId, target_id: 'nar:world:asthortera', verification: 'VERIFIED_SOURCE_GROUNDED', causal_class: 'STRUCTURAL_CONSTRAINT',
          source_side: 'both', source_path: stats.dataset_path, commit_sha: prodCommit, blob_sha: prodNccmSha, evidence_line: null,
          evidence_quote: `countries[${ent.name}] is a record of the planetary dataset ${stats.dataset_path}`, rationale: 'Structured national membership in the planetary dataset.',
        });
      }
    }
  }

  // 2. Timeline events from the structured dataset.
  const orderedTimeline = [...stats.timeline].sort((a, b) => b.start_bac - a.start_bac || codeUnitCompare(a.id, b.id));
  const span = (a: number, b: number) => (a === b ? `${a} BAC` : `${a}–${b} BAC`);
  for (const evt of orderedTimeline) {
    const narId = `nar:event:${evt.id.toLowerCase()}`;
    const kind: NarrativeEntityKind = /war|crisis|conflict/i.test(evt.label) ? 'conflict' : /treaty|accord|ceasefire|restoration/i.test(evt.label) ? 'treaty' : 'historical_event';
    addEntity({
      id: narId, kind, name: evt.label, summary: `${evt.label} (${span(evt.start_bac, evt.end_bac)})${evt.note ? `; ${evt.note}` : ''}.`,
      source_side: 'production', source_path: evt.source.path, commit_sha: evt.source.commit_sha, blob_sha: evt.source.blob_sha,
      evidence_locator: evt.source.pointer ?? evt.id, evidence_line: null, evidence_quote: `${evt.source.pointer ?? evt.id}: ${span(evt.start_bac, evt.end_bac)}`,
      historical_bac: { start_bac: evt.start_bac, end_bac: evt.end_bac, label: span(evt.start_bac, evt.end_bac) },
      editorial_updated_at: null, canon_status: evt.status, extraction_confidence: 'EXPLICIT_STRUCTURED', original_terminology: [evt.label],
      related_country_id: evt.entity_id, attributes: { start_bac: evt.start_bac, end_bac: evt.end_bac, event_kind: evt.kind },
    });
    const nationId = evt.entity_id ? `nar:nation:${evt.entity_id.replace(/^country:/, '')}` : null;
    if (nationId && entities.has(nationId)) {
      addRel({
        type: 'PARTICIPATES_IN', source_id: nationId, target_id: narId, verification: 'VERIFIED_SOURCE_GROUNDED', causal_class: 'PARTICIPATION',
        source_side: 'production', source_path: evt.source.path, commit_sha: evt.source.commit_sha, blob_sha: evt.source.blob_sha, evidence_line: null,
        evidence_quote: `${evt.source.pointer ?? evt.id}: ${evt.label}, ${span(evt.start_bac, evt.end_bac)}`, rationale: 'Dated record of this nation in the dataset timeline.',
      });
    }
  }
  // Chronological order between consecutive dated records (BAC years count down).
  const dated = orderedTimeline.filter((e) => e.kind === 'EVENT' || e.entity_id === 'country:reltronland' || e.entity_id === 'country:depcutland');
  for (let i = 0; i < dated.length - 1; i++) {
    const earlier = dated[i]!;
    const later = dated[i + 1]!;
    if (earlier.end_bac <= later.start_bac) continue;
    const earlierId = `nar:event:${earlier.id.toLowerCase()}`;
    const laterId = `nar:event:${later.id.toLowerCase()}`;
    const base = { verification: 'VERIFIED_SOURCE_GROUNDED' as const, causal_class: 'CHRONOLOGICAL' as const, source_side: 'production' as const, evidence_line: null };
    addRel({ ...base, type: 'PRECEDES', source_id: earlierId, target_id: laterId, source_path: earlier.source.path, commit_sha: earlier.source.commit_sha, blob_sha: earlier.source.blob_sha,
      evidence_quote: `${earlier.label} ends ${earlier.end_bac} BAC; ${later.label} starts ${later.start_bac} BAC`, rationale: 'BAC calendar order (a higher BAC year is earlier). Order only; no causal claim.' });
    addRel({ ...base, type: 'FOLLOWS', source_id: laterId, target_id: earlierId, source_path: later.source.path, commit_sha: later.source.commit_sha, blob_sha: later.source.blob_sha,
      evidence_quote: `${later.label} starts ${later.start_bac} BAC; ${earlier.label} ends ${earlier.end_bac} BAC`, rationale: 'BAC calendar order. Order only; no causal claim.' });
  }

  // 3. Markdown documents across the worldbuilding collections: one entity per document.
  for (const file of audit.files) {
    if (file.kind !== 'markdown' || file.path.startsWith('content/blog/') || file.path.startsWith('content/music/') || file.path.startsWith('content/video/')) continue;
    const stem = file.path.split('/').pop()!.replace(/\.md$/i, '');
    const folderKind = classifyFolderKind(file.path, stem);
    if (!folderKind) continue;
    const side: GraphSide = file.classification === 'DRAFT_ONLY' ? 'remodeling' : file.classification === 'PRODUCTION_ONLY' ? 'production' : 'both';
    const doc = await readDoc(file.classification === 'DRAFT_ONLY' ? remodeling : production, file.path, side);
    if (!doc) continue;
    parsedDocs.set(file.path, doc);
    const cite = firstCitableLine(doc.lines);
    if (!cite) continue;

    const existingNationId = `nar:nation:${slug(stem)}`;
    if (folderKind === 'nation' && entities.has(existingNationId)) {
      entities.set(existingNationId, {
        ...entities.get(existingNationId)!, summary: doc.description ?? cite.text, source_path: doc.path, commit_sha: doc.commit_sha, blob_sha: doc.blob_sha,
        evidence_locator: `${doc.path}#L${cite.line}`, evidence_line: cite.line, evidence_quote: cite.text, editorial_updated_at: doc.updated_at,
      });
      continue;
    }
    const canonStatus: EpistemicStatus = file.classification === 'DRAFT_ONLY' || (doc.canon_label && /provisional|proposal|working|scenario/i.test(doc.canon_label)) ? 'PROPOSED' : 'CANON_OBSERVED';
    addEntity({
      id: `nar:${folderKind}:${slug(stem)}`, kind: folderKind,
      name: doc.title.split(/\s+[—–:]\s+/)[0]!.replace(/^[^\wA-Za-z]+/, '').trim() || doc.title,
      summary: doc.description ?? cite.text, source_side: side, source_path: doc.path, commit_sha: doc.commit_sha, blob_sha: doc.blob_sha,
      evidence_locator: `${doc.path}#L${cite.line}`, evidence_line: cite.line, evidence_quote: cite.text, historical_bac: extractBacSpan(doc.body),
      editorial_updated_at: doc.updated_at, canon_status: canonStatus, extraction_confidence: doc.description ? 'FRONTMATTER_DECLARED' : 'EXPLICIT_PROSE',
      original_terminology: [doc.title, ...doc.tags.slice(0, 6)], related_country_id: null,
      attributes: { document_title: doc.title, classification: file.classification, ...(doc.canon_label ? { source_canon_note: doc.canon_label.slice(0, 140) } : {}) },
    });
  }

  // 4. Concepts the bilateral dossier states in a sentence. Summary and quote are the matched sentence.
  const rvdDoc = parsedDocs.get(RVD_PATH);
  if (rvdDoc) {
    const snap = rvdDoc.side === 'remodeling' ? remodeling : production;
    const at = (re: RegExp) => findPassage(snap, RVD_PATH, re);
    const concept = (id: string, kind: NarrativeEntityKind, name: string, p: Passage, extra: Partial<NarrativeEntity> = {}) => addEntity({
      id, kind, name, summary: p.quote, source_side: rvdDoc.side, source_path: p.path, commit_sha: p.commit_sha, blob_sha: p.blob_sha,
      evidence_locator: `${p.path}#L${p.line}`, evidence_line: p.line, evidence_quote: p.quote, historical_bac: extractBacSpan(p.quote),
      editorial_updated_at: rvdDoc.updated_at, canon_status: 'CANON_OBSERVED', extraction_confidence: 'EXPLICIT_PROSE', original_terminology: [], related_country_id: null, attributes: {}, ...extra,
    });

    const depeisit = await at(/The Depeisit Economic Crisis originated in a civilization of \d+ trillion inhabitants with SDI 0\.\d+\/1\.000/);
    const origin = await at(/Both states emerged from the crisis and migration history of Depeisit/);
    if (depeisit) {
      const m = /(\d+) trillion inhabitants with SDI (0\.\d+)/.exec(depeisit.quote)!;
      const crisis = await at(/\d{4} BAC — Depeisit Economic Crisis/);
      concept('nar:world:depeisit', 'world', 'Depeisit', depeisit, {
        historical_bac: crisis ? extractBacSpan(crisis.quote) : null, original_terminology: ['Depeisit', 'Depeisit Economic Crisis'],
        attributes: { population_trillion_stated: Number(m[1]), sdi_stated: Number(m[2]) },
      });
    }
    const fearRel = await at(/Loss of economic continuity and recurrence of Depeisit-type systemic failure/);
    const fearDep = await at(/Loss of industry, independent agency, territory and national continuity/);
    if (fearRel) concept('nar:motivation:reltronland-wartime-strategic-fear', 'motivation', 'Wartime strategic fear (Reltronland)', fearRel, { related_country_id: 'country:reltronland', attributes: { actor: 'Reltronland', table_row: 'Wartime strategic fear' } });
    if (fearDep) concept('nar:motivation:depcutland-wartime-strategic-fear', 'motivation', 'Wartime strategic fear (Depcutland)', fearDep, { related_country_id: 'country:depcutland', attributes: { actor: 'Depcutland', table_row: 'Wartime strategic fear' } });
    const model = await at(/Enduring relationship model: socially inseparable from below; strategically competitive and sovereign from above; often forced into issue-specific cooperation by shared consequences; and frequently perceived as allies from outside\./);
    if (model) concept('nar:constraint:enduring-relationship-model', 'constraint', 'Enduring relationship model', model, { original_terminology: ['Enduring relationship model'] });
    const illusion = await at(/The very competence with which these neighbors translate one another's objections can create an external illusion of alliance\./);
    if (illusion) concept('nar:viewpoint:external-illusion-of-alliance', 'viewpoint', 'External illusion of alliance', illusion, { original_terminology: ['external illusion of alliance'], attributes: { held_by: 'other states' } });
    const war = await at(/War of Conscience \(\d{4}–\d{4} BAC\)/);

    for (const nationId of ['nar:nation:reltronland', 'nar:nation:depcutland']) {
      if (depeisit && origin) stated('DERIVED_FROM', nationId, 'nar:world:depeisit', origin, 'STRUCTURAL_CONSTRAINT', 'The dossier states that both states emerged from the crisis and migration history of Depeisit.');
      if (model) stated('CONSTRAINED_BY', nationId, 'nar:constraint:enduring-relationship-model', model, 'STRUCTURAL_CONSTRAINT', 'The dossier states this as the enduring relationship model of the two states.');
    }
    if (fearRel) stated('MOTIVATED_BY', 'nar:nation:reltronland', 'nar:motivation:reltronland-wartime-strategic-fear', fearRel, 'STRUCTURAL_CONSTRAINT', 'Compact framing table: wartime strategic fear, Reltronland column.');
    if (fearDep) stated('MOTIVATED_BY', 'nar:nation:depcutland', 'nar:motivation:depcutland-wartime-strategic-fear', fearDep, 'STRUCTURAL_CONSTRAINT', 'Compact framing table: wartime strategic fear, Depcutland column.');
    if (war) stated('CONFLICTS_WITH', 'nar:nation:reltronland', 'nar:nation:depcutland', war, 'PARTICIPATION', 'The dossier documents the war between the two states. Historical conflict; the modern relationship is managed coexistence.');
    const threats = await at(/Their disagreements do not prevent them from repeatedly needing to cooperate on global crises, Henchoway-linked threats and Nytherion-related risks\./);
    if (threats) {
      stated('CONFLICTS_WITH', 'nar:faction:henchoway', 'nar:nation:depcutland', threats, 'PARTICIPATION', 'The dossier names Henchoway-linked threats as a reason both states repeatedly need to cooperate.');
      stated('CONFLICTS_WITH', 'nar:faction:henchoway', 'nar:nation:reltronland', threats, 'PARTICIPATION', 'The dossier names Henchoway-linked threats as a reason both states repeatedly need to cooperate.');
    }
  }

  // 5. Henchoway concepts stated in the faction dossier.
  const henDoc = parsedDocs.get(HENCHOWAY_PATH);
  if (henDoc && entities.has('nar:faction:henchoway')) {
    const at = (re: RegExp) => findPassage(henDoc.side === 'remodeling' ? remodeling : production, HENCHOWAY_PATH, re);
    const doctrine = await at(/Adaptive Stillness is the doctrine through which modern Henchoway learns from the costs of crude suppression\./);
    if (doctrine) {
      const architect = await at(/Vitor Baythorne \/ Van Den Scuba — Political Architect/);
      addEntity({
        id: 'nar:decision:adaptive-stillness-doctrine', kind: 'decision', name: 'Adaptive Stillness doctrine', summary: doctrine.quote,
        source_side: henDoc.side, source_path: doctrine.path, commit_sha: doctrine.commit_sha, blob_sha: doctrine.blob_sha,
        evidence_locator: `${doctrine.path}#L${doctrine.line}`, evidence_line: doctrine.line, evidence_quote: doctrine.quote, historical_bac: null,
        editorial_updated_at: henDoc.updated_at, canon_status: 'CANON_OBSERVED', extraction_confidence: 'EXPLICIT_PROSE', original_terminology: ['Adaptive Stillness'],
        related_country_id: null, attributes: architect ? { political_architect_heading: architect.quote } : {},
      });
      stated('DEFINES', 'nar:faction:henchoway', 'nar:decision:adaptive-stillness-doctrine', doctrine, 'STRUCTURAL_CONSTRAINT', 'The faction dossier defines Adaptive Stillness as the doctrine of modern Henchoway.');
    }
    const danger = await at(/Reltronland is dangerous to Vitor not merely because it is militarily and technologically powerful\./);
    if (danger) stated('CONFLICTS_WITH', 'nar:faction:henchoway', 'nar:nation:reltronland', danger, 'PARTICIPATION', 'The faction dossier describes the existential contest with Reltronland.');
    const distinct = await at(/Nytherion is an enduring metaphysical and existential possibility; Henchoway is an actor attempting to institutionalize its effects/);
    if (distinct) stated('THEMATICALLY_RELATED', 'nar:faction:henchoway', 'nar:philosophy:nytherion-abyss', distinct, 'THEMATIC_ONLY', 'The dossier distinguishes Nytherion (a condition) from Henchoway (an actor). Thematic relation only.');
    const leverage = await at(/Hargenbor — Strategic Leverage, Not a Puppet State/);
    if (leverage) stated('CAUSES_CANDIDATE', 'nar:faction:henchoway', 'nar:nation:hargenbor', leverage, 'CO_OCCURRENCE_ONLY', 'A section heading names Hargenbor as strategic leverage and not a puppet state. Candidate link for review, not a causal claim.', 'CANDIDATE_HYPOTHESIS');
  }

  // 6. Name occurrences. An occurrence in a series document is a verified appearance; every other
  // typed link inferred from an occurrence is a candidate for review.
  const named = [...entities.values()].filter((e) => ['nation', 'character', 'faction', 'institution', 'philosophy'].includes(e.kind) && e.name.length >= 4);
  for (const [, doc] of parsedDocs) {
    const stem = doc.path.split('/').pop()!.replace(/\.md$/i, '');
    const folderKind = classifyFolderKind(doc.path, stem);
    if (!folderKind) continue;
    const docEntityId = folderKind === 'nation' && entities.has(`nar:nation:${slug(stem)}`) ? `nar:nation:${slug(stem)}` : `nar:${folderKind}:${slug(stem)}`;
    if (!entities.has(docEntityId)) continue;
    for (const target of named) {
      if (target.id === docEntityId) continue;
      const m = new RegExp(`(?<![A-Za-z])${target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`).exec(doc.body);
      if (!m) continue;
      const lineNo = doc.body.slice(0, m.index).split('\n').length;
      const text = plainText(doc.lines[lineNo - 1] ?? '');
      const at = text.indexOf(target.name);
      if (at < 0) continue;
      const quote = text.slice(Math.max(0, at - 90), at + target.name.length + 150).trim();
      const base = { source_side: doc.side, source_path: doc.path, commit_sha: doc.commit_sha, blob_sha: doc.blob_sha, evidence_line: lineNo, evidence_quote: quote };
      const candidate = { ...base, verification: 'CANDIDATE_HYPOTHESIS' as const, causal_class: 'CO_OCCURRENCE_ONLY' as const };
      if (folderKind === 'narrative_arc' && (target.kind === 'character' || target.kind === 'nation' || target.kind === 'faction')) {
        addRel({ ...base, type: 'APPEARS_IN', source_id: target.id, target_id: docEntityId, verification: doc.side === 'remodeling' ? 'DECLARED_PROVENANCE' : 'VERIFIED_SOURCE_GROUNDED', causal_class: 'CO_OCCURRENCE_ONLY',
          rationale: `The name ${target.name} occurs in the series document ${doc.path}${doc.side === 'remodeling' ? ', which exists only in remodeling (a proposal)' : ''}. Appearance only; no role or causal claim.` });
      } else if ((folderKind === 'law' || folderKind === 'treaty') && target.kind === 'nation') {
        addRel({ ...candidate, type: 'CONSTRAINED_BY', source_id: target.id, target_id: docEntityId, rationale: `${target.name} is named in ${doc.title}. Whether the text binds it is a candidate for review.` });
      } else if ((folderKind === 'location' || folderKind === 'technology' || folderKind === 'institution') && target.kind === 'nation') {
        addRel({ ...candidate, type: 'LOCATED_IN', source_id: docEntityId, target_id: target.id, rationale: `${doc.title} names ${target.name}. The location or jurisdiction is a candidate for review.` });
      } else if (folderKind === 'historical_event' || folderKind === 'conflict') {
        addRel({ ...candidate, type: 'PARTICIPATES_IN', source_id: target.id, target_id: docEntityId, rationale: `${target.name} is named in ${doc.title}. Participation is a candidate for review.` });
      }
    }
  }

  // 7. Remodeling-only series documents propose extensions of an existing series (declared by the file diff).
  const abyssArcId = 'nar:narrative_arc:the-abyss-of-comfort';
  for (const draft of [...entities.values()].filter((e) => e.kind === 'narrative_arc' && e.source_side === 'remodeling')) {
    if (!entities.has(abyssArcId)) continue;
    const doc = parsedDocs.get(draft.source_path);
    const link = doc ? /\]\((?:\.\/)?the-abyss-of-comfort\.md[^)]*\)|The Abyss of Comfort/.exec(doc.body) : null;
    if (!doc || !link) continue;
    const lineNo = doc.body.slice(0, link.index).split('\n').length;
    const text = plainText(doc.lines[lineNo - 1] ?? '');
    const at = text.indexOf('The Abyss of Comfort');
    if (at < 0) continue;
    addRel({
      type: 'PROPOSES_CHANGE_TO', source_id: draft.id, target_id: abyssArcId, verification: 'DECLARED_PROVENANCE', causal_class: 'STRUCTURAL_CONSTRAINT', source_side: 'remodeling',
      source_path: doc.path, commit_sha: doc.commit_sha, blob_sha: doc.blob_sha, evidence_line: lineNo, evidence_quote: text.slice(Math.max(0, at - 90), at + 170).trim(),
      rationale: 'A remodeling-only series document that names The Abyss of Comfort. A proposal, not adopted canon.',
    });
  }

  return {
    entities: [...entities.values()].sort((a, b) => codeUnitCompare(a.id, b.id)),
    relationships: [...relationships.values()].sort((a, b) => codeUnitCompare(a.id, b.id)),
  };
}
