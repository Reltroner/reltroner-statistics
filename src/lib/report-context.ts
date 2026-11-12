import type { ReportContext } from '../export/model.ts';
import { getContext } from './data.ts';

export function reportContext(): ReportContext {
  const c = getContext();
  return {
    generated_at: c.generated_at,
    rules_version: c.rules_version,
    semantic_digest: c.semantic_digest,
    production: { repository: c.production.repository, commit_sha: c.production.commit_sha, tree_sha: c.production.tree_sha },
    remodeling: { repository: c.remodeling.repository, commit_sha: c.remodeling.commit_sha, tree_sha: c.remodeling.tree_sha },
    deployment: { status: c.deployment.status, deployed_sha: c.deployment.deployed_sha, summary: c.deployment.summary },
  };
}
