#!/usr/bin/env node
/**
 * Verify that a published Reltroner Statistics site serves exactly the local build: the live
 * build-info.json must match dist/build-info.json (Statistics commit, semantic digest, rules version and
 * source SHAs, all in ONE response). Uploading an artifact or running a deploy command is not evidence;
 * only this check is.
 *
 * RS-DEPLOY-SHA-005: an HTTP 200 that still carries the previous build is PROPAGATING, not a verdict.
 * The canonical origin is polled with bounded backoff until it serves the expected identity on consecutive
 * reads, or a deadline fails closed. Logic and bounds: scripts/lib/statistics-deployment-verification.ts.
 *
 *   node scripts/verify-deployment.ts https://statistics.reltroner.com
 *   node scripts/verify-deployment.ts https://statistics.reltroner.com --expected-sha <40-hex> \
 *     --deployment-url https://<8-hex>.reltroner-statistics.pages.dev --require-current-main
 *
 * stdout: one JSON result (status, url, mismatches, live_commit + additive diagnostics). stderr: progress.
 * Exit 0 verified, 1 unverified, 2 usage error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/context.ts';
import {
  createFetchTransport,
  createGitMainResolver,
  runVerifyDeploymentCli,
  systemClock,
} from './lib/statistics-deployment-verification.ts';

const outcome = await runVerifyDeploymentCli(process.argv.slice(2), {
  readExpected: () => JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'build-info.json'), 'utf8')) as unknown,
  transport: createFetchTransport(),
  clock: systemClock,
  resolveMainSha: createGitMainResolver(ROOT),
  log: (line) => process.stderr.write(`${line}\n`),
});
if (outcome.stderr) process.stderr.write(outcome.stderr);
// Exit only after the JSON result has flushed (pipes can be asynchronous); usage errors print nothing to stdout.
if (outcome.stdout) process.stdout.write(outcome.stdout, () => process.exit(outcome.exitCode));
else process.exitCode = outcome.exitCode;
