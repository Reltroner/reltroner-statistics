/**
 * RS-DEPLOY-SHA-005: static contract of both Statistics publication paths (ci.yml main push, release.yml dispatch).
 * Ordering, isolation and acceptance gates are asserted on the parsed workflows, so a later edit cannot
 * silently weaken them. No workflow is executed and nothing is deployed by these tests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { MCP_TOOLS, OPERATIONS } from '../../src/api/contract.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface Step { name?: string; id?: string; run?: string; shell?: string; if?: string; uses?: string; env?: Record<string, string> }
interface Job {
  if?: string;
  needs?: string | string[];
  'timeout-minutes'?: number;
  environment?: string;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  steps: Step[];
}
interface Workflow { permissions?: Record<string, string>; concurrency?: { group?: string; 'cancel-in-progress'?: boolean }; jobs: Record<string, Job> }

const workflow = (file: string) => parse(fs.readFileSync(path.join(ROOT, '.github', 'workflows', file), 'utf8')) as Workflow;
const ci = workflow('ci.yml');
const release = workflow('release.yml');
const ciPublish = ci.jobs.publish_statistics!;
const releasePublish = release.jobs.publish!;
const PUBLISH: Array<[string, Job]> = [['ci.yml publish_statistics', ciPublish], ['release.yml publish', releasePublish]];

const WRANGLER_LOG = '"$RUNNER_TEMP/wrangler-pages-deploy.log"';
const CAPTURE_RUN = `node scripts/capture-pages-deployment-url.ts ${WRANGLER_LOG} >> "$GITHUB_OUTPUT"`;
const MCP_RUN = 'node scripts/verify-remote-mcp.mjs --expected-sha "${{ github.sha }}" --profile page-aware-v1';

function index(job: Job, label: string, predicate: (step: Step) => boolean): number {
  const found = job.steps.findIndex(predicate);
  assert.ok(found >= 0, `missing step: ${label}`);
  assert.equal(job.steps.filter(predicate).length, 1, `exactly one step: ${label}`);
  return found;
}
const runs = (fragment: string) => (step: Step) => (step.run ?? '').includes(fragment);

test('both publication paths keep read-only permissions and one serialized, never-cancelled production group', () => {
  assert.deepEqual(ci.permissions, { contents: 'read' });
  assert.deepEqual(release.permissions, { contents: 'read' });
  assert.deepEqual(release.concurrency, { group: 'analysis-release', 'cancel-in-progress': false });
  for (const [label, job] of PUBLISH) {
    assert.deepEqual(job.concurrency, { group: 'statistics-production', 'cancel-in-progress': false }, label);
    assert.equal(job['timeout-minutes'], 15, label);
    assert.equal(job.environment, 'production', label);
  }
  for (const fragment of ["github.event_name == 'push'", "github.ref == 'refs/heads/main'", "vars.CLOUDFLARE_PAGES_PROJECT == 'reltroner-statistics'", "vars.SITE_URL == 'https://statistics.reltroner.com'"]) {
    assert.ok(ciPublish.if?.includes(fragment), `ci publish condition lost: ${fragment}`);
  }
  for (const fragment of ["github.event_name == 'workflow_dispatch'", 'inputs.publish_statistics == true', "github.ref == 'refs/heads/main'", "vars.CLOUDFLARE_PAGES_PROJECT == 'reltroner-statistics'"]) {
    assert.ok(releasePublish.if?.includes(fragment), `release publish condition lost: ${fragment}`);
  }
});

test('stale-main rejection and the GET-only isolation guard precede the single Wrangler upload', () => {
  for (const [label, job] of PUBLISH) {
    const stale = index(job, `${label} stale check`, (s) => /git fetch --depth=1 origin main/.test(s.run ?? '') && /STALE_(DEPLOY|RELEASE)_BLOCKED/.test(s.run ?? ''));
    const guard = index(job, `${label} guard`, runs('node scripts/guard-pages-target.ts'));
    const deploy = index(job, `${label} deploy`, runs('pages deploy dist'));
    assert.ok(stale < deploy && guard < deploy, `${label}: checks must run before the upload`);
    const step = job.steps[deploy]!;
    assert.match(step.run ?? '', /^npx --yes wrangler@4\.161\.0 pages deploy dist --project-name (reltroner-statistics|"\$\{\{ vars\.CLOUDFLARE_PAGES_PROJECT \}\}") --branch main --commit-hash "\$\{\{ github\.sha \}\}" 2>&1 \| tee "\$RUNNER_TEMP\/wrangler-pages-deploy\.log"$/, label);
    assert.equal(step.shell, 'bash', `${label}: bash runs with pipefail so tee cannot mask a failed upload`);
  }
});

test('only a validated unique deployment URL from this run reaches the verifier, through env and never inline', () => {
  for (const [label, job] of PUBLISH) {
    const deploy = index(job, `${label} deploy`, runs('pages deploy dist'));
    const capture = index(job, `${label} capture`, (s) => s.run === CAPTURE_RUN);
    const verify = index(job, `${label} verify`, runs('node scripts/verify-deployment.ts'));
    assert.ok(deploy < capture && capture < verify, `${label}: deploy, capture, verify in order`);
    const captureStep = job.steps[capture]!;
    assert.equal(captureStep.id, 'pages_deployment', label);
    assert.equal(captureStep.shell, 'bash', label);
    const verifyStep = job.steps[verify]!;
    assert.equal(verifyStep.env?.DEPLOYMENT_URL, '${{ steps.pages_deployment.outputs.deployment_url }}', label);
    assert.equal(verifyStep.env?.EXPECTED_SHA, '${{ github.sha }}', label);
    assert.ok(!(verifyStep.run ?? '').includes('${{'), `${label}: no expression is interpolated into the verifier command`);
    for (const flag of ['--expected-sha "$EXPECTED_SHA"', '--deployment-url "$DEPLOYMENT_URL"', '--require-current-main']) {
      assert.ok(verifyStep.run?.includes(flag), `${label}: verifier flag ${flag}`);
    }
  }
  assert.equal(
    ciPublish.steps.find(runs('node scripts/verify-deployment.ts'))?.run,
    'node scripts/verify-deployment.ts https://statistics.reltroner.com --expected-sha "$EXPECTED_SHA" --deployment-url "$DEPLOYMENT_URL" --require-current-main',
  );
  const releaseVerify = releasePublish.steps.find(runs('node scripts/verify-deployment.ts'));
  assert.equal(releaseVerify?.env?.SITE_URL, '${{ vars.SITE_URL }}');
  assert.equal(releaseVerify?.run, 'node scripts/verify-deployment.ts "$SITE_URL" --expected-sha "$EXPECTED_SHA" --deployment-url "$DEPLOYMENT_URL" --require-current-main');
  for (const file of ['ci.yml', 'release.yml']) {
    const text = fs.readFileSync(path.join(ROOT, '.github', 'workflows', file), 'utf8');
    for (const line of text.split('\n').filter((l) => l.includes('steps.pages_deployment.outputs'))) {
      assert.match(line, /^\s+DEPLOYMENT_URL: \$\{\{ steps\.pages_deployment\.outputs\.deployment_url \}\}$/, `${file}: step output used outside env`);
    }
  }
});

test('strict 16-tool REST/MCP acceptance still runs after convergence, on the exact deployed SHA', () => {
  for (const [label, job] of PUBLISH) {
    const verify = index(job, `${label} verify`, runs('node scripts/verify-deployment.ts'));
    const mcp = index(job, `${label} MCP acceptance`, (s) => s.run === MCP_RUN);
    assert.ok(verify < mcp, `${label}: MCP acceptance only after custom-domain convergence`);
    assert.equal(mcp, job.steps.length - 1, `${label}: acceptance remains the final step`);
  }
  assert.equal(releasePublish.steps.find((s) => s.run === MCP_RUN)?.if, "vars.SITE_URL == 'https://statistics.reltroner.com'");
  assert.equal(OPERATIONS.length, 18, '18 REST operations');
  assert.equal(MCP_TOOLS.length, 16, '16 MCP tools');
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'rs-ai-api-001-tool-inputs.json'), 'utf8')) as { tools: string[] };
  const page = ['resolve_statistics_page', 'read_statistics_page', 'read_statistics_section'];
  assert.equal(fixture.tools.length, 13);
  assert.deepEqual(MCP_TOOLS.map((tool) => tool.name), [...fixture.tools, ...page], '13 original tools, then the 3 PAGE-004 tools');
});

test('no workflow purges caches, rolls back, redeploys, deletes deployments or calls the Cloudflare API directly', () => {
  for (const [file, wf] of [['ci.yml', ci], ['release.yml', release]] as const) {
    for (const [name, job] of Object.entries(wf.jobs)) {
      for (const step of job.steps) {
        const run = step.run ?? '';
        for (const forbidden of [/purge/i, /rollback/i, /dns_records/i, /pages deployment/i, /pages project/i, /api\.cloudflare\.com/i, /\b(-X|--request|--method)\s*(POST|PUT|PATCH|DELETE)\b/i, /wrangler[^\n]*\b(delete|rollback|secret|domain)\b/i]) {
          assert.ok(!forbidden.test(run), `${file} ${name} "${step.name ?? run}" matches ${forbidden}`);
        }
        if (/pages deploy/.test(run)) {
          assert.ok((file === 'ci.yml' && name === 'publish_statistics') || (file === 'release.yml' && name === 'publish'), `${file} ${name} must not deploy`);
        }
      }
    }
  }
});

test('the verifier is release tooling only: no site page, function or public asset imports it', () => {
  const names = ['statistics-deployment-verification', 'verify-deployment', 'capture-pages-deployment-url'];
  const textual = /\.(ts|tsx|astro|js|mjs|cjs|json|css|html|md|txt)$/;
  for (const dir of ['src', 'functions', 'public']) {
    const base = path.join(ROOT, dir);
    for (const entry of fs.readdirSync(base, { recursive: true }) as string[]) {
      const file = path.join(base, entry);
      if (!textual.test(entry) || !fs.statSync(file).isFile()) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const name of names) assert.ok(!text.includes(name), `${dir}/${entry} references ${name}`);
    }
  }
});
