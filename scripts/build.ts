#!/usr/bin/env node
/** Full static build: verified artifacts → Astro pages → PDFs printed from HTML → headers and validation. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './lib/context.ts';

const skipPdf = process.argv.includes('--skip-pdf');
const env = { ...process.env, RELTRONER_PDF_EXPECTED: skipPdf ? '0' : '1' };
const run = (args: string[]) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run([path.join('scripts', 'require-artifacts.ts')]);
run([path.join('node_modules', 'astro', 'bin', 'astro.mjs'), 'build']);
if (!skipPdf) run([path.join('scripts', 'render-pdf.ts')]);
run([path.join('scripts', 'postbuild.ts')]);
