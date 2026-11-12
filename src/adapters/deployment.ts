import { SOURCE_REPOSITORIES, SHA_RE, type DeploymentEvidence, type DeploymentVerification } from '../domain/source.ts';
import { GitHubClient } from './github.ts';

/**
 * Deployment verification policy:
 *  - ONLY a build identifier served by the live production site (STUDIO_BUILD_INFO_URL returning
 *    {"commit_sha": "<40 hex>"}) can verify the deployed SHA.
 *  - GitHub Deployment records are reported as evidence but never accepted: they prove that a
 *    provider built a commit at some time, not which build currently serves the public domain.
 *  - Production main is never substituted for the deployed SHA.
 */
export async function verifyDeployment(
  client: GitHubClient,
  opts: { productionMainSha: string; buildInfoUrl?: string | undefined; fetchImpl?: typeof fetch },
): Promise<DeploymentVerification> {
  const evidence: DeploymentEvidence[] = [];
  const repo = SOURCE_REPOSITORIES.production;
  try {
    const base = GitHubClient.repoPath(repo.owner, repo.repo);
    const deployments = await client.json<Array<{ id: number; sha: string; environment: string; created_at: string; creator?: { login?: string } }>>(
      `${base}/deployments?environment=Production&per_page=1`,
    );
    const latest = deployments[0];
    if (latest) {
      let behind = '';
      if (SHA_RE.test(latest.sha) && latest.sha !== opts.productionMainSha) {
        try {
          const cmp = await client.json<{ status: string; ahead_by: number }>(`${base}/compare/${latest.sha}...${opts.productionMainSha}`);
          behind = cmp.status === 'ahead' ? `; production main is ${cmp.ahead_by} commits ahead of it` : `; compare status ${cmp.status}`;
        } catch { /* comparison is informative only */ }
      }
      evidence.push({
        kind: 'GITHUB_DEPLOYMENT_RECORD',
        accepted: false,
        reference: `${repo.owner}/${repo.repo} deployment ${latest.id} (${latest.environment}, created by ${latest.creator?.login ?? 'unknown'})`,
        observed_sha: SHA_RE.test(latest.sha) ? latest.sha : null,
        observed_at: latest.created_at ?? null,
        reason: `A provider deployment record shows a build happened, not which build serves the public domain${behind}.`,
      });
    }
  } catch (err) {
    evidence.push({
      kind: 'GITHUB_DEPLOYMENT_RECORD', accepted: false, reference: 'GitHub Deployments API', observed_sha: null, observed_at: null,
      reason: `Deployment records unavailable: ${String((err as Error).message).slice(0, 160)}`,
    });
  }

  if (opts.buildInfoUrl) {
    try {
      const url = new URL(opts.buildInfoUrl);
      if (url.protocol !== 'https:') throw new Error('build info URL must use https');
      const res = await (opts.fetchImpl ?? fetch)(url, { headers: { Accept: 'application/json' }, redirect: 'follow' });
      const body = res.ok ? ((await res.json()) as { commit_sha?: unknown }) : null;
      const sha = typeof body?.commit_sha === 'string' && SHA_RE.test(body.commit_sha) ? body.commit_sha : null;
      evidence.push({
        kind: 'LIVE_BUILD_IDENTIFIER', accepted: !!sha, reference: url.origin + url.pathname, observed_sha: sha,
        observed_at: new Date().toISOString(),
        reason: sha ? 'Live production site served a build identifier.' : `Live build identifier missing or invalid (HTTP ${res.status}).`,
      });
      if (sha) {
        return {
          status: 'DEPLOYMENT_VERIFIED', deployed_sha: sha, evidence,
          summary: `Deployed commit ${sha.slice(0, 12)} verified from the live build identifier${sha === opts.productionMainSha ? ' and equals production main' : '; it differs from production main'}.`,
        };
      }
    } catch (err) {
      evidence.push({
        kind: 'LIVE_BUILD_IDENTIFIER', accepted: false, reference: 'STUDIO_BUILD_INFO_URL', observed_sha: null, observed_at: null,
        reason: `Build identifier check failed: ${String((err as Error).message).slice(0, 160)}`,
      });
    }
  } else {
    evidence.push({
      kind: 'LIVE_BUILD_IDENTIFIER', accepted: false, reference: 'not configured', observed_sha: null, observed_at: null,
      reason: 'The live Studio site does not currently publish a build identifier (no STUDIO_BUILD_INFO_URL configured).',
    });
  }
  return {
    status: 'DEPLOYMENT_UNVERIFIED',
    deployed_sha: null,
    evidence,
    summary: 'The deployed Studio commit is not verified. Statistics derived from production main describe the production source candidate, not necessarily the live website.',
  };
}

export function offlineDeployment(reason: string): DeploymentVerification {
  return { status: 'DEPLOYMENT_UNVERIFIED', deployed_sha: null, evidence: [], summary: reason };
}
