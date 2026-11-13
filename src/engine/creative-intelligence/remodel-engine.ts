/**
 * Canon remodeling scenarios and seed proposals.
 *
 * Nothing in this module is typed in from memory. Prose anchors are sentences matched in the
 * pinned production blob (engine/evidence.ts); statistics are read from the observations
 * dataset with their units; remodeling changes come from the drift audit. When a passage or a
 * value is not found, the anchor, perspective or impact entry that needed it is left out.
 * Scenarios are SCENARIO, proposals are PROPOSED or SCENARIO, and none of them is canon.
 */

import type { Audit, Finding } from '../../domain/finding.ts';
import type { KnowledgeGraph } from '../../domain/graph.ts';
import type { Observation, StatisticsDataset } from '../../domain/observation.ts';
import type {
  CreativeOpportunity,
  CreativeProposal,
  NarrativeAuditFinding,
  NarrativeEntity,
  NarrativeRelationship,
  RemodelingScenario,
  ScenarioImpactEntry,
  SimulatedImpactReport,
  StoryRefactoringPlan,
} from '../../domain/creative.ts';
import { simulateNarrativeImpact } from '../../domain/creative.ts';
import type { QaCheck } from '../qa.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { canonicalJson, codeUnitCompare } from '../canonical.ts';
import { findPassage, readLines, type Passage } from '../evidence.ts';
import { sha256Hex } from '../git-objects.ts';
import { parseFrontmatter } from '../markdown.ts';
import { HENCHOWAY_PATH, RVD_PATH } from './extractor.ts';

export { simulateNarrativeImpact, type SimulatedImpactReport };

export const SCENARIO_SLUGS = Object.freeze({
  cooperation: 'reltronland-depcutland-existential-cooperation',
  beluftner: 'beluftner-land-area-demographic-remodeling',
  series: 'remodeling-only-series-documents',
});

export function scenarioId(slug: string): string {
  return `SCN-${sha256Hex(slug).slice(0, 12).toUpperCase()}`;
}
function prpId(slug: string): string {
  return `PRP-${sha256Hex(slug).slice(0, 12).toUpperCase()}`;
}

type Anchor = RemodelingScenario['production_baseline']['anchors'][number];
const num = (v: number, digits = 6) => Number(v.toPrecision(digits));
const cite = (p: Passage) => `“${p.quote}” (${p.path}:${p.line})`;

/** Current canon Year 0 value of an indicator for an entity. */
export function canonValue(stats: StatisticsDataset, entityId: string, indicatorId: string): Observation | null {
  return stats.observations.find((o) => o.entity_id === entityId && o.indicator_id === indicatorId && o.period.year_bac === 0 && !o.period.interval && !o.evidence
    && o.value !== null && (o.status === 'CANON_OBSERVED' || o.status === 'CANON_DERIVED')) ?? null;
}

