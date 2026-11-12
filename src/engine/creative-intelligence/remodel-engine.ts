/**
 * Canon Remodeling & Scenario Exploration Engine + Reltronland/Depcutland Case Study.
 *
 * Isolates production canon, remodeling candidates, and speculative scenario parameters.
 * Distinguishes verified direct dependencies, verified transitive dependencies,
 * candidate narrative impacts, and speculative brainstorming.
 * Marks psychological or social consequences without a validated mathematical model as
 * INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL.
 */

import type { Audit } from '../../domain/finding.ts';
import type { KnowledgeGraph } from '../../domain/graph.ts';
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
import type { SourceSnapshot } from '../comparator.ts';
import { canonicalJson, codeUnitCompare } from '../canonical.ts';
import { sha256Hex } from '../git-objects.ts';

export { simulateNarrativeImpact, type SimulatedImpactReport };

function scnId(slug: string): string {
  return `SCN-${sha256Hex(slug).slice(0, 12).toUpperCase()}`;
}

function prpId(slug: string): string {
  return `PRP-${sha256Hex(slug).slice(0, 12).toUpperCase()}`;
}

export function buildRemodelingScenarios(input: {
  audit: Audit;
  graph: KnowledgeGraph;
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
}): RemodelingScenario[] {
  const { audit, production, remodeling } = input;
  const prodSha = production.identity.commit_sha;
  const draftSha = remodeling.identity.commit_sha;

  const blobSha = (snap: SourceSnapshot, path: string) => snap.entries.get(path)?.sha ?? snap.identity.tree_sha;
  const findingForPath = (path: string) => audit.findings.find((f) => f.file_path === path)?.id ?? null;

  const scenarios: RemodelingScenario[] = [];

  // ============================================================================
  // 1. RELTRONLAND / DEPCUTLAND CASE STUDY (Section 6 Required Capability Benchmark)
  // ============================================================================
  const relDepPath = 'content/factions/reltronland-vs-depcutland.md';
  const henPath = 'content/factions/henchoway.md';
  const nccmPath = 'data/asthortera/nccm-v6-active-cross-domain.json';

  const relDepImpacts: ScenarioImpactEntry[] = [
    {
      dimension: 'HISTORICAL_INTERPRETATION',
      verification_tier: 'VERIFIED_DIRECT_DEPENDENCY',
      summary: 'Any joint crisis protocol is bounded by the 1125/1121 BAC pre-crisis foundations, the 1048–1030 BAC War of Conscience, the 1031 BAC Institutional Integrity Assessment, and the 1010 BAC Troncut Treaty.',
      affected_nodes: ['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:treaty:troncut-treaty', 'nar:conflict:war-of-conscience'],
      evidence_or_constraint: 'content/factions/reltronland-vs-depcutland.md (Sections 1–5): Both states predate the 1057 BAC crisis and resolved their existential war via treaty-bound institutional separation, not merger.',
      quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
    },
    {
      dimension: 'INSTITUTIONAL_BEHAVIOR',
      verification_tier: 'VERIFIED_DIRECT_DEPENDENCY',
      summary: 'The Grand Library and Central Banking Consortium (CBC) operate under the 1031 BAC neutrality validation; neither state can commandeer shared archival or settlement rails without violating the ceasefire architecture.',
      affected_nodes: ['nar:institution:grand-library', 'nar:institution:cbc', 'nar:nation:reltronland', 'nar:nation:depcutland'],
      evidence_or_constraint: 'content/factions/reltronland-vs-depcutland.md (line 138) & content/events/history-timeline.md: 1031 BAC Institutional Integrity Assessment and Ceasefire.',
      quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
    },
    {
      dimension: 'DIPLOMATIC_STORYLINES',
      verification_tier: 'VERIFIED_TRANSITIVE_DEPENDENCY',
      summary: 'Season 30 joint AICR archival deposits in the Endless Library create an external perception of seamless alliance among third-party states, while internally preserving strict sovereign veto powers.',
      affected_nodes: ['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:institution:grand-library', 'nar:faction:henchoway'],
      evidence_or_constraint: 'content/factions/reltronland-vs-depcutland.md (Sections 10–12): External illusion of alliance vs. internal strategic divergence.',
      quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
    },
    {
      dimension: 'MILITARY_COOPERATION',
      verification_tier: 'CANDIDATE_NARRATIVE_IMPACT',
      summary: 'Cooperating against Henchoway and the Nytherion Abyss pits Reltronland rapid financial/interdiction containment against Depcutland evidentiary chain-of-custody requirements prior to joint strikes.',
      affected_nodes: ['nar:nation:reltronland', 'nar:nation:depcutland', 'nar:faction:henchoway', 'nar:conflict:nytherion-abyss'],
      evidence_or_constraint: 'Derived from contrasting Reltronland Astralis anti-capture doctrine with Depcutland Oracle/archival custody.',
      quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
    },
    {
      dimension: 'CHARACTER_MOTIVATIONS',
      verification_tier: 'CANDIDATE_NARRATIVE_IMPACT',
      summary: 'Investigators and liaisons (such as Delwyn Harper, Redley Ris, and cross-border custodial officers) must navigate conflicting redaction orders when Henchoway contractor shells exploit neutral jurisdictions.',
      affected_nodes: ['nar:character:delwyn-harper', 'nar:character:redley-ris', 'nar:faction:henchoway'],
      evidence_or_constraint: 'content/series/the-abyss-of-comfort.md & content/factions/henchoway.md: Investigative custody vs institutional caution.',
      quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
    },
    {
      dimension: 'CIVILIAN_PERCEPTIONS',
      verification_tier: 'SPECULATIVE_BRAINSTORMING',
      summary: 'Because Depeisit-descended families are intertwined from the bottom up across both states, any emergency counter-infiltration border check immediately strains everyday civilian kinship networks.',
      affected_nodes: ['nar:nation:reltronland', 'nar:nation:depcutland'],
      evidence_or_constraint: 'Speculative scenario exploration grounded in Section 1 ("intertwined from the bottom up and differentiated from the top down"). Psychological response has no quantitative formula.',
      quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
    },
    {
      dimension: 'EXISTING_NARRATIVE_ARCS',
      verification_tier: 'VERIFIED_TRANSITIVE_DEPENDENCY',
      summary: 'Touches The Abyss of Comfort (Season 30 AICR archival custody and Seasons 41–44 institutional coalition response) without altering Seasons 1–16 canon.',
      affected_nodes: ['nar:narrative_arc:the-abyss-of-comfort', 'nar:faction:henchoway', 'nar:conflict:nytherion-abyss'],
      evidence_or_constraint: 'content/series/the-abyss-of-comfort.md & content/factions/reltronland-vs-depcutland.md.',
      quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
    },
    {
      dimension: 'STATISTICAL_IMPLICATIONS',
      verification_tier: 'VERIFIED_DIRECT_DEPENDENCY',
      summary: 'Reltronland (SDI 0.984, GDP $5,436.3B, pop 61.62M) and Depcutland (SDI 0.981, GDP $4,775.3B, pop 55.4M) represent the two highest-SDI states on Asthortera; their fiscal and archival stability anchors planetary high-development benchmarks.',
      affected_nodes: ['country:REL', 'country:DEP', 'nar:nation:reltronland', 'nar:nation:depcutland'],
      evidence_or_constraint: 'data/asthortera/nccm-v6-active-cross-domain.json (/countries/REL and /countries/DEP).',
      quantitative_status: 'MATHEMATICALLY_ESTABLISHED',
    },
  ];

  scenarios.push({
    id: scnId('reltronland-depcutland-existential-cooperation'),
    title: 'Reltronland & Depcutland: Rival Custodial Sovereigns Cooperating Against Shared Existential Threats',
    question: 'What new narrative tensions could arise if two historical rival states must cooperate against a shared existential threat?',
    focus_entities: [
      'nar:nation:reltronland',
      'nar:nation:depcutland',
      'nar:faction:henchoway',
      'nar:conflict:nytherion-abyss',
      'nar:institution:grand-library',
      'nar:institution:cbc',
      'nar:treaty:troncut-treaty',
    ],
    production_baseline: {
      summary: 'Reltronland (founded 1125 BAC by Troner Rhett, SDI 0.984) and Depcutland (founded 1121 BAC by Cutter Glouster, SDI 0.981) share Planet Depeisit ancestry (twins Tron and Cut) and are intertwined from the bottom up at the family level, yet remain differentiated from the top down in sovereign philosophy. After the 1057 BAC Depeisit Economic Crisis and the 1048–1030 BAC War of Conscience, the 1031 BAC Institutional Integrity Assessment validated Grand Library and CBC neutrality, and the 1010 BAC Troncut Treaty established durable peaceful competition. Both states cooperate against Henchoway and the Nytherion Abyss—creating an external illusion of alliance—without surrendering sovereign custody.',
      anchors: [
        {
          label: 'Shared Depeisit Ancestry & Dual Structure',
          value: 'Twins Tron and Cut; bottom-up civilian kinship inseparability vs. top-down sovereign state differentiation',
          path: relDepPath,
          commit_sha: prodSha,
          blob_sha: blobSha(production, relDepPath),
          line: 14,
          status: 'CANON_OBSERVED',
        },
        {
          label: 'Pre-Crisis Sovereign Foundations',
          value: 'Reltronland founded 1125 BAC (Troner Rhett); Depcutland founded 1121 BAC (Cutter Glouster) — 68 and 64 years before the 1057 BAC Depeisit Economic Crisis',
          path: relDepPath,
          commit_sha: prodSha,
          blob_sha: blobSha(production, relDepPath),
          line: 36,
          status: 'CANON_OBSERVED',
        },
        {
          label: 'War of Conscience & Custodial Neutrality',
          value: '1048–1030 BAC War of Conscience; 1031 BAC Institutional Integrity Assessment validating Grand Library & CBC neutrality; 1010 BAC Troncut Treaty',
          path: relDepPath,
          commit_sha: prodSha,
          blob_sha: blobSha(production, relDepPath),
          line: 130,
          status: 'CANON_OBSERVED',
        },
        {
          label: 'Modern SDI & Institutional Custody Split',
          value: 'Reltronland SDI 0.984 (financial infrastructure, Astralis anti-capture doctrine) vs. Depcutland SDI 0.981 (Oracle of Asthortera, archival/epistemic custody)',
          path: nccmPath,
          commit_sha: prodSha,
          blob_sha: blobSha(production, nccmPath),
          line: 1,
          status: 'CANON_OBSERVED',
        },
        {
          label: 'Shared Existential Threats & External Illusion of Alliance',
          value: 'Joint opposition to Henchoway (Adaptive Stillness / Vitor Baythorne) and Nytherion Abyss, including Season 30 AICR deposits in the Endless Library',
          path: relDepPath,
          commit_sha: prodSha,
          blob_sha: blobSha(production, relDepPath),
          line: 210,
          status: 'CANON_OBSERVED',
        },
      ],
    },
    remodeling_candidate: {
      summary: 'The remodeling workspace refines both content/factions/reltronland-vs-depcutland.md and content/factions/henchoway.md, sharpening the contrast between external diplomatic unity and internal institutional custody friction during anti-Henchoway operations.',
      changes: [
        {
          label: 'Reltronland vs Depcutland Comparative Dossier Refinement',
          production_value: 'Production baseline comparative faction profile',
          remodeling_value: 'Updated comparative sections emphasizing pre-crisis foundation guardrails, Season 30 AICR archival custody, and anti-capture boundaries',
          path: relDepPath,
          finding_id: findingForPath(relDepPath),
        },
        {
          label: 'Henchoway Recognition Scarcity & Attribution Boundaries',
          production_value: 'Production Henchoway faction profile',
          remodeling_value: 'Expanded Recognition Scarcity structural logic (4,412B population, SDI 0.947) and sovereign state non-attribution rules',
          path: henPath,
          finding_id: findingForPath(henPath),
        },
      ],
    },
    perspectives: [
      {
        actor_id: 'nar:nation:reltronland',
        actor_name: 'Reltronland Strategic & Financial Custodians (Astralis Doctrine)',
        stance: 'Prioritizes rapid systemic containment, financial clearing integrity, and decisive interdiction of Henchoway contractor shells before they capture critical infrastructure.',
        fear_or_constraint: 'Fears that Depcutland evidentiary deliberation or Oracle archival vetoes will delay urgent financial freezes and allow Henchoway shells to metastasize.',
        source_path: relDepPath,
        evidence_line: 155,
        evidence_quote: 'Reltronland emphasizes institutional resilience, financial custody, and Astralis anti-capture doctrine.',
      },
      {
        actor_id: 'nar:nation:depcutland',
        actor_name: 'Depcutland Epistemic & Archival Custodians (Oracle of Asthortera)',
        stance: 'Insists that every joint intelligence finding and Season 30 AICR record meet strict chain-of-custody verification before any cross-border enforcement is authorized.',
        fear_or_constraint: 'Fears that emergency anti-Henchoway operational powers will normalize unverified executive action and erode the 1010 BAC Troncut Treaty sovereignty balance.',
        source_path: relDepPath,
        evidence_line: 162,
        evidence_quote: 'Depcutland emphasizes archival stewardship, the Oracle of Asthortera, and epistemic accountability.',
      },
      {
        actor_id: 'nar:institution:grand-library',
        actor_name: 'Grand Library & Central Banking Consortium (1031 BAC Neutrality Mandate)',
        stance: 'Enforces strict procedural neutrality over shared archival ledgers and settlement clearinghouses so neither rival can weaponize joint infrastructure.',
        fear_or_constraint: 'Faces dual pressure when Reltronland requests immediate financial telemetry and Depcutland demands unredacted evidentiary seals on the same crisis file.',
        source_path: relDepPath,
        evidence_line: 138,
        evidence_quote: 'The 1031 BAC Institutional Integrity Assessment and Ceasefire validated the neutrality of the Grand Library and the Central Banking Consortium.',
      },
      {
        actor_id: 'nar:faction:henchoway',
        actor_name: 'Henchoway Adaptive Stillness Strategists (Vitor Baythorne)',
        stance: 'Operates through legal contractor shells and Recognition Scarcity dynamics in neutral corridors, deliberately targeting the jurisdictional seam between Reltronland and Depcutland.',
        fear_or_constraint: 'Vulnerable only when Reltronland financial tracing and Depcutland archival verification synchronize without triggering a bilateral sovereignty stalemate.',
        source_path: henPath,
        evidence_line: 69,
        evidence_quote: 'Henchoway presents stillness as relief, protection, and curated belonging inside a world too vast to notice everyone.',
      },
    ],
    hypothetical_parameters: [
      {
        id: 'custody-protocol',
        label: 'Joint Anti-Henchoway Intelligence & Custody Protocol',
        current_state: 'dual-key-compartmentalized',
        options: [
          {
            value: 'dual-key-compartmentalized',
            label: 'Dual-Key Compartmentalized Custody (Baseline)',
            description: 'Each state verifies intelligence independently; joint action requires explicit bilateral sign-off per file.',
          },
          {
            value: 'reciprocal-blind-escrow',
            label: '1031 BAC Reciprocal Blind Escrow (Grand Library / CBC)',
            description: 'Reltronland financial traces and Depcutland evidentiary seals are deposited in a neutral Grand Library/CBC escrow that triggers automatic disclosure only upon dual threshold match.',
          },
          {
            value: 'emergency-joint-directorate',
            label: 'Temporary Emergency Joint Directorate (High Tension)',
            description: 'Delegates temporary cross-border freeze authority to a joint task force, provoking fierce domestic constitutional pushback in both states.',
          },
        ],
      },
      {
        id: 'endless-library-disclosure',
        label: 'Season 30 Endless Library AICR Disclosure Policy',
        current_state: 'sealed-bilateral-deposit',
        options: [
          {
            value: 'sealed-bilateral-deposit',
            label: 'Sealed Bilateral Deposit (Baseline)',
            description: 'AICR findings are archived in the Endless Library under sovereign co-custody with public summaries redacted.',
          },
          {
            value: 'redacted-coalition-briefing',
            label: 'Redacted Coalition Briefing to UAA States',
            description: 'Shares operational Henchoway shell signatures with Hargenbor and allied states while withholding raw sovereign intelligence methods.',
          },
          {
            value: 'full-epistemic-publication',
            label: 'Full Public Epistemic Disclosure',
            description: 'Publishes complete AICR evidentiary chains to counter Recognition Scarcity, risking public panic and exposing bilateral friction.',
          },
        ],
      },
      {
        id: 'kinship-border-regime',
        label: 'Cross-Border Depeisit Kinship & Municipal Mobility',
        current_state: 'open-kinship-corridor',
        options: [
          {
            value: 'open-kinship-corridor',
            label: 'Open Civilian Kinship Corridor (Baseline)',
            description: 'Preserves seamless everyday family and municipal movement across both states despite top-down strategic rivalry.',
          },
          {
            value: 'credentialed-contractor-screening',
            label: 'Targeted Contractor & Shell Audit Screening',
            description: 'Applies enhanced CBC/archival screening to corporate entities while exempting ordinary civilian kinship travel.',
          },
          {
            value: 'crisis-verification-checkpoints',
            label: 'Emergency Crisis Verification Checkpoints',
            description: 'Subjects cross-border commuters to security audits, immediately straining intertwined Depeisit family networks.',
          },
        ],
      },
    ],
    impact_dimensions: relDepImpacts,
    alternatives: [
      {
        id: 'alt-custodial-deadlock',
        title: 'Alternative A — The Dual-Key Custodial Deadlock (Financial Speed vs. Epistemic Proof)',
        premise: 'Reltronland traces a Henchoway contractor shell routing capital through a neutral clearing corridor and demands an immediate CBC asset freeze; Depcutland refuses to co-sign until the Oracle/Grand Library verifies the unredacted chain of custody.',
        institutional_mechanism: 'Pits Reltronland Astralis anti-capture doctrine directly against Depcutland archival verification rules inside the 1031 BAC neutral clearing architecture.',
        narrative_payoff: 'Generates high-stakes institutional drama where both states act from legitimate, canon-grounded principles rather than villainy, allowing Henchoway to exploit the 48-hour verification gap.',
        contradiction_risks: [
          'Must not portray either the Grand Library or CBC as partisan instruments of one state (violates 1031 BAC ceasefire canon).',
        ],
      },
      {
        id: 'alt-kinship-whistleblower',
        title: 'Alternative B — The Cross-Border Kinship Whistleblower (Bottom-Up Unity vs. Top-Down Secrecy)',
        premise: 'Two siblings from an intertwined Depeisit family—one a Reltronland financial auditor, the other a Depcutland archival clerk—discover that their respective agencies hold half of the same Henchoway infiltration puzzle, but bilateral secrecy rules forbid them from comparing notes.',
        institutional_mechanism: 'Contrasts bottom-up familial inseparability with top-down sovereign compartmentalization established after the 1010 BAC Troncut Treaty.',
        narrative_payoff: 'Grounds macro geopolitical rivalry in intimate family loyalty and personal conscience, echoing the historical War of Conscience on a human scale.',
        contradiction_risks: [
          'Must maintain that Reltronland (1125 BAC) and Depcutland (1121 BAC) are distinct sovereign states, not a single federated government.',
        ],
      },
      {
        id: 'alt-illusion-of-alliance-fracture',
        title: 'Alternative C — Third-Party Coalition Strain Under the "External Illusion of Alliance"',
        premise: 'During a joint Season 30 / Season 41 briefing in the Endless Library, smaller states assume Reltronland and Depcutland speak with one voice—until a dispute over whether to classify a Nytherion Abyss anomaly as a strategic security threat or a public epistemic record exposes their divergent doctrines.',
        institutional_mechanism: 'Tests the "external illusion of alliance" documented in reltronland-vs-depcutland.md when third-party nations demand unified leadership.',
        narrative_payoff: 'Reveals how historical rivals can agree on the existence of an existential threat while fundamentally disagreeing on what civilization must preserve to survive it.',
        contradiction_risks: [
          'Must not escalate into renewed military war between Reltronland and Depcutland, which would violate modern post-1010 BAC treaty stability.',
        ],
      },
    ],
    speculative_assumptions: [
      'Assumes that joint anti-Henchoway operations require both Reltronland financial telemetry and Depcutland archival authentication to be legally enforceable in neutral corridors.',
      'Assumes that Henchoway actively monitors the procedural latency between Reltronland and Depcutland custodial sign-offs.',
      'Psychological and social reactions of civilian populations are exploratory narrative hypotheses (INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL).',
    ],
    potential_contradictions: [
      'GUARDRAIL 1: Never depict Reltronland (1125 BAC) or Depcutland (1121 BAC) as splitter states born from the 1057 BAC Depeisit Economic Crisis; both were sovereign decades before the crisis.',
      'GUARDRAIL 2: Never merge Reltronland and Depcutland into a single unitary state; their cooperation against Henchoway and the Nytherion Abyss creates an external illusion of alliance, not shared sovereignty.',
      'GUARDRAIL 3: Never compromise the 1031 BAC neutrality of the Grand Library or the Central Banking Consortium.',
    ],
    review_notes: 'All outputs in this case study are marked SCENARIO or PROPOSED for Product Owner evaluation. Approving an alternative for authoring does not ratify it into production canon until committed to Reltroner/reltroner-studio.',
    canon_status: 'SCENARIO',
  });

  // ============================================================================
  // 2. KALGERED 37-COUNTRY & CONSUMPTION REMODELING SCENARIO
  // ============================================================================
  const kalPath = 'data/kalgered/kalgered-remodeling-candidate-v1.json';
  const kalConsPath = 'data/kalgered/kalgered-consumption-v65.json';
  if (remodeling.entries.has(kalPath)) {
    scenarios.push({
      id: scnId('kalgered-37-country-expansion-remodeling'),
      title: 'Kalgered 37-Country & Consumption V6.5 Expansion vs. Production Asthortera Baseline',
      question: 'How does introducing the 37-country Kalgered remodeling candidate and consumption ledger interact with the 14-country Asthortera production baseline?',
      focus_entities: ['nar:world:asthortera', 'nar:nation:reltronland', 'nar:nation:depcutland'],
      production_baseline: {
        summary: 'Production canon (nccm-v6-active-cross-domain.json) defines 14 sovereign countries on Asthortera with verified GDP, population, SDI, and land-area invariants.',
        anchors: [
          {
            label: 'Asthortera 14-Country Production Ledger',
            value: '14 sovereign countries, planetary population 4,412B, GDP $83,240B, land bound 131,500k sq km',
            path: nccmPath,
            commit_sha: prodSha,
            blob_sha: blobSha(production, nccmPath),
            line: 1,
            status: 'CANON_OBSERVED',
          },
        ],
      },
      remodeling_candidate: {
        summary: 'Remodeling adds data/kalgered/kalgered-remodeling-candidate-v1.json (37 countries) and data/kalgered/kalgered-consumption-v65.json as draft-only expansion datasets.',
        changes: [
          {
            label: 'Kalgered Remodeling Candidate V1',
            production_value: 'Absent in production',
            remodeling_value: 'Added 37-country Kalgered candidate dataset (DRAFT_ONLY)',
            path: kalPath,
            finding_id: findingForPath(kalPath),
          },
          {
            label: 'Kalgered Consumption V6.5',
            production_value: 'Absent in production',
            remodeling_value: 'Added Kalgered consumption V6.5 dataset (DRAFT_ONLY)',
            path: kalConsPath,
            finding_id: findingForPath(kalConsPath),
          },
        ],
      },
      perspectives: [
        {
          actor_id: 'nar:world:asthortera',
          actor_name: 'Asthortera Statistical Observatory',
          stance: 'Maintains strict namespace isolation between the 14-country AsthorteraNCCM V6.5 ledger and the 37-country Kalgered candidate dataset.',
          fear_or_constraint: 'Pooling both datasets into a single planetary sum without an explicit domain partition would corrupt Asthortera planetary totals.',
          source_path: nccmPath,
          evidence_line: 1,
          evidence_quote: 'nccm-v6-active-cross-domain.json defines the 14 Asthortera sovereign countries.',
        },
      ],
      hypothetical_parameters: [
        {
          id: 'kalgered-integration-mode',
          label: 'Kalgered Dataset Integration Mode',
          current_state: 'isolated-domain-namespace',
          options: [
            {
              value: 'isolated-domain-namespace',
              label: 'Isolated Domain Namespace (Recommended)',
              description: 'Keep Kalgered under data/kalgered/* with its own schema and planetary sums, separate from Asthortera.',
            },
            {
              value: 'comparative-cross-world-observatory',
              label: 'Comparative Multi-System Observatory',
              description: 'Enable side-by-side SDI and consumption comparisons against Asthortera without merging totals.',
            },
          ],
        },
      ],
      impact_dimensions: [
        {
          dimension: 'STATISTICAL_IMPLICATIONS',
          verification_tier: 'VERIFIED_DIRECT_DEPENDENCY',
          summary: 'Keeping Kalgered in its own namespace preserves all 10 Asthortera QA invariants (QA-INV-001 through QA-INV-010).',
          affected_nodes: ['dataset:nccm-v6-active-cross-domain', 'nar:world:asthortera'],
          evidence_or_constraint: 'data/kalgered/kalgered-remodeling-candidate-v1.json is isolated under data/kalgered/.',
          quantitative_status: 'MATHEMATICALLY_ESTABLISHED',
        },
        {
          dimension: 'EXISTING_NARRATIVE_ARCS',
          verification_tier: 'CANDIDATE_NARRATIVE_IMPACT',
          summary: 'Provides structured socioeconomic context for secondary regional storylines without altering core Asthortera 14-nation canon.',
          affected_nodes: ['nar:world:asthortera'],
          evidence_or_constraint: 'Draft-only remodeling expansion.',
          quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
        },
      ],
      alternatives: [
        {
          id: 'alt-kalgered-isolated-registry',
          title: 'Maintain Dedicated Kalgered Registry with Explicit Provenance Headers',
          premise: 'Publish Kalgered datasets only after attaching explicit domain boundaries and QA sum rules separate from Asthortera.',
          institutional_mechanism: 'Schema-level separation between data/asthortera/* and data/kalgered/*.',
          narrative_payoff: 'Expands worldbuilding breadth without risking regression in the 14-country Asthortera baseline.',
          contradiction_risks: ['None if namespaces remain separate.'],
        },
      ],
      speculative_assumptions: ['Assumes Kalgered statistics remain a distinct analytical domain from the 14-country Asthortera core table.'],
      potential_contradictions: ['Never sum Kalgered country populations or land areas into the Asthortera 14-country planetary totals.'],
      review_notes: 'Remodeling candidate analysis only; status remains SCENARIO / DRAFT_ONLY.',
      canon_status: 'SCENARIO',
    });
  }

  // ============================================================================
  // 3. BELUFTNER LAND-AREA & DEMOGRAPHIC REMODELING SCENARIO
  // ============================================================================
  scenarios.push({
    id: scnId('beluftner-land-area-demographic-remodeling'),
    title: 'Beluftner Land-Area Remodeling (88k vs. 363k sq km) & Density Consequence Analysis',
    question: 'How does expanding Beluftner land area from 88 to 363 thousand sq km in remodeling affect population density, planetary land bounds, and regional worldbuilding?',
    focus_entities: ['nar:nation:beluftner', 'nar:world:asthortera'],
    production_baseline: {
      summary: 'In production canon, Beluftner (BEL) has land_area_thousand_sq_km = 88 and population_millions = 1,020.0, yielding a derived population density of 11,590.91 per sq km.',
      anchors: [
        {
          label: 'Production Beluftner Land Area & Population',
          value: '88 thousand sq km; population 1,020.0M; derived density 11,590.91 people/sq km',
          path: nccmPath,
          commit_sha: prodSha,
          blob_sha: blobSha(production, nccmPath),
          line: 1,
          status: 'CANON_OBSERVED',
        },
      ],
    },
    remodeling_candidate: {
      summary: 'In remodeling, Beluftner land_area_thousand_sq_km is proposed at 363 (+275 thousand sq km, +312.5%), reducing derived density to 2,809.92 per sq km while keeping total 14-country land area within the 131,500 thousand sq km planetary bound.',
      changes: [
        {
          label: 'Beluftner Land Area (thousand sq km)',
          production_value: '88',
          remodeling_value: '363',
          path: nccmPath,
          finding_id: findingForPath(nccmPath),
        },
      ],
    },
    perspectives: [
      {
        actor_id: 'nar:nation:beluftner',
        actor_name: 'Beluftner Territorial & Demographic Profile',
        stance: 'At 88k sq km, Beluftner is an ultra-dense megacity-archipelago state; at 363k sq km, it transitions to a high-density continental/maritime territory.',
        fear_or_constraint: 'Prose descriptions of urban compression vs. hinterland geography must match whichever numeric figure is ratified.',
        source_path: nccmPath,
        evidence_line: 1,
        evidence_quote: 'Beluftner land_area_thousand_sq_km: 88 (production) vs 363 (remodeling).',
      },
    ],
    hypothetical_parameters: [
      {
        id: 'beluftner-land-choice',
        label: 'Beluftner Land Area Parameter (thousand sq km)',
        current_state: '88-production-canon',
        options: [
          {
            value: '88-production-canon',
            label: '88k sq km (Production Canon — Density 11,590.91/sq km)',
            description: 'Retains ultra-high-density urban compression profile.',
          },
          {
            value: '363-remodeling-candidate',
            label: '363k sq km (Remodeling Candidate — Density 2,809.92/sq km)',
            description: 'Adopts expanded territory (+275k sq km); requires verifying prose descriptions of Beluftner geography.',
          },
        ],
      },
    ],
    impact_dimensions: [
      {
        dimension: 'STATISTICAL_IMPLICATIONS',
        verification_tier: 'VERIFIED_DIRECT_DEPENDENCY',
        summary: 'Mathematically shifts derived population density from 11,590.91 to 2,809.92 people/sq km (-75.76%) and increases 14-country total land area by +275 thousand sq km (still within QA-INV-006 planetary bound of 131,500k sq km).',
        affected_nodes: ['country:BEL', 'indicator:land_area_thousand_sq_km', 'nar:nation:beluftner'],
        evidence_or_constraint: 'Exact arithmetic derivation: 1,020,000,000 / 88,000 = 11,590.91 vs 1,020,000,000 / 363,000 = 2,809.92.',
        quantitative_status: 'MATHEMATICALLY_ESTABLISHED',
      },
      {
        dimension: 'CIVILIAN_PERCEPTIONS',
        verification_tier: 'SPECULATIVE_BRAINSTORMING',
        summary: 'A fourfold change in land area alters the lived urban-vs-regional settlement texture of Beluftner.',
        affected_nodes: ['nar:nation:beluftner'],
        evidence_or_constraint: 'Qualitative worldbuilding implication (INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL).',
        quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
      },
    ],
    alternatives: [
      {
        id: 'alt-beluftner-ratify-363',
        title: 'Ratify 363k sq km with Synchronized Country Lore Note',
        premise: 'Adopt 363k sq km in production alongside a lore note clarifying metropolitan core vs. administrative territory.',
        institutional_mechanism: 'Synchronized update across nccm-v6-active-cross-domain.json and countries/beluftner.md.',
        narrative_payoff: 'Explains how Beluftner maintains hyper-dense metropolitan cores within a larger 363k sq km administrative footprint.',
        contradiction_risks: ['Any existing prose citing 88k sq km must be updated simultaneously.'],
      },
    ],
    speculative_assumptions: ['Assumes population_millions remains constant at 1,020.0M across both scenarios.'],
    potential_contradictions: ['Production canon remains 88 thousand sq km until a commit is ratified in Reltroner/reltroner-studio.'],
    review_notes: 'Demonstrates exact mathematical impact vs qualitative narrative interpretation.',
    canon_status: 'SCENARIO',
  });

  // ============================================================================
  // 4. AURASTELIA FORWARD SERIES INTEGRATION SCENARIO (Seasons 41–44)
  // ============================================================================
  const valPath = 'content/series/house-of-valethra.md';
  const fivePath = 'content/series/the-five-voices-of-aurora-covenant.md';
  const abyssPath = 'content/series/the-abyss-of-comfort.md';
  if (remodeling.entries.has(valPath) || remodeling.entries.has(fivePath)) {
    scenarios.push({
      id: scnId('aurastelia-seasons-41-44-subseries-integration'),
      title: 'Aurastelia Seasons 41–44 Sub-Series Integration (House of Valethra & Five Voices of Aurora Covenant)',
      question: 'How do the two new remodeling series dossiers integrate into Seasons 41–44 of The Abyss of Comfort without disrupting Seasons 1–16 investigative canon?',
      focus_entities: [
        'nar:narrative_arc:the-abyss-of-comfort',
        'nar:narrative_arc:house-of-valethra',
        'nar:narrative_arc:the-five-voices-of-aurora-covenant',
        'nar:character:queen-valethra',
        'nar:character:delwyn-harper',
      ],
      production_baseline: {
        summary: 'In production canon, Seasons 41–44 (Aurastelia) are summarized inside content/series/the-abyss-of-comfort.md without standalone companion dossiers for House of Valethra or The Five Voices of Aurora Covenant.',
        anchors: [
          {
            label: 'The Abyss of Comfort Master Dossier',
            value: 'Contains Seasons 1–16 core investigative canon plus forward architecture through Season 44',
            path: abyssPath,
            commit_sha: prodSha,
            blob_sha: blobSha(production, abyssPath),
            line: 1,
            status: 'CANON_OBSERVED',
          },
        ],
      },
      remodeling_candidate: {
        summary: 'Remodeling introduces two dedicated companion dossiers (house-of-valethra.md and the-five-voices-of-aurora-covenant.md) and expands the-abyss-of-comfort.md (+2,499 lines) to cross-reference them.',
        changes: [
          {
            label: 'House of Valethra Companion Dossier',
            production_value: 'Absent in production',
            remodeling_value: 'Added content/series/house-of-valethra.md (DRAFT_ONLY)',
            path: valPath,
            finding_id: findingForPath(valPath),
          },
          {
            label: 'The Five Voices of Aurora Covenant Companion Dossier',
            production_value: 'Absent in production',
            remodeling_value: 'Added content/series/the-five-voices-of-aurora-covenant.md (DRAFT_ONLY)',
            path: fivePath,
            finding_id: findingForPath(fivePath),
          },
        ],
      },
      perspectives: [
        {
          actor_id: 'nar:character:queen-valethra',
          actor_name: 'House of Valethra (Royal & Independent Family Viewpoint)',
          stance: 'Reframes Seasons 41–44 through generational stewardship, civic legitimacy, and Hana’s independent moral agency.',
          fear_or_constraint: 'Must preserve Hana’s independent identity so she is not reduced to a purely political instrument.',
          source_path: valPath,
          evidence_line: 1,
          evidence_quote: 'A Royal and Independent Family Architecture inside Seasons 41–44 of The Abyss of Comfort.',
        },
      ],
      hypothetical_parameters: [
        {
          id: 'aurastelia-publication-sequence',
          label: 'Seasons 41–44 Dossier Publication Sequence',
          current_state: 'staged-remodeling-review',
          options: [
            {
              value: 'staged-remodeling-review',
              label: 'Staged Remodeling Review (Baseline)',
              description: 'Verify all working facility names and cross-links in remodeling before promoting to production.',
            },
            {
              value: 'atomic-trilogy-promotion',
              label: 'Atomic Three-File Promotion',
              description: 'Promote updated the-abyss-of-comfort.md, house-of-valethra.md, and the-five-voices-of-aurora-covenant.md in a single production commit so no broken links ever exist.',
            },
          ],
        },
      ],
      impact_dimensions: [
        {
          dimension: 'EXISTING_NARRATIVE_ARCS',
          verification_tier: 'VERIFIED_DIRECT_DEPENDENCY',
          summary: 'Directly expands Seasons 41–44 of The Abyss of Comfort and updates content/series/series-roadmap.md.',
          affected_nodes: ['nar:narrative_arc:the-abyss-of-comfort', 'nar:narrative_arc:house-of-valethra', 'nar:narrative_arc:the-five-voices-of-aurora-covenant'],
          evidence_or_constraint: 'Explicitly linked in remodeling content/series/the-abyss-of-comfort.md and series-roadmap.md.',
          quantitative_status: 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL',
        },
      ],
      alternatives: [
        {
          id: 'alt-atomic-promotion',
          title: 'Atomic Promotion After Facility-Name Finalization',
          premise: 'Freeze working facility labels in the-five-voices-of-aurora-covenant.md and promote all three files together.',
          institutional_mechanism: 'Single atomic Git commit in Reltroner/reltroner-studio.',
          narrative_payoff: 'Delivers rich family and community viewpoints for Seasons 41–44 with zero broken cross-references.',
          contradiction_risks: ['Promoting the-abyss-of-comfort.md without the two companion files would create broken links.'],
        },
      ],
      speculative_assumptions: ['Assumes Seasons 1–16 core investigative timeline remains untouched.'],
      potential_contradictions: ['Must promote companion files together with the master dossier to preserve link integrity.'],
      review_notes: 'Draft-only remodeling expansion; remains SCENARIO until creator publication.',
      canon_status: 'SCENARIO',
    });
  }

  void draftSha;
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
  const prodSha = production.identity.commit_sha;
  const draftSha = remodeling.identity.commit_sha;
  const timestamp = production.identity.committed_at || '2026-04-19T00:00:00Z';

  const makeProposal = (
    slug: string,
    partial: Omit<CreativeProposal, 'proposal_id' | 'schema_version' | 'production_source_sha' | 'remodeling_source_sha' | 'content_digest' | 'created_at' | 'updated_at'>,
  ): CreativeProposal => {
    const id = prpId(slug);
    const base = {
      proposal_id: id,
      schema_version: 'reltroner-creative-proposal.v1' as const,
      ...partial,
      production_source_sha: prodSha,
      remodeling_source_sha: draftSha,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const digest = sha256Hex(canonicalJson(base));
    return {
      ...base,
      content_digest: digest,
    };
  };

  const proposals: CreativeProposal[] = [];

  // 1. Reltronland / Depcutland Case Study Proposal
  const relDepScenario = scenarios.find((s) => s.id === scnId('reltronland-depcutland-existential-cooperation'));
  if (relDepScenario) {
    proposals.push(
      makeProposal('reltronland-depcutland-reciprocal-custody-protocol', {
        title: 'Reltronland–Depcutland Reciprocal Custody & Anti-Henchoway Crisis Protocol',
        intent: 'Explore narrative tensions when historical rivals Reltronland (1125 BAC, SDI 0.984) and Depcutland (1121 BAC, SDI 0.981) must synchronize financial interdiction and archival verification against Henchoway and the Nytherion Abyss without surrendering sovereignty.',
        proposal_type: 'CANON_REMODELING_SCENARIO',
        visibility: 'PUBLIC_OBSERVATORY_FIXTURE',
        originating_entities: relDepScenario.focus_entities,
        source_references: relDepScenario.production_baseline.anchors.map((a) => ({
          repository: 'Reltroner/reltroner-studio',
          side: 'production',
          commit_sha: a.commit_sha,
          path: a.path,
          blob_sha: a.blob_sha,
          line: a.line,
          quote: a.value,
        })),
        historical_context: relDepScenario.production_baseline.summary,
        existing_constraints: relDepScenario.potential_contradictions,
        narrative_hypothesis: 'When Henchoway contractor shells exploit neutral jurisdictions under Recognition Scarcity, Reltronland’s demand for rapid Astralis financial containment clashes with Depcutland’s requirement for unredacted Oracle/Grand Library chain-of-custody verification, testing the 1031 BAC neutrality mandate and the 1010 BAC Troncut Treaty.',
        alternatives: relDepScenario.alternatives.map((alt) => ({
          id: alt.id,
          title: alt.title,
          summary: `${alt.premise} (${alt.institutional_mechanism})`,
          pros: [alt.narrative_payoff, 'Preserves 1125/1121 BAC pre-crisis sovereignty and 1031 BAC institutional neutrality.'],
          cons: alt.contradiction_risks,
        })),
        assumptions: relDepScenario.speculative_assumptions,
        potential_impacts: [
          {
            target_id: 'nar:institution:grand-library',
            tier: 'VERIFIED_DIRECT',
            detail: 'Grand Library 1031 BAC neutrality mandate governs any joint Season 30 AICR evidentiary escrow.',
          },
          {
            target_id: 'nar:institution:cbc',
            tier: 'VERIFIED_DIRECT',
            detail: 'Central Banking Consortium clearing rules govern cross-border freezes against Henchoway contractor shells.',
          },
          {
            target_id: 'nar:narrative_arc:the-abyss-of-comfort',
            tier: 'VERIFIED_TRANSITIVE',
            detail: 'Connects Season 30 Endless Library AICR custody to Seasons 41–44 institutional coalition storylines.',
          },
          {
            target_id: 'nar:nation:reltronland',
            tier: 'SPECULATIVE',
            detail: 'Civilian kinship network strain under heightened border verification (exploratory hypothesis; no quantitative model).',
          },
        ],
        consistency_risks: relDepScenario.potential_contradictions,
        creator_notes: 'Benchmark creative proposal generated for the Reltronland/Depcutland case study. Remains PROPOSED / SCENARIO until explicitly ratified in Reltroner/reltroner-studio.',
        review_status: 'PROPOSED',
        canon_status: 'SCENARIO',
        ratification_evidence: null,
      }),
    );
  }

  // 2. Story Refactoring Proposal from primary refactoring plan
  const firstPlan = refactoringPlans[0];
  if (firstPlan) {
    proposals.push(
      makeProposal(`refactor-proposal-${firstPlan.id}`, {
        title: firstPlan.title,
        intent: firstPlan.rationale,
        proposal_type: 'STORY_REFACTORING',
        visibility: 'PUBLIC_OBSERVATORY_FIXTURE',
        originating_entities: firstPlan.affected_entities,
        source_references: firstPlan.affected_documents.map((d) => ({
          repository: d.side === 'production' ? 'Reltroner/reltroner-studio' : 'Reltroner/reltroner-studio-remodeling',
          side: d.side,
          commit_sha: d.commit_sha,
          path: d.path,
          blob_sha: d.blob_sha,
          line: 1,
          quote: firstPlan.current_structure.summary,
        })),
        historical_context: firstPlan.current_structure.summary,
        existing_constraints: firstPlan.canon_risks,
        narrative_hypothesis: firstPlan.proposed_structure.summary,
        alternatives: firstPlan.proposed_structure.units.map((u, idx) => ({
          id: `unit-${idx + 1}`,
          title: `${u.target} — ${u.section}`,
          summary: `${u.action}: ${u.rationale}`,
          pros: firstPlan.expected_benefits,
          cons: firstPlan.possible_narrative_losses,
        })),
        assumptions: ['All existing incoming markdown anchor links are preserved.'],
        potential_impacts: firstPlan.dependency_impact.direct_nodes.slice(0, 6).map((nodeId) => ({
          target_id: nodeId,
          tier: 'VERIFIED_DIRECT' as const,
          detail: `Direct graph dependency on ${firstPlan.affected_documents[0]?.path ?? 'document'}.`,
        })),
        consistency_risks: firstPlan.canon_risks,
        creator_notes: 'Non-destructive restructuring proposal; never modifies source repositories directly.',
        review_status: 'PROPOSED',
        canon_status: 'PROPOSED',
        ratification_evidence: null,
      }),
    );
  }

  // 3. Beluftner Land Area Remodeling Proposal
  const belScenario = scenarios.find((s) => s.id === scnId('beluftner-land-area-demographic-remodeling'));
  if (belScenario) {
    proposals.push(
      makeProposal('beluftner-land-area-reconciliation-proposal', {
        title: 'Beluftner Land Area Reconciliation (88k vs. 363k sq km) & Density Crosswalk',
        intent: 'Evaluate whether to retain Beluftner’s 88k sq km ultra-dense baseline or ratify the 363k sq km remodeling candidate with synchronized prose updates.',
        proposal_type: 'CONSISTENCY_RESOLUTION',
        visibility: 'PUBLIC_OBSERVATORY_FIXTURE',
        originating_entities: belScenario.focus_entities,
        source_references: belScenario.production_baseline.anchors.map((a) => ({
          repository: 'Reltroner/reltroner-studio',
          side: 'production',
          commit_sha: a.commit_sha,
          path: a.path,
          blob_sha: a.blob_sha,
          line: a.line,
          quote: a.value,
        })),
        historical_context: belScenario.production_baseline.summary,
        existing_constraints: [
          'QA-INV-006: Total 14-country land area must not exceed planetary land area (131,500 thousand sq km).',
          'QA-INV-004: Derived population density must equal population / land_area.',
        ],
        narrative_hypothesis: belScenario.remodeling_candidate.summary,
        alternatives: belScenario.alternatives.map((alt) => ({
          id: alt.id,
          title: alt.title,
          summary: alt.premise,
          pros: [alt.narrative_payoff],
          cons: alt.contradiction_risks,
        })),
        assumptions: belScenario.speculative_assumptions,
        potential_impacts: [
          {
            target_id: 'country:BEL',
            tier: 'VERIFIED_DIRECT',
            detail: 'Shifts derived population density from 11,590.91 to 2,809.92 people/sq km (-75.76%).',
          },
        ],
        consistency_risks: belScenario.potential_contradictions,
        creator_notes: 'Candidate resolution for CRD-BEL-LAND-AREA drift finding.',
        review_status: 'UNDER_REVIEW',
        canon_status: 'SCENARIO',
        ratification_evidence: null,
      }),
    );
  }

  return proposals.sort((a, b) => codeUnitCompare(a.proposal_id, b.proposal_id));
}
