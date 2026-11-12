import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { strFromU8 } from 'fflate';
import { fixtureSnapshot } from '../../src/adapters/fixture-snapshot.ts';
import { offlineDeployment } from '../../src/adapters/deployment.ts';
import {
  CreativeArtifactSchema,
  CreativeProposalSchema,
} from '../../src/contracts/schemas.ts';
import {
  isVerifiedNarrativeDependency,
  transitionProposalStatus,
  type CreativeArtifact,
  type CreativeProposal,
} from '../../src/domain/creative.ts';
import { compareSources } from '../../src/engine/comparator.ts';
import {
  buildCreativeIntelligenceArtifact,
  extractNarrativeKnowledge,
  generateDeterministicIdeation,
  getAiAdapterStatus,
  runNarrativeAudit,
  simulateNarrativeImpact,
} from '../../src/engine/creative-intelligence/index.ts';
import { buildKnowledgeGraph } from '../../src/engine/graph-builder.ts';
import { extractStatistics, NCCM_DATASET_PATH } from '../../src/engine/observations.ts';
import { runQa } from '../../src/engine/qa.ts';
import {
  buildCreativeReportFindings,
  proposalToFinding,
} from '../../src/export/creative-reports.ts';
import { executeExport, renderFormat } from '../../src/export/bundle.ts';
import { buildReportDocument, type ReportContext } from '../../src/export/model.ts';
import { EXPORT_FORMATS, makeExportPlan } from '../../src/export/plan.ts';
import { nccmFixture, TIMELINE_FIXTURE } from '../fixtures/nccm-fixture.ts';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

const RVD_FIXTURE = `---
title: Reltronland vs. Depcutland
description: Bilateral comparative profile of Reltronland and Depcutland
lastUpdated: 2026-11-10
---
# Reltronland vs. Depcutland

Both civilizations trace their shared lineage to **Planet Depeisit** and the twins Tron and Cut before the **1057 BAC Depeisit Economic Crisis**.
Reltronland (1125 BAC, Troner Rhett) and Depcutland (1121 BAC, Cutter Glouster) were sovereign states decades before the **1057 BAC Depeisit Economic Crisis**.
Reltronland emphasizes institutional resilience, financial custody, and Astralis anti-capture doctrine.
Loss of economic continuity and recurrence of Depeisit-type systemic failure drives Reltronland vigilance.
Depcutland emphasizes archival stewardship, the Oracle of Asthortera, and epistemic accountability.
Loss of industry, independent agency, territory and national continuity shapes Depcutland vigilance.
The 1031 BAC Institutional Integrity Assessment and Ceasefire validated the neutrality of the Grand Library and the Central Banking Consortium.
They are socially inseparable **from below**; strategically competitive and sovereign **from above**.
The very competence with which these neighbors translate one another's objections can create **an external illusion of alliance**.
Financial custody, transfer pricing, intellectual-property ownership, taxation, archive custody and territorial jurisdiction are different relationships.

## 9. How the Same War Is Narrated
Institutional capture → Reltronland invades → Depcutland reacts vs blockade narratives.
`;

const HENCHOWAY_FIXTURE = `---
title: Henchoway
description: Transnational organization pursuing Adaptive Stillness
lastUpdated: 2026-11-11
---
# Henchoway

Vitor Baythorne leads modern Henchoway under **Adaptive Stillness** and **Recognition Scarcity**.
The precise legal, personnel and institutional continuity between Kamila's ancient movement, Vexor's Scuba Division, and Vitor's modern network **is not fully established**.
Henchoway presents stillness as relief, protection, and curated belonging inside a world too vast to notice everyone.
Reltronland is dangerous to Vitor because of its anti-capture institutions and institutional neutralization resistance.
Nytherion is an enduring metaphysical and existential possibility that Henchoway exploits.
Hargenbor — Strategic Leverage, Not a Puppet State.
Henchoway does not own Asthortera's internet or every recommendation algorithm.
`;

const ABYSS_FIXTURE = `---
title: The Abyss of Comfort
description: Master narrative dossier for Seasons 1–44
---
# The Abyss of Comfort

Delwyn Harper and Redley Ris investigate the conspiracy across Reltronland and Depcutland.
Henchoway's killing of Garren is a genuine operational victory, but its interpretation of that victory can be strategically wrong.
`;

