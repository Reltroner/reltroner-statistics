/**
 * Source fixtures for the Creative and Decision Intelligence tests.
 *
 * The prose lines are short verbatim excerpts of the pinned production documents (so the
 * evidence patterns are tested against the real wording); everything else, including the
 * dataset numbers from nccm-fixture.ts and the filler lines, is synthetic test data.
 */
import { fixtureSnapshot } from '../../src/adapters/fixture-snapshot.ts';
import { offlineDeployment } from '../../src/adapters/deployment.ts';
import { compareSources } from '../../src/engine/comparator.ts';
import { buildCreativeIntelligenceArtifact } from '../../src/engine/creative-intelligence/index.ts';
import { buildKnowledgeGraph } from '../../src/engine/graph-builder.ts';
import { extractStatistics, NCCM_DATASET_PATH } from '../../src/engine/observations.ts';
import { runQa } from '../../src/engine/qa.ts';
import { nccmFixture, TIMELINE_FIXTURE } from './nccm-fixture.ts';

export const SHA_A = 'a'.repeat(40);
export const SHA_B = 'b'.repeat(40);

export const RVD_FIXTURE = `---
title: "Reltronland vs Depcutland: The Twin Pillars of Conscious Civilization"
description: "Integrated Reltronland–Depcutland canon."
lastUpdated: "2026-11-07"
---

# Reltronland vs Depcutland: The Twin Pillars of Conscious Civilization

This is a **consolidated historical, geopolitical, economic, and narrative reference** for Reltronland and Depcutland in Asthortera, including their shared ancestry, the **War of Conscience (1048–1030 BAC)**, the **Troncut Treaty (1010 BAC)**, and their modern relationship.

- **Unspecified operational details stay unspecified.** Do not invent the CEO's identity, company name, bank name, missile type, exact casualties, precise attack hour, disputed intelligence evidence, or a final judicial verdict.

| Dimension | Reltronland | Depcutland |
|---|---|---|
| Civilizational direction | Clarity, agency, action, merit and Astralis Pinnacle | Memory sovereignty, archival credibility, continuity and merit-based reform |
| Wartime strategic fear | Loss of economic continuity and recurrence of Depeisit-type systemic failure | Loss of industry, independent agency, territory and national continuity |

Both states emerged from the crisis and migration history of **Depeisit**, where Reltronland's predecessor had already developed substantial capabilities.

**Reltronland (1125 BAC; Troner Rhett)** and **Depcutland (1121 BAC; Cutter Glouster)** were independent **before** the **1057 BAC Depeisit Economic Crisis**.

The **Depeisit Economic Crisis** originated in a civilization of **25 trillion inhabitants with SDI 0.852/1.000** and spread to the two already independent states.

**1057 BAC — Depeisit Economic Crisis** destabilized the economic networks of **two already independent states**.

The blockade intensified payment, production and trust problems. It **did not create the entire debt crisis**, which already originated from the Depeisit aftermath.

The arrest triggered an acute political crisis, but both states' military intentions were already embedded in a larger financial contest.

1. The Depcutland CEO engaged in patent-violating trade and was arrested in Reltronepolis.
2. Depcutland's government ordered the initial military operation attempting to penetrate Neiput.
3. Reltronland detected and blocked that movement while retaining a prospective invasion plan for recovery of overdue debt.
4. Depcutland fired the first missiles from a nearby base against Reltronland's blockade.
5. The conflict escalated into the **Reltronland–Depcutland War / War of Conscience (1048–1030 BAC)**.

The blockade and the prospective invasion therefore must not be merged into a simple story that Reltronland was *only* defending a border. Nor does a creditor's unpaid claim create an automatic right to invade debtor territory.

The record does **not** yet specify whether Depcutland held a verifiable Reltronland invasion order or inferred imminent attack from deployments; whether the missile launch was separately ordered by the central leadership or delegated to a base command; the precise military losses; or the detailed legal findings on the CEO. Until authored, those are **open facts**, not grounds to fabricate an answer.

**Grand Library of Depcutland:** audits found a long history of custodial neutrality, international archival trust, preservation of third-party records and no verified political manipulation or unauthorized release of entrusted archives for aristocratic advantage.

> **Institution ≠ regime. Preserve credible civilizational infrastructure; dismantle captured authority.**

6. **Political guarantees:** non-interference, institutional independence and mechanisms for resolving future disputes without unilateral territorial expansion.

The treaty is **not** an alliance grounded in affection or an ancestral brotherhood oath. It is the institutionalization of **managed coexistence and a reciprocal strategic bargain**.

The states did **not** merge into a military alliance. They re-established sovereign diplomacy and cooperation where the expected mutual value exceeded the costs.

Other civilizations possess their own specialized capabilities and sovereign trajectories; Nytherion Abyss remains a separate existential opposition rather than a justification for treating all states as satellites.

**The most enduring reason Reltronland and Depcutland cannot cleanly separate is the scale of ordinary civilian interdependence.** Across generations, many families have close relatives on both sides.

| **Strategic institutions** | Banking, energy, navigation, archives, risk management and emergency interoperability | Corporate mandates and state sovereignty |

A state that tries to sever the relationship would disrupt not only finance and industry, but **its own citizens' families, schools, social worlds and livelihoods**. This is a **domestic constraint on hard geopolitical separation**, not evidence that either society surrendered national sovereignty.

**Reltronland is the largest financial-custody center in Asthortera.** Its reliable markets attract custody and financial activity.

**Depcutland, the Oracle of Asthortera, recognizes and anticipates the danger of economic value being separated from where knowledge was created.**

**Financial custody, transfer pricing, intellectual-property ownership, taxation, archive custody and territorial jurisdiction are different relationships.**

**TCBC is privately governed**, not a merged sovereign treasury; the **Grand Library/Endless Library has independent custodial integrity** under Depcutland.

**Their disagreements do not prevent them from repeatedly needing to cooperate on global crises, Henchoway-linked threats and Nytherion-related risks.** Civilian networks, supply chains, research infrastructures, archives and critical systems create practical stakes on both sides. A shared response may be necessary **without agreement about motive, blame, methods, liability or foreign policy**.

**Henchoway** is an intentional transnational actor; **Nytherion Abyss** is a wider existential and metaphysical condition.

The very competence with which these neighbors translate one another's objections can create **an external illusion of alliance**. **Explanatory accuracy is not allegiance, operational cooperation is not automatic agreement, and a specific joint response is not a permanent military alliance.**

| Forward arc | Documented cooperative or contested mechanism | Limit of inference |
|---|---|---|
| **Season 30** | AICR deposits selected records in Depcutland's Endless Library for **cross-sovereign redundancy** | Independent custody does not merge government or ownership |
| **Season 31** | **Reciprocal Continuity Protocol**, with the two institutions preserving evidence of their own possible failures | Sharing records does not elevate ancestry or replace sovereign judgment |
| **Season 39** | Reltronland calls for early risk mitigation; Depcutland requires pre-remediation provenance; the forum negotiates a **minimum interoperable response** | Agreement on limited safety steps is not universal political consensus |

These forward-season events and institutions are **design architecture until promoted**, not proof of historical ratification or completed episodes.

**Enduring relationship model:** socially inseparable **from below**; strategically competitive and sovereign **from above**; often forced into issue-specific cooperation **by shared consequences**; and frequently perceived as allies **from outside**.

Different institutions describe the same history at different levels of abstraction. These are **perspectives**, not automatically facts or propaganda.

- **Close civilian kinship does not erase nationality or make border controls meaningless.**
- **Foreign perceptions of mutual support do not create a common alliance, currency, treasury or unlimited shared liability.**
- **Forward Seasons 30–40 are planning evidence, not already completed canon events.**

The following require **additional author decisions or in-world evidence**, not retrospective invention:

- Creditor knowledge of systemic distress, lending incentives and any institutional complicity.
- Whether Depcutland possessed authenticated Reltronland invasion orders before launching its missiles.
- Allocation of responsibility among financial institutions, political elites, military commands, companies, citizens and the Depeisit inheritance.

These uncertainties **do not undo** the events explicitly established above.
`;

