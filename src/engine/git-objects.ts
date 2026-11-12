import { createHash } from 'node:crypto';
import { codeUnitCompare } from './canonical.ts';

/** Git blob identity: sha1("blob <len>\0" + bytes). Independent of OS checkout conversion. */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface TreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

/**
 * Recompute the root tree SHA from a recursive tree listing. This proves the listing returned
 * by the API is complete and untampered for the pinned commit: every directory object is
 * rebuilt from its direct children and must hash to the SHA the parent lists for it.
 */
export function computeRootTreeSha(entries: readonly TreeEntry[]): string {
  const children = new Map<string, TreeEntry[]>();
  children.set('', []);
  for (const e of entries) {
    const slash = e.path.lastIndexOf('/');
    const parent = slash < 0 ? '' : e.path.slice(0, slash);
    let list = children.get(parent);
    if (!list) children.set(parent, (list = []));
    list.push(e);
    if (e.type === 'tree' && !children.has(e.path)) children.set(e.path, []);
  }
  const listed = new Map(entries.filter((e) => e.type === 'tree').map((e) => [e.path, e.sha]));
  const memo = new Map<string, string>();
  const hashDir = (dir: string): string => {
    const cached = memo.get(dir);
    if (cached) return cached;
    const items = (children.get(dir) ?? []).map((e) => {
      const name = dir ? e.path.slice(dir.length + 1) : e.path;
      const mode = e.type === 'tree' ? '40000' : e.mode.replace(/^0+/, '');
      const sha = e.type === 'tree' ? hashDir(e.path) : e.sha;
      if (e.type === 'tree' && listed.get(e.path) !== sha) {
        throw new Error(`Tree integrity failure at ${e.path}: listed ${listed.get(e.path)} computed ${sha}`);
      }
      return { name, mode, sha, sortKey: e.type === 'tree' ? `${name}/` : name };
    });
    items.sort((a, b) => codeUnitCompare(a.sortKey, b.sortKey));
    const body = Buffer.concat(
      items.map((i) => Buffer.concat([Buffer.from(`${i.mode} ${i.name}\0`, 'utf8'), Buffer.from(i.sha, 'hex')])),
    );
    const sha = createHash('sha1').update(`tree ${body.byteLength}\0`).update(body).digest('hex');
    memo.set(dir, sha);
    return sha;
  };
  return hashDir('');
}
