/**
 * RS-AI-API-001 MCP endpoint: /mcp, stateless Streamable HTTP. A thin Pages Function over the same
 * read-only service as /api/v1. No session, no store, no outbound fetch, no write.
 */
import type { ApiEnv } from '../src/api/http.ts';
import { handleMcp } from '../src/api/mcp.ts';

export const onRequest = ({ request, env }: { request: Request; env: ApiEnv }): Promise<Response> => handleMcp(request, env);
