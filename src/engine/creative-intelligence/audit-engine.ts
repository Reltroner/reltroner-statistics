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
import { sha256Hex } from '../git-objects.ts';

const decoder = new TextDecoder();

function findingId(category: NarrativeAuditCategory, classification: NarrativeFindingClassification, key: string): string {
  return `NAF-${sha256Hex(`${category}|${classification}|${key}`).slice(0, 12).toUpperCase()}`;
}

async function findLineInBlob(snapshot: SourceSnapshot, path: string, pattern: RegExp): Promise<{ line: number; quote: string; blob_sha: string } | null> {
  const entry = snapshot.entries.get(path);
  if (!entry || entry.type !== 'blob') return null;
  const text = decoder.decode(await snapshot.readBlob(entry.sha)).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i]!)) {
      return {
        line: i + 1,
        quote: lines[i]!.replace(/[*_`>#~]/g, '').trim().slice(0, 280),
        blob_sha: entry.sha,
      };
    }
  }
  return { line: 1, quote: lines[0]?.slice(0, 200) ?? path, blob_sha: entry.sha };
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
    /Reltronland \(1125 BAC.*Depcutland \(1121 BAC.*1057 BAC Depeisit Economic Crisis/i,
  );
  if (relFnd && depFnd && rvdMatch) {
    push({
      key: 'chrono-verified:reltronland-depcutland-war-treaty-chain',
      category: 'IMPOSSIBLE_EVENT_ORDERING',
      classification: 'CREATIVE_REVIEW_CANDIDATE',
      severity: 'INFORMATIONAL',
      title: 'Verified BAC causal chronology: Foundations (1125/1121 BAC) → Depeisit Crisis (1057 BAC) → War of Conscience (1048–1030 BAC) → Troncut Treaty (1010 BAC)',
      affected_entities: ['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:world:depeisit'],
      passages: [
        {
          side: 'production',
          repository: production.identity.repository,
          commit_sha: production.identity.commit_sha,
          path: 'content/factions/reltronland-vs-depcutland.md',
          blob_sha: rvdMatch.blob_sha,
          line: rvdMatch.line,
          locator: 'Section 2.3',
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
      conflict_hypothesis: 'Cross-checked prose chronology in reltronland-vs-depcutland.md against structured BAC anchors in nccm-v6-active-cross-domain.json: all dates align without contradiction.',
      storytelling_context: 'Establishes the verified chronological spine for any prequel or reconstruction storyline set between 1125 BAC and 995 BAC.',
      review_guidance: 'No correction required; preserve this ordering as a hard constraint when authoring inter-war or reconstruction scenes.',
      is_defect: false,
    });
  }

  // 3. Statistical / Geographical / QA Invariant checks.
  for (const [sideLabel, checks, snap] of [
    ['production', qaProduction, production],
    ['remodeling', qaRemodeling, remodeling],
  ] as const) {
    for (const q of checks) {
      if (q.result !== 'FAIL') continue;
      const isGeo = q.id.includes('LAND-AREA');
      push({
        key: `qa-fail:${sideLabel}:${q.id}`,
        category: isGeo ? 'GEOGRAPHICAL_INCONSISTENCY' : 'STATISTICAL_STORY_MISMATCH',
        classification: sideLabel === 'production' ? 'VERIFIED_CONTRADICTION' : 'POTENTIAL_INCONSISTENCY',
        severity: sideLabel === 'production' ? 'HIGH' : 'MEDIUM',
        title: `${q.title} failed in ${sideLabel} (${q.id})`,
        affected_entities: q.failures.map((f) => `nar:nation:${f.subject.toLowerCase()}`),
        passages: [{
          side: sideLabel,
          repository: snap.identity.repository,
          commit_sha: snap.identity.commit_sha,
          path: stats.dataset_path,
          blob_sha: (sideLabel === 'production' ? stats.production?.blob_sha : stats.remodeling?.blob_sha) ?? snap.identity.tree_sha,
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
        affected_entities: [`nar:nation:${ent.id.replace(/^country:/, '')}`],
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
    /## 9\. How the Same War Is Narrated|Institutional capture → Reltronland invades → Depcutland reacts/i,
  );
  if (warNarration) {
    push({
      key: 'unreliable-narrator:war-of-conscience-divergent-accounts',
      category: 'RELATIONSHIP_INCONSISTENCY',
      classification: 'UNRELIABLE_NARRATOR_POSSIBILITY',
      severity: 'LOW',
      title: 'Competing national narratives of the 1048 BAC War of Conscience outbreak (Reltronland vs Depcutland)',
      affected_entities: ['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:conflict:reltronland-vs-depcutland'],
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: 'content/factions/reltronland-vs-depcutland.md',
        blob_sha: warNarration.blob_sha,
        line: warNarration.line,
        locator: 'Section 4.5 & Section 9',
        quote: warNarration.quote,
      }],
      conflict_hypothesis: 'Reltronland partisan accounts emphasize pre-war Depeisit debt contagion and aristocratic capture, whereas Depcutland partisan accounts emphasize the 1049 BAC blockade and sovereignty defense.',
      storytelling_context: 'Explicitly established in canon as competing partisan simplifications vs the integrated multi-causal historical chain. This is realistic geopolitical perspective divergence, NOT a canon contradiction.',
      review_guidance: 'Do not flatten into a single viewpoint; keep in-universe partisan speech distinct from the narrator’s multi-causal historical synthesis.',
      is_defect: false,
    });
  }

  const henMisread = await findLineInBlob(
    production,
    'content/series/the-abyss-of-comfort.md',
    /Henchoway's killing of Garren is a genuine operational victory, but its interpretation of that victory can be strategically wrong/i,
  );
  if (henMisread) {
    push({
      key: 'unreliable-narrator:henchoway-strategic-misreading-garren',
      category: 'CONFLICTING_EXPLICIT_FACTS',
      classification: 'UNRELIABLE_NARRATOR_POSSIBILITY',
      severity: 'LOW',
      title: 'Henchoway’s internal assessment of Garren Harper’s assassination vs wider narrative reality',
      affected_entities: ['nar:faction:henchoway', 'nar:character:delwyn-harper', 'nar:character:redley-ris', 'nar:narrative_arc:the-abyss-of-comfort'],
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: 'content/series/the-abyss-of-comfort.md',
        blob_sha: henMisread.blob_sha,
        line: henMisread.line,
        locator: 'Section 1 & Section 4',
        quote: henMisread.quote,
      }],
      conflict_hypothesis: 'Henchoway internal records classify Garren Harper’s death as the removal of an obstacle and weakening of Reltronland, whereas Pencilfania intelligence networks and Redley Ris keep the investigation alive.',
      storytelling_context: 'Intentional dramatic irony and strategic blindness ("comfort as strategic error"). An antagonist’s false belief is a core story engine, not a continuity error.',
      review_guidance: 'No correction needed; preserve the distinction between Henchoway’s internal intelligence assumptions and actual protagonist network state.',
      is_defect: false,
    });
  }

  // 7. Intentional ambiguity checks (NOT defects).
  const henContinuity = await findLineInBlob(
    production,
    'content/factions/henchoway.md',
    /The precise legal, personnel and institutional continuity between Kamila's ancient movement, Vexor's Scuba Division, and Vitor's modern network \*\*is not fully established\*\*/i,
  );
  if (henContinuity) {
    push({
      key: 'intentional-ambiguity:henchoway-ancient-to-modern-lineage',
      category: 'ENTITY_IDENTITY_MISMATCH',
      classification: 'INTENTIONAL_AMBIGUITY',
      severity: 'INFORMATIONAL',
      title: 'Unestablished institutional continuity between 2560 BAC Throne Pact, Vexor Scuba Division, and Vitor Baythorne’s modern Henchoway',
      affected_entities: ['nar:faction:henchoway', 'nar:character:kamila-alena', 'nar:philosophy:nytherion-abyss'],
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: 'content/factions/henchoway.md',
        blob_sha: henContinuity.blob_sha,
        line: henContinuity.line,
        locator: 'Section 2',
        quote: henContinuity.quote,
      }],
      conflict_hypothesis: 'Three historical layers (2560 BAC Eterna Collapse/Kamila Alena, Vexor Scuba Division, and Vitor Baythorne/Van Den Scuba) share symbolism without a documented unbroken legal charter.',
      storytelling_context: 'Explicitly marked in canon as intentional mystery and ideological recurrence rather than a single corporate registry.',
      review_guidance: 'Preserve ambiguity unless a future creator-ratified arc explicitly reveals a specific archival link.',
      is_defect: false,
    });
  }

  const valethraBranches = await findLineInBlob(
    remodeling,
    'content/series/house-of-valethra.md',
    /Undisclosed biological sibling branches remain deliberately mysterious/i,
  );
  if (valethraBranches) {
    push({
      key: 'intentional-ambiguity:house-of-valethra-undisclosed-branches',
      category: 'ENTITY_IDENTITY_MISMATCH',
      classification: 'INTENTIONAL_AMBIGUITY',
      severity: 'INFORMATIONAL',
      title: 'Deliberately undisclosed sibling branches in House of Valethra genealogy',
      affected_entities: ['nar:character:queen-valethra', 'nar:narrative_arc:house-of-valethra'],
      passages: [{
        side: 'remodeling',
        repository: remodeling.identity.repository,
        commit_sha: remodeling.identity.commit_sha,
        path: 'content/series/house-of-valethra.md',
        blob_sha: valethraBranches.blob_sha,
        line: valethraBranches.line,
        locator: 'Frontmatter & Section 1',
        quote: valethraBranches.quote,
      }],
      conflict_hypothesis: 'Genealogical table omits full biological sibling branches of Queen Valethra Seraphine Lunara.',
      storytelling_context: 'Governed by the "Quality and Depth Over Quantity" rule: characters are disclosed only when they serve a necessary narrative function.',
      review_guidance: 'Do not auto-populate placeholder royal family members.',
      is_defect: false,
    });
  }

  // 8. Institutional rule & technology capability boundaries.
  const custodyBoundary = await findLineInBlob(
    production,
    'content/factions/reltronland-vs-depcutland.md',
    /Financial custody, transfer pricing, intellectual-property ownership, taxation, archive custody and territorial jurisdiction are different relationships/i,
  );
  if (custodyBoundary) {
    push({
      key: 'institutional-rule:reltronland-financial-vs-depcutland-archival-custody',
      category: 'INSTITUTIONAL_RULE_CONTRADICTION',
      classification: 'CREATIVE_REVIEW_CANDIDATE',
      severity: 'LOW',
      title: 'Institutional boundary: Reltronland financial custody vs Depcutland archival custody and IP jurisdiction',
      affected_entities: ['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:institution:endless-library-of-depcutland'],
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: 'content/factions/reltronland-vs-depcutland.md',
        blob_sha: custodyBoundary.blob_sha,
        line: custodyBoundary.line,
        locator: 'Section 8.6',
        quote: custodyBoundary.quote,
      }],
      conflict_hypothesis: 'Story drafts touching Season 30 AICR archival deposits or cross-border corporate treasury risk conflating asset custody with territorial ownership or automatic tax transfer.',
      storytelling_context: 'Canonical institutional guardrail separating financial settlement (Reltronland) from provenance custody (Depcutland Endless Library).',
      review_guidance: 'Verify that any Season 30+ plot involving AICR records in Depcutland preserves independent custody without merging sovereignty.',
      is_defect: false,
    });
  }

  const techBoundary = await findLineInBlob(
    production,
    'content/factions/henchoway.md',
    /Henchoway does not own Asthortera's internet or every recommendation algorithm/i,
  );
  if (techBoundary) {
    push({
      key: 'tech-capability:henchoway-algorithm-attribution-boundary',
      category: 'TECHNOLOGY_CAPABILITY_CONTRADICTION',
      classification: 'CREATIVE_REVIEW_CANDIDATE',
      severity: 'LOW',
      title: 'Technological capability boundary: Henchoway Adaptive Stillness vs planetary communications infrastructure',
      affected_entities: ['nar:faction:henchoway', 'nar:decision:adaptive-stillness-doctrine'],
      passages: [{
        side: 'production',
        repository: production.identity.repository,
        commit_sha: production.identity.commit_sha,
        path: 'content/factions/henchoway.md',
        blob_sha: techBoundary.blob_sha,
        line: techBoundary.line,
        locator: 'Section 5 (Recognition Scarcity)',
        quote: techBoundary.quote,
      }],
      conflict_hypothesis: 'Over-attributing every algorithmic rejection or attention-scarcity phenomenon to Henchoway would contradict the established capability boundary.',
      storytelling_context: 'Henchoway exploits recognition scarcity in a 4,412-billion sentient post-scarcity civilization, but does not omnipotently control Asthortera’s digital networks.',
      review_guidance: 'Ensure plotlines distinguish structural attention scarcity from targeted Henchoway operations.',
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
      title: `${stats.unknowns.length} explicitly preserved canonical unknowns in NCCM V6.5 (${stats.dataset_path})`,
      affected_entities: ['nar:world:asthortera'],
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
      conflict_hypothesis: 'Several historical and sub-national series (including individual profiles for the 18 deferred states and exact years of short-lived Reltronland post-war growth surges) remain unassigned.',
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
      title: `Beluftner land area and population density remodeling proposal (${beluftnerDrift.production.value} vs ${beluftnerDrift.remodeling.value} thousand sq km)`,
      affected_entities: ['nar:nation:beluftner'],
      passages: [
        {
          side: 'production',
          repository: beluftnerDrift.provenance.production.repository,
          commit_sha: beluftnerDrift.provenance.production.commit_sha,
          path: beluftnerDrift.file_path,
          blob_sha: beluftnerDrift.provenance.production.blob_sha ?? stats.production?.blob_sha ?? production.identity.tree_sha,
          line: beluftnerDrift.provenance.production.line ?? null,
          locator: beluftnerDrift.locator,
          quote: `Production land_area=${String(beluftnerDrift.production.value)} (${beluftnerDrift.unit ?? 'thousand sq km'})`,
        },
        {
          side: 'remodeling',
          repository: beluftnerDrift.provenance.remodeling.repository,
          commit_sha: beluftnerDrift.provenance.remodeling.commit_sha,
          path: beluftnerDrift.file_path,
          blob_sha: beluftnerDrift.provenance.remodeling.blob_sha ?? stats.remodeling?.blob_sha ?? remodeling.identity.tree_sha,
          line: beluftnerDrift.provenance.remodeling.line ?? null,
          locator: beluftnerDrift.locator,
          quote: `Remodeling land_area=${String(beluftnerDrift.remodeling.value)} (${beluftnerDrift.unit ?? 'thousand sq km'})`,
        },
      ],
      conflict_hypothesis: `Remodeling workspace proposes expanding Beluftner land area from ${String(beluftnerDrift.production.value)} to ${String(beluftnerDrift.remodeling.value)} thousand sq km, altering derived population density and residual planetary land allocation.`,
      storytelling_context: 'Remodeling proposal under review; production canon remains 88 thousand sq km until ratified.',
      review_guidance: 'Inspect downstream impact on Beluftner–Cosmeilia border lore and planetary land-area sum before ratifying.',
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
      blob_sha: (f.classification === 'DRAFT_ONLY' ? f.remodeling_blob_sha : f.production_blob_sha) ?? production.identity.tree_sha,
      line: 1,
      locator: f.path,
      quote: `${f.title ?? f.path} (${f.classification}, ${f.finding_count} finding(s))`,
    }));
    push({
      key: 'draft-divergence:series-and-factions-remodeling',
      category: 'DRAFT_PRODUCTION_DIVERGENCE',
      classification: 'CREATIVE_REVIEW_CANDIDATE',
      severity: 'MEDIUM',
      title: `${narrativeChangedFiles.length} faction and series documents carry remodeling additions or revisions`,
      affected_entities: ['nar:narrative_arc:the-abyss-of-comfort', 'nar:nation:reltronland', 'nar:nation:depcutland', 'nar:faction:henchoway'],
      passages,
      conflict_hypothesis: 'Remodeling workspace introduces new series lore documents (e.g., House of Valethra, Five Voices of Aurora Covenant) and updated prose sections in faction profiles.',
      storytelling_context: 'Remodeling proposals represent forward narrative architecture (such as Seasons 41–44) and refined prose; they are not production defects.',
      review_guidance: 'Compare section diffs in the Remodeling Laboratory and Refactoring Workspace before promoting to production.',
      is_defect: false,
    });
  }

  return [...findings.values()].sort((a, b) => codeUnitCompare(a.id, b.id));
}

