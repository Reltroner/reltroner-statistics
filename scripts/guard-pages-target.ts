#!/usr/bin/env node
/**
 * RC-DEPLOY-01: fail-closed Cloudflare Pages publication isolation.
 * GET-only preflight: NEVER modifies Cloudflare DNS, nameservers, domains, routes or workers.
 * Only the dedicated Statistics Pages project is allowed: pages.dev bootstrap or the exact statistics.reltroner.com hostname.
 */
import { pathToFileURL } from 'node:url';

export const STATISTICS_PAGES_PROJECT = 'reltroner-statistics';
export const STATISTICS_PAGES_URL = 'https://reltroner-statistics.pages.dev';
export const STATISTICS_PUBLIC_URL = 'https://statistics.reltroner.com';
export const STATISTICS_CUSTOM_DOMAIN = 'statistics.reltroner.com';

export function assertStatisticsTarget(project: string, siteUrl: string): void {
  const allowedUrl = siteUrl === STATISTICS_PAGES_URL || siteUrl === STATISTICS_PUBLIC_URL;
  if (project !== STATISTICS_PAGES_PROJECT || !allowedUrl) {
    throw new Error(
      'ISOLATION_BLOCKED: only reltroner-statistics Pages at its exact pages.dev bootstrap URL or https://statistics.reltroner.com is authorized.'
    );
  }
}

export function assertProjectIdentity(value: unknown): void {
  if (!value || typeof value !== 'object') throw new Error('ISOLATION_BLOCKED: invalid Pages project response');
  const project = value as {
    name?: unknown;
    subdomain?: unknown;
    source?: { type?: string; config?: { owner?: string; repo_name?: string } } | null;
  };
  if (project.name !== STATISTICS_PAGES_PROJECT) throw new Error('ISOLATION_BLOCKED: Cloudflare returned the wrong Pages project');
  if (project.subdomain !== undefined && project.subdomain !== null && project.subdomain !== 'reltroner-statistics.pages.dev') {
    throw new Error('ISOLATION_BLOCKED: the returned Pages subdomain does not match Statistics');
  }
  const config = project.source?.config;
  if (config?.owner && config.owner.toLowerCase() !== 'reltroner') {
    throw new Error('ISOLATION_BLOCKED: Pages project is connected to another GitHub owner');
  }
  if (config?.repo_name && config.repo_name.toLowerCase() !== 'reltroner-statistics') {
    throw new Error('ISOLATION_BLOCKED: Pages project is connected to another repository');
  }
}

export function assertStatisticsDomains(domains: unknown, siteUrl: string, totalCount?: number, totalPages?: number): void {
  if (!Array.isArray(domains)) throw new Error('ISOLATION_BLOCKED: cannot verify Pages custom domains');
  if (totalPages !== undefined && (totalPages > 1 || totalPages < 0 || (domains.length !== 0 && totalPages !== 1))) throw new Error('ISOLATION_BLOCKED: unverified Pages custom-domain pagination');
  if (totalCount !== undefined && totalCount !== domains.length) throw new Error('ISOLATION_BLOCKED: incomplete Pages custom-domain inventory');

  if (siteUrl === STATISTICS_PAGES_URL) {
    if (domains.length !== 0) throw new Error('ISOLATION_BLOCKED: pages.dev bootstrap requires zero custom domains');
    return;
  }

  if (siteUrl !== STATISTICS_PUBLIC_URL || domains.length !== 1) {
    throw new Error('ISOLATION_BLOCKED: expected exactly one Statistics-only custom domain');
  }
  const domain = domains[0] as { name?: unknown; status?: unknown } | null;
  if (domain?.name !== STATISTICS_CUSTOM_DOMAIN || domain.status !== 'active') {
    throw new Error('ISOLATION_BLOCKED: statistics.reltroner.com must be the sole ACTIVE custom domain');
  }
}

type CloudflareReadResult = { result: unknown; result_info?: { total_count?: number; total_pages?: number } };

async function getCloudflareResult(url: string, token: string): Promise<CloudflareReadResult> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`ISOLATION_BLOCKED: Cloudflare read-only API returned HTTP ${response.status}`);
  const data = await response.json() as { success?: boolean; result?: unknown; result_info?: CloudflareReadResult['result_info'] };
  if (data.success !== true) throw new Error('ISOLATION_BLOCKED: Cloudflare API did not confirm success');
  return { result: data.result, result_info: data.result_info };
}

export async function verifyPagesIsolation(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const project = environment.CLOUDFLARE_PAGES_PROJECT ?? '';
  const siteUrl = environment.SITE_URL ?? '';
  assertStatisticsTarget(project, siteUrl);

  const accountId = environment.CLOUDFLARE_ACCOUNT_ID ?? '';
  const token = environment.CLOUDFLARE_API_TOKEN ?? '';
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !token) {
    throw new Error('ISOLATION_BLOCKED: required Cloudflare account ID/token is absent or invalid');
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${STATISTICS_PAGES_PROJECT}`;
  const projectData = await getCloudflareResult(endpoint, token);
  assertProjectIdentity(projectData.result);
  const domainData = await getCloudflareResult(`${endpoint}/domains`, token);
  assertStatisticsDomains(
    domainData.result,
    siteUrl,
    domainData.result_info?.total_count,
    domainData.result_info?.total_pages,
  );

  process.stdout.write(JSON.stringify({
    status: 'ISOLATED_STATISTICS_PAGES_VERIFIED',
    target_project: STATISTICS_PAGES_PROJECT,
    site_url: siteUrl,
    custom_domains: siteUrl === STATISTICS_PUBLIC_URL ? [STATISTICS_CUSTOM_DOMAIN] : [],
    cloudflare_methods: ['GET'],
    dns_mutations: 0,
    nameserver_mutations: 0,
  }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyPagesIsolation().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'ISOLATION_BLOCKED: unknown failure'}\n`);
    process.exitCode = 1;
  });
}