export const HENCHOWAY_FIXTURE = `---
title: "Henchoway — The Architecture of Stillness"
lastUpdated: "2026-11-11"
---

# Henchoway — The Architecture of Stillness

> **Core distinction:** Nytherion is an enduring metaphysical and existential possibility; Henchoway is an actor attempting to institutionalize its effects; Hargenbor is a separate sovereign nation whose resources and factions can become part of that contest.

The precise legal, personnel and institutional continuity between Kamila's ancient movement, Vexor's Scuba Division, and Vitor's modern network **is not fully established**. They must not be presented as a documented, uninterrupted chain of command across millennia.

**Adaptive Stillness** is the doctrine through which modern Henchoway learns from the costs of crude suppression.

**Boundary of attribution:** Henchoway does not own Asthortera's internet or every recommendation algorithm, and it is not the author of every rejection, quiet career, community preference, or restorative act. A direct Henchoway operation requires evidence of an actor, mechanism, jurisdiction and consequence.

### Kamila Alena — The Throne of Stillness

### Vitor Baythorne / Van Den Scuba — Political Architect

### Brexar Veilthorn — First Descent Marshal

**The core contradiction:** Henchoway needs capable researchers, learning, correction, investment and technical progress to manufacture a world that is less independently transformable.

The [dedicated organization dossier](../organizations/henchoway.md) describes their operational boundaries.

### Tremora Trench — Central Abyssal Command

### Hargenbor — Strategic Leverage, Not a Puppet State

### Stillwater Meridian — Planned Distributed Expansion

Reltronland is dangerous to Vitor not merely because it is militarily and technologically powerful. Its **Astralis anti-capture doctrine** makes it an example of civilization that can change.

## Related Canon
`;

