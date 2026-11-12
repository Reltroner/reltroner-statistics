/**
 * Content-addressed cache for immutable Git objects. Keys are Git SHAs, so entries never go
 * stale; blob bytes are re-verified against their SHA on every read and corrupt entries are evicted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gitBlobSha } from '../engine/git-objects.ts';

const HEX40 = /^[0-9a-f]{40}$/;
const SAFE_KIND = /^[a-z][a-z0-9-]{0,40}$/;
const SAFE_KEY = /^[A-Za-z0-9._-]{1,200}$/;

function atomicWrite(file: string, data: Uint8Array | string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export class ObjectCache {
  readonly root: string;
  hits = 0;
  misses = 0;
  constructor(root: string) {
    this.root = path.resolve(root);
  }

  #blobFile(sha: string): string {
    if (!HEX40.test(sha)) throw new Error('Invalid blob SHA for cache');
    return path.join(this.root, 'blobs', sha.slice(0, 2), sha.slice(2));
  }

  getBlob(sha: string): Uint8Array | null {
    const file = this.#blobFile(sha);
    if (!fs.existsSync(file)) { this.misses++; return null; }
    const bytes = new Uint8Array(fs.readFileSync(file));
    if (gitBlobSha(bytes) !== sha) {
      fs.rmSync(file, { force: true });
      this.misses++;
      return null;
    }
    this.hits++;
    return bytes;
  }

  putBlob(sha: string, bytes: Uint8Array): void {
    if (gitBlobSha(bytes) !== sha) throw new Error(`Refusing to cache blob with mismatched SHA ${sha}`);
    atomicWrite(this.#blobFile(sha), bytes);
  }

  #jsonFile(kind: string, key: string): string {
    if (!SAFE_KIND.test(kind) || !SAFE_KEY.test(key)) throw new Error('Unsafe cache key');
    return path.join(this.root, kind, `${key}.json`);
  }

  getJson<T>(kind: string, key: string): T | null {
    const file = this.#jsonFile(kind, key);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch {
      fs.rmSync(file, { force: true });
      return null;
    }
  }

  putJson(kind: string, key: string, value: unknown): void {
    atomicWrite(this.#jsonFile(kind, key), JSON.stringify(value));
  }
}
