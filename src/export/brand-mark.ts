/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R2: deterministic brand-mark constants derived from
 * root `reltroner-statistics-logo.webp` via `scripts/generate-brand-assets.py` (Pillow 13.0.0).
 * Pure static data so standalone HTML reports, headless Chromium PDF printing, and browser
 * ZIP exports share one offline-safe asset with zero network requests.
 */
export const BRAND_SOURCE_PATH = 'reltroner-statistics-logo.webp' as const;
export const BRAND_SOURCE_SHA256 = 'b1fecd119bb0d785501b6b5980d111e866d1e75ffa8f0d9b157741918ab868b0' as const;
export const BRAND_SOURCE_DIMENSIONS = { width: 1254, height: 1254 } as const;

export const REPORT_BRAND_MARK_WIDTH = 72 as const;
export const REPORT_BRAND_MARK_HEIGHT = 72 as const;
export const REPORT_BRAND_MARK_MIME = 'image/png' as const;
export const REPORT_BRAND_MARK_BYTES = 3775 as const;
export const REPORT_BRAND_MARK_SHA256 = '2161c9e2f7563b25bef933c1fff28ab038f415438aa2d3d04fa72d13635b1c27' as const;
export const REPORT_BRAND_MARK_DATA_URI = 'data:image/png;base64,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' as const;

export interface DerivedBrandAsset {
  readonly path: string;
  readonly url: string;
  readonly mime: string;
  readonly sizes: ReadonlyArray<readonly [number, number]>;
  readonly bytes: number;
  readonly sha256: string;
}

export const BRAND_DERIVED_ASSETS: readonly DerivedBrandAsset[] = [
  {
    "path": "public/statistics-brandmark.webp",
    "url": "/statistics-brandmark.webp",
    "mime": "image/webp",
    "sizes": [
      [
        96,
        96
      ]
    ],
    "bytes": 2798,
    "sha256": "70424c7ea52243a0a206e3230b288a797d1a01396ae755368f86ac71a1b04436"
  },
  {
    "path": "public/favicon.ico",
    "url": "/favicon.ico",
    "mime": "image/x-icon",
    "sizes": [
      [
        16,
        16
      ],
      [
        32,
        32
      ],
      [
        48,
        48
      ]
    ],
    "bytes": 8878,
    "sha256": "88dbad303bed3400f83226b0ef82436dc66350701e6d96eec1911c584aaebaff"
  },
  {
    "path": "public/favicon-32x32.png",
    "url": "/favicon-32x32.png",
    "mime": "image/png",
    "sizes": [
      [
        32,
        32
      ]
    ],
    "bytes": 2693,
    "sha256": "ed5d88676584f4eb8dc6fb0283c80988551e84eaf644d100df0504c1560445bb"
  },
  {
    "path": "public/favicon-48x48.png",
    "url": "/favicon-48x48.png",
    "mime": "image/png",
    "sizes": [
      [
        48,
        48
      ]
    ],
    "bytes": 5066,
    "sha256": "aa79ad4b4ee6e3762e15e903fd1697e3d0f26fc7f3c56971971015a371c0f591"
  },
  {
    "path": "public/apple-touch-icon.png",
    "url": "/apple-touch-icon.png",
    "mime": "image/png",
    "sizes": [
      [
        180,
        180
      ]
    ],
    "bytes": 39433,
    "sha256": "36b154a94b68be23076c06f4bcbb55448a723ead38bcecc7f6dc453ec9a23744"
  }
] as const;
