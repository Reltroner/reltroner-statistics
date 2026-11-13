/**
 * Source-grounded Narrative Consistency Auditing Engine.
 *
 * Distinguishes:
 *  - VERIFIED_CONTRADICTION
 *  - POTENTIAL_INCONSISTENCY
 *  - INTENTIONAL_AMBIGUITY
 *  - UNRELIABLE_NARRATOR_POSSIBILITY
 *  - INSUFFICIENT_EVIDENCE
 *  - CREATIVE_REVIEW_CANDIDATE
 *
 * Never treats intentional storytelling ambiguity, unreliable narration, competing viewpoints,
 * or remodeling proposals as objective canon defects.
 *
 * A finding that cites prose exists only when its pinned pattern matches the pinned blob; the
 * quote is the matched sentence. There is no fallback line.
 */

import type { Audit } from '../../domain/finding.ts';
import type { StatisticsDataset } from '../../domain/observation.ts';
import type {
  NarrativeAuditCategory,
  NarrativeAuditFinding,
  NarrativeEntity,
  NarrativeFindingClassification,
  NarrativePassageRef,
  NarrativeRelationship,
} from '../../domain/creative.ts';
import type { QaCheck } from '../qa.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { codeUnitCompare } from '../canonical.ts';
import { findPassage } from '../evidence.ts';
import { sha256Hex } from '../git-objects.ts';

function findingId(category: NarrativeAuditCategory, classification: NarrativeFindingClassification, key: string): string {
  return `NAF-${sha256Hex(`${category}|${classification}|${key}`).slice(0, 12).toUpperCase()}`;
}

/** Matched sentence in a pinned blob, or null. Patterns are written against the reading text (no Markdown markers). */
async function findLineInBlob(snapshot: SourceSnapshot, path: string, pattern: RegExp): Promise<{ line: number; quote: string; blob_sha: string } | null> {
  const p = await findPassage(snapshot, path, pattern);
  return p ? { line: p.line, quote: p.quote, blob_sha: p.blob_sha } : null;
}

export interface NarrativeAuditInput {
  audit: Audit;
  stats: StatisticsDataset;
  qaProduction: QaCheck[];
  qaRemodeling: QaCheck[];
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
  synthetic?: boolean;
}