const HENCHOWAY_ORG_FIXTURE = `---
title: "Henchoway — Organization and Operations"
---

# Henchoway — Organization and Operations

### Kamila Alena — The Throne

### Brexar Veilthorn — Operational Depth

### Tremora Trench — Deep-Sea Command Network

### Stillwater Meridian — Planned Expansion Platform

## Related Canon
`;

export const ABYSS_FIXTURE = [
  '---', 'title: "The Abyss of Comfort"', '---', '', '# The Abyss of Comfort', '',
  '> “The most terrifying abyss is not darkness, but comfort.”', '',
  'Delwyn Harper investigates across Reltronland and Depcutland while Henchoway acts through intermediaries.', '',
  "Henchoway's killing of Garren is a genuine operational victory, but its interpretation of that victory can be strategically wrong. Henchoway believes it has removed an investigator and weakened Reltronland's influence in Pencilfania.", '',
  ...Array.from({ length: 1600 }, (_, i) => (i % 80 === 0 ? `## Synthetic section ${i / 80 + 1}` : `Synthetic filler line ${i + 1} for the length test.`)),
].join('\n');

const VALETHRA_FIXTURE = `---
title: "House of Valethra — The Family That Chose Different Paths"
description: "A focused House of Valethra family architecture. Undisclosed biological sibling branches remain deliberately mysterious."
canonStatus: "Creator-approved bounded family architecture; working names and company labels remain provisional"
---

# House of Valethra

A family architecture inside the forward seasons of [The Abyss of Comfort](./the-abyss-of-comfort.md).
`;

const ROADMAP_FIXTURE = `---
title: "Asthortera Novel Series Roadmap"
---

# Asthortera Novel Series Roadmap

## Screen-program cross-reference — Asthortera Ball TV (2026-11-07)

Production notes for the screen program. See [The Abyss of Comfort](./the-abyss-of-comfort.md).

## Timeline Inter-Series: Asthortera Canonical Order

In-world order of the series.
`;

