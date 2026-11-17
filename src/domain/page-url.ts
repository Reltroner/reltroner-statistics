/**
 * RS-AI-PAGE-004 page addressing, shared by the build-time page mirror generator and the API.
 *
 * A pasted Statistics URL is a locator, never something to fetch: this module only parses the
 * text, offline, and refuses anything that is not exactly this site. Page lookup happens against
 * the build's page registry; nothing is guessed, folded or fuzzily matched.
 *
 * Dependency-free and pure, so it runs unchanged in Node and in the Pages Functions runtime.
 */

export const SITE_ORIGIN = 'https://statistics.reltroner.com';
export const SITE_HOST = 'statistics.reltroner.com';
export const PAGE_CONTEXT_SCHEMA = 'rs-page-context.v1';
export const PAGE_REGISTRY_SCHEMA = 'rs-page-registry.v1';
export const PAGE_MIRROR_ROOT = '/ai/pages';
export const PAGE_REGISTRY_PATH = '/ai/pages/index.json';
export const PAGE_REGISTRY_CHUNK_SCHEMA = 'rs-page-registry-chunk.v1';

export const PAGE_LIMITS = Object.freeze({
  MAX_URL_CHARS: 512,
  MAX_QUERY_PARAMS: 6,
  MAX_PARAM_CHARS: 160,
  MAX_FRAGMENT_CHARS: 120,
  MAX_SECTION_ID_CHARS: 120,
});

export const URL_REFUSALS = ['URL_TOO_LONG', 'INVALID_URL', 'INSECURE_SCHEME', 'FOREIGN_ORIGIN', 'CREDENTIALS_NOT_ALLOWED', 'PORT_NOT_ALLOWED', 'PATH_NOT_CANONICAL', 'QUERY_NOT_ALLOWED'] as const;
export type UrlRefusal = (typeof URL_REFUSALS)[number];

export interface PageLocator {
  /** Site path exactly as given (no folding of case, no decoding). */
  path: string;
  /** Decoded query parameters, in the order given. Repeated names are refused. */
  query: Array<[string, string]>;
  /** Decoded fragment without '#', or null. */
  fragment: string | null;
  form: 'absolute_url' | 'site_path';
  /** Normalizations applied while parsing, for the caller to see. */
  notes: string[];
}
export type ParsedLocator = { ok: true; value: PageLocator } | { ok: false; code: UrlRefusal; message: string };

const refuse = (code: UrlRefusal, message: string): ParsedLocator => ({ ok: false, code, message });
const PATH_CHARS = /^[A-Za-z0-9/_.-]*$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Parses an absolute https://statistics.reltroner.com URL or a site path starting with '/'.
 * Refuses other schemes and hosts, credentials, ports other than 443, backslashes, percent-encoded
 * or non-ASCII path characters, empty, '.' and '..' path segments, repeated query names and
 * oversized input. Nothing is fetched.
 */
