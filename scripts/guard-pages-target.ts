#!/usr/bin/env node
/**
 * RC-DEPLOY-01: fail-closed Cloudflare Pages publication isolation.
 * GET-only preflight: NEVER modifies Cloudflare DNS, nameservers, domains, routes or workers.
 * The ONLY permitted deployment target is the dedicated Statistics pages.dev project.
 */
import { pathToFileURL } from 'node:url';

export const STATISTICS_PAGES_PROJECT = 'reltroner-statistics';
export const STATISTICS_PAGES_URL = 'https://reltroner-statistics.pages.dev';

export function assertStatisticsTarget(project: string, siteUrl: string): void {
  if (project !== STATISTICS_PAGES_PROJECT || siteUrl !== STATISTICS_PAGES_URL) {
    throw new Error(
      'ISOLATION_BLOCKED: only the dedicated reltroner-statistics project and its exact https://reltroner-statistics.pages.dev URL are allowed. No custom-domain publication.'
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

export function assertNoCustomDomains(domains: unknown): void {
  if (!Array.isArray(domains)) throw new Error('ISOLATION_BLOCKED: cannot verify Pages custom domains');
  if (domains.length !== 0) throw new Error('ISOLATION_BLOCKED: Statistics Pages project has custom domains; zero custom domains required for DNS-free release');
}

async function getCloudflareResult(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`ISOLATION_BLOCKED: Cloudflare read-only API returned HTTP ${response.status}`);
  const data = await response.json() as { success?: boolean; result?: unknown };
  if (data.success !== true) throw new Error('ISOLATION_BLOCKED: Cloudflare API did not confirm success');
  return data.result;
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
  assertProjectIdentity(projectData);
  const domainData = await getCloudflareResult(`${endpoint}/domains`, token);
  assertNoCustomDomains(domainData);

  process.stdout.write(JSON.stringify({
    status: 'ISOLATED_STATISTICS_PAGES_VERIFIED',
    target_project: STATISTICS_PAGES_PROJECT,
    site_url: STATISTICS_PAGES_URL,
    custom_domains: 0,
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
