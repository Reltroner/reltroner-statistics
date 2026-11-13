import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNoCustomDomains,
  assertProjectIdentity,
  assertStatisticsTarget,
  STATISTICS_PAGES_PROJECT,
  STATISTICS_PAGES_URL,
} from '../../scripts/guard-pages-target.ts';

test('RC-DEPLOY-01 permits exactly the isolated Statistics pages.dev project', () => {
  assert.doesNotThrow(() => assertStatisticsTarget(STATISTICS_PAGES_PROJECT, STATISTICS_PAGES_URL));
  for (const [project, site] of [
    ['reltroner-studio-cf', STATISTICS_PAGES_URL],
    ['lms-fe', STATISTICS_PAGES_URL],
    ['hrm', STATISTICS_PAGES_URL],
    ['reltroner-statistics', 'https://reltroner.com'],
    ['reltroner-statistics', 'https://www.reltroner.com'],
    ['reltroner-statistics', 'https://lms.reltroner.com'],
    ['reltroner-statistics', 'https://hrm.reltroner.com'],
    ['reltroner-statistics', 'https://stats.reltroner.com'],
    ['reltroner-statistics', 'http://reltroner-statistics.pages.dev'],
    ['reltroner-statistics', 'https://reltroner-statistics.pages.dev.evil.example'],
    ['reltroner-statistics', 'https://reltroner-statistics.pages.dev@evil.example'],
  ] as const) {
    assert.throws(() => assertStatisticsTarget(project, site), /ISOLATION_BLOCKED/);
  }
});

test('RC-DEPLOY-01 verifies Pages project identity and source repository', () => {
  assert.doesNotThrow(() => assertProjectIdentity({
    name: 'reltroner-statistics',
    subdomain: 'reltroner-statistics.pages.dev',
    source: null,
  }));
  assert.doesNotThrow(() => assertProjectIdentity({
    name: 'reltroner-statistics',
    subdomain: 'reltroner-statistics.pages.dev',
    source: { type: 'github', config: { owner: 'Reltroner', repo_name: 'reltroner-statistics' } },
  }));
  assert.throws(() => assertProjectIdentity({ name: 'reltroner-studio-cf' }), /ISOLATION_BLOCKED/);
  assert.throws(() => assertProjectIdentity({ name: 'reltroner-statistics', subdomain: 'lms-fe.pages.dev' }), /ISOLATION_BLOCKED/);
  assert.throws(() => assertProjectIdentity({
    name: 'reltroner-statistics', source: { config: { owner: 'OtherOwner', repo_name: 'reltroner-statistics' } },
  }), /ISOLATION_BLOCKED/);
  assert.throws(() => assertProjectIdentity({
    name: 'reltroner-statistics', source: { config: { owner: 'Reltroner', repo_name: 'reltroner-studio' } },
  }), /ISOLATION_BLOCKED/);
});

test('RC-DEPLOY-01 refuses any custom domain or unverifiable custom domain list', () => {
  assert.doesNotThrow(() => assertNoCustomDomains([]));
  assert.throws(() => assertNoCustomDomains([{ name: 'reltroner.com' }]), /ISOLATION_BLOCKED/);
  assert.throws(() => assertNoCustomDomains([{ name: 'stats.reltroner.com' }]), /ISOLATION_BLOCKED/);
  assert.throws(() => assertNoCustomDomains(undefined), /ISOLATION_BLOCKED/);
  assert.throws(() => assertNoCustomDomains({}), /ISOLATION_BLOCKED/);
});
