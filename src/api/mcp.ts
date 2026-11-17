/**
 * RS-AI-API-001 MCP gateway: stateless Streamable HTTP served by the official SDK
 * (createMcpHandler builds a fresh McpServer for every request; there is no session, socket or
 * store). Each tool is one read-only operation of the same service the REST routes call, so MCP
 * and REST cannot disagree. Protocol negotiation, JSON-RPC and version handling are the SDK's.
 */
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { API_LIMITS, API_SCHEMA, ApiError, INPUTS, MCP_INSTRUCTIONS, MCP_SERVER_INFO, MCP_TOOLS, type OperationName } from './contract.ts';
import { assetLoader, errorResponse, guard, pageAssetReader, type ApiEnv } from './http.ts';
import { createService, type Service } from './service.ts';

/** Browser origins that may call /mcp. A request without an Origin header (server-to-server clients) is allowed. Origin is not authentication. */
export const DEFAULT_MCP_ORIGINS = Object.freeze(['https://chatgpt.com', 'https://chat.openai.com', 'https://claude.ai', 'https://gemini.google.com']);
export function originAllowed(origin: string | null, self: string, extra: string | undefined): boolean {
  if (origin === null) return true;
  if (origin === 'null') return false;
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.origin === self) return true;
  // Loopback development tools such as MCP Inspector.
  if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) return true;
  const allowed = [...DEFAULT_MCP_ORIGINS, ...(extra ?? '').split(',').map((s) => s.trim()).filter(Boolean)];
  return allowed.includes(parsed.origin);
}

const OUTPUT = z.object({
  schema_version: z.literal(API_SCHEMA),
  operation: z.string(),
  result_status: z.enum(['OK', 'INSUFFICIENT_DATA', 'NOT_FOUND', 'INVALID_INPUT']),
  snapshot: z.object({
    statistics_commit: z.string().nullable(), production_source_sha: z.string().nullable(), remodeling_source_sha: z.string().nullable(), studio_deployment_status: z.string(),
    rules_version: z.string().nullable(), semantic_digest: z.string().nullable(), analysis_generated_at: z.string().nullable(),
  }),
  data: z.unknown(),
  evidence: z.array(z.object({ id: z.string(), kind: z.string(), status: z.string(), repository: z.string().nullable(), commit_sha: z.string().nullable(), path: z.string().nullable(), pointer: z.string().nullable(), line: z.number().nullable(), quote: z.string().nullable(), url: z.string().nullable() })),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  next_cursor: z.string().nullable(),
  truncated: z.boolean(),
});

/** Object schema of an operation's inputs for tools/list; cross-field rules are enforced again in service.run(). */
function shapeOf(name: OperationName) {
  type Shape = Record<string, z.ZodType>;
  const schema = INPUTS[name] as unknown as { shape?: Shape; in?: { shape?: Shape }; def?: { in?: { shape?: Shape } } };
  const shape = schema.shape ?? schema.in?.shape ?? schema.def?.in?.shape;
  if (!shape) throw new Error(`No object shape for ${name}`);
  return z.object(shape);
}

export function buildMcpServer(service: Service): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, { instructions: MCP_INSTRUCTIONS });
  for (const op of MCP_TOOLS) {
    server.registerTool(op.name, {
      title: op.title,
      description: op.description,
      inputSchema: shapeOf(op.name),
      outputSchema: OUTPUT,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async (args: Record<string, unknown>) => {
      try {
        // run() validates again with the full schema, including the cross-field rules a raw shape cannot carry.
        const envelope = await service.run(op.name, args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(envelope) }], structuredContent: envelope as unknown as Record<string, unknown> };
      } catch (error) {
        const body = error instanceof ApiError ? { code: error.code, message: error.message } : { code: 'INTERNAL_ERROR', message: 'The tool call could not be completed.' };
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ schema_version: API_SCHEMA, operation: op.name, result_status: 'ERROR', error: body }) }] };
      }
    });
  }
  return server;
}

/** One HTTP exchange with /mcp. POST carries the protocol; the SDK answers GET and DELETE with 405 in stateless mode. */
export async function handleMcp(request: Request, env: ApiEnv, service?: Service): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (!originAllowed(request.headers.get('Origin'), url.origin, env.MCP_ALLOWED_ORIGINS)) return errorResponse('ORIGIN_NOT_ALLOWED', 403, 'This Origin may not call the MCP endpoint. Server-side MCP clients send no Origin header.');
    const blocked = await guard(request, env);
    if (blocked) return blocked;
    const api = service ?? createService(assetLoader(env, url.origin), pageAssetReader(env, url.origin));
    const handler = createMcpHandler(() => buildMcpServer(api), { legacy: 'stateless', maxRequestBodySize: API_LIMITS.MAX_BODY_BYTES });
    const response = await handler.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return errorResponse('INTERNAL_ERROR', 500, 'The MCP request could not be completed.');
  }
}
