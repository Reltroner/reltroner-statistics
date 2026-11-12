/**
 * Source authority model. Pure domain module: no Node, React or Astro imports.
 *
 * Three distinct identities exist and must never be conflated:
 *   A. VERIFIED PRODUCTION DEPLOYMENT — what is actually live (unknown until verified).
 *   B. PRODUCTION MAIN — Reltroner/reltroner-studio@main, the production source candidate.
 *   C. REMODELING MAIN — Reltroner/reltroner-studio-remodeling@main, drafts and proposals.
 */

export const SHA_RE = /^[0-9a-f]{40}$/;

export const SOURCE_REPOSITORIES = Object.freeze({
  production: Object.freeze({ owner: 'Reltroner', repo: 'reltroner-studio', role: 'PRODUCTION_MAIN' }),
  remodeling: Object.freeze({ owner: 'Reltroner', repo: 'reltroner-studio-remodeling', role: 'REMODELING_MAIN' }),
});

export type SourceSide = keyof typeof SOURCE_REPOSITORIES;
export type SourceRole = 'PRODUCTION_MAIN' | 'REMODELING_MAIN';
export type DeploymentStatus = 'DEPLOYMENT_VERIFIED' | 'DEPLOYMENT_UNVERIFIED';

export interface SourceIdentity {
  side: SourceSide;
  role: SourceRole;
  repository: string;
  requested_ref: string;
  commit_sha: string;
  tree_sha: string;
  committed_at: string | null;
  headline: string | null;
}

export interface DeploymentEvidence {
  kind: 'GITHUB_DEPLOYMENT_RECORD' | 'LIVE_BUILD_IDENTIFIER';
  accepted: boolean;
  reference: string;
  observed_sha: string | null;
  observed_at: string | null;
  reason: string;
}

export interface DeploymentVerification {
  status: DeploymentStatus;
  deployed_sha: string | null;
  evidence: DeploymentEvidence[];
  summary: string;
}

export function assertSha(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SHA_RE.test(value)) {
    throw new Error(`${label} must be a full 40-character lowercase Git SHA`);
  }
}

export function repositorySlug(side: SourceSide): string {
  const r = SOURCE_REPOSITORIES[side];
  return `${r.owner}/${r.repo}`;
}

/** Immutable GitHub URL for a path at a pinned commit. Never points at a moving branch. */
export function pinnedBlobUrl(side: SourceSide, commitSha: string, path: string): string {
  assertSha(commitSha, 'commitSha');
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${repositorySlug(side)}/blob/${commitSha}/${encoded}`;
}

export function pinnedCommitUrl(side: SourceSide, commitSha: string): string {
  assertSha(commitSha, 'commitSha');
  return `https://github.com/${repositorySlug(side)}/commit/${commitSha}`;
}

export function shortSha(sha: string | null | undefined): string {
  return typeof sha === 'string' && SHA_RE.test(sha) ? sha.slice(0, 12) : 'UNKNOWN';
}

/** The verified deployed SHA is never substituted with production main. */
export function deploymentLabel(v: Pick<DeploymentVerification, 'status' | 'deployed_sha'>): string {
  return v.status === 'DEPLOYMENT_VERIFIED' && v.deployed_sha ? shortSha(v.deployed_sha) : 'DEPLOYMENT_UNVERIFIED';
}
