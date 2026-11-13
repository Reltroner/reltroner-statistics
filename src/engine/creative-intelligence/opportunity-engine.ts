/**
 * Narrative opportunity discovery.
 *
 * "Established facts" are sentences matched in the pinned source or values read from the
 * dataset, each with its citation; a fact whose passage is not found is left out, and an
 * opportunity with no verified fact is not produced. Questions, alternatives and assumptions are
 * exploratory prompts written as open questions; they assert nothing about canon.
 *
 * Priority scores are computed from the extracted narrative relationships (see scoreOpportunities)
 * and are a heuristic for ordering, not a judgment of creative quality.
 */

import type { StatisticsDataset } from '../../domain/observation.ts';
import type { CreativeOpportunity, NarrativeEntity, NarrativeRelationship, OpportunityCategory } from '../../domain/creative.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { codeUnitCompare } from '../canonical.ts';
import { findPassage, type Passage } from '../evidence.ts';
import { sha256Hex } from '../git-objects.ts';
import { slug } from '../observations.ts';
import { HENCHOWAY_PATH, RVD_PATH } from './extractor.ts';

function oppId(category: OpportunityCategory, key: string): string {
  return `OPP-${sha256Hex(`${category}|${key}`).slice(0, 12).toUpperCase()}`;
}

type Anchor = CreativeOpportunity['canon_anchors'][number];
type Draft = Omit<CreativeOpportunity, 'id' | 'priority_score'> & { key: string };

const TENSION_TYPES = new Set(['CONFLICTS_WITH', 'CONSTRAINED_BY', 'MOTIVATED_BY']);
const THIN_BELOW = 3;

/**
 * structural_reach  = entities one verified relationship away from the affected entities,
 *                     divided by the largest such count among the opportunities;
 * tension_density   = verified conflict, constraint and motivation relationships touching the
 *                     affected entities, divided by the largest such count;
 * coverage_gap      = share of affected entities with fewer than three verified relationships;
 * composite         = mean of the three. All values are rounded to two decimals.
 */
