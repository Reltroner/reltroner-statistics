/**
 * The decision trees published by the pipeline. Each is small and bounded, built from passages
 * and values resolved in the pinned sources. A tree whose premise is not found is not built.
 *
 * Creative trees list options; they never rank them and never recommend one. Review trees
 * (audit triage, development readiness) recommend a review action from deterministic conditions
 * and never change canon. Counterfactuals and inventions are PURE_SPECULATION.
 */
import type { CreativeArtifact } from '../../domain/creative.ts';
import type { ConsequenceDimension, DecisionConsequence, DecisionNode, DecisionTree, OutcomeClass, ReviewAction } from '../../domain/decision.ts';
import type { Audit } from '../../domain/finding.ts';
import type { StatisticsDataset } from '../../domain/observation.ts';
import type { QaCheck } from '../qa.ts';
import { HENCHOWAY_PATH, RVD_PATH } from '../creative-intelligence/extractor.ts';
import { canonValue } from '../creative-intelligence/remodel-engine.ts';
import { TreeKit, type KitContext } from './kit.ts';

export interface TreeInputs extends KitContext {
  stats: StatisticsDataset;
  audit: Audit;
  qaProduction: QaCheck[];
  qaRemodeling: QaCheck[];
  creative: CreativeArtifact;
}

type Cons = [text: string, basis: OutcomeClass, dimension: ConsequenceDimension | null, evidence: string[]];
const cons = (items: Cons[]): DecisionConsequence[] => items.map(([text, basis, dimension, evidence_ids]) => ({ text, basis, dimension, evidence_ids }));
const outcome = (id: string, label: string, description: string, items: Cons[], extra: Partial<DecisionNode> = {}): DecisionNode => ({
  id, type: 'OUTCOME', label, description, evidence_ids: [...new Set(items.flatMap((i) => i[3]))], outcome_class: items[0]![1], consequences: cons(items),
  consistency_risks: [], open_questions: [], affected_entities: [], ...extra,
});
const review = (id: string, label: string, action: ReviewAction, text: string, evidence: string[] = []): DecisionNode =>
  outcome(id, label, text, [[text, 'REVIEW_RECOMMENDATION', null, evidence]], { recommended_action: action });
const noData = (id: string, label: string, missing: string[], evidence_ids: string[] = []): DecisionNode => ({ id, type: 'INSUFFICIENT_DATA', label, description: missing.join(' '), evidence_ids, missing });
const AUTHORING = ['Creator review before any authoring. Nothing here is canon.'];