export async function runNarrativeAudit(input: NarrativeAuditInput): Promise<NarrativeAuditFinding[]> {
  const { audit, stats, qaProduction, qaRemodeling, entities, production, remodeling, synthetic } = input;
  const findings = new Map<string, NarrativeAuditFinding>();

  const push = (f: Omit<NarrativeAuditFinding, 'id'> & { key: string }) => {
    const id = findingId(f.category, f.classification, f.key);
    const { key: _k, ...rest } = f;
    if (!findings.has(id)) {
      findings.set(id, {
        id,
        ...rest,
        ...(synthetic ? { synthetic: true } : {}),
      });
    }
  };

  // 1. Chronological consistency & impossible event ordering checks (BAC countdown calendar).
  const foundationByCountry = new Map<string, { year_bac: number; path: string; blob_sha: string }>();
  for (const ent of stats.entities) {
    if (ent.kind === 'country' && ent.foundation_bac !== null && stats.production) {
      foundationByCountry.set(ent.id, {
        year_bac: ent.foundation_bac,
        path: stats.dataset_path,
        blob_sha: stats.production.blob_sha,
      });
    }
  }

  for (const evt of stats.timeline) {
    if (evt.start_bac < evt.end_bac) {
      push({
        key: `chrono-inverted:${evt.id}`,
        category: 'CHRONOLOGICAL_CONTRADICTION',
        classification: 'VERIFIED_CONTRADICTION',
        severity: 'HIGH',
        title: `Inverted BAC interval on ${evt.label} (${evt.start_bac}–${evt.end_bac} BAC)`,
        affected_entities: evt.entity_id ? [evt.entity_id] : [`nar:event:${evt.id.toLowerCase()}`],
        passages: [{
          side: 'production',
          repository: evt.source.repository,
          commit_sha: evt.source.commit_sha,
          path: evt.source.path,
          blob_sha: evt.source.blob_sha,
          line: evt.source.line,
          locator: evt.source.pointer ?? evt.id,
          quote: `${evt.label}: start_bac=${evt.start_bac}, end_bac=${evt.end_bac}`,
        }],
        conflict_hypothesis: `In the BAC countdown calendar, years count down toward Year 0, so start_bac (${evt.start_bac}) must be greater than or equal to end_bac (${evt.end_bac}).`,
        storytelling_context: 'Deterministic calendar arithmetic rule; not a narrative perspective choice.',
        review_guidance: 'Correct the start_bac and end_bac order in the timeline source record.',
        is_defect: true,
      });
    }
    if (evt.entity_id && evt.kind !== 'FOUNDATION' && foundationByCountry.has(evt.entity_id)) {
      const fnd = foundationByCountry.get(evt.entity_id)!;
      if (evt.start_bac > fnd.year_bac) {
        push({
          key: `event-before-foundation:${evt.id}:${evt.entity_id}`,
          category: 'IMPOSSIBLE_EVENT_ORDERING',
          classification: 'VERIFIED_CONTRADICTION',
          severity: 'HIGH',
          title: `${evt.label} (${evt.start_bac} BAC) precedes sovereign foundation of ${evt.entity_id} (${fnd.year_bac} BAC)`,
          affected_entities: [evt.entity_id, `nar:event:${evt.id.toLowerCase()}`],
          passages: [{
            side: 'production',
            repository: evt.source.repository,
            commit_sha: evt.source.commit_sha,
            path: evt.source.path,
            blob_sha: evt.source.blob_sha,
            line: evt.source.line,
            locator: evt.source.pointer ?? evt.id,
            quote: `Event at ${evt.start_bac} BAC vs sovereign foundation at ${fnd.year_bac} BAC.`,
          }],
          conflict_hypothesis: `State-level event ${evt.label} is dated ${evt.start_bac} BAC, which is earlier than the state's sovereign foundation (${fnd.year_bac} BAC).`,
          storytelling_context: 'Unless the event explicitly describes pre-foundation ancestral lineages (such as Planet Depeisit), a sovereign state cannot act before its founding.',
          review_guidance: 'Verify whether the event belongs to pre-foundation ancestral history or requires a BAC date correction.',
          is_defect: true,
        });
      }
    }
  }

  // 2. Verify Reltronland (1125 BAC) & Depcutland (1121 BAC) -> Depeisit Crisis (1057 BAC) -> War of Conscience (1048–1030 BAC) -> Troncut Treaty (1010 BAC) sequence.
  const relFnd = foundationByCountry.get('country:reltronland');
  const depFnd = foundationByCountry.get('country:depcutland');
  const rvdMatch = await findLineInBlob(
    production,
    'content/factions/reltronland-vs-depcutland.md',
    /Reltronland \(\d{4} BAC; [^)]+\) and Depcutland \(\d{4} BAC; [^)]+\) were independent before the \d{4} BAC Depeisit Economic Crisis\./,
  );
  if (relFnd && depFnd && rvdMatch) {
    push({
      key: 'chrono-verified:reltronland-depcutland-war-treaty-chain',
      category: 'IMPOSSIBLE_EVENT_ORDERING',
      classification: 'CREATIVE_REVIEW_CANDIDATE',
      severity: 'INFORMATIONAL',
      title: `Prose and dataset agree on the foundation years: Reltronland ${relFnd.year_bac} BAC, Depcutland ${depFnd.year_bac} BAC`,
      affected_entities: ['nar:nation:reltronland', 'nar:nation:depcutland'].filter((id) => entities.some((e) => e.id === id)),
      passages: [
        {
          side: 'production',
          repository: production.identity.repository,
          commit_sha: production.identity.commit_sha,
          path: 'content/factions/reltronland-vs-depcutland.md',
          blob_sha: rvdMatch.blob_sha,
          line: rvdMatch.line,
          locator: `content/factions/reltronland-vs-depcutland.md#L${rvdMatch.line}`,
          quote: rvdMatch.quote,
        },
        {
          side: 'production',
          repository: production.identity.repository,
          commit_sha: production.identity.commit_sha,
          path: stats.dataset_path,
          blob_sha: relFnd.blob_sha,
          line: null,
          locator: 'historical_foundations.ordered_core',
          quote: `Reltronland=${relFnd.year_bac} BAC, Depcutland=${depFnd.year_bac} BAC`,
        },
      ],
      conflict_hypothesis: rvdMatch.quote.includes(`(${relFnd.year_bac} BAC`) && rvdMatch.quote.includes(`(${depFnd.year_bac} BAC`)
        ? 'The foundation years stated in the dossier sentence equal the foundation years recorded in the dataset. No contradiction.'
        : 'The dossier sentence and the dataset record different foundation years. Compare the quoted sentence with the dataset values.',
      storytelling_context: 'A consistency cross-check between a prose statement and the structured dataset, reported so the agreement is visible.',
      review_guidance: 'No correction is suggested when the years agree; keep both statements synchronized when either is edited.',
      is_defect: false,
    });
  }

  // 3. Statistical / Geographical / QA Invariant checks.
  for (const [sideLabel, checks, snap] of [
    ['production', qaProduction, production],
    ['remodeling', qaRemodeling, remodeling],
  ] as const) {
    for (const q of checks) {
      if (q.result !== 'FAIL' || !snap.entries.has(stats.dataset_path)) continue;
      const isGeo = q.id.includes('LAND-AREA');
      push({
        key: `qa-fail:${sideLabel}:${q.id}`,
        category: isGeo ? 'GEOGRAPHICAL_INCONSISTENCY' : 'STATISTICAL_STORY_MISMATCH',
        classification: sideLabel === 'production' ? 'VERIFIED_CONTRADICTION' : 'POTENTIAL_INCONSISTENCY',
        severity: sideLabel === 'production' ? 'HIGH' : 'MEDIUM',
        title: `${q.title} failed in ${sideLabel} (${q.id})`,
        affected_entities: [...new Set(q.failures.map((f) => `nar:nation:${f.subject.toLowerCase()}`).filter((id) => entities.some((e) => e.id === id)))],
        passages: [{
          side: sideLabel,
          repository: snap.identity.repository,
          commit_sha: snap.identity.commit_sha,
          path: stats.dataset_path,
          blob_sha: snap.entries.get(stats.dataset_path)!.sha,
          line: null,
          locator: q.pointers[0] ?? q.id,
          quote: `${q.detail} (observed=${q.observed}, expected=${q.expected})`,
        }],
        conflict_hypothesis: `Mathematical invariant ${q.id} (${q.formula}) failed with ${q.failures.length} discrepancy(ies).`,
        storytelling_context: sideLabel === 'remodeling' ? 'Occurs in remodeling proposal workspace, not production canon.' : 'Authoritative dataset mathematical contradiction.',
        review_guidance: 'Reconcile the national and planetary aggregate figures before ratifying.',
        is_defect: sideLabel === 'production',
      });
    }
  }

  // 4. Cross-document source reference checks (do declared country source documents exist?).
  for (const ent of stats.entities) {
    if (!ent.source_document) continue;
    const inProd = production.entries.has(ent.source_document);
    if (!inProd && stats.production) {
      push({
        key: `missing-source-doc:${ent.id}:${ent.source_document}`,
        category: 'NARRATIVE_DEPENDENCY_CONFLICT',
        classification: 'POTENTIAL_INCONSISTENCY',
        severity: 'MEDIUM',
        title: `Declared source document "${ent.source_document}" for ${ent.name} is absent from production tree`,
        affected_entities: [`nar:nation:${ent.id.replace(/^country:/, '')}`].filter((id) => entities.some((e) => e.id === id)),
        passages: [{
          side: 'production',
          repository: production.identity.repository,
          commit_sha: production.identity.commit_sha,
          path: stats.dataset_path,
          blob_sha: stats.production.blob_sha,
          line: null,
          locator: `countries[${ent.name}].source`,
          quote: `source="${ent.source_document}"`,
        }],
        conflict_hypothesis: `Entity ${ent.name} cites ${ent.source_document} as its canonical profile document, but that path was not found in the pinned production snapshot.`,
        storytelling_context: 'A broken cross-reference prevents automated provenance traversal from the statistical record to narrative lore.',
        review_guidance: 'Restore the referenced markdown path or update the source pointer in the dataset.',
        is_defect: true,
      });
    }
  }

  // 5. Duplicate or conflicting entity definitions check.
  const byTypeAndName = new Map<string, NarrativeEntity[]>();
  for (const e of entities) {
    const k = `${e.kind}|${e.name.toLowerCase()}`;
    const list = byTypeAndName.get(k) ?? [];
    list.push(e);
    byTypeAndName.set(k, list);
  }
  for (const [k, list] of byTypeAndName) {
    if (list.length > 1) {
      push({
        key: `duplicate-def:${k}`,
        category: 'DUPLICATE_OR_CONFLICTING_DEFINITION',
        classification: 'POTENTIAL_INCONSISTENCY',
        severity: 'MEDIUM',
        title: `Duplicate narrative entity definition for ${list[0]!.name} (${list[0]!.kind}) across ${list.length} paths`,
        affected_entities: list.map((x) => x.id),
        passages: list.map((x) => ({
          side: x.source_side === 'remodeling' ? 'remodeling' : 'production',
          repository: x.source_side === 'remodeling' ? remodeling.identity.repository : production.identity.repository,
          commit_sha: x.commit_sha,
          path: x.source_path,
          blob_sha: x.blob_sha,
          line: x.evidence_line,
          locator: x.evidence_locator,
          quote: x.evidence_quote,
        })),
        conflict_hypothesis: `Multiple narrative entities of kind "${list[0]!.kind}" resolve to the same display name "${list[0]!.name}" in different documents.`,
        storytelling_context: 'May represent an intentional multi-aspect dossier (e.g., faction ideology vs organizational operations) or accidental duplication.',
        review_guidance: 'Verify that one document is designated as primary and the other cross-links to it with distinct scope.',
        is_defect: false,
      });
    }
  }

  // 6. Unreliable narrator & competing historical viewpoints (NOT defects).
  const warNarration = await findLineInBlob(
    production,
    'content/factions/reltronland-vs-depcutland.md',
    /Different institutions describe the same history at different levels of abstraction\. These are perspectives, not automatically facts or propaganda\./,
  );
  if (warNarration) {
    push({
      key: 'unreliable-narrator:war-of-conscience-divergent-accounts',
      category: 'RELATIONSHIP_INCONSISTENCY',
      classification: 'UNRELIABLE_NARRATOR_POSSIBILITY',
      severity: 'LOW',
      title: 'The same war is narrated differently by different institutions (documented as perspectives)',
      affected_entities: ['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:conflict:reltronland-vs-depcutland'].filter((id) => entities.some((e) => e.id === id)),
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: 'content/factions/reltronland-vs-depcutland.md',
        blob_sha: warNarration.blob_sha,
        line: warNarration.line,
        locator: `content/factions/reltronland-vs-depcutland.md#L${warNarration.line}`,
        quote: warNarration.quote,
      }],
      conflict_hypothesis: 'Accounts of the war given by Reltronland and Depcutland institutions differ in vocabulary and emphasis. A reader could mistake two such accounts for a contradiction.',
      storytelling_context: 'The dossier states that these differing accounts are perspectives. Differing in-world accounts are therefore not a canon contradiction.',
      review_guidance: 'Keep in-world perspectives attributed to their speakers; do not merge them into one account.',
      is_defect: false,
    });
  }

  const henMisread = await findLineInBlob(
    production,
    'content/series/the-abyss-of-comfort.md',
    /Henchoway's killing of Garren is a genuine operational victory, but its interpretation of that victory can be strategically wrong\./,
  );
  if (henMisread) {
    push({
      key: 'unreliable-narrator:henchoway-strategic-misreading-garren',
      category: 'CONFLICTING_EXPLICIT_FACTS',
      classification: 'UNRELIABLE_NARRATOR_POSSIBILITY',
      severity: 'LOW',
      title: 'Henchoway’s own reading of its victory over Garren is stated to be possibly wrong',
      affected_entities: ['nar:faction:henchoway', 'nar:narrative_arc:the-abyss-of-comfort'].filter((id) => entities.some((e) => e.id === id)),
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: 'content/series/the-abyss-of-comfort.md',
        blob_sha: henMisread.blob_sha,
        line: henMisread.line,
        locator: `content/series/the-abyss-of-comfort.md#L${henMisread.line}`,
        quote: henMisread.quote,
      }],
      conflict_hypothesis: 'What Henchoway believes about the effect of its action can differ from what the narrative establishes. A reader could mistake the antagonist’s belief for a statement of fact.',
      storytelling_context: 'The series dossier itself says the interpretation can be strategically wrong. A mistaken belief held by a faction is not a continuity error.',
      review_guidance: 'Keep statements of what Henchoway believes distinct from statements of what happened.',
      is_defect: false,
    });
  }

  // 7. Intentional ambiguity checks (NOT defects).
  const henContinuity = await findLineInBlob(
    production,
    'content/factions/henchoway.md',
    /The precise legal, personnel and institutional continuity between Kamila's ancient movement, Vexor's Scuba Division, and Vitor's modern network is not fully established\./,
  );
  if (henContinuity) {
    push({
      key: 'intentional-ambiguity:henchoway-ancient-to-modern-lineage',
      category: 'ENTITY_IDENTITY_MISMATCH',
      classification: 'INTENTIONAL_AMBIGUITY',
      severity: 'INFORMATIONAL',
      title: 'Continuity between the ancient movement, the Scuba Division and the modern Henchoway network is stated as not fully established',
      affected_entities: ['nar:faction:henchoway', 'nar:character:kamila-alena'].filter((id) => entities.some((e) => e.id === id)),
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: 'content/factions/henchoway.md',
        blob_sha: henContinuity.blob_sha,
        line: henContinuity.line,
        locator: `content/factions/henchoway.md#L${henContinuity.line}`,
        quote: henContinuity.quote,
      }],
      conflict_hypothesis: 'The source leaves the institutional continuity between three historical layers open. A reader could report the gap as a missing or inconsistent lineage.',
      storytelling_context: 'The faction dossier states the gap deliberately. An open question that the source declares open is not a defect.',
      review_guidance: 'Preserve the ambiguity; do not fill the lineage unless the creator publishes it.',
      is_defect: false,
    });
  }

  const valethraBranches = await findLineInBlob(
    remodeling,
    'content/series/house-of-valethra.md',
    /Undisclosed biological sibling branches remain deliberately mysterious\./,
  );
  if (valethraBranches) {
    push({
      key: 'intentional-ambiguity:house-of-valethra-undisclosed-branches',
      category: 'ENTITY_IDENTITY_MISMATCH',
      classification: 'INTENTIONAL_AMBIGUITY',
      severity: 'INFORMATIONAL',
      title: 'House of Valethra: undisclosed sibling branches are stated as deliberately mysterious (remodeling)',
      affected_entities: ['nar:character:queen-valethra', 'nar:narrative_arc:house-of-valethra'].filter((id) => entities.some((e) => e.id === id)),
      passages: [{
        side: 'remodeling',
        repository: remodeling.identity.repository,
        commit_sha: remodeling.identity.commit_sha,
        path: 'content/series/house-of-valethra.md',
        blob_sha: valethraBranches.blob_sha,
        line: valethraBranches.line,
        locator: `content/series/house-of-valethra.md#L${valethraBranches.line}`,
        quote: valethraBranches.quote,
      }],
      conflict_hypothesis: 'The remodeling document does not disclose every family branch. A reader could report the omission as an incomplete genealogy.',
      storytelling_context: 'The description of the document says the omission is deliberate. It is a remodeling proposal, not production canon.',
      review_guidance: 'Do not generate placeholder family members.',
      is_defect: false,
    });
  }

  // 8. Institutional rule & technology capability boundaries.
  const custodyBoundary = await findLineInBlob(
    production,
    'content/factions/reltronland-vs-depcutland.md',
    /Financial custody, transfer pricing, intellectual-property ownership, taxation, archive custody and territorial jurisdiction are different relationships\./,
  );
  if (custodyBoundary) {
    push({
      key: 'institutional-rule:reltronland-financial-vs-depcutland-archival-custody',
      category: 'INSTITUTIONAL_RULE_CONTRADICTION',
      classification: 'CREATIVE_REVIEW_CANDIDATE',
      severity: 'LOW',
      title: 'Institutional boundary: custody, pricing, ownership, taxation, archives and jurisdiction are stated as different relationships',
      affected_entities: ['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:institution:endless-library-of-depcutland'].filter((id) => entities.some((e) => e.id === id)),
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: 'content/factions/reltronland-vs-depcutland.md',
        blob_sha: custodyBoundary.blob_sha,
        line: custodyBoundary.line,
        locator: `content/factions/reltronland-vs-depcutland.md#L${custodyBoundary.line}`,
        quote: custodyBoundary.quote,
      }],
      conflict_hypothesis: 'A draft that treats custody of an asset or record as ownership, or as a transfer of jurisdiction, would contradict the quoted boundary.',
      storytelling_context: 'The dossier states the boundary as a rule. It is listed as a review aid for new material, not as a defect in existing canon.',
      review_guidance: 'Check new material that involves custody or archives against the quoted sentence.',
      is_defect: false,
    });
  }

  const techBoundary = await findLineInBlob(
    production,
    'content/factions/henchoway.md',
    /Henchoway does not own Asthortera's internet or every recommendation algorithm, and it is not the author of every rejection, quiet career, community preference, or restorative act\./,
  );
  if (techBoundary) {
    push({
      key: 'tech-capability:henchoway-algorithm-attribution-boundary',
      category: 'TECHNOLOGY_CAPABILITY_CONTRADICTION',
      classification: 'CREATIVE_REVIEW_CANDIDATE',
      severity: 'LOW',
      title: 'Attribution boundary: what may and may not be attributed to Henchoway',
      affected_entities: ['nar:faction:henchoway', 'nar:decision:adaptive-stillness-doctrine'].filter((id) => entities.some((e) => e.id === id)),
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: 'content/factions/henchoway.md',
        blob_sha: techBoundary.blob_sha,
        line: techBoundary.line,
        locator: `content/factions/henchoway.md#L${techBoundary.line}`,
        quote: techBoundary.quote,
      }],
      conflict_hypothesis: 'A draft that attributes every rejection or recommendation to Henchoway would contradict the quoted boundary.',
      storytelling_context: 'The faction dossier states the boundary of attribution. It is listed as a review aid for new material, not as a defect in existing canon.',
      review_guidance: 'A direct Henchoway operation needs evidence in the story; do not attribute by default.',
      is_defect: false,
    });
  }

  // 9. Insufficient evidence & declared source unknowns (NOT defects).
  if (stats.unknowns.length > 0 && stats.production) {
    push({
      key: 'insufficient-evidence:nccm-declared-unknowns',
      category: 'STATISTICAL_STORY_MISMATCH',
      classification: 'INSUFFICIENT_EVIDENCE',
      severity: 'INFORMATIONAL',
      title: `${stats.unknowns.length} declared unknowns are preserved in ${stats.dataset_path}`,
      affected_entities: ['nar:world:asthortera'].filter((id) => entities.some((e) => e.id === id)),
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: stats.dataset_path,
        blob_sha: stats.production.blob_sha,
        line: null,
        locator: 'canon_ratification.unknowns_remain_unknown',
        quote: stats.unknowns.slice(0, 3).join(' | '),
      }],
      conflict_hypothesis: `The dataset declares ${stats.unknowns.length} unknowns that remain unassigned: ${stats.unknowns.join('; ')}.`,
      storytelling_context: 'Explicit epistemic discipline: unknowns remain unknown until creator ratification rather than being filled by interpolation.',
      review_guidance: 'Treat as open worldbuilding space; do not interpolate numerical values without ratified source anchors.',
      is_defect: false,
    });
  }

  // 10. Draft vs Production narrative divergence (Remodeling proposals vs Production canon).
  const beluftnerDrift = audit.findings.find(
    (f) => f.file_path === stats.dataset_path && f.entity?.name === 'Beluftner' && f.field?.includes('land_area'),
  );
  if (beluftnerDrift && beluftnerDrift.provenance.production && beluftnerDrift.provenance.remodeling) {
    push({
      key: `draft-divergence:beluftner-land-area:${beluftnerDrift.id}`,
      category: 'GEOGRAPHICAL_INCONSISTENCY',
      classification: 'CREATIVE_REVIEW_CANDIDATE',
      severity: 'MEDIUM',
      title: `Beluftner land area: production ${String(beluftnerDrift.production.value)}, remodeling ${String(beluftnerDrift.remodeling.value)} ${beluftnerDrift.unit ?? ''}`.trim(),
      affected_entities: ['nar:nation:beluftner'].filter((id) => entities.some((e) => e.id === id)),
      passages: [
        {
          side: 'production',
          repository: beluftnerDrift.provenance.production.repository,
          commit_sha: beluftnerDrift.provenance.production.commit_sha,
          path: beluftnerDrift.file_path,
          blob_sha: production.entries.get(beluftnerDrift.file_path)!.sha,
          line: beluftnerDrift.provenance.production.line ?? null,
          locator: beluftnerDrift.locator,
          quote: `${beluftnerDrift.locator} = ${String(beluftnerDrift.production.value)}`,
        },
        {
          side: 'remodeling',
          repository: beluftnerDrift.provenance.remodeling.repository,
          commit_sha: beluftnerDrift.provenance.remodeling.commit_sha,
          path: beluftnerDrift.file_path,
          blob_sha: remodeling.entries.get(beluftnerDrift.file_path)!.sha,
          line: beluftnerDrift.provenance.remodeling.line ?? null,
          locator: beluftnerDrift.locator,
          quote: `${beluftnerDrift.locator} = ${String(beluftnerDrift.remodeling.value)}`,
        },
      ],
      conflict_hypothesis: `The remodeling dataset proposes ${String(beluftnerDrift.remodeling.value)} ${beluftnerDrift.unit ?? ''} where production main records ${String(beluftnerDrift.production.value)} ${beluftnerDrift.unit ?? ''}. Any figure derived from land area changes with it.`,
      storytelling_context: `A remodeling proposal under review. Production main records ${String(beluftnerDrift.production.value)} ${beluftnerDrift.unit ?? ''} (drift finding ${beluftnerDrift.id}).`,
      review_guidance: 'Check prose that describes the territory of Beluftner and the planetary land-area identity before any adoption.',
      is_defect: false,
    });
  }

  const narrativeChangedFiles = audit.files.filter(
    (f) =>
      f.kind === 'markdown' &&
      (f.classification === 'DRAFT_ONLY' || (f.classification === 'CHANGED' && f.content_nature === 'CONTENT')) &&
      (f.path.startsWith('content/series/') || f.path.startsWith('content/factions/')),
  );
  if (narrativeChangedFiles.length > 0) {
    const passages: NarrativePassageRef[] = narrativeChangedFiles.slice(0, 4).map((f) => ({
      side: f.classification === 'DRAFT_ONLY' ? 'remodeling' : 'production',
      repository: f.classification === 'DRAFT_ONLY' ? remodeling.identity.repository : production.identity.repository,
      commit_sha: f.classification === 'DRAFT_ONLY' ? remodeling.identity.commit_sha : production.identity.commit_sha,
      path: f.path,
      blob_sha: (f.classification === 'DRAFT_ONLY' ? f.remodeling_blob_sha : f.production_blob_sha)!,
      line: null,
      locator: f.path,
      quote: `${f.title ?? f.path} (${f.classification}, ${f.finding_count} finding(s))`,
    }));
    push({
      key: 'draft-divergence:series-and-factions-remodeling',
      category: 'DRAFT_PRODUCTION_DIVERGENCE',
      classification: 'CREATIVE_REVIEW_CANDIDATE',
      severity: 'MEDIUM',
      title: `${narrativeChangedFiles.length} faction and series documents carry remodeling additions or revisions`,
      affected_entities: [...new Set(narrativeChangedFiles.map((f) => entities.find((e) => e.source_path === f.path)?.id).filter((id): id is string => !!id))],
      passages,
      conflict_hypothesis: `Series or faction documents that exist only in remodeling or differ in content: ${narrativeChangedFiles.map((f) => f.path).join(', ')}.`,
      storytelling_context: 'Remodeling content is a proposal. A difference from production is not a production defect.',
      review_guidance: 'Compare the file-level drift findings before any promotion to production.',
      is_defect: false,
    });
  }

  return [...findings.values()].sort((a, b) => codeUnitCompare(a.id, b.id));
}

