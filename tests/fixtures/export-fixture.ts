/** Deterministic report fixture built through the real comparator (synthetic sources, not canon). */
import { fixtureSnapshot } from '../../src/adapters/fixture-snapshot.ts';
import { offlineDeployment } from '../../src/adapters/deployment.ts';
import { compareSources } from '../../src/engine/comparator.ts';
import type { ReportContext } from '../../src/export/model.ts';

export async function exportFixture() {
  const A = 'a'.repeat(40), B = 'b'.repeat(40);
  const prod = fixtureSnapshot('production', A, {
    'data/asthortera/nccm.json': JSON.stringify({ countries_14: [
      { name: 'Beluftner', land_area_million_km2: 88, motto: 'plain words', canon_status: 'C' },
      { name: 'Evil<Co>', note: '=HYPERLINK("http://x","click")', debt: -5, canon_status: 'C' },
    ] }),
    'content/factions/a.md': '---\ntitle: A & B <tag>\n---\n# History\nOld line\n',
  });
  const draft = fixtureSnapshot('remodeling', B, {
    'data/asthortera/nccm.json': JSON.stringify({ countries_14: [
      { name: 'Beluftner', land_area_million_km2: 363, motto: 'new words "quoted", with comma', canon_status: 'C' },
      { name: 'Evil<Co>', note: '+SUM(A1:A2)\u0007bell', debt: -7, canon_status: 'C', extra: '@cmd' },
    ] }),
    'content/factions/a.md': '---\ntitle: A & B <tag>\n---\n# History\nNew line <script>alert(1)</script>\n',
    'content/statistics/new.md': '---\ntitle: Draft only\n---\nproposal',
  });
  const audit = await compareSources(prod, draft, { deployment: offlineDeployment('fixture'), generatedAt: '2026-01-01T00:00:00.000Z' });
  const context: ReportContext = {
    generated_at: audit.generated_at,
    rules_version: audit.rules_version,
    semantic_digest: audit.semantic_digest,
    production: { repository: audit.sources.production.repository, commit_sha: A, tree_sha: audit.sources.production.tree_sha },
    remodeling: { repository: audit.sources.remodeling.repository, commit_sha: B, tree_sha: audit.sources.remodeling.tree_sha },
    deployment: { status: audit.deployment.status, deployed_sha: audit.deployment.deployed_sha, summary: audit.deployment.summary },
  };
  return { audit, context, findings: audit.findings };
}
