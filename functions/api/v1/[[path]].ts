/**
 * RS-AI-API-001 REST routes: /api/v1/*. A thin Pages Function over the shared read-only service
 * (src/api). Public, credential-free reads of this deployment's published artifacts; see
 * /openapi.json. The existing /api/assistant function is separate and unchanged.
 */
import { handleRest, type ApiEnv } from '../../../src/api/http.ts';

export const onRequest = ({ request, env }: { request: Request; env: ApiEnv }): Promise<Response> => handleRest(request, env);
