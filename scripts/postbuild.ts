#!/usr/bin/env node
/**
 * Post-build hardening and validation for the static output:
 *  - Content-Security-Policy with SHA-256 hashes of every inline script (no 'unsafe-inline' scripts)
 *  - security and cache headers in Cloudflare Pages `_headers` format
 *  - build-info.json: this site's own build identity (so its deployment can be verified later)
 *  - route registry, finding pages, PDFs and every internal link must resolve, or the build fails
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROUTES } from '../src/lib/site.ts';
import { ROOT } from './lib/context.ts';

const dist = path.join(ROOT, 'dist');
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const files = walk(dist);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const rel = (f: string) => `/${path.relative(dist, f).split(path.sep).join('/')}`;
const errors: string[] = [];

// 1. Inline script hashes.
const hashes = new Set<string>();
for (const f of htmlFiles) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (m[1]!.trim()) hashes.add(`'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`);
  }
}
const csp = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].sort().join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');
const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
/data/*
  Cache-Control: public, max-age=300, must-revalidate
/reports/*
  Cache-Control: public, max-age=300, must-revalidate
`;
fs.writeFileSync(path.join(dist, '_headers'), headers);

// 2. Build identity of this site (not of Studio).
let statisticsCommit: string | null = null;
try { statisticsCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { statisticsCommit = null; }
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', 'manifest.json'), 'utf8'));
fs.writeFileSync(path.join(dist, 'build-info.json'), `${JSON.stringify({
  schema_version: 'reltroner-statistics-build.v1',
  statistics_commit: statisticsCommit,
  statistics_tree_clean: (() => { try { return execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' }).trim() === ''; } catch { return null; } })(),
  semantic_digest: manifest.semantic_digest,
  rules_version: manifest.rules_version,
  sources: { production: manifest.sources.production.commit_sha, remodeling: manifest.sources.remodeling.commit_sha },
  studio_deployment: manifest.deployment.status,
  analysis_generated_at: manifest.generated_at,
}, null, 2)}\n`);

// 3. Routes, finding pages and PDFs.
const exists = (urlPath: string) => {
  const clean = decodeURIComponent(urlPath.split('#')[0]!.split('?')[0]!);
  const p = path.join(dist, clean);
  return fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, 'index.html')));
};
for (const r of ROUTES) if (!exists(r.path)) errors.push(`Route missing: ${r.path}`);
if (!fs.existsSync(path.join(dist, '404.html'))) errors.push('404.html missing');
const audit = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts', 'audit.json'), 'utf8')) as { findings: Array<{ id: string }> };
const pdfIndexPath = path.join(dist, 'reports', 'pdf', 'index.json');
const pdfIndex = fs.existsSync(pdfIndexPath) ? (JSON.parse(fs.readFileSync(pdfIndexPath, 'utf8')) as { files: Record<string, { path: string; sha256: string }> }) : null;
for (const f of audit.findings) {
  if (!exists(`/drift/${f.id}`)) errors.push(`Finding page missing: ${f.id}`);
  if (process.env.RELTRONER_PDF_EXPECTED === '1' && !pdfIndex?.files[f.id]) errors.push(`PDF missing: ${f.id}`);
}
if (pdfIndex) {
  for (const [key, entry] of Object.entries(pdfIndex.files)) {
    const bytes = fs.readFileSync(path.join(dist, entry.path));
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) errors.push(`PDF checksum mismatch: ${key}`);
    if (!bytes.subarray(0, 5).toString('latin1').startsWith('%PDF-')) errors.push(`Not a PDF: ${key}`);
  }
}

// 4. Every internal link and asset reference must resolve.
let links = 0;
for (const f of htmlFiles) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)) {
    const url = m[1]!.replace(/&amp;/g, '&');
    if (url.startsWith('//')) continue;
    links++;
    if (!exists(url)) errors.push(`Broken link in ${rel(f)}: ${url}`);
  }
}

const total = files.reduce((a, f) => a + fs.statSync(f).size, 0);
if (errors.length) {
  process.stderr.write(`${errors.slice(0, 40).join('\n')}\n${errors.length} problem(s)\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({
  status: 'STATIC_BUILD_VERIFIED_NOT_DEPLOYED', pages: htmlFiles.length, internal_links_checked: links, inline_script_hashes: hashes.size,
  pdfs: pdfIndex ? Object.keys(pdfIndex.files).length : 0, files: files.length + 2, megabytes: Number((total / 1024 / 1024).toFixed(1)),
})}\n`);
