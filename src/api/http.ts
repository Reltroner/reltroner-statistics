/**
 * RS-AI-API-001 HTTP layer, shared by the Pages Functions and the tests. It maps a web Request to
 * one operation of the service and nothing else: fixed routes, GET or POST only, bounded bodies,
 * JSON in and out, no stack traces. It reads artifacts of this deployment through the injected
 * asset binding and never fetches a caller-supplied URL.
 */
import { API_LIMITS, API_SCHEMA, ApiError, OPERATIONS, type Envelope, type ErrorBody, type OperationDef, type OperationName } from './contract.ts';
import { ARTIFACTS, createService, type ArtifactName, type Loader, type Service } from './service.ts';

export interface ApiEnv {
  /** Static assets of this Pages deployment. */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Optional owner-configured rate limiter. When bound, every API and MCP request is counted. */
  API_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  /** Owner kill switch: "true" answers 503 on every API and MCP route. */
  RS_API_DISABLED?: string;
  /** Extra browser origins allowed to call /mcp, comma-separated. */
  MCP_ALLOWED_ORIGINS?: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'cross-origin' } as const;
/** Public, credential-free reads: any origin may read REST answers. No cookie or secret is ever involved. */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } as const;

export function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
export function errorResponse(code: string, status: number, message: string, operation: string | null = null, headers: Record<string, string> = {}): Response {
  const body: ErrorBody = { schema_version: API_SCHEMA, operation, result_status: 'ERROR', error: { code, message } };
  return jsonResponse(body, status, { 'Cache-Control': 'no-store', ...headers });
}

/** Parsed artifacts of this deployment, kept for the life of the isolate. They are public, immutable per build and never per-client. */
const cache = new WeakMap<object, Map<ArtifactName, Promise<unknown>>>();
export function assetLoader(env: ApiEnv, origin: string): Loader {
  let store = cache.get(env.ASSETS);
  if (!store) cache.set(env.ASSETS, (store = new Map()));
  const map = store;
  return (name) => {
    let pending = map.get(name);
    if (!pending) {
      pending = env.ASSETS.fetch(new Request(new URL(ARTIFACTS[name].path, origin))).then(async (response) => {
        if (!response.ok) throw new ApiError('ARTIFACT_UNAVAILABLE', 503, `The published artifact ${ARTIFACTS[name].path} is not available.`);
        return response.json() as Promise<unknown>;
      });
      // A failed read is not cached, so a later request can succeed.
      pending.catch(() => map.delete(name));
      map.set(name, pending);
    }
    return pending;
  };
}

/** Shared gate of REST and MCP: the owner kill switch, then the optional rate limiter. */
export async function guard(request: Request, env: ApiEnv): Promise<Response | null> {
  if (env.RS_API_DISABLED === 'true') return errorResponse('API_DISABLED', 503, 'The intelligence API is switched off by the site owner. The website and its published data files are unaffected.');
  if (env.API_RATE_LIMITER) {
    const { success } = await env.API_RATE_LIMITER.limit({ key: `rs-api:${request.headers.get('CF-Connecting-IP') ?? 'anonymous'}` });
    if (!success) return errorResponse('RATE_LIMITED', 429, 'Too many requests. Try again shortly.', null, { 'Retry-After': '60' });
  }
  return null;
}

export async function readJsonBody(request: Request, maxBytes = API_LIMITS.MAX_BODY_BYTES): Promise<unknown> {
  const type = (request.headers.get('Content-Type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 415, 'Send the body as application/json.');
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > maxBytes) throw new ApiError('REQUEST_TOO_LARGE', 413, `The body exceeds ${maxBytes} bytes.`);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new ApiError('REQUEST_TOO_LARGE', 413, `The body exceeds ${maxBytes} bytes.`);
  try { return JSON.parse(raw) as unknown; } catch { throw new ApiError('INVALID_JSON', 400, 'The body is not valid JSON.'); }
}

function match(pathname: string): { op: OperationDef; params: Record<string, string> } | null {
  const clean = pathname.replace(/\/+$/, '');
  if (clean !== '/api/v1' && !clean.startsWith('/api/v1/')) return null;
  const rest = clean.slice('/api/v1'.length) || '/';
  for (const op of OPERATIONS) {
    if (op.path === rest) return { op, params: {} };
    if (op.path.endsWith('/{id}') && rest.startsWith(op.path.slice(0, -4)) && rest.length > op.path.length - 4) {
      let value: string;
      try { value = decodeURIComponent(rest.slice(op.path.length - 4)); } catch { return null; }
      if (!value.includes('/')) return { op, params: { id: value } };
    }
  }
  return null;
}

/** Query string to a plain input object. Unknown members are rejected later by the strict schema. */
function queryInput(url: URL): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

/** Statuses of answers that are valid results rather than failures. */
const statusOf = (e: Envelope): number => (e.result_status === 'NOT_FOUND' ? 404 : e.result_status === 'INVALID_INPUT' ? 422 : 200);

export async function handleRest(request: Request, env: ApiEnv, service?: Service): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...CORS, 'Cache-Control': 'public, max-age=86400' } });
  let operation: OperationName | null = null;
  try {
    const blocked = await guard(request, env);
    if (blocked) { for (const [k, v] of Object.entries(CORS)) blocked.headers.set(k, v); return blocked; }
    const found = match(url.pathname);
    if (!found) return errorResponse('NOT_FOUND', 404, 'No such API route. See /openapi.json for the routes of this version.', null, CORS);
    const { op, params } = found;
    operation = op.name;
    if (request.method !== op.method) return errorResponse('METHOD_NOT_ALLOWED', 405, `${op.path} accepts ${op.method} only.`, op.name, { ...CORS, Allow: `${op.method}, OPTIONS` });
    if (url.search.length > 2048) throw new ApiError('INVALID_INPUT', 414, 'The query string is too long.');
    const input = op.method === 'GET' ? { ...queryInput(url), ...params } : await readJsonBody(request);
    const api = service ?? createService(assetLoader(env, url.origin));
    const envelope = await api.run(op.name, input);
    // Answers change only with a new build; calculations depend on the body and are not shared-cached.
    return jsonResponse(envelope, statusOf(envelope), { ...CORS, 'Cache-Control': op.method === 'GET' ? 'public, max-age=300, must-revalidate' : 'no-store' });
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error.code, error.http, error.message, operation, CORS);
    return errorResponse('INTERNAL_ERROR', 500, 'The request could not be completed.', operation, CORS);
  }
}