export async function buildRemodelingScenarios(input: {
  audit: Audit;
  stats: StatisticsDataset;
  qaProduction: QaCheck[];
  qaRemodeling: QaCheck[];
  graph: KnowledgeGraph;
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
}): Promise<RemodelingScenario[]> {
  const { audit, stats, qaProduction, qaRemodeling, production, remodeling } = input;
  const known = new Set([...input.entities.map((e) => e.id), ...input.graph.nodes.map((n) => n.id)]);
  const existing = (ids: string[]) => ids.filter((id) => known.has(id));
  const at = (path: string, re: RegExp) => findPassage(production, path, re);
  const anchor = (label: string, p: Passage | null): Anchor | null => (p ? { label, value: p.quote, path: p.path, commit_sha: p.commit_sha, blob_sha: p.blob_sha, line: p.line, status: 'CANON_OBSERVED' } : null);
  const fileRecord = (path: string) => audit.files.find((f) => f.path === path) ?? null;
  const fileFinding = (path: string): Finding | null => audit.findings.find((f) => f.file_path === path && f.level === 'FILE') ?? null;
  const remodelingState = (path: string): string => {
    const rec = fileRecord(path);
    if (!rec) return 'Not in the compared scope.';
    if (rec.classification === 'IDENTICAL') return 'Byte-identical in remodeling; no proposal.';
    if (rec.classification === 'PRODUCTION_ONLY') return 'Absent from remodeling.';
    if (rec.classification === 'DRAFT_ONLY') return `Exists only in remodeling (${rec.remodeling_bytes ?? 0} bytes).`;
    const diff = fileFinding(path)?.diff;
    return rec.content_nature === 'CONTENT' ? `Content differs in remodeling${diff ? ` (+${diff.added_lines} / −${diff.removed_lines} lines)` : ''}.` : `Differs only by ${rec.content_nature ?? 'format'}.`;
  };
  const scenarios: RemodelingScenario[] = [];

  // 1. Reltronland and Depcutland facing a shared threat.
  if (production.entries.has(RVD_PATH)) {
    const independent = await at(RVD_PATH, /Reltronland \(\d{4} BAC; Troner Rhett\) and Depcutland \(\d{4} BAC; Cutter Glouster\) were independent before the \d{4} BAC Depeisit Economic Crisis\./);
    const treaty = await at(RVD_PATH, /The treaty is not an alliance grounded in affection or an ancestral brotherhood oath\./);
    const noMerge = await at(RVD_PATH, /The states did not merge into a military alliance\./);
    const threats = await at(RVD_PATH, /Their disagreements do not prevent them from repeatedly needing to cooperate on global crises, Henchoway-linked threats and Nytherion-related risks\./);
    const notAllegiance = await at(RVD_PATH, /Explanatory accuracy is not allegiance, operational cooperation is not automatic agreement, and a specific joint response is not a permanent military alliance\./);
    const custody = await at(RVD_PATH, /TCBC is privately governed, not a merged sovereign treasury; the Grand Library\/Endless Library has independent custodial integrity under Depcutland\./);
    const illusion = await at(RVD_PATH, /The very competence with which these neighbors translate one another's objections can create an external illusion of alliance\./);
    const sever = await at(RVD_PATH, /A state that tries to sever the relationship would disrupt not only finance and industry, but its own citizens' families, schools, social worlds and livelihoods\./);
    const planning = await at(RVD_PATH, /Forward Seasons 30–40 are planning evidence, not already completed canon events\./);
    const distinction = await at(RVD_PATH, /Henchoway is an intentional transnational actor; Nytherion Abyss is a wider existential and metaphysical condition\./);
    const rel = { sdi: canonValue(stats, 'country:reltronland', 'sdi'), pop: canonValue(stats, 'country:reltronland', 'population'), share: canonValue(stats, 'country:reltronland', 'gdp_share') };
    const dep = { sdi: canonValue(stats, 'country:depcutland', 'sdi'), pop: canonValue(stats, 'country:depcutland', 'population'), share: canonValue(stats, 'country:depcutland', 'gdp_share') };
    const datasetAnchor = (label: string, o: Observation | null): Anchor | null => (o ? { label, value: `${o.source.pointer ?? o.indicator_id} = ${o.value} ${o.unit}`, path: o.source.path, commit_sha: o.source.commit_sha, blob_sha: o.source.blob_sha, line: null, status: o.status } : null);
    const anchors = [
      anchor('Independent before the Depeisit crisis', independent), anchor('The treaty is not an alliance', treaty), anchor('No military alliance', noMerge),
      anchor('Shared threats require cooperation', threats), anchor('Cooperation is not allegiance', notAllegiance), anchor('Institutions keep their own custody', custody),
      datasetAnchor('Reltronland SDI (Year 0)', rel.sdi), datasetAnchor('Depcutland SDI (Year 0)', dep.sdi),
    ].filter((a): a is Anchor => a !== null);

    const perspective = async (actor_id: string, actor_name: string, path: string, stanceRe: RegExp, constraintRe: RegExp) => {
      const s = await at(path, stanceRe);
      const c = await at(path, constraintRe);
      return s && c && known.has(actor_id)
        ? { actor_id, actor_name, stance: s.quote, fear_or_constraint: c.quote, source_path: path, evidence_line: s.line, evidence_quote: s.quote, constraint_line: c.line, commit_sha: s.commit_sha, blob_sha: s.blob_sha }
        : null;
    };
    const perspectives = (await Promise.all([
      perspective('nar:nation:reltronland', 'Reltronland (compact framing table: civilizational direction; wartime strategic fear)', RVD_PATH,
        /Clarity, agency, action, merit and Astralis Pinnacle/, /Loss of economic continuity and recurrence of Depeisit-type systemic failure/),
      perspective('nar:nation:depcutland', 'Depcutland (compact framing table: civilizational direction; wartime strategic fear)', RVD_PATH,
        /Memory sovereignty, archival credibility, continuity and merit-based reform/, /Loss of industry, independent agency, territory and national continuity/),
      perspective('nar:institution:endless-library-of-depcutland', 'Grand Library of Depcutland, later the Endless Library (1031 BAC assessment; operating principle)', RVD_PATH,
        /audits found a long history of custodial neutrality, international archival trust, preservation of third-party records and no verified political manipulation/, /Institution ≠ regime\. Preserve credible civilizational infrastructure; dismantle captured authority\./),
      perspective('nar:faction:henchoway', 'Henchoway (doctrine; stated core contradiction)', HENCHOWAY_PATH,
        /Adaptive Stillness is the doctrine through which modern Henchoway learns from the costs of crude suppression\./, /The core contradiction: Henchoway needs capable researchers, learning, correction, investment and technical progress to manufacture a world that is less independently transformable\./),
    ])).filter((p): p is NonNullable<typeof p> => p !== null);

    const impact = (dimension: ScenarioImpactEntry['dimension'], tier: ScenarioImpactEntry['verification_tier'], summary: string, nodes: string[], p: Passage | null): ScenarioImpactEntry | null =>
      p ? { dimension, verification_tier: tier, summary, affected_nodes: existing(nodes), evidence_or_constraint: cite(p), quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL' } : null;
    const pair = ['nar:nation:reltronland', 'nar:nation:depcutland'];
    const impacts = [
      impact('HISTORICAL_INTERPRETATION', 'VERIFIED_DIRECT_DEPENDENCY', 'A cooperation storyline has to keep both states sovereign since before the crisis; neither is a product of it.', pair, independent),
      impact('MILITARY_COOPERATION', 'VERIFIED_DIRECT_DEPENDENCY', 'A joint response cannot be written as a permanent military alliance.', pair, notAllegiance),
      impact('INSTITUTIONAL_BEHAVIOR', 'VERIFIED_DIRECT_DEPENDENCY', 'Shared mechanisms cannot merge the treasury or take custody of the library away from Depcutland.', [...pair, 'nar:institution:endless-library-of-depcutland'], custody),
      impact('DIPLOMATIC_STORYLINES', 'VERIFIED_DIRECT_DEPENDENCY', 'Other states may read cooperation as an alliance; the source names this as an illusion.', pair, illusion),
      impact('CIVILIAN_PERCEPTIONS', 'VERIFIED_DIRECT_DEPENDENCY', 'Hard separation is constrained domestically: it would disrupt the citizens of the state that attempts it.', pair, sever),
      impact('EXISTING_NARRATIVE_ARCS', 'CANDIDATE_NARRATIVE_IMPACT', 'Forward seasons that describe cooperation mechanisms are planning evidence. A new storyline may touch them, but they are not completed events.', [...pair, 'nar:narrative_arc:the-abyss-of-comfort'], planning),
      { dimension: 'CHARACTER_MOTIVATIONS', verification_tier: 'SPECULATIVE_BRAINSTORMING', summary: 'The dossier states no character-level consequence for this scenario. Any character storyline is an author decision.', affected_nodes: [],
        evidence_or_constraint: 'No source passage. Speculative by definition.', quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL' } satisfies ScenarioImpactEntry,
      rel.sdi && dep.sdi && rel.pop && dep.pop && rel.share && dep.share ? {
        dimension: 'STATISTICAL_IMPLICATIONS', verification_tier: 'VERIFIED_DIRECT_DEPENDENCY',
        summary: `Year 0 dataset values: Reltronland SDI ${rel.sdi.value}, population ${rel.pop.value} ${rel.pop.unit}, ${num(rel.share.value! * 100, 4)}% of planetary GDP; Depcutland SDI ${dep.sdi.value}, population ${dep.pop.value} ${dep.pop.unit}, ${num(dep.share.value! * 100, 4)}% of planetary GDP. The scenario changes none of these values.`,
        affected_nodes: existing(['entity:country:reltronland', 'entity:country:depcutland', 'indicator:sdi', 'indicator:population', 'indicator:gdp_share']),
        evidence_or_constraint: `${stats.dataset_path} (${stats.model_version ?? 'dataset'}), production main ${production.identity.commit_sha.slice(0, 12)}.`, quantitative_status: 'MATHEMATICALLY_ESTABLISHED',
      } satisfies ScenarioImpactEntry : null,
    ].filter((i): i is ScenarioImpactEntry => i !== null);

    const season = async (n: number, re: RegExp) => {
      const p = await at(RVD_PATH, re);
      if (!p) return null;
      const cells = p.quote.split('|').map((c) => c.trim()).filter(Boolean);
      return { id: `alt-season-${n}`, title: `Season ${n} design in the production source`, premise: cells[1] ?? p.quote, institutional_mechanism: `Limit of inference stated by the source: ${cells[2] ?? ''}`.trim(),
        narrative_payoff: `Planned forward architecture, quoted from ${p.path}:${p.line}. Not a completed event.`, contradiction_risks: planning ? [cite(planning)] : [] };
    };
    const alternatives = (await Promise.all([
      season(30, /Season 30 \| AICR deposits selected records in Depcutland's Endless Library for cross-sovereign redundancy \| Independent custody does not merge government or ownership/),
      season(31, /Season 31 \| Reciprocal Continuity Protocol, with the two institutions preserving evidence of their own possible failures \| Sharing records does not elevate ancestry or replace sovereign judgment/),
      season(39, /Season 39 \| Reltronland calls for early risk mitigation; Depcutland requires pre-remediation provenance; the forum negotiates a minimum interoperable response \| Agreement on limited safety steps is not universal political consensus/),
    ])).filter((a): a is NonNullable<typeof a> => a !== null);

    if (anchors.length && threats) {
      scenarios.push({
        id: scenarioId(SCENARIO_SLUGS.cooperation),
        title: 'Reltronland & Depcutland: cooperating against a shared threat without an alliance',
        question: 'What narrative tensions arise if two sovereign rivals must cooperate against a shared threat?',
        focus_entities: existing(['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:faction:henchoway', 'nar:philosophy:nytherion-abyss', 'nar:institution:endless-library-of-depcutland', 'nar:narrative_arc:the-abyss-of-comfort']),
        production_baseline: {
          summary: `${anchors.length} verified anchors from production main. The dossier states that the two states repeatedly need to cooperate on shared threats and that such cooperation is not an alliance. Each anchor below is quoted from the pinned source.`,
          anchors,
        },
        remodeling_candidate: {
          summary: 'State of the source documents of this scenario in the remodeling repository, taken from the drift audit.',
          changes: [RVD_PATH, HENCHOWAY_PATH].filter((p) => fileRecord(p)).map((p) => ({ label: p, production_value: 'Production main (authoritative)', remodeling_value: remodelingState(p), path: p, finding_id: fileFinding(p)?.id ?? null })),
        },
        perspectives,
        hypothetical_parameters: [
          { id: 'cooperation-mode', label: 'Form of the response (hypothetical)', current_state: 'undecided',
            options: [
              { value: 'undecided', label: 'Undecided', description: 'No direction selected. Use the decision tree to explore each option with its evidence.' },
              { value: 'public', label: 'Cooperate publicly', description: 'A declared, issue-specific joint response.' },
              { value: 'limited-technical', label: 'Cooperate through limited technical institutions', description: 'Narrow mechanisms such as those the source plans for forward seasons.' },
              { value: 'indirect', label: 'Coordinate indirectly', description: 'No declared joint action; coordination through existing ties.' },
              { value: 'refuse', label: 'Refuse cooperation', description: 'Decline joint action.' },
            ] },
          ...(distinction ? [{ id: 'threat-kind', label: 'Kind of threat (hypothetical)', current_state: 'unspecified',
            options: [
              { value: 'unspecified', label: 'Unspecified', description: cite(distinction) },
              { value: 'henchoway', label: 'Henchoway-linked threat', description: 'An intentional transnational actor, as the source distinguishes it.' },
              { value: 'nytherion', label: 'Nytherion-related risk', description: 'A wider existential and metaphysical condition, as the source distinguishes it.' },
            ] }] : []),
        ],
        impact_dimensions: impacts,
        alternatives,
        speculative_assumptions: [
          'The scenario assumes that a new shared threat arises in the present era. No specific event is taken from the source.',
          'No quantitative model of civilian or institutional reaction exists. Such reactions are author decisions.',
        ],
        potential_contradictions: [independent, treaty, noMerge, notAllegiance, custody].filter((p): p is Passage => p !== null).map((p) => `Do not contradict: ${cite(p)}`),
        review_notes: 'A scenario for exploration. Nothing here is canon until the creator publishes it in Reltroner/reltroner-studio.',
        canon_status: 'SCENARIO',
      });
    }
  }

  // 2. Beluftner land area: production value against the remodeling proposal, with derived density.
  const land = audit.findings.find((f) => f.file_path === stats.dataset_path && f.level === 'FIELD' && f.entity?.name === 'Beluftner' && /^land_area/.test(f.field ?? '')
    && typeof f.production.value === 'number' && typeof f.remodeling.value === 'number');
  const belPop = canonValue(stats, 'country:beluftner', 'population');
  const belLand = canonValue(stats, 'country:beluftner', 'land_area');
  if (land && belPop && belLand && belLand.value === land.production.value) {
    const prodArea = land.production.value as number;
    const draftArea = land.remodeling.value as number;
    const draftPop = stats.proposals.find((o) => o.entity_id === 'country:beluftner' && o.indicator_id === 'population' && o.value !== null)?.value ?? belPop.value!;
    const perKm2 = (popBillion: number, areaMillionKm2: number) => num((popBillion * 1e9) / (areaMillionKm2 * 1e6), 6);
    const density = belPop.unit === 'billion sentients' && belLand.unit === 'million km²' ? { prod: perKm2(belPop.value!, prodArea), draft: perKm2(draftPop, draftArea) } : null;
    const status = audit.findings.find((f) => f.file_path === stats.dataset_path && f.entity?.name === 'Beluftner' && f.field === 'land_area_status' && typeof f.remodeling.value === 'string');
    const qa = (list: QaCheck[]) => list.find((q) => q.id === 'QA-LAND-AREA-BOUND')?.result ?? 'NOT_EVALUABLE';
    scenarios.push({
      id: scenarioId(SCENARIO_SLUGS.beluftner),
      title: `Beluftner land area: ${prodArea} ${belLand.unit} in production, ${draftArea} ${belLand.unit} proposed in remodeling`,
      question: `What follows if the land area of Beluftner changes from ${prodArea} to ${draftArea} ${belLand.unit}?`,
      focus_entities: existing(['nar:nation:beluftner', 'entity:country:beluftner', 'indicator:land_area']),
      production_baseline: {
        summary: `Production main records a land area of ${prodArea} ${belLand.unit} and a population of ${belPop.value} ${belPop.unit} for Beluftner${density ? `, which gives ${density.prod} sentients per km² (population ÷ land area)` : ''}.`,
        anchors: [
          { label: 'Land area (production)', value: `${belLand.source.pointer ?? land.locator} = ${prodArea} ${belLand.unit}`, path: belLand.source.path, commit_sha: belLand.source.commit_sha, blob_sha: belLand.source.blob_sha, line: null, status: belLand.status },
          { label: 'Population (production)', value: `${belPop.source.pointer ?? 'population'} = ${belPop.value} ${belPop.unit}`, path: belPop.source.path, commit_sha: belPop.source.commit_sha, blob_sha: belPop.source.blob_sha, line: null, status: belPop.status },
        ],
      },
      remodeling_candidate: {
        summary: `The remodeling dataset proposes ${draftArea} ${belLand.unit}${density ? `, which would give ${density.draft} sentients per km² with a population of ${draftPop} ${belPop.unit}` : ''}. A proposal, not a production value.`,
        changes: [
          { label: `Land area (${belLand.unit})`, production_value: String(prodArea), remodeling_value: String(draftArea), path: land.file_path, finding_id: land.id },
          ...(status ? [{ label: 'land_area_status label in remodeling', production_value: status.production.present ? String(status.production.value) : '(member absent)', remodeling_value: String(status.remodeling.value), path: status.file_path, finding_id: status.id }] : []),
        ],
      },
      perspectives: [],
      hypothetical_parameters: [{
        id: 'beluftner-land-area', label: `Land area of Beluftner (${belLand.unit})`, current_state: 'production',
        options: [
          { value: 'production', label: `${prodArea} (production main)`, description: density ? `${density.prod} sentients per km².` : 'Production value.' },
          { value: 'remodeling', label: `${draftArea} (remodeling proposal)`, description: density ? `${density.draft} sentients per km². Not adopted.` : 'Remodeling proposal. Not adopted.' },
        ],
      }],
      impact_dimensions: [
        {
          dimension: 'STATISTICAL_IMPLICATIONS', verification_tier: 'VERIFIED_DIRECT_DEPENDENCY',
          summary: `${density ? `Derived density would change from ${density.prod} to ${density.draft} sentients per km² (${num(((density.draft - density.prod) / density.prod) * 100, 4)}%). ` : ''}Land-area identity QA-LAND-AREA-BOUND: production ${qa(qaProduction)}, remodeling ${qa(qaRemodeling)}.`,
          affected_nodes: existing(['entity:country:beluftner', 'indicator:land_area', 'indicator:population']),
          evidence_or_constraint: `Arithmetic on dataset values: population ÷ land area. Drift finding ${land.id}.`, quantitative_status: 'MATHEMATICALLY_ESTABLISHED',
        },
        {
          dimension: 'CIVILIAN_PERCEPTIONS', verification_tier: 'SPECULATIVE_BRAINSTORMING',
          summary: 'How a different territory would change the described character of Beluftner is not stated by any source. An author decision.',
          affected_nodes: existing(['nar:nation:beluftner']), evidence_or_constraint: 'No source passage. Speculative by definition.', quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
        },
      ],
      alternatives: [
        { id: 'alt-keep-production', title: `Keep ${prodArea} ${belLand.unit}`, premise: 'Production main stays as it is; the remodeling value remains a proposal.', institutional_mechanism: 'No change to any repository.',
          narrative_payoff: 'Existing prose and derived figures stay valid.', contradiction_risks: [] },
        { id: 'alt-adopt-remodeling', title: `Adopt ${draftArea} ${belLand.unit} in production`, premise: 'The creator publishes the value in Reltroner/reltroner-studio.', institutional_mechanism: 'A creator commit to the production repository. This application cannot make it.',
          narrative_payoff: 'Production and remodeling agree on the figure.', contradiction_risks: ['Prose that describes the territory or density of Beluftner would need review in the same change.'] },
      ],
      speculative_assumptions: draftPop === belPop.value ? ['The population is the same in production and in the remodeling proposal.'] : [`The remodeling proposal also changes the population to ${draftPop} ${belPop.unit}.`],
      potential_contradictions: [`Production main records ${prodArea} ${belLand.unit} until the creator publishes a different value.`],
      review_notes: 'Values and arithmetic are from the pinned datasets. The proposal is not canon.',
      canon_status: 'SCENARIO',
    });
  }

  // 3. Series documents that exist only in remodeling.
  const draftSeries = audit.files.filter((f) => f.classification === 'DRAFT_ONLY' && f.kind === 'markdown' && f.path.startsWith('content/series/'));
  const abyssPath = 'content/series/the-abyss-of-comfort.md';
  const abyssLines = await readLines(production, abyssPath);
  if (draftSeries.length && abyssLines) {
    const abyss = input.entities.find((e) => e.source_path === abyssPath && e.kind === 'narrative_arc');
    const drafts = [];
    for (const f of draftSeries) {
      const lines = (await readLines(remodeling, f.path)) ?? [];
      const fm = parseFrontmatter(lines.join('\n'));
      const label = fm.ok && fm.value && typeof fm.value.canonStatus === 'string' ? fm.value.canonStatus : null;
      drafts.push({ file: f, lines: lines.length, label, names: lines.some((l) => l.includes('The Abyss of Comfort')), entity: input.entities.find((e) => e.source_path === f.path)?.id ?? null });
    }
    scenarios.push({
      id: scenarioId(SCENARIO_SLUGS.series),
      title: `${draftSeries.length} series document${draftSeries.length === 1 ? '' : 's'} exist only in remodeling`,
      question: 'How do the remodeling-only series documents relate to the series documents in production?',
      focus_entities: existing([...(abyss ? [abyss.id] : []), ...drafts.map((d) => d.entity).filter((id): id is string => !!id)]),
      production_baseline: {
        summary: `Production main contains ${abyssPath} (${abyssLines.length} lines). The documents listed under the remodeling candidate do not exist in production.`,
        anchors: abyss && abyss.evidence_line ? [{ label: 'The Abyss of Comfort (production)', value: abyss.evidence_quote, path: abyss.source_path, commit_sha: abyss.commit_sha, blob_sha: abyss.blob_sha, line: abyss.evidence_line, status: 'CANON_OBSERVED' }] : [],
      },
      remodeling_candidate: {
        summary: `State of the production document in remodeling: ${remodelingState(abyssPath)}`,
        changes: drafts.map((d) => ({ label: d.file.title ?? d.file.path, production_value: 'Absent from production main', remodeling_value: `${d.lines} lines${d.label ? `; canonStatus in its frontmatter: “${d.label}”` : ''}`, path: d.file.path, finding_id: fileFinding(d.file.path)?.id ?? null })),
      },
      perspectives: [],
      hypothetical_parameters: [{
        id: 'promotion', label: 'Promotion of the remodeling-only documents (hypothetical)', current_state: 'not-promoted',
        options: [
          { value: 'not-promoted', label: 'Not promoted (current state)', description: 'The documents remain remodeling proposals.' },
          { value: 'promoted-together', label: 'Promoted together', description: 'All documents and any links between them are published in one creator commit.' },
        ],
      }],
      impact_dimensions: [{
        dimension: 'EXISTING_NARRATIVE_ARCS', verification_tier: 'CANDIDATE_NARRATIVE_IMPACT',
        summary: `${drafts.filter((d) => d.names).length} of ${drafts.length} remodeling-only series documents name The Abyss of Comfort. Naming a series is a co-occurrence, not a dependency.`,
        affected_nodes: existing([...(abyss ? [abyss.id] : []), ...drafts.map((d) => d.entity).filter((id): id is string => !!id)]),
        evidence_or_constraint: drafts.map((d) => `${d.file.path}: ${d.lines} lines`).join('; '), quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
      }],
      alternatives: [{
        id: 'alt-review-before-promotion', title: 'Review the canon status labels before any promotion', premise: 'Each document declares its own status in its frontmatter (quoted above).',
        institutional_mechanism: 'Creator review in the remodeling repository, then a creator commit to production.', narrative_payoff: 'Working names and proposed material stay marked as such.', contradiction_risks: [],
      }],
      speculative_assumptions: ['Whether and when these documents are promoted is a creator decision.'],
      potential_contradictions: ['Remodeling-only documents are proposals. They are not part of production canon.'],
      review_notes: 'File existence, line counts and frontmatter labels are read from the pinned snapshots.',
      canon_status: 'SCENARIO',
    });
  }

  return scenarios.sort((a, b) => codeUnitCompare(a.id, b.id));
}

export function buildSeedProposals(input: {
  scenarios: RemodelingScenario[];
  opportunities: CreativeOpportunity[];
  refactoringPlans: StoryRefactoringPlan[];
  auditFindings: NarrativeAuditFinding[];
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
}): CreativeProposal[] {
  const { scenarios, refactoringPlans, production, remodeling } = input;
  const timestamp = production.identity.committed_at || '1970-01-01T00:00:00Z';
  const makeProposal = (
    slug: string,
    partial: Omit<CreativeProposal, 'proposal_id' | 'schema_version' | 'production_source_sha' | 'remodeling_source_sha' | 'content_digest' | 'created_at' | 'updated_at'>,
  ): CreativeProposal => {
    const base = {
      proposal_id: prpId(slug), schema_version: 'reltroner-creative-proposal.v1' as const, ...partial,
      production_source_sha: production.identity.commit_sha, remodeling_source_sha: remodeling.identity.commit_sha, created_at: timestamp, updated_at: timestamp,
    };
    return { ...base, content_digest: sha256Hex(canonicalJson(base)) };
  };
  const refs = (s: RemodelingScenario): CreativeProposal['source_references'] => s.production_baseline.anchors.map((a) => ({
    repository: production.identity.repository, side: 'production', commit_sha: a.commit_sha, path: a.path, blob_sha: a.blob_sha, line: a.line, quote: a.value,
  }));
  const tier = (t: ScenarioImpactEntry['verification_tier']): CreativeProposal['potential_impacts'][number]['tier'] =>
    t === 'VERIFIED_DIRECT_DEPENDENCY' ? 'VERIFIED_DIRECT' : t === 'VERIFIED_TRANSITIVE_DEPENDENCY' ? 'VERIFIED_TRANSITIVE' : t === 'CANDIDATE_NARRATIVE_IMPACT' ? 'CANDIDATE_IMPACT' : 'SPECULATIVE';
  const impacts = (s: RemodelingScenario) => s.impact_dimensions.flatMap((d) => d.affected_nodes.slice(0, 1).map((target_id) => ({ target_id, tier: tier(d.verification_tier), detail: d.summary })));
  const alternatives = (s: RemodelingScenario) => s.alternatives.map((alt) => ({ id: alt.id, title: alt.title, summary: `${alt.premise} ${alt.institutional_mechanism}`.trim(), pros: [alt.narrative_payoff], cons: alt.contradiction_risks }));
  const proposals: CreativeProposal[] = [];

  const cooperation = scenarios.find((s) => s.id === scenarioId(SCENARIO_SLUGS.cooperation));
  if (cooperation) {
    proposals.push(makeProposal('reltronland-depcutland-shared-threat-cooperation', {
      title: 'Reltronland–Depcutland cooperation against a shared threat',
      intent: cooperation.question,
      proposal_type: 'CANON_REMODELING_SCENARIO', visibility: 'PUBLIC_OBSERVATORY_FIXTURE',
      originating_entities: cooperation.focus_entities, source_references: refs(cooperation),
      historical_context: cooperation.production_baseline.summary, existing_constraints: cooperation.potential_contradictions,
      narrative_hypothesis: 'A new shared threat forces the two states into issue-specific cooperation. The decision tree lists the available forms of response with the evidence for each.',
      alternatives: alternatives(cooperation), assumptions: cooperation.speculative_assumptions, potential_impacts: impacts(cooperation), consistency_risks: cooperation.potential_contradictions,
      creator_notes: 'Generated from the pinned production source. Unratified.', review_status: 'PROPOSED', canon_status: 'SCENARIO', ratification_evidence: null,
    }));
  }
  const plan = refactoringPlans[0];
  if (plan) {
    proposals.push(makeProposal(`refactor-proposal-${plan.id}`, {
      title: plan.title, intent: plan.rationale, proposal_type: 'STORY_REFACTORING', visibility: 'PUBLIC_OBSERVATORY_FIXTURE',
      originating_entities: plan.affected_entities,
      source_references: plan.affected_documents.map((d) => ({
        repository: d.side === 'production' ? production.identity.repository : remodeling.identity.repository, side: d.side, commit_sha: d.commit_sha, path: d.path, blob_sha: d.blob_sha, line: null,
        quote: `${d.path} (${plan.current_structure.units.find((u) => u.path === d.path)?.line_count ?? 0} lines)`,
      })),
      historical_context: plan.current_structure.summary, existing_constraints: plan.canon_risks, narrative_hypothesis: plan.proposed_structure.summary,
      alternatives: plan.proposed_structure.units.map((u, i) => ({ id: `unit-${i + 1}`, title: `${u.target}: ${u.section}`, summary: `${u.action}. ${u.rationale}`, pros: plan.expected_benefits, cons: plan.possible_narrative_losses })),
      assumptions: ['The plan changes structure only; no statement of canon is added or removed.'],
      potential_impacts: plan.dependency_impact.direct_nodes.slice(0, 6).map((target_id) => ({ target_id, tier: 'VERIFIED_DIRECT' as const, detail: `Declared or verified graph dependency on ${plan.affected_documents[0]?.path ?? 'the document'}.` })),
      consistency_risks: plan.canon_risks, creator_notes: 'A restructuring proposal. This application never modifies a source repository.', review_status: 'PROPOSED', canon_status: 'PROPOSED', ratification_evidence: null,
    }));
  }
  const beluftner = scenarios.find((s) => s.id === scenarioId(SCENARIO_SLUGS.beluftner));
  if (beluftner) {
    proposals.push(makeProposal('beluftner-land-area-review', {
      title: beluftner.title, intent: beluftner.question, proposal_type: 'CONSISTENCY_RESOLUTION', visibility: 'PUBLIC_OBSERVATORY_FIXTURE',
      originating_entities: beluftner.focus_entities, source_references: refs(beluftner), historical_context: beluftner.production_baseline.summary,
      existing_constraints: beluftner.potential_contradictions, narrative_hypothesis: beluftner.remodeling_candidate.summary, alternatives: alternatives(beluftner),
      assumptions: beluftner.speculative_assumptions, potential_impacts: impacts(beluftner), consistency_risks: beluftner.alternatives.flatMap((a) => a.contradiction_risks),
      creator_notes: `Review item for drift finding ${beluftner.remodeling_candidate.changes[0]?.finding_id ?? ''}. Unratified.`.trim(), review_status: 'UNDER_REVIEW', canon_status: 'SCENARIO', ratification_evidence: null,
    }));
  }
  return proposals.sort((a, b) => codeUnitCompare(a.proposal_id, b.proposal_id));
}
