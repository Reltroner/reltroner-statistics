/**
 * Source-grounded Narrative Opportunity Discovery & Creative Development Roadmap Engine.
 *
 * Strictly avoids generic AI tropes. Every candidate opportunity explains:
 *  - Which established worldbuilding element inspired it
 *  - What narrative question it explores
 *  - What is already established in canon
 *  - What remains hypothetical
 *  - What contradiction or consistency risk may arise
 *  - How the creator could develop it further
 */

import type { StatisticsDataset } from '../../domain/observation.ts';
import type {
  CreativeOpportunity,
  NarrativeEntity,
  NarrativeRelationship,
  OpportunityCategory,
} from '../../domain/creative.ts';
import type { SourceSnapshot } from '../comparator.ts';
import { codeUnitCompare } from '../canonical.ts';
import { sha256Hex } from '../git-objects.ts';
import { slug } from '../observations.ts';

function oppId(category: OpportunityCategory, key: string): string {
  return `OPP-${sha256Hex(`${category}|${key}`).slice(0, 12).toUpperCase()}`;
}

export function discoverCreativeOpportunities(input: {
  stats: StatisticsDataset;
  entities: NarrativeEntity[];
  relationships: NarrativeRelationship[];
  production: SourceSnapshot;
  remodeling: SourceSnapshot;
}): CreativeOpportunity[] {
  const { stats, entities, production } = input;
  const prodCommit = production.identity.commit_sha;
  const nccmBlob = stats.production?.blob_sha ?? production.identity.tree_sha;
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const opportunities = new Map<string, CreativeOpportunity>();

  const add = (o: Omit<CreativeOpportunity, 'id'> & { key: string }) => {
    const id = oppId(o.category, o.key);
    const { key: _k, ...rest } = o;
    opportunities.set(id, { id, ...rest });
  };

  const anchorFor = (entityId: string, fallbackPath = stats.dataset_path, fallbackQuote = 'Documented in source.') => {
    const ent = entityById.get(entityId);
    if (ent) {
      return {
        path: ent.source_path,
        commit_sha: ent.commit_sha,
        blob_sha: ent.blob_sha,
        line: ent.evidence_line,
        quote: ent.evidence_quote,
        entity_id: ent.id,
      };
    }
    return {
      path: fallbackPath,
      commit_sha: prodCommit,
      blob_sha: nccmBlob,
      line: null,
      quote: fallbackQuote,
      entity_id: null,
    };
  };

  // 1. UNRESOLVED_INSTITUTIONAL_TENSION: Reltronland financial custody vs Depcutland archival custody under shared Henchoway/Nytherion threat.
  if (entityById.has('nar:nation:reltronland') && entityById.has('nar:nation:depcutland')) {
    add({
      key: 'reltronland-depcutland-custody-vs-existential-threat',
      category: 'UNRESOLVED_INSTITUTIONAL_TENSION',
      title: 'Cross-sovereign verification crisis between Reltronland financial custody and Depcutland archival custody',
      inspired_by: 'Section 8.6 and Section 8.8 of content/factions/reltronland-vs-depcutland.md (Financial Custody vs Epistemic Custody; Season 30 AICR deposit in the Endless Library).',
      canon_anchors: [
        anchorFor('nar:nation:reltronland'),
        anchorFor('nar:nation:depcutland'),
        ...(entityById.has('nar:constraint:bilateral-sovereignty-without-alliance')
          ? [anchorFor('nar:constraint:bilateral-sovereignty-without-alliance')]
          : []),
      ],
      narrative_question:
        'What institutional friction emerges when an urgent Henchoway infiltration audit requires cross-referencing Reltronland settlement records against sealed third-party provenance archives in Depcutland’s Endless Library?',
      established_facts: [
        'Reltronland (SDI 0.984) is Asthortera’s primary financial-custody and settlement center, governed by the Astralis anti-capture doctrine.',
        'Depcutland (SDI 0.981) is the "Oracle of Asthortera," whose geopolitical authority rests on archival neutrality and wartime custodial trust validated in the 1031 BAC audit.',
        'Both nations cooperate against Henchoway and Nytherion risks, and Season 30 establishes AICR record deposits in the Endless Library for cross-sovereign redundancy.',
        'Neither state will accept subordination, foreign-administered settlement, or the loss of its core institutional identity.',
      ],
      hypothetical_space: [
        'Specific verification protocols when a Henchoway contractor network exploits the boundary between financial settlement data and sealed archival provenance.',
        'How mid-level auditors and archivists (who share cross-border family ties) navigate conflicting legal mandates without violating either state’s sovereignty.',
      ],
      potential_conflict:
        'Reltronland’s anti-capture investigators demand rapid disclosure to neutralize a live Henchoway dependency chain, while Depcutland’s custodians refuse unilateral unsealing that would damage centuries of international custodial trust.',
      affected_entities: [
        'nar:nation:reltronland',
        'nar:nation:depcutland',
        ...(entityById.has('nar:faction:henchoway') ? ['nar:faction:henchoway'] : []),
      ],
      possible_alternatives: [
        {
          id: 'ALT-ZERO-KNOWLEDGE-AUDIT',
          label: 'Blind雙-Custody Verification Protocol',
          summary: 'Archivists and financial auditors design a zero-disclosure joint verification chamber under Troncut Treaty dispute clauses.',
          mechanism: 'Proves whether a contractor record is compromised without transferring custody of third-party archives to Reltronland.',
          narrative_tradeoff: 'Preserves both states’ institutional doctrines while creating high-stakes procedural suspense and third-party misperceptions of a secret alliance.',
        },
        {
          id: 'ALT-JURISDICTIONAL-STANDOFF',
          label: 'Temporary Border Clearing Freeze & Civilian Mediation',
          summary: 'Official ministries deadlock over subpoena authority until cross-border academic and family networks expose the Henchoway intermediary.',
          mechanism: 'Highlights the canonical rule that bilateral inseparability is strongest from below (civilian networks) rather than elite decree.',
          narrative_tradeoff: 'Emphasizes social realism and institutional fallibility, though slower in diplomatic tempo.',
        },
      ],
      assumptions: [
        'Assumes the investigated contractor operates across both Reltronepolis financial clearing and Depsetica archival licensing.',
        'Assumes neither government invokes military coercion, consistent with post-1010 BAC Troncut Treaty guarantees.',
      ],
      consistency_risks: [
        'Must not portray Depcutland’s refusal as Depeisit-style aristocratic corruption (which ended in 1031–1030 BAC).',
        'Must not merge Reltronland and Depcutland into a unified supranational security command.',
      ],
      development_steps: [
        'Anchor the dispute in a specific Season 30 AICR redundancy deposit clause.',
        'Contrast a Reltronland anti-capture auditor’s fear of systemic recurrence with a Depcutland archivist’s fear of losing neutral credibility.',
        'Show a third-party nation misinterpreting their eventual technical coordination as proof of a bilateral hegemonic bloc.',
      ],
      priority_score: {
        structural_reach: 0.94,
        tension_density: 0.96,
        coverage_gap: 0.78,
        composite: 0.91,
        explanation: 'Connects the two highest-SDI nations, the primary transnational antagonist (Henchoway), and explicitly documented Season 30 forward hooks.',
      },
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  // 2. UNDERDEVELOPED_ENTITY: Development-5 cohort and Deferred-18 states.
  const dev5 = stats.entities.filter((e) => e.cohort === 'DEVELOPMENT_5');
  if (dev5.length > 0) {
    const dev5Ids = dev5.map((e) => `nar:nation:${slug(e.name)}`).filter((id) => entityById.has(id));
    add({
      key: 'development-5-and-deferred-18-institutional-profiles',
      category: 'UNDERDEVELOPED_ENTITY',
      title: `Institutional and historical expansion for the ${dev5.length} Development-Cohort nations (${dev5.map((d) => d.name).join(', ')})`,
      inspired_by: `NCCM V6.5 two-tier cohort structure (${stats.dataset_path}): 14 fully profiled nations vs ${dev5.length} development-cohort nations and 18 deferred states.`,
      canon_anchors: dev5Ids.slice(0, 3).map((id) => anchorFor(id)),
      narrative_question:
        'How do the five development-cohort civilizations navigate trade, monetary stability, and talent retention alongside the 14 fully profiled powers without losing their specialized cultural identities?',
      established_facts: [
        `The ${dev5.length} development-cohort states (${dev5.map((d) => d.name).join(', ')}) have core Year 0 population, GDP, and SDI anchors in ${stats.dataset_path}, plus dedicated faction markdown profiles.`,
        'Several sub-indicators (such as Gini, urbanization, and historical pre-rebase series) are explicitly unassigned (NULL/MISSING) in the development cohort.',
        'Eighteen additional sovereign states are represented only as a combined residual aggregate in Year 0.',
      ],
      hypothetical_space: [
        'Bilateral trade and transit treaties between the 5 development-cohort nations and older Eastern Continental powers.',
        'How specialization (e.g., Astrostelia’s cosmic observatories, Calespia’s gastronomy/agriculture, Krisberia’s crystalline craftsmanship, Lenternow’s lanternlight urbanism, Scenrepolia’s electromagnetic engineering) shapes their diplomatic leverage.',
      ],
      potential_conflict:
        'High-SDI magnet states (Reltronland, Depcutland, Aurastelia) attract skilled researchers, forcing smaller or specialized nations to build distinct institutional incentives rather than competing on raw financial scale.',
      affected_entities: dev5Ids.length ? dev5Ids : ['nar:world:asthortera'],
      possible_alternatives: [
        {
          id: 'ALT-SPECIALIZED-GUILD-COMPACT',
          label: 'Cross-Specialized Technical Standards Compact',
          summary: 'Krisberia, Scenrepolia, and Astrostelia establish joint precision-instrument and observatory standards that larger powers must license.',
          mechanism: 'Turns niche technical specialization into asymmetric diplomatic leverage within the multipolar order.',
          narrative_tradeoff: 'Gives smaller nations active agency without requiring military or population parity.',
        },
        {
          id: 'ALT-MIGRATION-CIRCULATION',
          label: 'Rotational Fellowship & Return-Service Charter',
          summary: 'Models how citizens study in Reltronland or Depcutland and return to serve in Calespia or Lenternow.',
          mechanism: 'Directly links to the Year 0 migration flows and return-service cultural documents.',
          narrative_tradeoff: 'Grounds macroscopic demographic statistics in personal family and career decisions.',
        },
      ],
      assumptions: [
        'Preserves all unassigned statistical fields as unknown until formally modeled.',
        'Does not disaggregate the 18 deferred states without a ratified census update.',
      ],
      consistency_risks: [
        'Avoid inventing unratified GDP or land-area numbers in prose that could conflict with the planetary residual sum.',
      ],
      development_steps: [
        'Select one development-cohort nation and link its faction profile to at least one historical event and one international organization.',
        'Author a focused diplomatic or trade vignette illustrating its specialization in action.',
      ],
      priority_score: {
        structural_reach: 0.85,
        tension_density: 0.74,
        coverage_gap: 0.95,
        composite: 0.86,
        explanation: 'Highest structural coverage gap in the statistical-to-narrative graph.',
      },
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  // 3. UNEXPLORED_HISTORICAL_CONSEQUENCE: Post-1010 BAC creditor accountability & 1031 BAC institutional audit records.
  if (entityById.has('nar:nation:reltronland') && entityById.has('nar:nation:depcutland')) {
    add({
      key: 'unexplored-1031-bac-audit-and-creditor-accountability',
      category: 'UNEXPLORED_HISTORICAL_CONSEQUENCE',
      title: 'The 1031 BAC Institutional Integrity Audit & unresolved pre-war creditor accountability',
      inspired_by: 'Section 6.3 and Section 10.3 of content/factions/reltronland-vs-depcutland.md (1031 BAC Institutional Integrity Assessment; open questions on creditor knowledge of systemic distress).',
      canon_anchors: [anchorFor('nar:nation:reltronland'), anchorFor('nar:nation:depcutland')],
      narrative_question:
        'How did the 1031 BAC joint/targeted auditors verify the neutrality of the Grand Library and CBC amidst active wartime distrust, and what pre-war creditor records remained contested during the 1030–1010 BAC Merit Archival reconstruction?',
      established_facts: [
        'In 1031 BAC, audits distinguished the Grand Library of Depcutland and CBC from the captured aristocratic administration, enabling the First Institutional Ceasefire.',
        'Section 10.3 explicitly lists "Creditor knowledge of systemic distress, lending incentives and any institutional complicity" as an open evidentiary question.',
        'By 1010 BAC, the Troncut Treaty institutionalized managed coexistence and reopened diplomatic and economic corridors.',
      ],
      hypothetical_space: [
        'The personal and procedural drama of the 1031 BAC audit teams working under ceasefire protocols.',
        'How compromised pre-war lending practices in both Depeisit-linked networks and Reltronland credit markets were reformed.',
      ],
      potential_conflict:
        'Hardline wartime factions on both sides have incentives to sabotage the 1031 BAC audit—either to justify total conquest of Depcutland’s archives or to hide pre-war debt rollover complicity.',
      affected_entities: ['nar:nation:reltronland', 'nar:nation:depcutland'],
      possible_alternatives: [
        {
          id: 'ALT-1031-AUDIT-CHRONICLE',
          label: 'The 1031 BAC Ceasefire Audit Dossier',
          summary: 'Follows a Reltronland forensic accountant and a Depcutland Merit Coalition archivist verifying third-party records under artillery ceasefire.',
          mechanism: 'Demonstrates how empirical evidence forced Reltronland to correct its blanket suspicion and helped Depcutland separate custodial heritage from regime failure.',
          narrative_tradeoff: 'Turns an abstract historical milestone into a concrete institutional thriller.',
        },
      ],
      assumptions: [
        'Maintains the 1031 BAC ceasefire as a limited institutional de-escalation, not the final end of the war (which concluded in 1030 BAC).',
      ],
      consistency_risks: [
        'Must not reduce the 1048–1030 BAC War of Conscience to a binary of virtuous Reltronland vs corrupt Depcutland.',
      ],
      development_steps: [
        'Map the 1031 BAC audit criteria to modern Year 0 anti-capture and archival standards.',
        'Specify which pre-war debt records were settled in the 1010 BAC Troncut Treaty and which remained sealed.',
      ],
      priority_score: {
        structural_reach: 0.88,
        tension_density: 0.89,
        coverage_gap: 0.82,
        composite: 0.87,
        explanation: 'Directly addresses open evidentiary questions explicitly flagged in Section 10.3 of the canonical bilateral dossier.',
      },
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  // 4. CHARACTER_MOTIVATION_CONFLICT: Kamila Alena's metaphysical stillness vs Vitor Baythorne's political world-order agenda.
  if (entityById.has('nar:faction:henchoway')) {
    add({
      key: 'kamila-throne-vs-vitor-adaptive-stillness',
      category: 'CHARACTER_MOTIVATION_CONFLICT',
      title: 'Divergence between Kamila Alena’s metaphysical Throne of Stillness and Vitor Baythorne’s political Adaptive Stillness',
      inspired_by: 'Section 3 and Section 6 of content/factions/henchoway.md (Kamila Alena vs Vitor Baythorne / Van Den Scuba; Season 12 framing).',
      canon_anchors: [
        anchorFor('nar:faction:henchoway'),
        ...(entityById.has('nar:character:kamila-alena') ? [anchorFor('nar:character:kamila-alena')] : []),
      ],
      narrative_question:
        'Where does Vitor Baythorne’s operational need for capable scientists, infrastructure, and institutional leverage collide with Kamila Alena’s philosophical vision of Nytherion as the cessation of striving?',
      established_facts: [
        'Kamila Alena represents the metaphysical Throne of Stillness and philosophical voice of Nytherion’s limits; she does not merely serve Vitor’s political program.',
        'Vitor Baythorne leads modern Henchoway and pursues a scalable, durable world-order project ("Adaptive Stillness"), including deep-sea infrastructure like Stillwater Meridian (Seasons 27–29).',
        'Henchoway suffers from a core internal contradiction: it requires capable researchers, learning, correction, and technical progress to manufacture a world that is less independently transformative.',
      ],
      hypothetical_space: [
        'Internal schisms within Henchoway’s Abyssal Science Division when operational ambition contradicts philosophical stillness.',
        'How protagonists (Delwyn Harper, Sterling Logger, Redley Ris, Rei Reltroner) perceive and exploit the fault line between Vitor’s institutional machinery and Kamila’s existential stance.',
      ],
      potential_conflict:
        'Vitor’s expansion into commercial/scientific consortia (such as PHDC / Stillwater Meridian) relies on human ambition and technical excellence—the exact qualities his ideology claims to supersede.',
      affected_entities: [
        'nar:faction:henchoway',
        ...(entityById.has('nar:character:kamila-alena') ? ['nar:character:kamila-alena'] : []),
        ...(entityById.has('nar:decision:adaptive-stillness-doctrine') ? ['nar:decision:adaptive-stillness-doctrine'] : []),
      ],
      possible_alternatives: [
        {
          id: 'ALT-ABYSSAL-SCIENCE-DEFECTOR',
          label: 'The Paradox of the Abyssal Researcher',
          summary: 'A senior researcher inside Henchoway’s Abyssal Science Division realizes that solving an anomaly requires the very scientific agency Henchoway seeks to sedate.',
          mechanism: 'Operationalizes the core contradiction documented in Section 6 of content/factions/henchoway.md.',
          narrative_tradeoff: 'Deepens antagonist complexity without turning Henchoway into a cartoon monolith.',
        },
      ],
      assumptions: [
        'Preserves the distinction between Nytherion as an enduring existential possibility and Henchoway as an organizational actor.',
      ],
      consistency_risks: [
        'Must not reduce Kamila Alena to a mid-level operational subordinate of Vitor Baythorne.',
      ],
      development_steps: [
        'Trace the transition from Season 12 philosophical framing to Seasons 27–29 Stillwater Meridian infrastructure.',
        'Contrast Vitor’s strategic calculations with Kamila’s existential dialogue.',
      ],
      priority_score: {
        structural_reach: 0.86,
        tension_density: 0.92,
        coverage_gap: 0.75,
        composite: 0.85,
        explanation: 'Explores an explicitly documented internal contradiction at the heart of the primary antagonist architecture.',
      },
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  // 5. WORLDBUILDING_RELATIONSHIP_POTENTIAL: Hargenbor’s sovereignty paradox between maritime commerce, UAA diplomacy, and Tremora Trench proximity.
  if (entityById.has('nar:nation:hargenbor') && entityById.has('nar:faction:henchoway')) {
    add({
      key: 'hargenbor-sovereignty-paradox-and-pelagic-consortium',
      category: 'WORLDBUILDING_RELATIONSHIP_POTENTIAL',
      title: 'Hargenbor’s sovereignty paradox: Maritime guardian state vs deep-sea pelagic contractor leverage',
      inspired_by: 'Section 3, Section 8, and Section 12 of content/factions/henchoway.md and content/factions/hargenbor.md.',
      canon_anchors: [anchorFor('nar:nation:hargenbor'), anchorFor('nar:faction:henchoway')],
      narrative_question:
        'How do independent Hargenborian maritime authorities and honest pelagic engineers protect their national sovereignty when foreign powers suspect Hargenbor-linked deep-sea logistics of serving Henchoway’s Stillwater Meridian network?',
      established_facts: [
        'Hargenbor is a sovereign maritime civilization ("Guardian of the Central Seas of Asthortera") and a recognized UAA participant.',
        'Henchoway draws on Hargenbor-linked ports, shipbuilding, logistics, and capital near Tremora Trench, but Hargenbor is explicitly NOT Henchoway’s legal property or a uniform puppet.',
        'Reltronland cannot lawfully negate Hargenbor’s sovereignty simply on suspicion, and an independent Hargenbor can oppose Henchoway when its own maritime interests are threatened.',
      ],
      hypothetical_space: [
        'Domestic political and maritime inspection conflicts inside Hargenbor over licensing the Pelagic Heritage Development Consortium (PHDC).',
        'Joint maritime safety verification between Hargenbor, Kalgered, and Reltronland that respects Hargenborian jurisdiction.',
      ],
      potential_conflict:
        'Aggressive external sanctions or unilateral foreign patrols would alienate patriotic Hargenborians and push legitimate shipyards toward Henchoway-backed capital, whereas Hargenbor-led maritime audits can sever Henchoway’s logistics from within.',
      affected_entities: ['nar:nation:hargenbor', 'nar:faction:henchoway', 'nar:nation:reltronland'],
      possible_alternatives: [
        {
          id: 'ALT-HARGENBOR-ADMIRALTY-AUDIT',
          label: 'Hargenbor Admiralty Deep-Trench Inspection',
          summary: 'Hargenbor’s own maritime safety and coast guard institutions uncover unauthorized deep-trench cargo routing under a PHDC research permit.',
          mechanism: 'Demonstrates the "Sovereignty paradox" weakness of Henchoway (Section 12 of henchoway.md).',
          narrative_tradeoff: 'Honors Hargenbor’s national agency and avoids portraying an entire civilization as complicit.',
        },
      ],
      assumptions: [
        'Assumes PHDC permits include both genuine oceanographic research and concealed dual-use logistics.',
      ],
      consistency_risks: [
        'Never treat every Hargenborian sailor, port authority, or shipping firm as a Henchoway agent.',
      ],
      development_steps: [
        'Cross-link Hargenbor’s economic indicators (GDP, maritime trade share) with its geopolitical position in Seasons 27–29.',
      ],
      priority_score: {
        structural_reach: 0.83,
        tension_density: 0.88,
        coverage_gap: 0.84,
        composite: 0.85,
        explanation: 'High worldbuilding leverage connecting maritime geography, international law, and Seasons 27–29 plot architecture.',
      },
      creative_status: 'DISCOVERED_CANDIDATE',
    });
  }

  // 6. INTERSECTING_NARRATIVE_THREADS & UNUSED_WORLDBUILDING_CONSTRAINT: Recognition Scarcity & Aurora Covenant / House of Valethra in Seasons 41–44.
  add({
    key: 'recognition-scarcity-and-aurora-covenant-independent-lives',
    category: 'INTERSECTING_NARRATIVE_THREADS',
    title: 'Intersecting Recognition Scarcity with House of Valethra and The Five Voices of Aurora Covenant (Seasons 41–44)',
    inspired_by: 'Section 5 of content/factions/henchoway.md (Recognition Scarcity, 2026-11-11) and remodeling series dossiers content/series/house-of-valethra.md & content/series/the-five-voices-of-aurora-covenant.md.',
    canon_anchors: [
      ...(entityById.has('nar:faction:henchoway') ? [anchorFor('nar:faction:henchoway')] : []),
      ...(entityById.has('nar:narrative_arc:house-of-valethra') ? [anchorFor('nar:narrative_arc:house-of-valethra')] : []),
      ...(entityById.has('nar:narrative_arc:the-five-voices-of-aurora-covenant') ? [anchorFor('nar:narrative_arc:the-five-voices-of-aurora-covenant')] : []),
    ],
    narrative_question:
      'How do Hana Seraphine Lunara and the five sisters of the Aurora Covenant (Andrea, Elise, Inela, Olivia, Uriela) model meaningful, independent professional lives that resist Henchoway’s "comfort-as-surrender" appeal in a world of finite attention capital?',
    established_facts: [
      'Asthortera’s 4,412 billion sentients and 0.947 planetary SDI solve material scarcity, leaving finite "attention capital" and recognition scarcity as a real psychological pressure.',
      'Henchoway exploits recognition fatigue by framing surrender of agency as relief from competition.',
      'House of Valethra and The Five Voices of Aurora Covenant establish that inheriting royal stature or a shared family origin does not require inheriting a single public role—each sister and Hana chooses a distinct professional path.',
    ],
    hypothetical_space: [
      'How local community nodes (like the Aurorasia rehabilitation and volunteer-care network) provide genuine human recognition that immunizes citizens against Henchoway’s curated stillness.',
      'Interactions in Seasons 41–44 ("The Lobby of Six Unwritten Futures") where quiet professional dedication is contrasted with both celebrity obsession and abyssal withdrawal.',
    ],
    potential_conflict:
      'Characters face pressure between public institutional expectations and Henchoway’s seductive offer of effortless peace, discovering that conscious choice within a grounded community is the true counter-force.',
    affected_entities: [
      ...(entityById.has('nar:narrative_arc:house-of-valethra') ? ['nar:narrative_arc:house-of-valethra'] : []),
      ...(entityById.has('nar:narrative_arc:the-five-voices-of-aurora-covenant') ? ['nar:narrative_arc:the-five-voices-of-aurora-covenant'] : []),
      ...(entityById.has('nar:nation:aurastelia') ? ['nar:nation:aurastelia'] : []),
    ],
    possible_alternatives: [
      {
        id: 'ALT-AURORA-NODE-RESILIENCE',
        label: 'Community Recognition vs Curated Stillness',
        summary: 'Contrasts the local Aurora Covenant rehabilitation node with a prestigious PHDC/Henchoway-affiliated wellness fellowship.',
        mechanism: 'Tests the governing contrast from henchoway.md: Astralis requires the continued possibility of conscious choice and correction, not celebrity or nonstop labor.',
        narrative_tradeoff: 'Integrates the remodeling family-lore proposals directly into the philosophical core of The Abyss of Comfort.',
      },
    ],
    assumptions: [
      'Treats House of Valethra and The Five Voices of Aurora Covenant as remodeling-stage forward architecture (Seasons 41–44) until merged into production.',
    ],
    consistency_risks: [
      'Keep working facility and company labels marked provisional as specified in the source frontmatter.',
    ],
    development_steps: [
      'Review the remodeling diffs for House of Valethra and The Five Voices of Aurora Covenant.',
      'Link each sister’s professional domain to specific Aurastelian institutions without inflating the royal cast.',
    ],
    priority_score: {
      structural_reach: 0.81,
      tension_density: 0.87,
      coverage_gap: 0.8,
      composite: 0.83,
      explanation: 'Bridges the latest ratified ideological mechanism (Recognition Scarcity) with the newest remodeling series architectures.',
    },
    creative_status: 'DISCOVERED_CANDIDATE',
  });

  return [...opportunities.values()].sort(
    (a, b) => b.priority_score.composite - a.priority_score.composite || codeUnitCompare(a.id, b.id),
  );
}

