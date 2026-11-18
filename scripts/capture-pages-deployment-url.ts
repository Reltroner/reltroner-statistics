#!/usr/bin/env node
/**
 * RS-DEPLOY-SHA-005: emit the unique Statistics Pages deployment URL that THIS Wrangler run printed, as one
 * GitHub step-output line. Exactly one https://<8-hex>.reltroner-statistics.pages.dev URL must appear; none,
 * several, or a lookalike host fails closed. The URL is never guessed and never reused from another run.
 * It is release-artifact evidence only, not proof that statistics.reltroner.com serves that deployment.
 *
 *   node scripts/capture-pages-deployment-url.ts "$RUNNER_TEMP/wrangler-pages-deploy.log" >> "$GITHUB_OUTPUT"
 *
 * stdout: `deployment_url=<url>` on success only. Exit 0 captured, 1 unavailable, 2 usage error.
 */
import fs from 'node:fs';
import { captureDeploymentUrl } from './lib/statistics-deployment-verification.ts';

const outcome = captureDeploymentUrl(process.argv.slice(2), (file) => fs.readFileSync(file, 'utf8'));
if (outcome.stderr) process.stderr.write(outcome.stderr);
if (outcome.stdout) process.stdout.write(outcome.stdout, () => process.exit(outcome.exitCode));
else process.exitCode = outcome.exitCode;