const stub = (title: string, body: string) => `---\ntitle: "${title}"\n---\n\n# ${title}\n\n${body}\n`;

export function creativeSnapshots(overrides: { beluftnerDraftArea?: number; production?: Record<string, string>; remodeling?: Record<string, string> } = {}) {
  const shared = {
    'data/asthortera/old-model-v3.json': '{"schema_version":"old"}',
    'content/events/history-timeline.md': `---\ntitle: History\n---\n${TIMELINE_FIXTURE}`,
    'content/factions/alpha.md': stub('Alpha', 'Alpha borders Beluftner across the northern strait of the fixture world.'),
    'content/factions/beluftner.md': stub('Beluftner', 'Beluftner is a fixture nation used by the tests of this repository.'),
    'content/factions/reltronland.md': stub('Reltronland', 'Reltronland is one of the two neighbors described in the bilateral dossier.'),
    'content/factions/depcutland.md': stub('Depcutland', 'Depcutland is one of the two neighbors described in the bilateral dossier.'),
    'content/factions/hargenbor.md': stub('Hargenbor', 'Hargenbor is a sovereign maritime nation in the fixture corpus of the tests.'),
    'content/factions/reltronland-vs-depcutland.md': RVD_FIXTURE,
    'content/factions/henchoway.md': HENCHOWAY_FIXTURE,
    'content/organizations/henchoway.md': HENCHOWAY_ORG_FIXTURE,
    'content/philosophies/nytherion-abyss.md': stub('Nytherion Abyss', 'Nytherion Abyss is described as an existential condition in the fixture corpus.'),
    'content/places/endless-library-of-depcutland.md': stub('Endless Library of Depcutland', 'The Endless Library continues the Grand Library of Depcutland in the fixture corpus.'),
    'content/characters/kamila-alena.md': stub('Kamila Alena', 'Kamila Alena is named in the Henchoway dossier of the fixture corpus.'),
    'content/series/the-abyss-of-comfort.md': ABYSS_FIXTURE,
    'content/series/series-roadmap.md': ROADMAP_FIXTURE,
  };
  const prod = fixtureSnapshot('production', SHA_A, { [NCCM_DATASET_PATH]: JSON.stringify(nccmFixture()), ...shared, ...(overrides.production ?? {}) });
  const draft = fixtureSnapshot('remodeling', SHA_B, {
    [NCCM_DATASET_PATH]: JSON.stringify(nccmFixture({ beluftnerArea: overrides.beluftnerDraftArea ?? 363 })), ...shared,
    'content/series/house-of-valethra.md': VALETHRA_FIXTURE,
    'content/series/the-five-voices-of-aurora-covenant.md': stub('The Five Voices of Aurora Covenant', 'A proposed family story that names The Abyss of Comfort as its parent series.'),
    ...(overrides.remodeling ?? {}),
  });
  return { prod, draft };
}

/** The full analysis chain over the fixture snapshots. */
export async function creativeWorld(overrides: Parameters<typeof creativeSnapshots>[0] = {}) {
  const { prod, draft } = creativeSnapshots(overrides);
  const audit = await compareSources(prod, draft, { deployment: offlineDeployment('fixture'), generatedAt: '2026-01-01T00:00:00Z' });
  const stats = await extractStatistics(prod, draft);
  const qaProd = runQa(nccmFixture(), 'PRODUCTION_MAIN');
  const qaRemod = runQa(nccmFixture({ beluftnerArea: overrides.beluftnerDraftArea ?? 363 }), 'REMODELING_MAIN');
  const graph = await buildKnowledgeGraph({ audit, stats, qa: qaProd, production: prod, remodeling: draft });
  const creative = await buildCreativeIntelligenceArtifact({ production: prod, remodeling: draft, audit, stats, qaProduction: qaProd, qaRemodeling: qaRemod, graph, generatedAt: '2026-01-01T00:00:00Z' });
  return { prod, draft, audit, stats, qaProd, qaRemod, graph, creative };
}