const VALETHRA_FIXTURE = `---
title: House of Valethra
description: Royal and Independent Family Architecture inside Seasons 41–44
canonStatus: working remodeling proposal
---
# House of Valethra

A Royal and Independent Family Architecture inside Seasons 41–44 of The Abyss of Comfort.
Undisclosed biological sibling branches remain deliberately mysterious.
`;

function buildCreativeFixtures() {
  const prod = fixtureSnapshot('production', SHA_A, {
    [NCCM_DATASET_PATH]: JSON.stringify(nccmFixture()),
    'data/asthortera/old-model-v3.json': '{"schema_version":"old"}',
    'content/events/history-timeline.md': `---\ntitle: History\n---\n${TIMELINE_FIXTURE}`,
    'content/factions/alpha.md': '---\ntitle: Alpha\n---\nAlpha borders Beluftner.',
    'content/factions/beluftner.md': '---\ntitle: Beluftner\n---\nBeluftner text.',
    'content/factions/reltronland-vs-depcutland.md': RVD_FIXTURE,
    'content/factions/henchoway.md': HENCHOWAY_FIXTURE,
    'content/organizations/henchoway.md': '---\ntitle: Henchoway Operations\n---\nOperational divisions and contractor shells.',
    'content/series/the-abyss-of-comfort.md': ABYSS_FIXTURE,
    'content/series/series-roadmap.md': '---\ntitle: Series Roadmap\n---\nIn-universe novel chronology and P6/P7 adaptation scope.',
  });

  const draft = fixtureSnapshot('remodeling', SHA_B, {
    [NCCM_DATASET_PATH]: JSON.stringify(nccmFixture({ beluftnerArea: 363 })),
    'data/asthortera/old-model-v3.json': '{"schema_version":"old"}',
    'data/kalgered/kalgered-remodeling-candidate-v1.json': '{"countries":37}',
    'data/kalgered/kalgered-consumption-v65.json': '{"version":"6.5"}',
    'content/events/history-timeline.md': `---\ntitle: History\n---\n${TIMELINE_FIXTURE}`,
    'content/factions/alpha.md': '---\ntitle: Alpha\n---\nAlpha borders Beluftner.',
    'content/factions/beluftner.md': '---\ntitle: Beluftner\n---\nBeluftner text.',
    'content/factions/reltronland-vs-depcutland.md': RVD_FIXTURE,
    'content/factions/henchoway.md': HENCHOWAY_FIXTURE,
    'content/organizations/henchoway.md': '---\ntitle: Henchoway Operations\n---\nOperational divisions and contractor shells.',
    'content/series/the-abyss-of-comfort.md': ABYSS_FIXTURE,
    'content/series/series-roadmap.md': '---\ntitle: Series Roadmap\n---\nIn-universe novel chronology and P6/P7 adaptation scope.',
    'content/series/house-of-valethra.md': VALETHRA_FIXTURE,
    'content/series/the-five-voices-of-aurora-covenant.md': '---\ntitle: The Five Voices of Aurora Covenant\n---\nSeasons 41–44 community node.',
  });

  return { prod, draft };
}

test('Gates 1 & 2: verified narrative extraction and strict separation of co-occurrence/thematic links from causal dependencies', async () => {
  const { prod, draft } = buildCreativeFixtures();
  const audit = await compareSources(prod, draft, { deployment: offlineDeployment('fixture'), generatedAt: '2026-01-01T00:00:00Z' });
  const stats = await extractStatistics(prod, draft);
  const { entities, relationships } = await extractNarrativeKnowledge({ audit, stats, production: prod, remodeling: draft });

  assert.ok(entities.length >= 10, 'extracts narrative entities');
  for (const ent of entities) {
    assert.match(ent.commit_sha, /^[0-9a-f]{40}$/);
    assert.match(ent.blob_sha, /^[0-9a-f]{40}$/);
    assert.ok(ent.source_path.length > 0);
  }

  // Co-occurrence (MENTIONS) and thematic links (THEMATICALLY_RELATED) never count as verified causal dependencies
  assert.equal(isVerifiedNarrativeDependency('MENTIONS'), false);
  assert.equal(isVerifiedNarrativeDependency('THEMATICALLY_RELATED'), false);
  assert.equal(isVerifiedNarrativeDependency('CAUSES_CANDIDATE'), false);
  assert.equal(isVerifiedNarrativeDependency('CONSTRAINED_BY', 'VERIFIED_SOURCE_GROUNDED'), true);
  assert.equal(isVerifiedNarrativeDependency('CAUSES', 'CANDIDATE_HYPOTHESIS'), false);

  const qa = runQa(nccmFixture(), 'PRODUCTION_MAIN');
  const graph = await buildKnowledgeGraph({ audit, stats, qa, production: prod, remodeling: draft });
  const impact = simulateNarrativeImpact(graph, entities, relationships, 'nar:faction:henchoway');
  assert.ok(impact.verified_direct.every((d) => d.edge_type !== 'MENTIONS' && d.edge_type !== 'THEMATICALLY_RELATED'));
  assert.ok(impact.speculative_brainstorming.every((s) => s.quantitative_status === 'INSUFFICIENT_DATA_NO_QUANTITATIVE_MODEL'));
});

