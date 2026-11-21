#!/usr/bin/env python3
"""
RS-NEWSLETTER-BRANDING-EXPORT-008 R2: deterministic brand-asset generator.

Reads ONLY the root authority image (`reltroner-statistics-logo.webp`), verifies its WebP
signature, dimensions and SHA-256, and deterministically generates:
  - public/statistics-brandmark.webp   (96x96 RGB WebP for SiteHeader)
  - public/favicon.ico                 (16x16, 32x32, 48x48 multi-size ICO)
  - public/favicon-32x32.png           (32x32 RGBA PNG favicon)
  - public/favicon-48x48.png           (48x48 RGBA PNG favicon)
  - public/apple-touch-icon.png        (180x180 opaque RGB PNG for Apple touch icon)
  - src/export/brand-mark.ts           (static 72x72 PNG data URI + SHA-256 manifest)

Never modifies `reltroner-statistics-logo.webp`, `public/reltroner-statistics-logo.webp`,
or `.vscode/settings.json`.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE_REL = "reltroner-statistics-logo.webp"
SOURCE_PATH = ROOT / SOURCE_REL
EXPECTED_SOURCE_SHA256 = "b1fecd119bb0d785501b6b5980d111e866d1e75ffa8f0d9b157741918ab868b0"
EXPECTED_SOURCE_SIZE = (1254, 1254)
FAVICON_RADIUS_RATIO = 0.22
REPORT_MARK_SIZE = 72
REPORT_MARK_COLORS = 128


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def rounded_mask(size: int, radius_ratio: float = FAVICON_RADIUS_RATIO) -> Image.Image:
    scale = 4
    big = size * scale
    radius = int(round(big * radius_ratio))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=radius, fill=255)
    return mask.resize((size, size), Image.Resampling.LANCZOS)


def encode_image(img: Image.Image, fmt: str, **kwargs: object) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format=fmt, **kwargs)
    return buf.getvalue()


def load_verified_source() -> tuple[Image.Image, bytes, str]:
    if not SOURCE_PATH.is_file():
        raise SystemExit(f"R2 source missing: {SOURCE_PATH}")
    raw = SOURCE_PATH.read_bytes()
    if len(raw) < 12 or raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        raise SystemExit(f"R2 source is not a valid RIFF/WEBP file: {SOURCE_PATH}")
    digest = sha256_hex(raw)
    if digest != EXPECTED_SOURCE_SHA256:
        raise SystemExit(
            f"R2 source SHA-256 mismatch: expected {EXPECTED_SOURCE_SHA256}, got {digest}"
        )
    im = Image.open(io.BytesIO(raw))
    im.load()
    if im.format != "WEBP" or im.size != EXPECTED_SOURCE_SIZE:
        raise SystemExit(
            f"R2 source geometry mismatch: format={im.format} size={im.size}, expected WEBP {EXPECTED_SOURCE_SIZE}"
        )
    return im, raw, digest


def build_assets(src: Image.Image, source_sha256: str) -> tuple[dict[str, bytes], str]:
    src_rgba = src.convert("RGBA")
    src_rgb = src.convert("RGB")

    # 1. Header brandmark (96x96 RGB WebP; displayed at 30x30 CSS px -> 3.2x HiDPI).
    brandmark_img = src_rgb.resize((96, 96), Image.Resampling.LANCZOS)
    brandmark_bytes = encode_image(brandmark_img, "WEBP", quality=88, method=6)

    # 2. Favicons (rounded-square alpha mask matching prior rx=8/32 proportion).
    def rounded_icon(size: int) -> Image.Image:
        out = src_rgba.resize((size, size), Image.Resampling.LANCZOS)
        out.putalpha(rounded_mask(size))
        return out

    fav16_img = rounded_icon(16)
    fav32_img = rounded_icon(32)
    fav48_img = rounded_icon(48)
    fav32_bytes = encode_image(fav32_img, "PNG", optimize=True, compress_level=9)
    fav48_bytes = encode_image(fav48_img, "PNG", optimize=True, compress_level=9)
    ico_bytes = encode_image(
        fav48_img,
        "ICO",
        bitmap_format="png",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[fav32_img, fav16_img],
    )

    # 3. Apple touch icon (180x180 opaque square PNG per Apple spec).
    apple_img = src_rgb.resize((180, 180), Image.Resampling.LANCZOS)
    apple_bytes = encode_image(apple_img, "PNG", optimize=True, compress_level=9)

    # 4. Offline report inline brand mark (72x72 128-color PNG -> compact HTML & Chromium PDF XObject).
    report_rgb = src_rgb.resize((REPORT_MARK_SIZE, REPORT_MARK_SIZE), Image.Resampling.LANCZOS)
    report_pal = report_rgb.quantize(
        colors=REPORT_MARK_COLORS,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    report_bytes = encode_image(report_pal, "PNG", optimize=True, compress_level=9)
    report_b64 = base64.b64encode(report_bytes).decode("ascii")
    report_sha = sha256_hex(report_bytes)

    public_files: dict[str, bytes] = {
        "public/statistics-brandmark.webp": brandmark_bytes,
        "public/favicon.ico": ico_bytes,
        "public/favicon-32x32.png": fav32_bytes,
        "public/favicon-48x48.png": fav48_bytes,
        "public/apple-touch-icon.png": apple_bytes,
    }

    manifest_entries = [
        {
            "path": "public/statistics-brandmark.webp",
            "url": "/statistics-brandmark.webp",
            "mime": "image/webp",
            "sizes": [[96, 96]],
            "bytes": len(brandmark_bytes),
            "sha256": sha256_hex(brandmark_bytes),
        },
        {
            "path": "public/favicon.ico",
            "url": "/favicon.ico",
            "mime": "image/x-icon",
            "sizes": [[16, 16], [32, 32], [48, 48]],
            "bytes": len(ico_bytes),
            "sha256": sha256_hex(ico_bytes),
        },
        {
            "path": "public/favicon-32x32.png",
            "url": "/favicon-32x32.png",
            "mime": "image/png",
            "sizes": [[32, 32]],
            "bytes": len(fav32_bytes),
            "sha256": sha256_hex(fav32_bytes),
        },
        {
            "path": "public/favicon-48x48.png",
            "url": "/favicon-48x48.png",
            "mime": "image/png",
            "sizes": [[48, 48]],
            "bytes": len(fav48_bytes),
            "sha256": sha256_hex(fav48_bytes),
        },
        {
            "path": "public/apple-touch-icon.png",
            "url": "/apple-touch-icon.png",
            "mime": "image/png",
            "sizes": [[180, 180]],
            "bytes": len(apple_bytes),
            "sha256": sha256_hex(apple_bytes),
        },
    ]

    ts_module = (
        "/**\n"
        " * RS-NEWSLETTER-BRANDING-EXPORT-008 R2: deterministic brand-mark constants derived from\n"
        f" * root `{SOURCE_REL}` via `scripts/generate-brand-assets.py` (Pillow 13.0.0).\n"
        " * Pure static data so standalone HTML reports, headless Chromium PDF printing, and browser\n"
        " * ZIP exports share one offline-safe asset with zero network requests.\n"
        " */\n"
        f"export const BRAND_SOURCE_PATH = '{SOURCE_REL}' as const;\n"
        f"export const BRAND_SOURCE_SHA256 = '{source_sha256}' as const;\n"
        f"export const BRAND_SOURCE_DIMENSIONS = {{ width: {EXPECTED_SOURCE_SIZE[0]}, height: {EXPECTED_SOURCE_SIZE[1]} }} as const;\n"
        "\n"
        f"export const REPORT_BRAND_MARK_WIDTH = {REPORT_MARK_SIZE} as const;\n"
        f"export const REPORT_BRAND_MARK_HEIGHT = {REPORT_MARK_SIZE} as const;\n"
        "export const REPORT_BRAND_MARK_MIME = 'image/png' as const;\n"
        f"export const REPORT_BRAND_MARK_BYTES = {len(report_bytes)} as const;\n"
        f"export const REPORT_BRAND_MARK_SHA256 = '{report_sha}' as const;\n"
        f"export const REPORT_BRAND_MARK_DATA_URI = 'data:image/png;base64,{report_b64}' as const;\n"
        "\n"
        "export interface DerivedBrandAsset {\n"
        "  readonly path: string;\n"
        "  readonly url: string;\n"
        "  readonly mime: string;\n"
        "  readonly sizes: ReadonlyArray<readonly [number, number]>;\n"
        "  readonly bytes: number;\n"
        "  readonly sha256: string;\n"
        "}\n"
        "\n"
        f"export const BRAND_DERIVED_ASSETS: readonly DerivedBrandAsset[] = {json.dumps(manifest_entries, indent=2)} as const;\n"
    )
    return public_files, ts_module


def main() -> int:
    check = "--check" in sys.argv[1:]
    src, _, source_sha256 = load_verified_source()
    public_files, ts_module = build_assets(src, source_sha256)
    ts_path = ROOT / "src/export/brand-mark.ts"

    if check:
        errors: list[str] = []
        for rel, expected in public_files.items():
            p = ROOT / rel
            if not p.is_file():
                errors.append(f"Missing derived asset: {rel}")
                continue
            actual = p.read_bytes()
            if actual != expected:
                errors.append(
                    f"Derived asset mismatch for {rel}: expected {sha256_hex(expected)}, got {sha256_hex(actual)}"
                )
        if not ts_path.is_file() or ts_path.read_text(encoding="utf-8") != ts_module:
            errors.append("src/export/brand-mark.ts is out of sync with scripts/generate-brand-assets.py")
        if errors:
            for e in errors:
                print(f"[brand-assets] FAIL: {e}", file=sys.stderr)
            return 1
        print(
            json.dumps(
                {
                    "status": "BRAND_ASSETS_VERIFIED",
                    "source_sha256": source_sha256,
                    "derived_count": len(public_files) + 1,
                }
            )
        )
        return 0

    for rel, data in public_files.items():
        target = ROOT / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    ts_path.write_text(ts_module, encoding="utf-8", newline="\n")
    print(
        json.dumps(
            {
                "status": "BRAND_ASSETS_GENERATED",
                "source_sha256": source_sha256,
                "files": {rel: {"bytes": len(b), "sha256": sha256_hex(b)} for rel, b in public_files.items()},
                "brand_mark_ts": {"bytes": len(ts_module.encode("utf-8")), "sha256": sha256_hex(ts_module.encode("utf-8"))},
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
