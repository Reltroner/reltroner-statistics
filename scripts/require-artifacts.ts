#!/usr/bin/env node
/** Build gate: refuse to build without validated pipeline artifacts. */
import fs from 'node:fs';
import path from 'node:path';
import { ArtifactManifestSchema } from '../src/contracts/schemas.ts';
import { sha256Hex } from '../src/engine/git-objects.ts';
import { ROOT } from './lib/context.ts';

const dir = path.join(ROOT, 'artifacts');
const file = path.join(dir, 'manifest.json');
if (!fs.existsSync(file)) {
  process.stderr.write('No artifacts/manifest.json. Run "npm run pipeline" (reads GitHub read-only; set GITHUB_TOKEN) before building.\n');
  process.exit(1);
}
const manifest = ArtifactManifestSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
for (const f of manifest.files) {
  const p = path.join(dir, f.path);
  if (!fs.existsSync(p) || sha256Hex(fs.readFileSync(p)) !== f.sha256) {
    process.stderr.write(`Artifact ${f.path} is missing or does not match its manifest checksum.\n`);
    process.exit(1);
  }
}
process.stdout.write(`${JSON.stringify({ status: 'ARTIFACTS_VERIFIED', production: manifest.sources.production.commit_sha, remodeling: manifest.sources.remodeling.commit_sha, files: manifest.files.length })}\n`);