test('Gates 3, 4, 5 & 6: synthetic negative fixtures detect chronological contradictions, QA attribute conflicts, missing source docs, and duplicate definitions', async () => {
  const { prod, draft } = buildCreativeFixtures();
  const audit = await compareSources(prod, draft, { deployment: offlineDeployment('fixture'), generatedAt: '2026-01-01T00:00:00Z' });
  const stats = await extractStatistics(prod, draft);
  const { entities, relationships } = await extractNarrativeKnowledge({ audit, stats, production: prod, remodeling: draft });

  // Inject synthetic negative conditions (marked synthetic: true)
  const syntheticStats = structuredClone(stats);
  // Gate 3a: Inverted BAC interval (start_bac < end_bac in countdown calendar)
  syntheticStats.timeline.push({
    id: 'SYNTH-INVERTED-INTERVAL',
    kind: 'EVENT',
    label: 'Synthetic Inverted BAC Event',
    entity_id: 'country:alpha',
    start_bac: 900,
    end_bac: 1050,
    status: 'CANON_OBSERVED',
    note: 'Synthetic negative test fixture',
    source: {
      role: 'PRODUCTION_MAIN',
      repository: 'Reltroner/reltroner-studio',
      commit_sha: SHA_A,
      path: NCCM_DATASET_PATH,
      blob_sha: prod.identity.tree_sha,
      pointer: 'synthetic.inverted',
      line: 1,
    },
  });
  // Gate 3b: State event dated before state's sovereign foundation
  const alphaEntity = syntheticStats.entities.find((e) => e.id === 'country:alpha')!;
  alphaEntity.foundation_bac = 1100;
  syntheticStats.timeline.push({
    id: 'SYNTH-PRE-FOUNDATION-ACTION',
    kind: 'EVENT',
    label: 'Synthetic State Treaty Before Foundation',
    entity_id: 'country:alpha',
    start_bac: 1250,
    end_bac: 1240,
    status: 'CANON_OBSERVED',
    note: 'Synthetic pre-foundation contradiction',
    source: {
      role: 'PRODUCTION_MAIN',
      repository: 'Reltroner/reltroner-studio',
      commit_sha: SHA_A,
      path: NCCM_DATASET_PATH,
      blob_sha: prod.identity.tree_sha,
      pointer: 'synthetic.prefoundation',
      line: 2,
    },
  });
  // Gate 5: Missing declared source_document on a country record
  alphaEntity.source_document = 'content/factions/non-existent-synthetic-country.md';

  // Gate 4: Failing QA invariant on production
  const badQaProd = runQa(nccmFixture({ planetSdi: 0.5, beluftnerArea: 450 }), 'PRODUCTION_MAIN');
  const qaRemod = runQa(nccmFixture({ beluftnerArea: 363 }), 'REMODELING_MAIN');

  // Gate 6: Duplicate entity definition with same kind and name
  const syntheticEntities = [
    ...entities,
    {
      ...entities[0]!,
      id: `${entities[0]!.id}-synthetic-dup`,
      source_path: 'content/factions/synthetic-duplicate.md',
    },
  ];

  const findings = await runNarrativeAudit({
    audit,
    stats: syntheticStats,
    qaProduction: badQaProd,
    qaRemodeling: qaRemod,
    entities: syntheticEntities,
    relationships,
    production: prod,
    remodeling: draft,
    synthetic: true,
  });

  assert.ok(findings.every((f) => f.synthetic === true), 'all synthetic findings are tagged synthetic: true');
  assert.ok(
    findings.some((f) => f.category === 'CHRONOLOGICAL_CONTRADICTION' && f.classification === 'VERIFIED_CONTRADICTION' && f.is_defect),
    'detects inverted BAC interval (Gate 3a)',
  );
  assert.ok(
    findings.some((f) => f.category === 'IMPOSSIBLE_EVENT_ORDERING' && f.classification === 'VERIFIED_CONTRADICTION' && f.is_defect),
    'detects event dated before sovereign foundation (Gate 3b)',
  );
  assert.ok(
    findings.some((f) => (f.category === 'STATISTICAL_STORY_MISMATCH' || f.category === 'GEOGRAPHICAL_INCONSISTENCY') && f.classification === 'VERIFIED_CONTRADICTION' && f.is_defect),
    'detects QA attribute conflict (Gate 4)',
  );
  assert.ok(
    findings.some((f) => f.category === 'NARRATIVE_DEPENDENCY_CONFLICT' && f.classification === 'POTENTIAL_INCONSISTENCY' && f.is_defect),
    'detects missing declared source document (Gate 5)',
  );
  assert.ok(
    findings.some((f) => f.category === 'DUPLICATE_OR_CONFLICTING_DEFINITION' && f.classification === 'POTENTIAL_INCONSISTENCY'),
    'detects duplicate entity definitions (Gate 6)',
  );
});

