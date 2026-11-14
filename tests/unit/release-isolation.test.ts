import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertStatisticsDomains,
  assertProjectIdentity,
  assertStatisticsTarget,
  STATISTICS_PAGES_PROJECT,
  STATISTICS_PAGES_URL,
  STATISTICS_PUBLIC_URL,
} from '../../scripts/guard-pages-target.ts';

test('RC-DEPLOY-02 permits Statistics Pages bootstrap and exactly one Statistics custom URL', () => {
  assert.doesNotThrow(() => assertStatisticsTarget(STATISTICS_PAGES_PROJECT, STATISTICS_PAGES_URL));
  assert.doesNotThrow(() => assertStatisticsTarget(STATISTICS_PAGES_PROJECT, STATISTICS_PUBLIC_URL));
  for (const [project, site] of [
    ['reltroner-studio-cf', STATISTICS_PUBLIC_URL],
    ['lms-fe', STATISTICS_PUBLIC_URL],
    ['hrm', STATISTICS_PUBLIC_URL],
    ['reltroner-statistics', 'https://reltroner.com'],
    ['reltroner-statistics', 'https://www.reltroner.com'],
    ['reltroner-statistics', 'https://lms.reltroner.com'],
    ['reltroner-statistics', 'https://hrm.reltroner.com'],
    ['reltroner-statistics', 'https://stats.reltroner.com'],
    ['reltroner-statistics', 'http://statistics.reltroner.com'],
    ['reltroner-statistics', 'https://statistics.reltroner.com.evil.example'],
    ['reltroner-statistics', 'https://statistics.reltroner.com@evil.example'],
    ['reltroner-statistics', 'https://statistics.reltroner.com/'],
    ['reltroner-statistics', 'https://reltroner-statistics.pages.dev.evil.example'],
  ] as const) {
    assert.throws(() => assertStatisticsTarget(project, site), /ISOLATION_BLOCKED/);
  }
});

test('RC-DEPLOY-02 requires isolated Pages project identity and correct GitHub source', () => {
  assert.doesNotThrow(() => assertProjectIdentity({
    name: 'reltroner-statistics', subdomain: 'reltroner-statistics.pages.dev', source: null,
  }));
  assert.doesNotThrow(() => assertProjectIdentity({
    name: 'reltroner-statistics', subdomain: 'reltroner-statistics.pages.dev',
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

test('RC-DEPLOY-02 supports DNS-free bootstrap only with zero custom domains', () => {
  assert.doesNotThrow(() => assertStatisticsDomains([], STATISTICS_PAGES_URL, 0, 1));
  assert.throws(() => assertStatisticsDomains([{ name: 'statistics.reltroner.com', status: 'active' }], STATISTICS_PAGES_URL), /ISOLATION_BLOCKED/);
  assert.throws(() => assertStatisticsDomains(undefined, STATISTICS_PAGES_URL), /ISOLATION_BLOCKED/);
});

test('RC-DEPLOY-02 requires the single active Statistics hostname and full domain inventory', () => {
  const accepted = [{ name: 'statistics.reltroner.com', status: 'active' }];
  assert.doesNotThrow(() => assertStatisticsDomains(accepted, STATISTICS_PUBLIC_URL, 1, 1));
  for (const domains of [
    [],
    [{ name: 'stats.reltroner.com', status: 'active' }],
    [{ name: 'reltroner.com', status: 'active' }],
    [{ name: 'lms.reltroner.com', status: 'active' }],
    [{ name: 'hrm.reltroner.com', status: 'active' }],
    [{ name: 'statistics.reltroner.com', status: 'pending' }],
    [{ name: 'statistics.reltroner.com', status: 'error' }],
    [{ name: 'statistics.reltroner.com', status: 'active' }, { name: 'reltroner.com', status: 'active' }],
  ]) {
    assert.throws(() => assertStatisticsDomains(domains, STATISTICS_PUBLIC_URL), /ISOLATION_BLOCKED/);
  }
  assert.throws(() => assertStatisticsDomains(accepted, STATISTICS_PUBLIC_URL, 2, 1), /ISOLATION_BLOCKED/);
  assert.throws(() => assertStatisticsDomains(accepted, STATISTICS_PUBLIC_URL, 1, 2), /ISOLATION_BLOCKED/);
});