/** 1. Reltronland and Depcutland facing a shared threat. */
export async function cooperationTree(input: TreeInputs): Promise<DecisionTree | null> {
  const k = new TreeKit(input);
  const p = (id: string, re: RegExp, extra: Parameters<TreeKit['passage']>[3] = {}) => k.passage(id, RVD_PATH, re, extra);
  const forward = { canon_status: 'SCENARIO' as const, note: 'Forward-season design in the production source: planning evidence, not a completed event.' };
  const THREATS = await p('EV-RD-THREATS', /Their disagreements do not prevent them from repeatedly needing to cooperate on global crises, Henchoway-linked threats and Nytherion-related risks\./);
  if (!k.verified(THREATS)) return null;
  const STAKES = await p('EV-RD-STAKES', /Civilian networks, supply chains, research infrastructures, archives and critical systems create practical stakes on both sides\./);
  const NO_AGREEMENT = await p('EV-RD-NO-AGREEMENT', /A shared response may be necessary without agreement about motive, blame, methods, liability or foreign policy\./);
  const ACTORS = await p('EV-RD-ACTORS', /Henchoway is an intentional transnational actor; Nytherion Abyss is a wider existential and metaphysical condition\./);
  const ILLUSION = await p('EV-RD-ILLUSION', /The very competence with which these neighbors translate one another's objections can create an external illusion of alliance\./);
  const NOT_ALLEGIANCE = await p('EV-RD-NOT-ALLEGIANCE', /Explanatory accuracy is not allegiance, operational cooperation is not automatic agreement, and a specific joint response is not a permanent military alliance\./);
  const NO_MERGE = await p('EV-RD-NO-MERGE', /The states did not merge into a military alliance\./);
  const TREATY = await p('EV-RD-TREATY', /The treaty is not an alliance grounded in affection or an ancestral brotherhood oath\./);
  const NO_LIABILITY = await p('EV-RD-NO-LIABILITY', /Foreign perceptions of mutual support do not create a common alliance, currency, treasury or unlimited shared liability\./);
  const S30 = await p('EV-RD-SEASON-30', /Season 30 \| AICR deposits selected records in Depcutland's Endless Library for cross-sovereign redundancy \| Independent custody does not merge government or ownership/, forward);
  const S31 = await p('EV-RD-SEASON-31', /Season 31 \| Reciprocal Continuity Protocol, with the two institutions preserving evidence of their own possible failures \| Sharing records does not elevate ancestry or replace sovereign judgment/, forward);
  const S39 = await p('EV-RD-SEASON-39', /Season 39 \| Reltronland calls for early risk mitigation; Depcutland requires pre-remediation provenance; the forum negotiates a minimum interoperable response \| Agreement on limited safety steps is not universal political consensus/, forward);
  const DESIGN = await p('EV-RD-DESIGN', /These forward-season events and institutions are design architecture until promoted, not proof of historical ratification or completed episodes\./);
  const PLANNING = await p('EV-RD-PLANNING', /Forward Seasons 30–40 are planning evidence, not already completed canon events\./);
  const INSTITUTIONS = await p('EV-RD-INSTITUTIONS', /Strategic institutions \| Banking, energy, navigation, archives, risk management and emergency interoperability \| Corporate mandates and state sovereignty/);
  const CUSTODY = await p('EV-RD-CUSTODY', /TCBC is privately governed, not a merged sovereign treasury; the Grand Library\/Endless Library has independent custodial integrity under Depcutland\./);
  const CIVILIAN = await p('EV-RD-CIVILIAN', /The most enduring reason Reltronland and Depcutland cannot cleanly separate is the scale of ordinary civilian interdependence\./);
  const KINSHIP = await p('EV-RD-KINSHIP', /Close civilian kinship does not erase nationality or make border controls meaningless\./);
  const SEVER = await p('EV-RD-SEVER', /A state that tries to sever the relationship would disrupt not only finance and industry, but its own citizens' families, schools, social worlds and livelihoods\./);
  const DOMESTIC = await p('EV-RD-DOMESTIC', /This is a domestic constraint on hard geopolitical separation, not evidence that either society surrendered national sovereignty\./);
  const MODEL = await p('EV-RD-MODEL', /Enduring relationship model: socially inseparable from below; strategically competitive and sovereign from above; often forced into issue-specific cooperation by shared consequences; and frequently perceived as allies from outside\./);
  const INDEPENDENT = await p('EV-RD-INDEPENDENT', /Reltronland \(\d{4} BAC; Troner Rhett\) and Depcutland \(\d{4} BAC; Cutter Glouster\) were independent before the \d{4} BAC Depeisit Economic Crisis\./);

  const states = ['nar:nation:reltronland', 'nar:nation:depcutland'];
  const dossier = `document:${RVD_PATH}`;
  const series = 'document:content/series/the-abyss-of-comfort.md';
  const library = 'document:content/places/endless-library-of-depcutland.md';
  k.constraint('c-sovereign', 'Both states were sovereign before the crisis and remain sovereign.', [INDEPENDENT]);
  k.constraint('c-not-alliance', 'Cooperation is not an alliance: no merged command, no alliance by treaty, no permanent military alliance.', [NOT_ALLEGIANCE, NO_MERGE, TREATY]);
  k.constraint('c-custody', 'Institutions keep their own custody: no merged treasury, and the library stays under Depcutland.', [CUSTODY]);
  k.constraint('c-actors', 'Henchoway is an actor and Nytherion Abyss is a condition; they are not interchangeable.', [ACTORS]);
  k.constraint('c-forward', 'Forward seasons are planning evidence, not completed events.', [PLANNING]);
  k.assumptions.push('A new shared threat arises in the present era. No specific event is taken from the source.', 'The four responses are exploratory options. None is established canon, and none is ranked above another.');

  k.node({ id: 'root', type: 'ROOT', label: 'A shared threat appears', description: 'Reltronland and Depcutland face a Henchoway-linked threat or a Nytherion-related risk. The situation is hypothetical; the constraints are quoted from production main.', evidence_ids: [] });
  k.node({ id: 'premise', type: 'EVIDENCE', label: 'What the source establishes', description: 'The two states repeatedly need to cooperate on shared threats, have practical stakes on both sides, and need not agree on motive or method.', evidence_ids: [THREATS, STAKES, NO_AGREEMENT, ACTORS, MODEL] });
  k.node({ id: 'respond', type: 'DECISION', label: 'Form of the response', description: 'A creative choice. The evaluator never selects one.', evidence_ids: [], question: 'How do the two states respond to the shared threat?' });
  k.node({ id: 'public', type: 'DECISION', label: 'Framing of public cooperation', description: 'How a declared joint response is framed.', evidence_ids: [NOT_ALLEGIANCE], question: 'How is the public cooperation framed?' });
  k.node({ id: 'limited', type: 'DECISION', label: 'Limited mechanism', description: 'Narrow institutional mechanisms. Three are designed for forward seasons in the production source.', evidence_ids: [INSTITUTIONS, DESIGN], question: 'Which limited mechanism carries the cooperation?' });
  k.node({ id: 'indirect', type: 'DECISION', label: 'Channel of indirect coordination', description: 'No declared joint action.', evidence_ids: [CIVILIAN], question: 'What carries the coordination?' });
  k.node({ id: 'refuse', type: 'DECISION', label: 'Extent of the refusal', description: 'Declining joint action.', evidence_ids: [STAKES], question: 'How far does the refusal go?' });

  k.node(outcome('o-public-issue', 'Issue-specific joint response', 'A declared response limited to the threat, with sovereignty explicit.', [
    ['Other states may infer mutual political backing. The source names this an external illusion of alliance.', 'VERIFIED_SOURCE_GROUNDED', 'EXTERNAL_PERCEPTION', [ILLUSION]],
    ['The response stays issue-specific: a specific joint response is not a permanent military alliance.', 'VERIFIED_SOURCE_GROUNDED', 'SOVEREIGNTY', [NOT_ALLEGIANCE]],
    ['Perceived mutual support creates no common treasury, currency or shared liability.', 'VERIFIED_SOURCE_GROUNDED', 'INSTITUTIONAL_TRUST', [NO_LIABILITY]],
    ['How each public reacts to seeing the rivals act together is not stated by any source.', 'PURE_SPECULATION', 'CIVILIAN_LIFE', []],
  ], { consistency_risks: [{ text: 'Writing the response as agreement on motive, blame or method exceeds what the source lets a shared response imply.', evidence_ids: [NO_AGREEMENT] }],
    open_questions: ['Which institutions speak for each state.', 'Whether and how third parties are informed.'], affected_entities: [...states, 'nar:viewpoint:external-illusion-of-alliance'] }));
  k.node(outcome('o-public-alliance', 'Permanent alliance or merged command', 'A new political fact that the source rules out for the present relationship.', [
    ['A permanent alliance or a merged command would be a new political fact. No source establishes it.', 'PURE_SPECULATION', 'SOVEREIGNTY', []],
  ], { consistency_risks: [{ text: 'Contradicts the statements that the states did not merge into a military alliance and that a joint response is not a permanent alliance.', evidence_ids: [NO_MERGE, NOT_ALLEGIANCE, TREATY] }],
    open_questions: ['Only an explicit creator decision published in the production source could establish this.'], affected_entities: states }));
  const season = (id: string, n: number, ev: string, text: string) => k.node(outcome(id, `Season ${n} design`, `A mechanism the production source already designs for Season ${n}.`, [
    [`${text} The production source designs this for Season ${n}; it is planning evidence, not a completed event.`, 'DEPENDENCY_SUPPORTED', 'INSTITUTIONAL_TRUST', [ev, DESIGN]],
    ['Documents that define or link to the dossier and the series would need review if the mechanism is authored.', 'DEPENDENCY_SUPPORTED', 'NARRATIVE_STRUCTURE', [ev]],
    ['Whether the mechanism succeeds against the threat is not stated by any source.', 'PURE_SPECULATION', 'LONG_TERM', []],
  ], { consistency_risks: [{ text: 'Treating the mechanism as an already completed event would contradict its planning status.', evidence_ids: [PLANNING] }, { text: 'The mechanism cannot merge custody or the treasury.', evidence_ids: [CUSTODY] }],
    open_questions: ['When, and whether, the season is promoted from design to canon.'], affected_entities: [...states, 'nar:institution:endless-library-of-depcutland', 'nar:narrative_arc:the-abyss-of-comfort'] }));
  season('o-season-30', 30, S30, 'Selected records are deposited in the Endless Library for cross-sovereign redundancy, and independent custody does not merge government or ownership.');
  season('o-season-31', 31, S31, 'A reciprocal continuity protocol has both institutions preserve evidence of their own possible failures, and sharing records does not replace sovereign judgment.');
  season('o-season-39', 39, S39, 'A forum negotiates a minimum interoperable response, and agreement on limited safety steps is not universal political consensus.');
  k.node(outcome('o-indirect-civil', 'Through civilian and professional ties', 'Coordination without a declared joint action.', [
    ['Coordination travels through the civilian, professional and institutional ties the source describes. That these ties would carry a threat response is a hypothesis.', 'NARRATIVE_HYPOTHESIS', 'CIVILIAN_LIFE', [CIVILIAN, INSTITUTIONS]],
    ['Without a declared joint action there is no joint statement for other states to read as an alliance.', 'NARRATIVE_HYPOTHESIS', 'EXTERNAL_PERCEPTION', [ILLUSION]],
  ], { consistency_risks: [{ text: 'Kinship does not suspend nationality or border controls.', evidence_ids: [KINSHIP] }], open_questions: ['Who notices the coordination, and whether either government acknowledges it.'], affected_entities: states }));
  k.node(outcome('o-indirect-backchannel', 'A secret channel between governments', 'An invention with no source support.', [
    ['A secret standing channel between the governments would be an invention. No source describes one.', 'PURE_SPECULATION', 'INSTITUTIONAL_TRUST', []],
  ], { consistency_risks: [{ text: 'A hidden standing arrangement could read as the alliance the source rules out.', evidence_ids: [NOT_ALLEGIANCE] }], open_questions: ['Every detail of such a channel is an author decision.'], affected_entities: states }));
  k.node(outcome('o-refuse-issue', 'Decline joint action on this issue', 'A refusal limited to the present threat.', [
    ['The practical stakes remain on both sides: civilian networks, supply chains, research infrastructures, archives and critical systems.', 'VERIFIED_SOURCE_GROUNDED', 'CIVILIAN_LIFE', [STAKES]],
    ['The source says the two states repeatedly need to cooperate despite their disagreements, so a refusal runs against a stated pattern.', 'VERIFIED_SOURCE_GROUNDED', 'LONG_TERM', [THREATS]],
    ['What the threat then does is not stated by any source.', 'PURE_SPECULATION', 'LONG_TERM', []],
  ], { open_questions: ['Which state refuses, and on what stated ground.'], affected_entities: states }));
  k.node(outcome('o-refuse-sever', 'Sever the relationship', 'Hard separation.', [
    ['A state that tries to sever the relationship would disrupt its own citizens’ families, schools, social worlds and livelihoods.', 'VERIFIED_SOURCE_GROUNDED', 'CIVILIAN_LIFE', [SEVER]],
    ['The source calls this a domestic constraint on hard geopolitical separation.', 'VERIFIED_SOURCE_GROUNDED', 'SOVEREIGNTY', [DOMESTIC]],
  ], { consistency_risks: [{ text: 'A clean separation would contradict the stated scale of civilian interdependence.', evidence_ids: [CIVILIAN] }], open_questions: ['How long such a separation could hold is not stated.'], affected_entities: states }));

  k.branch('b-root', 'root', 'premise', 'Continue');
  k.branch('b-premise', 'premise', 'respond', 'Continue', { evidence_ids: [THREATS] });
  const opt = (id: string, from: string, to: string, label: string, rationale: string, evidence_ids: string[], uncertainty: 'SOURCE_STATED' | 'INFERRED' | 'SPECULATIVE', extra = {}) =>
    k.branch(id, from, to, label, { rationale, evidence_ids, uncertainty, assumptions: [], review_requirements: AUTHORING, ...extra });
  opt('opt-public', 'respond', 'public', 'Cooperate publicly', 'A declared joint response. The source allows a specific joint response and denies that it is an alliance.', [NOT_ALLEGIANCE, NO_LIABILITY], 'INFERRED');
  opt('opt-limited', 'respond', 'limited', 'Cooperate through limited technical institutions', 'Narrow mechanisms between institutions. The source lists strategic institutions with emergency interoperability and designs three forward mechanisms.', [INSTITUTIONS, S30, S31, S39], 'INFERRED');
  opt('opt-indirect', 'respond', 'indirect', 'Coordinate indirectly', 'No declared joint action. The source describes dense civilian and professional ties.', [CIVILIAN, MODEL], 'SPECULATIVE');
  opt('opt-refuse', 'respond', 'refuse', 'Refuse cooperation', 'Decline joint action. The source states what remains at stake.', [STAKES, THREATS], 'INFERRED');
  opt('opt-public-issue', 'public', 'o-public-issue', 'Issue-specific response with sovereignty explicit', 'Stays inside what the source says a joint response is.', [NOT_ALLEGIANCE], 'SOURCE_STATED', { outcome_class: 'VERIFIED_SOURCE_GROUNDED' });
  opt('opt-public-alliance', 'public', 'o-public-alliance', 'Permanent alliance or merged command', 'Blocked while the source statements against an alliance are verified.', [NO_MERGE, NOT_ALLEGIANCE, TREATY], 'SPECULATIVE',
    { outcome_class: 'PURE_SPECULATION', guard: { op: 'NOT', of: [{ op: 'EVIDENCE_VERIFIED', evidence_ids: [NO_MERGE, NOT_ALLEGIANCE, TREATY] }] } });
  opt('opt-season-30', 'limited', 'o-season-30', 'Cross-sovereign record redundancy (Season 30 design)', 'Quoted from the forward-season table of the dossier.', [S30], 'SOURCE_STATED', { outcome_class: 'DEPENDENCY_SUPPORTED' });
  opt('opt-season-31', 'limited', 'o-season-31', 'Reciprocal continuity protocol (Season 31 design)', 'Quoted from the forward-season table of the dossier.', [S31], 'SOURCE_STATED', { outcome_class: 'DEPENDENCY_SUPPORTED' });
  opt('opt-season-39', 'limited', 'o-season-39', 'Minimum interoperable response (Season 39 design)', 'Quoted from the forward-season table of the dossier.', [S39], 'SOURCE_STATED', { outcome_class: 'DEPENDENCY_SUPPORTED' });
  opt('opt-indirect-civil', 'indirect', 'o-indirect-civil', 'Civilian, professional and institutional ties', 'Builds on ties the source describes.', [CIVILIAN, INSTITUTIONS], 'INFERRED', { outcome_class: 'NARRATIVE_HYPOTHESIS', assumptions: ['Existing ties can carry information relevant to the threat.'] });
  opt('opt-indirect-backchannel', 'indirect', 'o-indirect-backchannel', 'A secret channel between the governments', 'No source support.', [], 'SPECULATIVE', { outcome_class: 'PURE_SPECULATION', assumptions: ['Such a channel exists; nothing in the source says so.'] });
  opt('opt-refuse-issue', 'refuse', 'o-refuse-issue', 'Decline joint action on this issue only', 'The relationship continues; only this response is declined.', [STAKES], 'SOURCE_STATED', { outcome_class: 'VERIFIED_SOURCE_GROUNDED' });
  opt('opt-refuse-sever', 'refuse', 'o-refuse-sever', 'Sever the relationship', 'Hard separation, which the source describes as domestically constrained.', [SEVER, DOMESTIC], 'SOURCE_STATED', { outcome_class: 'VERIFIED_SOURCE_GROUNDED' });

  for (const id of ['o-season-30', 'o-season-31', 'o-season-39']) k.connect(id, { dependentsOf: [dossier, series, library], candidatesOf: ['nar:institution:endless-library-of-depcutland'], evidenceOf: [S30, S31, S39, DESIGN] });
  k.connect('o-public-issue', { evidenceOf: [ILLUSION, NOT_ALLEGIANCE], candidatesOf: ['nar:faction:henchoway'], speculativeOn: states });
  k.connect('o-public-alliance', { speculativeOn: states, evidenceOf: [NO_MERGE] });
  k.connect('o-indirect-civil', { speculativeOn: states, evidenceOf: [CIVILIAN] });
  k.connect('o-indirect-backchannel', { speculativeOn: states });
  k.connect('o-refuse-issue', { evidenceOf: [STAKES, THREATS], speculativeOn: ['nar:faction:henchoway'] });
  k.connect('o-refuse-sever', { evidenceOf: [SEVER], dependentsOf: [dossier] });
  return k.finish({
    slug: 'reltronland-depcutland-shared-threat', type: 'NARRATIVE_IDEATION', purposes: ['NARRATIVE_IDEATION', 'INSTITUTIONAL_CONFLICT'], root: 'root', canon_status: 'SCENARIO',
    title: 'Reltronland and Depcutland: responding to a shared threat',
    description: 'Four exploratory responses to a hypothetical shared threat, each with the canon constraints it must respect, its evidence, and what remains unknown. The options are not ranked.',
    question: 'How could two sovereign rivals respond to a shared threat without becoming an alliance?', paths: [RVD_PATH, HENCHOWAY_PATH],
  });
}

/** 2. The decisions that led to open fire in 1048 BAC: what the record states and what it leaves open. */
export async function outbreakTree(input: TreeInputs): Promise<DecisionTree | null> {
  const k = new TreeKit(input);
  const p = (id: string, re: RegExp) => k.passage(id, RVD_PATH, re);
  const SEQ1 = await p('EV-RD-SEQUENCE-1', /The Depcutland CEO engaged in patent-violating trade and was arrested in Reltronepolis\./);
  if (!k.verified(SEQ1)) return null;
  const SEQ2 = await p('EV-RD-SEQUENCE-2', /Depcutland's government ordered the initial military operation attempting to penetrate Neiput\./);
  const SEQ3 = await p('EV-RD-SEQUENCE-3', /Reltronland detected and blocked that movement while retaining a prospective invasion plan for recovery of overdue debt\./);
  const SEQ4 = await p('EV-RD-SEQUENCE-4', /Depcutland fired the first missiles from a nearby base against Reltronland's blockade\./);
  const SEQ5 = await p('EV-RD-SEQUENCE-5', /The conflict escalated into the Reltronland–Depcutland War \/ War of Conscience \(\d{4}–\d{4} BAC\)\./);
  const EMBEDDED = await p('EV-RD-EMBEDDED', /The arrest triggered an acute political crisis, but both states' military intentions were already embedded in a larger financial contest\./);
  const NOT_ENTIRE = await p('EV-RD-NOT-ENTIRE', /It did not create the entire debt crisis, which already originated from the Depeisit aftermath\./);
  const NO_RIGHT = await p('EV-RD-NO-RIGHT', /Nor does a creditor's unpaid claim create an automatic right to invade debtor territory\./);
  const OPEN = await p('EV-RD-OPEN-FACTS', /The record does not yet specify whether Depcutland held a verifiable Reltronland invasion order or inferred imminent attack from deployments; whether the missile launch was separately ordered by the central leadership or delegated to a base command; the precise military losses; or the detailed legal findings on the CEO\./);
  const UNTIL = await p('EV-RD-UNTIL-AUTHORED', /Until authored, those are open facts, not grounds to fabricate an answer\./);
  const UNSPECIFIED = await p('EV-RD-UNSPECIFIED', /Do not invent the CEO's identity, company name, bank name, missile type, exact casualties, precise attack hour, disputed intelligence evidence, or a final judicial verdict\./);

  const states = ['nar:nation:reltronland', 'nar:nation:depcutland'];
  const war = 'nar:conflict:reltronland-vs-depcutland';
  k.constraint('c-sequence', 'The five-step sequence is the determinate record; it is not rewritten here.', [SEQ1, SEQ2, SEQ3, SEQ4, SEQ5]);
  k.constraint('c-open-facts', 'Facts the record leaves open stay open until authored.', [OPEN, UNTIL]);
  k.constraint('c-unspecified', 'Unspecified operational details are not invented.', [UNSPECIFIED]);
  k.assumptions.push('The tree examines decisions the record documents. Counterfactual branches are speculation and are labeled as such.');
  // The record lists these two facts as not yet specified. They are supplied as MISSING only while that sentence is verified.
  if (k.verified(OPEN)) {
    k.fact('invasion_order_evidence', null, { state: 'MISSING', source: 'Listed by the dossier as not yet specified.', evidence_ids: [OPEN], canon_status: 'INSUFFICIENT_DATA' });
    k.fact('launch_command_authority', null, { state: 'MISSING', source: 'Listed by the dossier as not yet specified.', evidence_ids: [OPEN], canon_status: 'INSUFFICIENT_DATA' });
  }

  k.node({ id: 'root', type: 'ROOT', label: 'The outbreak of 1048 BAC', description: 'The decisions that turned a financial and legal crisis into open war, as recorded in production main.', evidence_ids: [] });
  k.node({ id: 'record', type: 'EVIDENCE', label: 'Determinate historical sequence', description: 'Five steps the dossier lists in order.', evidence_ids: [SEQ1, SEQ2, SEQ3, SEQ4, SEQ5] });
  k.node({ id: 'point', type: 'DECISION', label: 'Decision to examine', description: 'Choose one documented decision.', evidence_ids: [], question: 'Which decision in the sequence do you want to examine?' });
  k.node({ id: 'ceo', type: 'DECISION', label: 'The CEO', description: 'Follow the record or explore a counterfactual.', evidence_ids: [SEQ1], question: 'Follow the record or explore a counterfactual?' });
  k.node(outcome('o-ceo-record', 'As recorded', 'The documented decision and its documented effect.', [
    ['The CEO engaged in patent-violating trade and was arrested in Reltronepolis.', 'VERIFIED_SOURCE_GROUNDED', 'HISTORICAL_MEMORY', [SEQ1]],
    ['The arrest triggered an acute political crisis, while the military intentions of both states were already embedded in a larger financial contest.', 'VERIFIED_SOURCE_GROUNDED', 'HISTORICAL_MEMORY', [EMBEDDED]],
  ], { consistency_risks: [{ text: 'The identity of the CEO, the company and the legal findings are unspecified and must not be invented.', evidence_ids: [UNSPECIFIED] }],
    open_questions: ['The identity of the CEO and the detailed legal findings.'], affected_entities: [...states, war] }));
  k.node(outcome('o-ceo-counterfactual', 'Counterfactual: no illegal trade', 'Not part of the record.', [
    ['If the CEO had not traded illegally, what follows is not stated by any source.', 'PURE_SPECULATION', 'HISTORICAL_MEMORY', []],
  ], { consistency_risks: [{ text: 'A counterfactual in which the war is simply avoided would ignore that the crisis preceded the incident.', evidence_ids: [EMBEDDED, NOT_ENTIRE] }], open_questions: ['Every consequence of the counterfactual is an author decision.'], affected_entities: states }));
  k.node({ id: 'c-order', type: 'CONDITION', label: 'Evidence behind the first military order', description: 'Depcutland ordered the first military operation. Whether it held evidence of an invasion order is a separate fact.', evidence_ids: [SEQ2],
    question: 'Does the record establish that Depcutland held a verifiable invasion order?', predicate: { op: 'PRESENT', fact: 'invasion_order_evidence' } });
  k.node(outcome('o-order-established', 'Established by a later source', 'Reached only when a production source assigns this fact.', [
    ['A later production source assigns the fact; this tree then follows that source.', 'NARRATIVE_HYPOTHESIS', 'HISTORICAL_MEMORY', []],
  ], { open_questions: ['The content of that future source.'], affected_entities: states }));
  k.node(noData('n-order-open', 'Not established in the record', ['Whether Depcutland held a verifiable Reltronland invasion order or inferred imminent attack from deployments.'], [OPEN, UNTIL]));
  k.node(noData('n-order-unknown', 'Cannot tell from the pinned source', ['The sentence that lists the open facts was not found, so this tree cannot say whether the record establishes the fact.']));
  k.node(outcome('o-posture', 'Blockade and prospective invasion', 'The documented posture of Reltronland.', [
    ['Reltronland detected and blocked the movement while retaining a prospective invasion plan for the recovery of overdue debt.', 'VERIFIED_SOURCE_GROUNDED', 'HISTORICAL_MEMORY', [SEQ3]],
    ['An unpaid claim creates no automatic right to invade debtor territory.', 'VERIFIED_SOURCE_GROUNDED', 'SOVEREIGNTY', [NO_RIGHT]],
  ], { open_questions: ['Who authorized the invasion planning is not part of the five-step sequence.'], affected_entities: [...states, war] }));
  k.node({ id: 'c-launch', type: 'CONDITION', label: 'Authority behind the missile launch', description: 'Depcutland fired the first missiles. Who ordered the launch is a separate fact.', evidence_ids: [SEQ4],
    question: 'Does the record establish who ordered the launch?', predicate: { op: 'PRESENT', fact: 'launch_command_authority' } });
  k.node(outcome('o-launch-established', 'Established by a later source', 'Reached only when a production source assigns this fact.', [
    ['A later production source assigns the fact; this tree then follows that source.', 'NARRATIVE_HYPOTHESIS', 'HISTORICAL_MEMORY', []],
  ], { open_questions: ['The content of that future source.'], affected_entities: states }));
  k.node(noData('n-launch-open', 'Chain of command not established', ['Whether the launch was separately ordered by the central leadership or delegated to a base command.'], [OPEN, UNTIL]));
  k.node(noData('n-launch-unknown', 'Cannot tell from the pinned source', ['The sentence that lists the open facts was not found, so this tree cannot say whether the record establishes the fact.']));

  k.branch('b-root', 'root', 'record', 'Continue');
  k.branch('b-record', 'record', 'point', 'Continue', { evidence_ids: [SEQ5] });
  const opt = (id: string, from: string, to: string, label: string, rationale: string, evidence_ids: string[], extra = {}) => k.branch(id, from, to, label, { rationale, evidence_ids, uncertainty: 'SOURCE_STATED', review_requirements: AUTHORING, ...extra });
  opt('opt-ceo', 'point', 'ceo', 'The CEO: patent-violating trade under debt pressure', 'Step 1 of the sequence.', [SEQ1]);
  opt('opt-order', 'point', 'c-order', 'Depcutland: the first military order', 'Step 2 of the sequence.', [SEQ2]);
  opt('opt-posture', 'point', 'o-posture', 'Reltronland: blockade and prospective invasion', 'Step 3 of the sequence.', [SEQ3], { outcome_class: 'VERIFIED_SOURCE_GROUNDED' });
  opt('opt-launch', 'point', 'c-launch', 'Depcutland: the missile launch', 'Step 4 of the sequence.', [SEQ4]);
  opt('opt-ceo-record', 'ceo', 'o-ceo-record', 'Follow the record', 'The documented decision.', [SEQ1, EMBEDDED], { outcome_class: 'VERIFIED_SOURCE_GROUNDED' });
  opt('opt-ceo-counterfactual', 'ceo', 'o-ceo-counterfactual', 'Explore a counterfactual', 'Not part of the record.', [], { uncertainty: 'SPECULATIVE', outcome_class: 'PURE_SPECULATION', assumptions: ['The CEO does not trade illegally.'] });
  for (const [cond, yes, no, unknown] of [['c-order', 'o-order-established', 'n-order-open', 'n-order-unknown'], ['c-launch', 'o-launch-established', 'n-launch-open', 'n-launch-unknown']] as const) {
    k.branch(`${cond}-true`, cond, yes, 'The record establishes it', { when: 'TRUE', uncertainty: 'DETERMINISTIC', outcome_class: 'NARRATIVE_HYPOTHESIS' });
    k.branch(`${cond}-false`, cond, no, 'The record lists it as open', { when: 'FALSE', uncertainty: 'DETERMINISTIC', evidence_ids: [OPEN] });
    k.branch(`${cond}-unknown`, cond, unknown, 'Unknown', { when: 'UNKNOWN', uncertainty: 'DETERMINISTIC' });
  }
  k.connect('o-ceo-record', { evidenceOf: [SEQ1, EMBEDDED], dependentsOf: [`document:${RVD_PATH}`] });
  k.connect('o-ceo-counterfactual', { speculativeOn: states });
  k.connect('o-posture', { evidenceOf: [SEQ3, NO_RIGHT] });
  return k.finish({
    slug: 'outbreak-1048-bac-decisions', type: 'HISTORICAL_SCENARIO', purposes: ['HISTORICAL_SCENARIO', 'CHARACTER_DECISION'], root: 'root', canon_status: 'SCENARIO',
    title: 'The outbreak of 1048 BAC: documented decisions and open facts',
    description: 'Each documented decision of the outbreak with its recorded consequence. Facts the record leaves open end in an insufficient-data state; counterfactuals are speculation.',
    question: 'What did each decision lead to, and what does the record leave open?', paths: [RVD_PATH],
  });
}

/** 3. Restructuring a long series document (from the measured split plan). */
export function refactoringTree(input: TreeInputs): DecisionTree | null {
  const plan = input.creative.refactoring_plans.find((p) => p.operation === 'SPLIT_NARRATIVE_ARC');
  const doc = plan?.affected_documents.find((d) => d.side === 'production');
  if (!plan || !doc) return null;
  const k = new TreeKit(input);
  const node = `document:${doc.path}`;
  const linking = input.graph.edges.filter((e) => e.type === 'REFERENCES' && e.target === node && e.status === 'VERIFIED' && e.source.startsWith('document'));
  const drafts = plan.affected_documents.filter((d) => d.side === 'remodeling');
  const unit = plan.current_structure.units[0]!;
  const LENGTH = k.measure('EV-RF-LENGTH', doc.path, `${doc.path}: ${unit.line_count} lines, ${unit.role}.`);
  const LINKS = k.measure('EV-RF-LINKS', doc.path, `${linking.length} document${linking.length === 1 ? '' : 's'} link to ${doc.path} with a verified Markdown link.`);
  const DRAFTS = drafts.map((d, i) => k.measure(`EV-RF-REMODELING-${i + 1}`, d.path, `${d.path} exists only in the remodeling repository.`, 'remodeling'));
  const graphKnown = input.graph.nodes.some((n) => n.id === node);
  k.fact('document_lines', unit.line_count, { unit: 'lines', source: 'Measured from the pinned blob.', evidence_ids: [LENGTH], canon_status: 'CANON_DERIVED' });
  if (graphKnown) k.fact('incoming_links', linking.length, { unit: 'documents', source: 'Verified Markdown links in the knowledge graph.', evidence_ids: [LINKS], canon_status: 'CANON_DERIVED' });
  k.fact('remodeling_only_companions', drafts.length, { unit: 'documents', source: 'Series documents that exist only in the remodeling repository (drift audit).', evidence_ids: DRAFTS, canon_status: 'PROPOSED' });
  k.constraint('r-links', 'Links and anchors that point to the document must keep resolving.', [LINKS], 'REVIEW_RULE');
  k.constraint('r-proposal', 'A structural change is a proposal. This application never changes a source repository.', [], 'METHOD_RULE');
  k.assumptions.push('The options concern structure only. No statement of canon is added or removed by any of them.');

  k.node({ id: 'root', type: 'ROOT', label: 'A long series document', description: `${doc.path} is ${unit.line_count} lines in one file.`, evidence_ids: [] });
  k.node({ id: 'measured', type: 'EVIDENCE', label: 'What was measured', description: 'Length, sections, linking documents and remodeling-only companions.', evidence_ids: [LENGTH, LINKS, ...DRAFTS] });
  k.node({ id: 'structure', type: 'DECISION', label: 'Structure', description: 'A creator decision about document structure.', evidence_ids: [], question: 'What should happen to the document?' });
  k.node({ id: 'c-links', type: 'CONDITION', label: 'Linking documents', description: 'A split moves text that other documents may point to.', evidence_ids: [LINKS], question: 'Do other documents link to it?', predicate: { op: 'GREATER_THAN', fact: 'incoming_links', value: 0, unit: 'documents' } });
  k.node({ id: 'g-anchors', type: 'REVIEW_GATE', label: 'Anchor review', description: 'A human check before a split is proposed.', evidence_ids: [LINKS], question: 'Have the links and anchors that must keep resolving been listed?' });
  k.node(outcome('o-split-ready', 'Split can be proposed', 'The dependents are known and listed.', [
    [`A split is safe for links only if the ${linking.length} linking documents keep resolving. They are listed as dependents.`, 'DEPENDENCY_SUPPORTED', 'NARRATIVE_STRUCTURE', [LINKS]],
    ['Whether separate documents read better is a creative judgment.', 'NARRATIVE_HYPOTHESIS', 'NARRATIVE_STRUCTURE', []],
  ], { consistency_risks: [{ text: 'Parallels across sections are harder to see unless the new documents link to each other.', evidence_ids: [] }], open_questions: ['Names and boundaries of the new documents.'], affected_entities: plan.affected_entities }));
  k.node(review('o-split-hold', 'List the anchors first', 'INVESTIGATE', 'List the linking documents and the anchors they use before proposing the split.', [LINKS]));
  k.node(outcome('o-split-free', 'Split cannot break a verified link', 'No document links to it.', [
    ['No document links to this file with a verified Markdown link, so a split cannot break one.', 'VERIFIED_SOURCE_GROUNDED', 'NARRATIVE_STRUCTURE', [LINKS]],
  ], { open_questions: ['Names and boundaries of the new documents.'], affected_entities: plan.affected_entities }));
  k.node(noData('n-links', 'Linking documents unknown', ['The document has no node in the knowledge graph, so its linking documents were not counted.']));
  k.node(outcome('o-preserve', 'Keep one document', 'No structural change.', [
    [`The document stays as it is: ${unit.line_count} lines in one file. No link or anchor changes.`, 'VERIFIED_SOURCE_GROUNDED', 'NARRATIVE_STRUCTURE', [LENGTH]],
    ['Remodeling-only documents stay proposals.', 'NARRATIVE_HYPOTHESIS', 'NARRATIVE_STRUCTURE', DRAFTS],
  ], { open_questions: ['Whether editing a file of this length remains practical is a judgment for the creator.'], affected_entities: plan.affected_entities }));
  k.node({ id: 'g-order', type: 'REVIEW_GATE', label: 'Order review', description: 'Order can carry meaning.', evidence_ids: [], question: 'Has the creator confirmed that the present order carries no intended ambiguity?' });
  k.node(outcome('o-reorder', 'Reorder sections', 'A different order of the same text.', [
    ['A different order may read more clearly. Whether it does is a creative judgment.', 'NARRATIVE_HYPOTHESIS', 'NARRATIVE_STRUCTURE', []],
  ], { consistency_risks: [{ text: 'Reordering can remove an ambiguity that the present order was meant to carry.', evidence_ids: [] }], open_questions: ['The new order.'], affected_entities: plan.affected_entities }));
  k.node(review('o-reorder-hold', 'Do not reorder yet', 'DEFER', 'Keep the order until the creator confirms that it carries no intended ambiguity.'));
  k.node({ id: 'c-companions', type: 'CONDITION', label: 'Remodeling-only companions', description: 'Companion documents that exist only as proposals cannot be merged in production.', evidence_ids: DRAFTS, question: 'Do the companion documents exist only in remodeling?', predicate: { op: 'GREATER_THAN', fact: 'remodeling_only_companions', value: 0, unit: 'documents' } });
  k.node(review('o-merge-nothing', 'Nothing to merge in production', 'NO_ACTION', `The ${drafts.length} companion document${drafts.length === 1 ? '' : 's'} found by the drift audit exist only in remodeling, so there is nothing to merge in production.`, DRAFTS));
  k.node(outcome('o-merge-review', 'Merge is an open creative question', 'No remodeling-only companion was found.', [
    ['Which production documents count as companions of this one, and whether merging them helps, is a creative judgment. No source states it.', 'NARRATIVE_HYPOTHESIS', 'NARRATIVE_STRUCTURE', []],
  ], { open_questions: ['Which documents are companions.'], affected_entities: plan.affected_entities }));

  k.branch('b-root', 'root', 'measured', 'Continue');
  k.branch('b-measured', 'measured', 'structure', 'Continue');
  const opt = (id: string, to: string, label: string, rationale: string) => k.branch(id, 'structure', to, label, { rationale, uncertainty: 'INFERRED', review_requirements: ['Creator decision. A proposal only.'] });
  opt('opt-split', 'c-links', 'Split into linked documents', plan.rationale);
  opt('opt-preserve', 'o-preserve', 'Keep one document', 'Leave the structure as it is.');
  opt('opt-reorder', 'g-order', 'Reorder sections', 'Change the order of sections without changing their text.');
  opt('opt-merge', 'c-companions', 'Merge with companion documents', 'Combine companion documents into this one.');
  k.branch('c-links-true', 'c-links', 'g-anchors', 'Yes', { when: 'TRUE', uncertainty: 'DETERMINISTIC', evidence_ids: [LINKS] });
  k.branch('c-links-false', 'c-links', 'o-split-free', 'No', { when: 'FALSE', uncertainty: 'DETERMINISTIC', evidence_ids: [LINKS], outcome_class: 'VERIFIED_SOURCE_GROUNDED' });
  k.branch('c-links-unknown', 'c-links', 'n-links', 'Unknown', { when: 'UNKNOWN', uncertainty: 'DETERMINISTIC' });
  k.branch('g-anchors-yes', 'g-anchors', 'o-split-ready', 'Yes, they are listed', { uncertainty: 'DETERMINISTIC', outcome_class: 'DEPENDENCY_SUPPORTED', review_requirements: ['Reviewer confirms the list.'] });
  k.branch('g-anchors-no', 'g-anchors', 'o-split-hold', 'Not yet', { uncertainty: 'DETERMINISTIC', outcome_class: 'REVIEW_RECOMMENDATION' });
  k.branch('g-order-yes', 'g-order', 'o-reorder', 'Confirmed', { uncertainty: 'SPECULATIVE', outcome_class: 'NARRATIVE_HYPOTHESIS', review_requirements: ['Creator confirmation.'] });
  k.branch('g-order-no', 'g-order', 'o-reorder-hold', 'Not confirmed', { uncertainty: 'DETERMINISTIC', outcome_class: 'REVIEW_RECOMMENDATION' });
  k.branch('c-companions-true', 'c-companions', 'o-merge-nothing', 'Yes', { when: 'TRUE', uncertainty: 'DETERMINISTIC', outcome_class: 'REVIEW_RECOMMENDATION' });
  k.branch('c-companions-false', 'c-companions', 'o-merge-review', 'No', { when: 'FALSE', uncertainty: 'DETERMINISTIC', outcome_class: 'NARRATIVE_HYPOTHESIS' });
  k.connect('o-split-ready', { dependentsOf: [node], evidenceOf: [LINKS] });
  k.connect('o-preserve', { evidenceOf: [LENGTH] });
  return k.finish({
    slug: `restructure-${doc.path}`, type: 'STORY_REFACTORING', root: 'root', canon_status: 'PROPOSED',
    title: `Restructuring ${doc.path.split('/').pop()}: split, keep, reorder or merge`,
    description: 'Four structural alternatives for a long series document, with measured facts and the reviews each alternative needs. A proposal only.',
    question: 'Should the document be split, kept, reordered or merged?', paths: [doc.path, ...drafts.map((d) => d.path)],
  });
}

/** 4. A remodeling value that differs from production: the land area of Beluftner. */
export function remodelingTree(input: TreeInputs): DecisionTree | null {
  const { stats, audit } = input;
  const land = audit.findings.find((f) => f.file_path === stats.dataset_path && f.level === 'FIELD' && f.entity?.name === 'Beluftner' && /^land_area/.test(f.field ?? '') && typeof f.production.value === 'number' && typeof f.remodeling.value === 'number');
  const prodLand = canonValue(stats, 'country:beluftner', 'land_area');
  const prodPop = canonValue(stats, 'country:beluftner', 'population');
  const draftLand = stats.proposals.find((o) => o.entity_id === 'country:beluftner' && o.indicator_id === 'land_area' && o.value !== null) ?? null;
  if (!land || !prodLand || !prodPop || prodLand.value !== land.production.value) return null;
  const k = new TreeKit(input);
  const PROD_LAND = k.dataset('EV-BL-PRODUCTION-LAND', prodLand, 'Land area in production main');
  const PROD_POP = k.dataset('EV-BL-PRODUCTION-POPULATION', prodPop, 'Population in production main');
  const DRIFT = k.finding('EV-BL-DRIFT', land);
  const statusFinding = audit.findings.find((f) => f.file_path === stats.dataset_path && f.entity?.name === 'Beluftner' && f.field === 'land_area_status');
  const STATUS = statusFinding ? k.finding('EV-BL-STATUS-LABEL', statusFinding) : null;
  const qa = (list: QaCheck[]) => list.find((q) => q.id === 'QA-LAND-AREA-BOUND');
  const QA_PROD = k.qa('EV-BL-QA-PRODUCTION', qa(input.qaProduction), 'production', stats.dataset_path);
  const QA_DRAFT = k.qa('EV-BL-QA-REMODELING', qa(input.qaRemodeling), 'remodeling', stats.dataset_path);
  const prodArea = land.production.value as number;
  const draftArea = land.remodeling.value as number;
  const year0 = { start_bac: 0, end_bac: 0 };
  k.fact('production_land_area', prodArea, { unit: prodLand.unit, period: year0, canon_status: prodLand.status, source: `${prodLand.source.pointer ?? 'land area'} in production main`, evidence_ids: [PROD_LAND] });
  k.fact('remodeling_land_area', draftArea, { unit: draftLand?.unit ?? null, period: draftLand ? year0 : null, canon_status: 'PROPOSED', source: 'Remodeling dataset (a proposal)', evidence_ids: [DRIFT] });
  if (qa(input.qaRemodeling)) k.fact('qa_land_bound_remodeling', qa(input.qaRemodeling)!.result, { source: 'QA-LAND-AREA-BOUND on the remodeling dataset', evidence_ids: [QA_DRAFT], canon_status: 'PROPOSED' });
  const comparable = prodPop.unit === 'billion sentients' && prodLand.unit === 'million km²';
  const density = (area: number) => Number(((prodPop.value! * 1e9) / (area * 1e6)).toPrecision(6));
  const densityText = comparable ? ` Derived density: ${density(prodArea)} sentients per km² (population ÷ land area).` : '';
  const adoptText = comparable ? ` Derived density would become ${density(draftArea)} sentients per km² (${Number((((density(draftArea) - density(prodArea)) / density(prodArea)) * 100).toPrecision(4))}%).` : '';
  k.constraint('c-production', `Production main records ${prodArea} ${prodLand.unit} for Beluftner.`, [PROD_LAND]);
  k.constraint('r-publication', 'Only a creator commit to the production repository changes a production value. This application cannot make one.', [], 'METHOD_RULE');
  k.assumptions.push('The population is taken from production main for both alternatives.');

  k.node({ id: 'root', type: 'ROOT', label: 'A remodeling value differs from production', description: `Remodeling proposes ${draftArea} where production main records ${prodArea} ${prodLand.unit}.`, evidence_ids: [] });
  k.node({ id: 'values', type: 'EVIDENCE', label: 'The two values', description: 'The production value, the drift finding and the status label the remodeling dataset attaches to its value.', evidence_ids: [PROD_LAND, DRIFT, ...(STATUS ? [STATUS] : [])] });
  k.node({ id: 'c-comparable', type: 'CONDITION', label: 'Comparable values', description: 'Unit and period must match before two values are compared.', evidence_ids: [PROD_LAND, DRIFT], question: 'Are both values in the same unit and period?',
    predicate: { op: 'ALL', of: [{ op: 'COMPATIBLE_UNIT', a: 'production_land_area', b: 'remodeling_land_area' }, { op: 'COMPATIBLE_PERIOD', a: 'production_land_area', b: 'remodeling_land_area' }] } });
  k.node(review('o-not-comparable', 'Values are not comparable', 'INVESTIGATE', 'The two values differ in unit or period. Resolve that before any review of the proposal.', [DRIFT]));
  k.node(noData('n-comparable', 'Unit or period unknown', ['The unit or the period of the remodeling value is not recorded, so the values cannot be compared.'], [DRIFT]));
  k.node({ id: 'c-identity', type: 'CONDITION', label: 'Land-area identity', description: 'A deterministic check of the dataset.', evidence_ids: [QA_DRAFT, QA_PROD], question: 'Does the land-area identity hold on the remodeling dataset?', predicate: { op: 'EQUALS', fact: 'qa_land_bound_remodeling', value: 'PASS' } });
  k.node(review('o-identity-fails', 'The proposal breaks an identity', 'INVESTIGATE', 'The remodeling dataset fails the land-area identity. Return the proposal to remodeling review.', [QA_DRAFT]));
  k.node(noData('n-identity', 'Identity not evaluated', ['The land-area identity was not evaluated on the remodeling dataset.'], [QA_DRAFT]));
  k.node({ id: 'decide', type: 'DECISION', label: 'Creator decision', description: 'Only the creator decides what happens to a proposal.', evidence_ids: [], question: 'What should happen to the proposal?' });
  k.node(outcome('o-keep', `Keep ${prodArea} ${prodLand.unit}`, 'Production main is unchanged.', [
    [`Production main keeps ${prodArea} ${prodLand.unit} and a population of ${prodPop.value} ${prodPop.unit}.${densityText}`, 'VERIFIED_SOURCE_GROUNDED', 'STATISTICS', [PROD_LAND, PROD_POP]],
    ['The remodeling value stays a proposal.', 'NARRATIVE_HYPOTHESIS', 'STATISTICS', [DRIFT]],
  ], { open_questions: ['Whether the remodeling repository keeps its value.'], affected_entities: ['entity:country:beluftner', 'nar:nation:beluftner'] }));
  k.node({ id: 'g-prose', type: 'REVIEW_GATE', label: 'Prose review', description: 'Prose may describe the territory.', evidence_ids: [], question: 'Has prose that describes the territory of Beluftner been reviewed?' });
  k.node(outcome('o-adopt', `Adopt ${draftArea} ${prodLand.unit} in production`, 'A creator commit to the production repository.', [
    [`If the creator publishes ${draftArea} ${prodLand.unit}, the production dataset changes and every record it defines is touched by that change.${adoptText}`, 'DEPENDENCY_SUPPORTED', 'STATISTICS', [DRIFT, PROD_POP]],
    ['How the described character of the territory changes is not stated by any source.', 'PURE_SPECULATION', 'CIVILIAN_LIFE', []],
  ], { consistency_risks: [{ text: 'Prose and derived figures that rest on the present value would need the same change.', evidence_ids: [PROD_LAND] }], open_questions: ['Which documents describe the territory.'], affected_entities: ['entity:country:beluftner', 'nar:nation:beluftner'] }));
  k.node(review('o-adopt-hold', 'Review the prose first', 'DEFER', 'Review the prose that describes the territory before the value is adopted.'));
  k.node(review('o-defer', 'Leave the proposal in remodeling', 'DEFER', 'The proposal stays in the remodeling repository. Production main is unchanged.', [DRIFT]));

  k.branch('b-root', 'root', 'values', 'Continue');
  k.branch('b-values', 'values', 'c-comparable', 'Continue');
  k.branch('c-comparable-true', 'c-comparable', 'c-identity', 'Same unit and period', { when: 'TRUE', uncertainty: 'DETERMINISTIC' });
  k.branch('c-comparable-false', 'c-comparable', 'o-not-comparable', 'Different unit or period', { when: 'FALSE', uncertainty: 'DETERMINISTIC', outcome_class: 'REVIEW_RECOMMENDATION' });
  k.branch('c-comparable-unknown', 'c-comparable', 'n-comparable', 'Unknown', { when: 'UNKNOWN', uncertainty: 'DETERMINISTIC' });
  k.branch('c-identity-true', 'c-identity', 'decide', 'Identity holds', { when: 'TRUE', uncertainty: 'DETERMINISTIC', evidence_ids: [QA_DRAFT] });
  k.branch('c-identity-false', 'c-identity', 'o-identity-fails', 'Identity fails', { when: 'FALSE', uncertainty: 'DETERMINISTIC', evidence_ids: [QA_DRAFT], outcome_class: 'REVIEW_RECOMMENDATION' });
  k.branch('c-identity-unknown', 'c-identity', 'n-identity', 'Unknown', { when: 'UNKNOWN', uncertainty: 'DETERMINISTIC' });
  const opt = (id: string, to: string, label: string, rationale: string, extra = {}) => k.branch(id, 'decide', to, label, { rationale, uncertainty: 'INFERRED', review_requirements: ['Creator decision.'], ...extra });
  opt('opt-keep', 'o-keep', `Keep ${prodArea} ${prodLand.unit}`, 'Production main is authoritative as it stands.', { evidence_ids: [PROD_LAND], outcome_class: 'VERIFIED_SOURCE_GROUNDED' });
  opt('opt-adopt', 'g-prose', `Adopt ${draftArea} ${prodLand.unit} in production`, 'Requires a creator commit to the production repository.', { evidence_ids: [DRIFT] });
  opt('opt-defer', 'o-defer', 'Leave the proposal in remodeling', 'No decision now.', { outcome_class: 'REVIEW_RECOMMENDATION' });
  k.branch('g-prose-yes', 'g-prose', 'o-adopt', 'Reviewed', { uncertainty: 'INFERRED', outcome_class: 'DEPENDENCY_SUPPORTED', review_requirements: ['Reviewer confirms the prose review.'] });
  k.branch('g-prose-no', 'g-prose', 'o-adopt-hold', 'Not reviewed', { uncertainty: 'DETERMINISTIC', outcome_class: 'REVIEW_RECOMMENDATION' });
  k.connect('o-adopt', { dependentsOf: [`dataset:${stats.dataset_path}`], candidatesOf: ['entity:country:beluftner'], evidenceOf: [DRIFT] });
  k.connect('o-keep', { evidenceOf: [PROD_LAND] });
  return k.finish({
    slug: 'beluftner-land-area-proposal', type: 'WORLDBUILDING_REMODELING', root: 'root', canon_status: 'PROPOSED',
    title: `Beluftner land area: ${prodArea} or ${draftArea} ${prodLand.unit}`,
    description: 'Decision support for a remodeling value that differs from production: comparability and identity checks first, then the creator decision with the consequence of each alternative.',
    question: 'What should happen to the remodeling proposal for the land area of Beluftner?', paths: [stats.dataset_path],
  });
}

/** 5. Triage of a narrative consistency finding. Evaluated per finding with facts derived from it. */
export function triageTree(input: TreeInputs): DecisionTree {
  const k = new TreeKit(input);
  k.constraint('r-no-auto-change', 'The tree recommends a review action. It never changes canon.', [], 'REVIEW_RULE');
  k.constraint('r-unknown', 'A condition that cannot be evaluated ends in an insufficient-data state, never in a default action.', [], 'METHOD_RULE');
  k.assumptions.push('Facts are derived from one consistency finding and its cited passages.');
  const cond = (id: string, label: string, question: string, predicate: DecisionNode['predicate']) => k.node({ id, type: 'CONDITION', label, description: question, evidence_ids: [], question, predicate });
  k.node({ id: 'root', type: 'ROOT', label: 'A consistency finding', description: 'A finding of the narrative consistency audit needs a review decision.', evidence_ids: [] });
  cond('c-source', 'Source identity', 'Is the source identity verified?', { op: 'EQUALS', fact: 'source_identity_verified', value: true });
  cond('c-period', 'Historical period', 'Are the compared observations from compatible historical periods?', { op: 'ANY', of: [{ op: 'EQUALS', fact: 'comparison_kind', value: 'SINGLE_PASSAGE' }, { op: 'COMPATIBLE_PERIOD', a: 'period_a', b: 'period_b' }] });
  cond('c-explicit', 'Explicit contradiction', 'Is the contradiction explicit and independently reproducible?', { op: 'ALL', of: [{ op: 'EQUALS', fact: 'deterministic_rule', value: true }, { op: 'EQUALS', fact: 'is_defect', value: true }] });
  cond('c-side', 'Authority', 'Is the contradiction in production canon?', { op: 'EQUALS', fact: 'finding_side', value: 'production' });
  cond('c-ambiguity', 'Intentional ambiguity', 'Could the apparent contradiction be intentional ambiguity or a perspective?', { op: 'MEMBER_OF', fact: 'classification', values: ['INTENTIONAL_AMBIGUITY', 'UNRELIABLE_NARRATOR_POSSIBILITY'] });
  cond('c-evidence', 'Sufficient evidence', 'Is there sufficient evidence to recommend a change?', { op: 'ALL', of: [{ op: 'GREATER_THAN', fact: 'verified_passages', value: 0, unit: 'passages' }, { op: 'NOT', of: [{ op: 'EQUALS', fact: 'classification', value: 'INSUFFICIENT_EVIDENCE' }] }] });
  k.node(review('o-reingest', 'Re-run ingestion', 'INVESTIGATE', 'A cited passage does not match the pinned blob. Re-run ingestion and re-check the citation before reviewing the finding.'));
  k.node(noData('n-source', 'Source identity unknown', ['Whether the cited passages match the pinned blobs.']));
  k.node(review('o-periods-differ', 'Different periods', 'PRESERVE', 'The observations belong to different historical periods. Record the difference as change over time, not as a contradiction.'));
  k.node(review('o-periods-unknown', 'Establish the periods', 'INVESTIGATE', 'The period of at least one observation is not recorded. Establish both periods before judging the difference.'));
  k.node(review('o-escalate', 'Escalate to the creator', 'ESCALATE_TO_CREATOR', 'A deterministic rule proves a contradiction in production canon. Escalate it to the creator with the evidence. No change is made automatically.'));
  k.node(review('o-return-remodeling', 'Return to remodeling review', 'DEFER', 'The contradiction is in a remodeling proposal. Return it to remodeling review; production canon is unaffected.'));
  k.node(noData('n-side', 'Side unknown', ['Which source the contradiction belongs to.']));
  k.node(review('o-preserve', 'Preserve', 'PRESERVE', 'The source presents the matter as intentional ambiguity or as a perspective. Preserve it; it is not a defect.'));
  k.node(noData('n-classification', 'Classification unknown', ['The classification of the finding.']));
  k.node(review('o-creator-review', 'Present to the creator', 'ESCALATE_TO_CREATOR', 'Present the finding to the creator as a review candidate with its evidence. No change is recommended automatically.'));
  k.node(review('o-defer', 'Keep open', 'DEFER', 'The evidence is not sufficient to recommend a change. Keep the question open.'));
  k.node(noData('n-evidence', 'Evidence count unknown', ['How many cited passages were verified.']));
  k.node(noData('n-explicit', 'Rule status unknown', ['Whether a deterministic rule produced the finding.']));
  const tf = (cond: string, yes: string, no: string, unknown: string | null, labels: [string, string] = ['Yes', 'No']) => {
    k.branch(`${cond}-true`, cond, yes, labels[0], { when: 'TRUE', uncertainty: 'DETERMINISTIC' });
    k.branch(`${cond}-false`, cond, no, labels[1], { when: 'FALSE', uncertainty: 'DETERMINISTIC' });
    if (unknown) k.branch(`${cond}-unknown`, cond, unknown, 'Unknown', { when: 'UNKNOWN', uncertainty: 'DETERMINISTIC' });
  };
  k.branch('b-root', 'root', 'c-source', 'Continue');
  tf('c-source', 'c-period', 'o-reingest', 'n-source');
  tf('c-period', 'c-explicit', 'o-periods-differ', 'o-periods-unknown');
  tf('c-explicit', 'c-side', 'c-ambiguity', 'n-explicit');
  tf('c-side', 'o-escalate', 'o-return-remodeling', 'n-side', ['Production', 'Remodeling']);
  tf('c-ambiguity', 'o-preserve', 'c-evidence', 'n-classification');
  tf('c-evidence', 'o-creator-review', 'o-defer', 'n-evidence');
  return k.finish({
    slug: 'narrative-consistency-triage', type: 'CONSISTENCY_REVIEW', root: 'root', canon_status: 'REVIEW_AID',
    title: 'Triage of a narrative consistency finding',
    description: 'Six deterministic questions lead from a consistency finding to a recommended review action: escalate, investigate, defer or preserve. The tree never changes canon.',
    question: 'How should a reviewer handle this consistency finding?', paths: [],
  });
}

/** 6. Readiness of a creative opportunity for development. Evaluated per opportunity. */
export function readinessTree(input: TreeInputs): DecisionTree {
  const k = new TreeKit(input);
  k.constraint('r-no-ranking', 'The tree reports a readiness state. It does not rank creative ideas by quality.', [], 'METHOD_RULE');
  k.assumptions.push('Facts are derived from one opportunity: its verified anchors, the consistency findings on its entities and its ordering score.');
  const cond = (id: string, label: string, question: string, predicate: DecisionNode['predicate']) => k.node({ id, type: 'CONDITION', label, description: question, evidence_ids: [], question, predicate });
  k.node({ id: 'root', type: 'ROOT', label: 'A creative opportunity', description: 'An opportunity from the creative roadmap is considered for development.', evidence_ids: [] });
  cond('c-anchors', 'Verified anchors', 'Does the opportunity cite verified canon passages?', { op: 'GREATER_THAN', fact: 'verified_anchors', value: 0, unit: 'passages' });
  cond('c-defects', 'Open contradictions', 'Are there unresolved verified contradictions on its entities?', { op: 'GREATER_THAN', fact: 'open_defects', value: 0, unit: 'findings' });
  cond('c-remodeling', 'Remodeling material', 'Does it depend on remodeling-only material?', { op: 'EQUALS', fact: 'depends_on_remodeling', value: true });
  cond('c-gap', 'Coverage gap', 'Are at least half of its entities thinly connected?', { op: 'WITHIN_RANGE', fact: 'coverage_gap', min: 0.5, max: 1 });
  k.node(review('o-gather', 'Gather evidence first', 'INVESTIGATE', 'The opportunity cites no verified passage. Collect source evidence before developing it.'));
  k.node(noData('n-anchors', 'Anchors unknown', ['How many of its anchors were verified.']));
  k.node(review('o-resolve-first', 'Resolve the contradictions first', 'DEFER', 'A verified contradiction touches its entities. Resolve that finding before building on them.'));
  k.node(review('o-await-creator', 'Explore, but do not author as canon', 'DEFER', 'The opportunity rests on remodeling-only material. It can be explored; authoring waits on the creator’s decision about that material.'));
  k.node(review('o-ready-gap', 'Ready: fills a coverage gap', 'ESCALATE_TO_CREATOR', 'Ready to present to the creator. Most of its entities are thinly connected, so development would add coverage.'));
  k.node(review('o-ready', 'Ready: builds on connected entities', 'ESCALATE_TO_CREATOR', 'Ready to present to the creator. Its entities are already well connected.'));
  k.node(noData('n-defects', 'Findings unknown', ['Whether consistency findings touch its entities.']));
  k.node(noData('n-remodeling', 'Dependence unknown', ['Whether it rests on remodeling-only material.']));
  k.node(noData('n-gap', 'Coverage unknown', ['The coverage gap of its entities.']));
  const tf = (cond: string, yes: string, no: string, unknown: string) => {
    k.branch(`${cond}-true`, cond, yes, 'Yes', { when: 'TRUE', uncertainty: 'DETERMINISTIC' });
    k.branch(`${cond}-false`, cond, no, 'No', { when: 'FALSE', uncertainty: 'DETERMINISTIC' });
    k.branch(`${cond}-unknown`, cond, unknown, 'Unknown', { when: 'UNKNOWN', uncertainty: 'DETERMINISTIC' });
  };
  k.branch('b-root', 'root', 'c-anchors', 'Continue');
  tf('c-anchors', 'c-defects', 'o-gather', 'n-anchors');
  tf('c-defects', 'o-resolve-first', 'c-remodeling', 'n-defects');
  tf('c-remodeling', 'o-await-creator', 'c-gap', 'n-remodeling');
  tf('c-gap', 'o-ready-gap', 'o-ready', 'n-gap');
  return k.finish({
    slug: 'creative-development-readiness', type: 'DEVELOPMENT_PRIORITIZATION', root: 'root', canon_status: 'REVIEW_AID',
    title: 'Readiness of a creative opportunity',
    description: 'Four deterministic questions report whether an opportunity is ready to present to the creator, should wait, or needs evidence first. It reports readiness; it does not judge creative quality.',
    question: 'Is this opportunity ready for development?', paths: [],
  });
}