test('Gates 7, 8 & 9: intentional ambiguity, unreliable narration, and declared unknowns are never misclassified as canon defects', async () => {
  const { prod, draft } = buildCreativeFixtures();
  const audit = await compareSources(prod, draft, { deployment: offlineDeployment('fixture'), generatedAt: '2026-01-01T00:00:00Z' });
  const stats = await extractStatistics(prod, draft);
  const { entities, relationships } = await extractNarrativeKnowledge({ audit, stats, production: prod, remodeling: draft });
  const qaProd = runQa(nccmFixture(), 'PRODUCTION_MAIN');
  const qaRemod = runQa(nccmFixture({ beluftnerArea: 363 }), 'REMODELING_MAIN');

  const findings = await runNarrativeAudit({
    audit,
    stats,
    qaProduction: qaProd,
    qaRemodeling: qaRemod,
    entities,
    relationships,
    production: prod,
    remodeling: draft,
  });

  const ambiguity = findings.filter((f) => f.classification === 'INTENTIONAL_AMBIGUITY');
  assert.ok(ambiguity.length >= 2, 'identifies intentional ambiguity in Henchoway and House of Valethra (Gate 7)');
  assert.ok(ambiguity.every((f) => f.is_defect === false), 'intentional ambiguity is never a defect');

  const unreliable = findings.filter((f) => f.classification === 'UNRELIABLE_NARRATOR_POSSIBILITY');
  assert.ok(unreliable.length >= 2, 'identifies competing war accounts and Henchoway strategic misreading (Gate 8)');
  assert.ok(unreliable.every((f) => f.is_defect === false), 'unreliable narration is never a defect');

  const insufficient = findings.filter((f) => f.classification === 'INSUFFICIENT_EVIDENCE');
  assert.ok(insufficient.length >= 1, 'preserves declared NCCM unknowns as INSUFFICIENT_EVIDENCE (Gate 9)');
  assert.ok(insufficient.every((f) => f.is_defect === false), 'declared unknowns are never a defect');
});

