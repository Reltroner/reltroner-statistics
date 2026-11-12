import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectCache } from '../../src/adapters/cache.ts';
import { GitHubClient } from '../../src/adapters/github.ts';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function githubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
}

export function createClient(log = (m: string) => process.stderr.write(`[github] ${m}\n`)): GitHubClient {
  return new GitHubClient({ token: githubToken(), concurrency: Number(process.env.GITHUB_CONCURRENCY || 6), log });
}

export function createCache(): ObjectCache {
  return new ObjectCache(path.join(ROOT, '.cache', 'github'));
}

export function parseArgs(argv: string[], allowed: readonly string[], flags: readonly string[] = []): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]!;
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    if (key in out) throw new Error(`Duplicate argument: ${key}`);
    if (flags.includes(key)) { out[key] = true; continue; }
    if (!allowed.includes(key)) throw new Error(`Unsupported argument: ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    out[key] = value;
  }
  return out;
}

export function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