export function parsePageLocator(input: string): ParsedLocator {
  if (input.length > PAGE_LIMITS.MAX_URL_CHARS) return refuse('URL_TOO_LONG', `The URL is longer than ${PAGE_LIMITS.MAX_URL_CHARS} characters.`);
  if (!/^[\x21-\x7e]+$/.test(input)) return refuse('INVALID_URL', 'Only printable ASCII is accepted. Spaces, control characters and non-ASCII characters must not appear in a page URL.');
  if (input.includes('\\')) return refuse('PATH_NOT_CANONICAL', 'Backslashes are not part of any page address.');
  const notes: string[] = [];
  let rest: string;
  let form: PageLocator['form'];
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(input);
  if (scheme) {
    const name = scheme[1]!.toLowerCase();
    if (name === 'http') return refuse('INSECURE_SCHEME', `Only ${SITE_ORIGIN} is resolved. Plain http is refused.`);
    if (name !== 'https') return refuse('INVALID_URL', `The scheme ${name}: is not a web page address of this site.`);
    if (!input.slice(scheme[0].length).startsWith('//')) return refuse('INVALID_URL', 'An absolute URL needs "https://" followed by the host.');
    const afterScheme = input.slice(scheme[0].length + 2);
    const end = afterScheme.search(/[/?#]/);
    const authority = end < 0 ? afterScheme : afterScheme.slice(0, end);
    rest = end < 0 ? '/' : afterScheme.slice(end);
    if (authority.includes('@')) return refuse('CREDENTIALS_NOT_ALLOWED', 'URLs with user names or passwords are refused.');
    const hostPort = /^([^:]*)(?::(.*))?$/.exec(authority)!;
    const host = hostPort[1]!.toLowerCase();
    if (hostPort[2] !== undefined) {
      if (hostPort[2] !== '443') return refuse('PORT_NOT_ALLOWED', 'Only the default https port is accepted.');
      notes.push('DEFAULT_PORT_REMOVED');
    }
    if (host !== SITE_HOST) return refuse('FOREIGN_ORIGIN', `Only pages of ${SITE_ORIGIN} are resolved. No other site is fetched or looked up.`);
    if (scheme[1] !== 'https' || hostPort[1] !== SITE_HOST) notes.push('SCHEME_AND_HOST_LOWERCASED');
    if (rest.startsWith('?') || rest.startsWith('#')) { rest = `/${rest}`; notes.push('EMPTY_PATH_IS_ROOT'); }
    form = 'absolute_url';
  } else if (input.startsWith('/') && !input.startsWith('//')) {
    rest = input;
    form = 'site_path';
  } else {
    return refuse('INVALID_URL', `Give an absolute ${SITE_ORIGIN}/… URL or a site path that starts with "/".`);
  }

  const hashAt = rest.indexOf('#');
  const rawFragment = hashAt < 0 ? null : rest.slice(hashAt + 1);
  const beforeHash = hashAt < 0 ? rest : rest.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  const path = queryAt < 0 ? beforeHash : beforeHash.slice(0, queryAt);
  const rawQuery = queryAt < 0 ? '' : beforeHash.slice(queryAt + 1);

  if (path.includes('%')) return refuse('PATH_NOT_CANONICAL', 'Percent-encoded path characters are refused. Site paths use only letters, digits, "-", "_", "." and "/".');
  if (!PATH_CHARS.test(path)) return refuse('PATH_NOT_CANONICAL', 'Site paths use only letters, digits, "-", "_", "." and "/".');
  const segments = path.split('/').slice(1);
  for (const [i, s] of segments.entries()) {
    if (s === '.' || s === '..') return refuse('PATH_NOT_CANONICAL', 'Dot segments ("." and "..") are refused; nothing outside the published pages is reachable.');
    if (s === '' && i < segments.length - 1) return refuse('PATH_NOT_CANONICAL', 'Empty path segments ("//") are refused.');
  }

  const query: Array<[string, string]> = [];
  if (rawQuery) {
    const seen = new Set<string>();
    for (const part of rawQuery.split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      let name: string; let value: string;
      try {
        name = decodeURIComponent((eq < 0 ? part : part.slice(0, eq)).replace(/\+/g, ' '));
        value = decodeURIComponent((eq < 0 ? '' : part.slice(eq + 1)).replace(/\+/g, ' '));
      } catch {
        return refuse('QUERY_NOT_ALLOWED', 'A query parameter is not valid percent-encoding.');
      }
      if (CONTROL.test(name) || CONTROL.test(value)) return refuse('QUERY_NOT_ALLOWED', 'Control characters are refused in query parameters.');
      if (name.length > PAGE_LIMITS.MAX_PARAM_CHARS || value.length > PAGE_LIMITS.MAX_PARAM_CHARS) return refuse('QUERY_NOT_ALLOWED', `Query parameter names and values are limited to ${PAGE_LIMITS.MAX_PARAM_CHARS} characters.`);
      if (seen.has(name)) return refuse('QUERY_NOT_ALLOWED', `The query parameter "${name.slice(0, 40)}" is repeated; a repeated parameter is ambiguous and is refused.`);
      seen.add(name);
      query.push([name, value]);
    }
    if (query.length > PAGE_LIMITS.MAX_QUERY_PARAMS) return refuse('QUERY_NOT_ALLOWED', `At most ${PAGE_LIMITS.MAX_QUERY_PARAMS} query parameters are accepted.`);
  }
  let fragment: string | null = null;
  if (rawFragment !== null && rawFragment !== '') {
    if (rawFragment.length > PAGE_LIMITS.MAX_FRAGMENT_CHARS) return refuse('QUERY_NOT_ALLOWED', `Fragments are limited to ${PAGE_LIMITS.MAX_FRAGMENT_CHARS} characters.`);
    try { fragment = decodeURIComponent(rawFragment); } catch { return refuse('QUERY_NOT_ALLOWED', 'The fragment is not valid percent-encoding.'); }
    if (CONTROL.test(fragment)) return refuse('QUERY_NOT_ALLOWED', 'Control characters are refused in the fragment.');
  }
  return { ok: true, value: { path, query, fragment, form, notes } };
}

/**
 * Registry ids to try for a parsed path, in order, with the normalization each implies. A directory
 * page is registered with its trailing slash ("/statistics/spatial/"), a file page without one
 * ("/reports/all/x.html"); the root is "/". Case, encoding and spelling are never changed.
 */
export function pageIdCandidates(path: string): Array<{ id: string; note: string | null }> {
  if (path === '' || path === '/') return [{ id: '/', note: path === '' ? 'EMPTY_PATH_IS_ROOT' : null }];
  return path.endsWith('/')
    ? [{ id: path, note: null }, { id: path.slice(0, -1), note: 'TRAILING_SLASH_REMOVED' }]
    : [{ id: `${path}/`, note: 'TRAILING_SLASH_ADDED' }, { id: path, note: null }];
}

/** Page id of a built HTML file, relative to dist with forward slashes ("statistics/spatial/index.html" → "/statistics/spatial/"). */
export function pageIdOfHtmlFile(relative: string): string {
  if (relative === 'index.html') return '/';
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'index.html'.length)}`;
  return `/${relative}`;
}

/**
 * Mirror files of a page, without extension. The root is "_root": Astro never routes a
 * "_"-prefixed page, so the name cannot collide with a page; "index" is kept for the registry.
 */
export function mirrorBase(pageId: string): string {
  if (pageId === '/') return `${PAGE_MIRROR_ROOT}/_root`;
  return `${PAGE_MIRROR_ROOT}${pageId.endsWith('/') ? pageId.slice(0, -1) : pageId}`;
}
export const mirrorJson = (pageId: string) => `${mirrorBase(pageId)}.json`;
export const mirrorMarkdown = (pageId: string) => `${mirrorBase(pageId)}.md`;

/** Only mirror files of the build may be read: a fixed root, plain segments, no dot segments. */
export function isMirrorJsonPath(p: string): boolean {
  if (!/^\/ai\/pages\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.json$/.test(p) || p === PAGE_REGISTRY_PATH) return false;
  return !p.split('/').some((s) => s === '.' || s === '..');
}

export const canonicalUrl = (pageId: string) => `${SITE_ORIGIN}${pageId}`;

/** Section ids generated from heading text: lower-case words joined by "-". */
export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';
}

// ---------------------------------------------------------------- shareable view state
export const VIEW_KINDS = ['graph_node', 'narrative_entity', 'narrative_entity_or_graph_node', 'creative_scenario', 'decision_tree', 'calculator_mode'] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];
export interface ViewParam {
  name: string;
  location: 'query' | 'fragment';
  kind: ViewKind;
  /** What the page's own component does with it, in its words. */
  effect: string;
}
export interface IgnoredParam { name: string; location: 'query' | 'fragment'; reason: string; browser_only: boolean }
export interface PageViewState {
  component: string;
  supported: ViewParam[];
  unsupported: IgnoredParam[];
  /** Interaction state that lives only in the visitor's browser and never travels in a link. */
  browser_only: string[];
}

/**
 * The URL parameters each page's interface reads (verified against the component sources by a
 * unit test). Only parameters whose effect is reproducible from published data are "supported";
 * the rest are declared, with the reason, so they are never silently guessed.
 */
export const PAGE_VIEW_STATE: Readonly<Record<string, PageViewState>> = Object.freeze({
  '/impact/': {
    component: 'ImpactExplorer',
    supported: [{ name: 'node', location: 'query', kind: 'graph_node', effect: 'Selects the origin node of the impact traversal (default types, depth 4, production and shared edges).' }],
    unsupported: [],
    browser_only: ['Edge-type toggles, the depth slider and the remodeling switch are not written to the URL.'],
  },
  '/creative/explore/': {
    component: 'NarrativeGraphExplorer',
    supported: [{ name: 'entity', location: 'query', kind: 'narrative_entity', effect: 'Selects one narrative entity.' }],
    unsupported: [],
    browser_only: ['Search text and kind filters typed on the page are not written to the URL.'],
  },
  '/creative/ideas/': {
    component: 'IdeationWorkspace',
    supported: [{ name: 'entity', location: 'query', kind: 'narrative_entity', effect: 'Focuses the workspace on one narrative entity.' }],
    unsupported: [],
    browser_only: ['The question sentence the workspace writes for the focused entity, and private proposals kept in this browser’s session storage, are not reproduced.'],
  },
  '/creative/remodel/': {
    component: 'CanonRemodelLab',
    supported: [
      { name: 'origin', location: 'query', kind: 'narrative_entity_or_graph_node', effect: 'Selects the origin entity or graph node.' },
      { name: 'scenario', location: 'fragment', kind: 'creative_scenario', effect: 'A fragment equal to a scenario id selects that scenario.' },
    ],
    unsupported: [],
    browser_only: ['Hypothetical parameter choices made on the page are not written to the URL.'],
  },
  '/creative/impact/': {
    component: 'CanonRemodelLab',
    supported: [
      { name: 'origin', location: 'query', kind: 'narrative_entity_or_graph_node', effect: 'Selects the origin entity or graph node.' },
      { name: 'scenario', location: 'fragment', kind: 'creative_scenario', effect: 'A fragment equal to a scenario id selects that scenario.' },
    ],
    unsupported: [],
    browser_only: ['Hypothetical parameter choices made on the page are not written to the URL.'],
  },
  '/creative/decisions/': {
    component: 'DecisionTreeWorkspace',
    supported: [{ name: 'tree', location: 'query', kind: 'decision_tree', effect: 'Selects one decision tree.' }],
    unsupported: [],
    browser_only: ['Branch choices and private review notes kept in this browser’s session storage are not reproduced.'],
  },
  '/calculator/': {
    component: 'CalculatorWorkspace',
    supported: [{ name: 'mode', location: 'fragment', kind: 'calculator_mode', effect: 'A fragment equal to a calculator mode id opens that mode.' }],
    unsupported: [{ name: 'handoff-unavailable', location: 'fragment', reason: 'Shows a notice that inputs from the Assistant could not be carried over; the inputs themselves travel in session storage.', browser_only: true }],
    browser_only: ['Inputs handed over from the Assistant travel in this browser’s session storage; inputs typed on the page are not written to the URL.'],
  },
  '/drift/': {
    component: 'FindingsExplorer',
    supported: [],
    unsupported: [
      { name: 'q', location: 'query', reason: 'The explorer filters its table in the browser. That filter is not reproduced; analyze_source_drift offers server-side filters that are similar but not identical.', browser_only: false },
      { name: 'file', location: 'query', reason: 'Same as q: a browser-side table filter that is not reproduced.', browser_only: false },
      { name: 'level', location: 'query', reason: 'Same as q: a browser-side column filter that is not reproduced.', browser_only: false },
      { name: 'classification', location: 'query', reason: 'Same as q: a browser-side column filter that is not reproduced.', browser_only: false },
      { name: 'review_status', location: 'query', reason: 'Same as q: a browser-side column filter that is not reproduced.', browser_only: false },
      { name: 'priority', location: 'query', reason: 'Same as q: a browser-side column filter that is not reproduced.', browser_only: false },
    ],
    browser_only: ['Row selections for export are kept in this browser’s session storage.'],
  },
  '/reports/': {
    component: 'ReportCenter',
    supported: [],
    unsupported: [
      { name: 'id', location: 'query', reason: 'Pre-selects one finding for an export bundle. Not reproduced; the finding itself is at its own page (/drift/<id>/) or through trace_evidence.', browser_only: false },
      { name: 'family', location: 'query', reason: 'Pre-selects a family of findings for an export bundle. Not reproduced.', browser_only: false },
      { name: 'selection', location: 'query', reason: 'Reads a selection kept in this browser’s session storage. A link cannot carry it.', browser_only: true },
    ],
    browser_only: ['Export bundles are assembled in the browser.'],
  },
});