test('Gates 10, 11 & 12: story refactoring impact, scenario isolation (Reltronland/Depcutland case study), and deterministic opportunity prioritization', async () => {
  const { prod, draft } = buildCreativeFixtures();
  const audit = await compareSources(prod, draft, { deployment: offlineDeployment('fixture'), generatedAt: '2026-01-01T00:00:00Z' });
  const stats = await extractStatistics(prod, draft);
  const qaProd = runQa(nccmFixture(), 'PRODUCTION_MAIN');
  const qaRemod = runQa(nccmFixture({ beluftnerArea: 363 }), 'REMODELING_MAIN');
  const graph = await buildKnowledgeGraph({ audit, stats, qa: qaProd, production: prod, remodeling: draft });

  const artifactA = await buildCreativeIntelligenceArtifact({
    production: prod,
    remodeling: draft,
    audit,
    stats,
    qaProduction: qaProd,
    qaRemodeling: qaRemod,
    graph,
    generatedAt: '2026-01-01T00:00:00Z',
  });
  const artifactB = await buildCreativeIntelligenceArtifact({
    production: prod,
    remodeling: draft,
    audit,
    stats,
    qaProduction: qaProd,
    qaRemodeling: qaRemod,
    graph,
    generatedAt: '2026-01-01T00:00:00Z',
  });

  // Gate 12: Determinism across repeated runs
  assert.equal(artifactA.semantic_digest, artifactB.semantic_digest);
  assert.deepEqual(artifactA.opportunities, artifactB.opportunities);
  assert.equal(CreativeArtifactSchema.safeParse(artifactA).success, true);

  // Gate 10: Story refactoring plans are non-destructive and compute graph impact
  assert.ok(artifactA.refactoring_plans.length >= 4);
  for (const plan of artifactA.refactoring_plans) {
    assert.equal(plan.canon_status, 'PROPOSED');
    assert.ok(plan.current_structure.units.length > 0);
    assert.ok(plan.proposed_structure.units.length > 0);
    assert.ok(typeof plan.dependency_impact.summary === 'string');
  }

  // Gate 11: Scenario isolation and Reltronland/Depcutland Case Study completeness
  const relDep = artifactA.scenarios.find((s) => s.title.includes('Reltronland & Depcutland'));
  assert.ok(relDep, 'includes Reltronland/Depcutland case study scenario');
  assert.equal(relDep.canon_status, 'SCENARIO');
  assert.ok(relDep.production_baseline.anchors.every((a) => a.status === 'CANON_OBSERVED'));
  assert.ok(relDep.perspectives.length >= 4);
  assert.ok(relDep.alternatives.length >= 3);
  assert.ok(relDep.potential_contradictions.some((c) => c.includes('1125 BAC') && c.includes('1057 BAC')));
  assert.ok(relDep.impact_dimensions.length === 8);
});