export function scoreOpportunities(drafts: readonly Draft[], relationships: readonly NarrativeRelationship[]): Map<string, CreativeOpportunity['priority_score']> {
  const verified = relationships.filter((r) => r.verification !== 'CANDIDATE_HYPOTHESIS');
  const degree = new Map<string, number>();
  for (const r of verified) for (const id of [r.source_id, r.target_id]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const raw = drafts.map((d) => {
    const affected = new Set(d.affected_entities);
    const neighbors = new Set<string>();
    let tension = 0;
    for (const r of verified) {
      const s = affected.has(r.source_id);
      const t = affected.has(r.target_id);
      if (!s && !t) continue;
      if (!s) neighbors.add(r.source_id);
      if (!t) neighbors.add(r.target_id);
      if (TENSION_TYPES.has(r.type)) tension++;
    }
    const thin = [...affected].filter((id) => (degree.get(id) ?? 0) < THIN_BELOW).length;
    return { key: d.key, reach: neighbors.size, tension, thin, n: affected.size };
  });
  const maxReach = Math.max(1, ...raw.map((r) => r.reach));
  const maxTension = Math.max(1, ...raw.map((r) => r.tension));
  const round = (v: number) => Math.round(v * 100) / 100;
  return new Map(raw.map((r) => {
    const structural_reach = round(r.reach / maxReach);
    const tension_density = round(r.tension / maxTension);
    const coverage_gap = round(r.n ? r.thin / r.n : 0);
    return [r.key, {
      structural_reach, tension_density, coverage_gap, composite: round((structural_reach + tension_density + coverage_gap) / 3),
      explanation: `${r.reach} entities one verified relationship away; ${r.tension} verified conflict, constraint or motivation relationships; ${r.thin} of ${r.n} affected entities have fewer than ${THIN_BELOW} verified relationships. Reach and tension are divided by the largest value among the ${raw.length} opportunities; the composite is the mean. A heuristic for ordering only.`,
    }];
  }));
}

export async function discoverCreativeOpportunities(input: {
  stats: StatisticsDataset;
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
}): Promise<CreativeOpportunity[]> {
  const { stats, entities, relationships, production } = input;
  const byId = new Map(entities.map((e) => [e.id, e]));
  const existing = (ids: string[]) => ids.filter((id) => byId.has(id));
  const passages = async (path: string, patterns: RegExp[]): Promise<Passage[]> => (await Promise.all(patterns.map((re) => findPassage(production, path, re)))).filter((p): p is Passage => p !== null);
  const anchors = (ps: Passage[], entityId: string | null = null): Anchor[] => ps.map((p) => ({ path: p.path, commit_sha: p.commit_sha, blob_sha: p.blob_sha, line: p.line, quote: p.quote, entity_id: entityId && byId.has(entityId) ? entityId : null }));
  const facts = (ps: Passage[]) => ps.map((p) => `“${p.quote}” (${p.path}:${p.line})`);
  const drafts: Draft[] = [];

  // 1. Two kinds of custody under a shared threat.
  const custody = await passages(RVD_PATH, [
    /Reltronland is the largest financial-custody center in Asthortera\./,
    /Depcutland, the Oracle of Asthortera, recognizes and anticipates the danger of economic value being separated from where knowledge was created\./,
    /Financial custody, transfer pricing, intellectual-property ownership, taxation, archive custody and territorial jurisdiction are different relationships\./,
    /Their disagreements do not prevent them from repeatedly needing to cooperate on global crises, Henchoway-linked threats and Nytherion-related risks\./,
  ]);
  const custodyRisks = await passages(RVD_PATH, [
    /TCBC is privately governed, not a merged sovereign treasury; the Grand Library\/Endless Library has independent custodial integrity under Depcutland\./,
    /Explanatory accuracy is not allegiance, operational cooperation is not automatic agreement, and a specific joint response is not a permanent military alliance\./,
  ]);
  if (custody.length) {
    drafts.push({
      key: 'financial-and-epistemic-custody-under-shared-threat', category: 'UNRESOLVED_INSTITUTIONAL_TENSION',
      title: 'Financial custody and epistemic custody acting on the same case',
      inspired_by: `${custody.length} passages in ${RVD_PATH}.`,
      canon_anchors: anchors(custody),
      narrative_question: 'What happens when a shared threat requires both kinds of custody to act on the same case?',
      established_facts: facts(custody),
      hypothetical_space: ['Which institution acts first, and what each may disclose to the other.', 'How the two custody roles stay separate while they cooperate.'],
      potential_conflict: 'One custodian may need speed while the other needs provenance. The source does not say how such a case is resolved.',
      affected_entities: existing(['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:faction:henchoway', 'nar:institution:endless-library-of-depcutland']),
      possible_alternatives: [
        { id: 'ALT-SEPARATE-MANDATES', label: 'Each custodian acts within its own mandate', summary: 'The institutions exchange findings without exchanging custody.', mechanism: 'Follows the boundary the source states between custody and ownership.', narrative_tradeoff: 'Joint action is slower; the boundary stays intact.' },
        { id: 'ALT-NEGOTIATED-MINIMUM', label: 'A negotiated minimum response', summary: 'A forum agrees on limited safety steps only.', mechanism: 'Resembles the Season 39 design quoted in the dossier, which is planning evidence and not a completed event.', narrative_tradeoff: 'Little is agreed; the disagreement stays visible.' },
      ],
      assumptions: ['A new case arises in the present era. No specific event is taken from the source.'],
      consistency_risks: facts(custodyRisks),
      development_steps: ['Decide which institution holds what in the case.', 'Check every step against the quoted custody boundary.'],
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  // 2. Development-cohort nations and the deferred aggregate (dataset facts).
  const dev = stats.entities.filter((e) => e.cohort === 'DEVELOPMENT_5');
  const aggregate = stats.entities.find((e) => e.kind === 'aggregate_residual');
  if (dev.length && stats.production) {
    const devIds = new Set(dev.map((e) => e.id));
    const unassigned = stats.observations.filter((o) => devIds.has(o.entity_id) && o.value === null).length;
    const assigned = stats.observations.filter((o) => devIds.has(o.entity_id) && o.value !== null && o.period.year_bac === 0).length;
    const narIds = existing(dev.map((e) => `nar:nation:${slug(e.name)}`));
    drafts.push({
      key: 'development-cohort-and-deferred-aggregate', category: 'UNDERDEVELOPED_ENTITY',
      title: `${dev.length} development-cohort nations with partial records`,
      inspired_by: `Cohort structure of ${stats.dataset_path}.`,
      canon_anchors: narIds.slice(0, 3).map((id) => { const e = byId.get(id)!; return { path: e.source_path, commit_sha: e.commit_sha, blob_sha: e.blob_sha, line: e.evidence_line, quote: e.evidence_quote, entity_id: e.id }; }),
      narrative_question: 'Which of the partially recorded nations should be developed next, and what must stay unknown until the creator decides?',
      established_facts: [
        `The dataset records ${dev.length} development-cohort nations: ${dev.map((d) => d.name).join(', ')} (${stats.dataset_path}).`,
        `${assigned} Year 0 values are assigned for them and ${unassigned} are explicitly unassigned (INSUFFICIENT_DATA).`,
        ...(aggregate ? [`${aggregate.represents_states} further states are represented as one combined aggregate, not as ${aggregate.represents_states} separate records.`] : []),
      ],
      hypothetical_space: ['Institutions, history and relations of each nation beyond what its document states.'],
      potential_conflict: 'Prose written for these nations could imply figures that the dataset leaves unassigned.',
      affected_entities: narIds,
      possible_alternatives: [
        { id: 'ALT-ONE-NATION-FIRST', label: 'Develop one nation in depth', summary: 'Choose one nation and write from its existing document.', mechanism: 'Keeps the other records unchanged.', narrative_tradeoff: 'Depth for one nation; the others stay thin.' },
        { id: 'ALT-COMMON-FRAME', label: 'Write a common frame for all of them', summary: 'Describe what the nations share before detailing any.', mechanism: 'Uses only values the dataset assigns.', narrative_tradeoff: 'Breadth without depth.' },
      ],
      assumptions: ['Unassigned values stay unassigned until the creator publishes them.'],
      consistency_risks: [`Do not state figures for values the dataset leaves unassigned${aggregate ? ', and do not describe the combined aggregate as separately measured states' : ''}.`],
      development_steps: ['Pick a nation.', 'List what its document and its dataset record already state.', 'Write only from that list or mark additions as proposals.'],
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  // 3. Open questions the dossier lists itself.
  const open = await passages(RVD_PATH, [
    /The following require additional author decisions or in-world evidence, not retrospective invention:/,
    /Creditor knowledge of systemic distress, lending incentives and any institutional complicity\./,
    /Whether Depcutland possessed authenticated Reltronland invasion orders before launching its missiles\./,
    /Allocation of responsibility among financial institutions, political elites, military commands, companies, citizens and the Depeisit inheritance\./,
  ]);
  const openGuard = await passages(RVD_PATH, [/These uncertainties do not undo the events explicitly established above\./, /Until authored, those are open facts, not grounds to fabricate an answer\./]);
  if (open.length > 1) {
    drafts.push({
      key: 'open-evidentiary-questions-listed-by-the-dossier', category: 'UNEXPLORED_HISTORICAL_CONSEQUENCE',
      title: 'Open questions the bilateral dossier lists for author decision',
      inspired_by: `The list of open narrative and evidentiary questions in ${RVD_PATH}.`,
      canon_anchors: anchors(open),
      narrative_question: 'Which of the listed open questions should the creator decide next?',
      established_facts: facts(open),
      hypothetical_space: ['Any answer to a listed question. Each answer is an author decision.'],
      potential_conflict: 'An answer written into one document can conflict with events the dossier already establishes.',
      affected_entities: existing(['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:conflict:reltronland-vs-depcutland']),
      possible_alternatives: [
        { id: 'ALT-LEAVE-OPEN', label: 'Leave the question open', summary: 'The question stays unanswered in canon.', mechanism: 'The dossier already marks it as open.', narrative_tradeoff: 'Ambiguity is preserved.' },
        { id: 'ALT-DECIDE-ONE', label: 'Decide one question', summary: 'The creator answers one listed question in the production source.', mechanism: 'A creator commit to the production repository.', narrative_tradeoff: 'One ambiguity is closed; the answer constrains later writing.' },
      ],
      assumptions: ['The list in the dossier is taken as the set of open questions; none is added here.'],
      consistency_risks: facts(openGuard),
      development_steps: ['Choose a listed question.', 'Collect what the dossier establishes around it.', 'Record the decision in the production source if it is made.'],
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  // 4. The contradiction the Henchoway dossier states about itself.
  const contradiction = await passages(HENCHOWAY_PATH, [
    /The core contradiction: Henchoway needs capable researchers, learning, correction, investment and technical progress to manufacture a world that is less independently transformable\./,
    /Adaptive Stillness is the doctrine through which modern Henchoway learns from the costs of crude suppression\./,
  ]);
  const continuity = await passages(HENCHOWAY_PATH, [/The precise legal, personnel and institutional continuity between Kamila's ancient movement, Vexor's Scuba Division, and Vitor's modern network is not fully established\./]);
  if (contradiction.length && byId.has('nar:faction:henchoway')) {
    drafts.push({
      key: 'henchoway-stated-core-contradiction', category: 'CHARACTER_MOTIVATION_CONFLICT',
      title: 'The core contradiction the Henchoway dossier states',
      inspired_by: `${contradiction.length} passages in ${HENCHOWAY_PATH}.`,
      canon_anchors: anchors(contradiction, 'nar:faction:henchoway'),
      narrative_question: 'How does an organization that depends on capable people pursue a world that is less transformable?',
      established_facts: facts(contradiction),
      hypothetical_space: ['How the contradiction shows inside the organization.', 'Who inside or outside it notices.'],
      potential_conflict: 'The organization needs the capacities its doctrine works against. The dossier states the contradiction; it does not narrate how it plays out.',
      affected_entities: existing(['nar:faction:henchoway', 'nar:decision:adaptive-stillness-doctrine', 'nar:character:kamila-alena']),
      possible_alternatives: [
        { id: 'ALT-INTERNAL-VIEW', label: 'Tell it from inside', summary: 'A member of the organization meets the contradiction in their own work.', mechanism: 'Uses the contradiction exactly as stated.', narrative_tradeoff: 'The antagonist gains depth; the point of view moves away from the protagonists.' },
        { id: 'ALT-EXTERNAL-VIEW', label: 'Tell it from outside', summary: 'Others observe the contradiction through its effects.', mechanism: 'Needs evidence in the story for each attributed act.', narrative_tradeoff: 'The organization stays opaque.' },
      ],
      assumptions: ['No specific person or event is taken from the source for this storyline.'],
      consistency_risks: facts(continuity),
      development_steps: ['Choose the point of view.', 'Keep attributed acts within the attribution boundary the dossier states.'],
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  // 5. Hargenbor as a separate sovereign nation.
  const hargenbor = await passages(HENCHOWAY_PATH, [
    /Hargenbor is a separate sovereign nation whose resources and factions can become part of that contest\./,
    /Hargenbor — Strategic Leverage, Not a Puppet State/,
  ]);
  if (hargenbor.length && byId.has('nar:nation:hargenbor')) {
    drafts.push({
      key: 'hargenbor-sovereign-nation-in-the-contest', category: 'WORLDBUILDING_RELATIONSHIP_POTENTIAL',
      title: 'Hargenbor: a sovereign nation inside the contest, not a puppet state',
      inspired_by: `${hargenbor.length} passages in ${HENCHOWAY_PATH}.`,
      canon_anchors: anchors(hargenbor, 'nar:nation:hargenbor'),
      narrative_question: 'How does a sovereign nation act when its resources and factions become part of someone else’s contest?',
      established_facts: facts(hargenbor),
      hypothetical_space: ['Positions taken by institutions of Hargenbor.', 'How other states treat Hargenbor.'],
      potential_conflict: 'Treating the whole nation as an instrument of Henchoway would contradict the quoted distinction.',
      affected_entities: existing(['nar:nation:hargenbor', 'nar:faction:henchoway']),
      possible_alternatives: [
        { id: 'ALT-HARGENBOR-AGENCY', label: 'Hargenbor acts for its own interests', summary: 'Institutions of Hargenbor decide for themselves.', mechanism: 'Consistent with the stated sovereignty.', narrative_tradeoff: 'More actors with their own aims.' },
      ],
      assumptions: ['No specific institution of Hargenbor is taken from the source for this storyline.'],
      consistency_risks: ['Do not write Hargenbor as a puppet state; the dossier heading says it is not.'],
      development_steps: ['Read the Hargenbor document for what it establishes.', 'Keep sovereign and factional actors distinct.'],
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  // 6. Remodeling-only series documents next to the attribution boundary of Henchoway.
  const boundary = await passages(HENCHOWAY_PATH, [
    /Henchoway does not own Asthortera's internet or every recommendation algorithm, and it is not the author of every rejection, quiet career, community preference, or restorative act\./,
    /A direct Henchoway operation requires evidence of an actor, mechanism, jurisdiction and consequence\./,
  ]);
  const draftSeries = entities.filter((e) => e.kind === 'narrative_arc' && e.source_side === 'remodeling');
  if (boundary.length && draftSeries.length) {
    drafts.push({
      key: 'remodeling-series-and-attribution-boundary', category: 'INTERSECTING_NARRATIVE_THREADS',
      title: 'Remodeling-only series documents and the attribution boundary of Henchoway',
      inspired_by: `${boundary.length} passages in ${HENCHOWAY_PATH} and ${draftSeries.length} remodeling-only series documents.`,
      canon_anchors: [...anchors(boundary, 'nar:faction:henchoway'), ...draftSeries.map((e) => ({ path: e.source_path, commit_sha: e.commit_sha, blob_sha: e.blob_sha, line: e.evidence_line, quote: e.evidence_quote, entity_id: e.id }))],
      narrative_question: 'If the remodeling-only series documents are developed further, which events in them may be attributed to Henchoway?',
      established_facts: [...facts(boundary), ...draftSeries.map((e) => `${e.source_path} exists only in the remodeling repository (a proposal).`)],
      hypothetical_space: ['How the proposed family stories meet the wider series.'],
      potential_conflict: 'Attributing ordinary events in the proposed stories to Henchoway without evidence would cross the quoted boundary.',
      affected_entities: existing([...draftSeries.map((e) => e.id), 'nar:faction:henchoway']),
      possible_alternatives: [
        { id: 'ALT-NO-ATTRIBUTION', label: 'Keep the proposed stories independent', summary: 'Nothing in them is attributed to Henchoway.', mechanism: 'Stays inside the attribution boundary by construction.', narrative_tradeoff: 'The threads stay separate.' },
      ],
      assumptions: ['The remodeling documents stay proposals until the creator publishes them.'],
      consistency_risks: ['Remodeling-only documents are not production canon.'],
      development_steps: ['Review the canon status each remodeling document declares in its frontmatter.', 'Require evidence in the story for any attributed operation.'],
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  const scores = scoreOpportunities(drafts, relationships);
  return drafts
    .map(({ key, ...rest }) => ({ id: oppId(rest.category, key), ...rest, priority_score: scores.get(key)! }))
    .sort((a, b) => b.priority_score.composite - a.priority_score.composite || codeUnitCompare(a.id, b.id));
}
