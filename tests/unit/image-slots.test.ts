import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ILLUSTRATION_CDN_ORIGIN,
  ILLUSTRATION_RESOURCE_COMMIT,
  ILLUSTRATION_RESOURCE_REPO,
  IMAGE_SLOTS,
  pinnedIllustrationUrl,
  resolveSlot,
  validateSlot,
  type ImageSlotId,
} from '../../src/lib/image-slots.ts';

const ROOT = process.cwd();

function walkAstroPages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkAstroPages(full);
    return entry.name.endsWith('.astro') ? [full] : [];
  });
}

test('pinnedIllustrationUrl enforces full 40-char lowercase hex commit SHA and safe relative WebP path', () => {
  const ok = pinnedIllustrationUrl('images/stats-home-hero.webp', ILLUSTRATION_RESOURCE_COMMIT);
  assert.equal(
    ok,
    `${ILLUSTRATION_CDN_ORIGIN}/gh/${ILLUSTRATION_RESOURCE_REPO}@${ILLUSTRATION_RESOURCE_COMMIT}/images/stats-home-hero.webp`,
  );
  // Short SHAs, branch refs, tags, uppercase hex and path traversal must all be rejected.
  for (const badSha of ['d9fff7d', 'd9fff7d30ca9', 'main', 'latest', 'HEAD', 'D9FFF7D30CA9D977328D1120C3B638C48046FF9C', 'z'.repeat(40)]) {
    assert.throws(() => pinnedIllustrationUrl('images/stats-home-hero.webp', badSha), /full 40-char/);
  }
  for (const badPath of ['../secret.webp', 'masters/stats-home-hero.jpg', 'images/Stats_Home.webp', 'images/foo.png', 'https://evil.example/x.webp']) {
    assert.throws(() => pinnedIllustrationUrl(badPath, ILLUSTRATION_RESOURCE_COMMIT), /Invalid illustration asset path/);
  }
});

test('validateSlot rejects approved slots missing src, missing alt, or lacking full 40-char commit pin', () => {
  const base = IMAGE_SLOTS.STATS_HOME_HERO;
  assert.throws(() => validateSlot({ ...base, src: null }), /requires src and meaningful alt/);
  assert.throws(() => validateSlot({ ...base, alt: '   ' }), /requires src and meaningful alt/);
  assert.throws(
    () => validateSlot({ ...base, src: 'https://cdn.jsdelivr.net/gh/Reltroner/reltroner-statistics-resource@main/images/stats-home-hero.webp' }),
    /full 40-char commit-pinned/,
  );
  assert.throws(
    () => validateSlot({ ...base, src: 'https://cdn.jsdelivr.net/gh/Reltroner/reltroner-statistics-resource@d9fff7d/images/stats-home-hero.webp' }),
    /full 40-char commit-pinned/,
  );
});

test('all 18 registered slots resolve cleanly, keep 1:1 unique paths, exact ratios, and match page census', () => {
  const ids = Object.keys(IMAGE_SLOTS) as ImageSlotId[];
  assert.equal(ids.length, 18);

  const expectedRatio: Record<'16 / 9' | '3 / 2' | '4 / 3', number> = {
    '16 / 9': 16 / 9,
    '3 / 2': 3 / 2,
    '4 / 3': 4 / 3,
  };
  const seenPaths = new Set<string>();
  let approvedCount = 0;
  let pendingCount = 0;

  for (const id of ids) {
    const slot = resolveSlot(id);
    assert.equal(slot.id, id);
    assert.ok(Math.abs(slot.width / slot.height - expectedRatio[slot.aspect]) < 1e-6, `${id} intrinsic ratio matches ${slot.aspect}`);
    if (slot.approved) {
      approvedCount++;
      assert.ok(slot.src && slot.resourcePath && slot.sha256);
      assert.ok(/^[0-9a-f]{64}$/.test(slot.sha256), `${id} sha256 format`);
      const expectedSlug = id.toLowerCase().replace(/_/g, '-');
      assert.equal(slot.resourcePath, `images/${expectedSlug}.webp`, `${id} deterministic 1:1 filename`);
      assert.ok(!seenPaths.has(slot.resourcePath), `no duplicate path for ${slot.resourcePath}`);
      seenPaths.add(slot.resourcePath);
    } else {
      pendingCount++;
      assert.equal(slot.src, null);
      assert.equal(slot.resourcePath, null);
      assert.equal(slot.sha256, null);
    }
  }
  assert.equal(approvedCount, 9);
  assert.equal(pendingCount, 9);

  // Reconcile against actual <ImageSlot slotId="..." /> invocations in src/pages/**/*.astro.
  const referenced = new Set<string>();
  let occurrences = 0;
  for (const file of walkAstroPages(path.join(ROOT, 'src', 'pages'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/<ImageSlot\b[^>]*slotId="([^"]+)"/g)) {
      occurrences++;
      const slotId = m[1]!;
      assert.ok(Object.hasOwn(IMAGE_SLOTS, slotId), `unregistered slot ${slotId} in ${file}`);
      referenced.add(slotId);
    }
  }
  assert.equal(referenced.size, 18, 'all 18 registered slots are referenced (0 unused)');
  assert.equal(occurrences, 20, '20 total occurrences across 17 pages');
});