test('Gates 13, 14 & 15: proposal ratification boundary, 8-format creative export integrity, and private workspace isolation', async () => {
  const creativeRaw = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'artifacts', 'creative.json'), 'utf8');
  const creative = CreativeArtifactSchema.parse(JSON.parse(creativeRaw)) as unknown as CreativeArtifact;

  // Gate 13: Proposal schema validation and creator ratification boundary
  const seed = creative.seed_proposals[0]!;
  assert.equal(CreativeProposalSchema.safeParse(seed).success, true);
  assert.notEqual(seed.canon_status, 'CANON_OBSERVED');

  const approvedForAuthoring = transitionProposalStatus(seed, 'APPROVED_FOR_AUTHORING');
  assert.equal(approvedForAuthoring.review_status, 'APPROVED_FOR_AUTHORING');
  assert.notEqual(approvedForAuthoring.canon_status, 'CANON_OBSERVED', 'UI approval never ratifies canon');

  assert.throws(
    () => transitionProposalStatus(seed, 'RATIFIED_EXTERNALLY'),
    /Cannot mark proposal as RATIFIED_EXTERNALLY without verified creator publication evidence/,
  );

  const ratifiedWithEvidence = transitionProposalStatus(seed, 'RATIFIED_EXTERNALLY', {
    ratificationEvidence: {
      repository: 'Reltroner/reltroner-studio',
      commit_sha: SHA_A,
      path: 'content/factions/reltronland-vs-depcutland.md',
      verified: true,
    },
  });
  assert.equal(ratifiedWithEvidence.review_status, 'RATIFIED_EXTERNALLY');
  assert.equal(ratifiedWithEvidence.canon_status, 'CANON_OBSERVED');

  // Gate 15: Private workspace content never leaks into public artifacts or public report bundles
  assert.ok(
    creative.seed_proposals.every((p) => p.visibility === 'PUBLIC_OBSERVATORY_FIXTURE'),
    'public creative.json contains zero PRIVATE_LOCAL_SESSION proposals',
  );
  const privateProposal: CreativeProposal = {
    ...seed,
    proposal_id: 'PRP-00000000PRIV',
    title: 'SECRET UNRELEASED TWIST DO NOT PUBLISH',
    visibility: 'PRIVATE_LOCAL_SESSION',
  };
  const creativeWithPrivate: CreativeArtifact = {
    ...creative,
    seed_proposals: [...creative.seed_proposals, privateProposal],
  };
  const publicReportFindings = buildCreativeReportFindings({ creative: creativeWithPrivate });
  assert.ok(
    !publicReportFindings.some((f) => f.id === 'PRP-00000000PRIV' || f.title.includes('SECRET UNRELEASED TWIST')),
    'buildCreativeReportFindings excludes PRIVATE_LOCAL_SESSION proposals from public report bundles',
  );
  // Yet the creator can still convert a private proposal locally via proposalToFinding:
  const localPrivateFinding = proposalToFinding(privateProposal);
  assert.match(localPrivateFinding.recommendation, /PRIVATE_LOCAL_SESSION/);

  // Gate 14: All 7 report families render across all 8 formats with UNRATIFIED status notices
  const prefixes = new Set(publicReportFindings.map((f) => f.id.split('-')[0]));
  for (const expectedPrefix of ['STA', 'NAF', 'REF', 'SCN', 'OPP', 'PRP']) {
    assert.ok(prefixes.has(expectedPrefix), `includes ${expectedPrefix} report family`);
  }

  const context: ReportContext = {
    generated_at: creative.generated_at,
    rules_version: creative.rules_version,
    semantic_digest: creative.semantic_digest,
    production: { repository: 'Reltroner/reltroner-studio', commit_sha: creative.sources.production_commit_sha, tree_sha: SHA_A },
    remodeling: { repository: 'Reltroner/reltroner-studio-remodeling', commit_sha: creative.sources.remodeling_commit_sha, tree_sha: SHA_B },
    deployment: { status: 'DEPLOYMENT_UNVERIFIED', deployed_sha: null, summary: 'test' },
  };

  const sampleCreativeFinding = publicReportFindings.find((f) => f.id.startsWith('SCN-'))!;
  const singleDoc = buildReportDocument(context, [sampleCreativeFinding], 'single');
  for (const fmt of EXPORT_FORMATS.filter((f) => f !== 'pdf')) {
    const bytes = renderFormat(singleDoc, fmt);
    assert.ok(bytes.byteLength > 100, `renders ${fmt}`);
    if (fmt !== 'xlsx') {
      const text = strFromU8(bytes);
      assert.ok(text.includes(sampleCreativeFinding.id), `${fmt} includes finding ID`);
      assert.ok(text.includes('UNRATIFIED'), `${fmt} includes explicit UNRATIFIED marker`);
    }
  }

  const plan = makeExportPlan(
    {
      scope: 'selected',
      audit_id: 'CREATIVE-TEST',
      production_sha: creative.sources.production_commit_sha,
      remodeling_sha: creative.sources.remodeling_commit_sha,
      formats: [...EXPORT_FORMATS],
      finding_ids: [sampleCreativeFinding.id],
      bundle_layout: 'per-finding',
    },
    publicReportFindings.map((f) => f.id),
  );
  const bundle = await executeExport({
    plan,
    findings: publicReportFindings,
    context,
    loadPdf: async (k) => new TextEncoder().encode(`%PDF-1.7 ${k}`),
  });
  assert.ok(bundle.bytes.byteLength > 500);
  assert.equal(bundle.entries?.length, 9); // 8 formats + MANIFEST.json

  // Verify AI adapter privacy contract
  const ai = getAiAdapterStatus();
  assert.equal(ai.available, false);
  assert.equal(ai.privacy_boundary, 'STRICT_NO_EXTERNAL_TRANSMISSION');
  const ideation = generateDeterministicIdeation({
    query: 'Reltronland and Depcutland',
    entities: creative.entities,
    relationships: creative.relationships,
    opportunities: creative.opportunities,
    scenarios: creative.scenarios,
  });
  assert.equal(ideation.epistemic_label, 'HYPOTHETICAL_UNRATIFIED');
  assert.ok(ideation.grounded_hypotheses.length > 0);
});
