# RS-AI-API-001 — AI & MCP Client Setup Guide

- **Public Site:** `https://statistics.reltroner.com`
- **Discovery:** `https://statistics.reltroner.com/llms.txt` · `https://statistics.reltroner.com/ai/manifest.json` · `https://statistics.reltroner.com/ai/context.json`
- **OpenAPI 3.1:** `https://statistics.reltroner.com/openapi.json`
- **REST Base:** `https://statistics.reltroner.com/api/v1`
- **Stateless MCP Endpoint:** `https://statistics.reltroner.com/mcp` (Streamable HTTP, `POST /mcp`)

---

## 1. Honest Capability Notice (Read First)

Pasting `https://statistics.reltroner.com/` into a chat window **does not automatically connect MCP tools**. AI clients interact with Reltroner Statistics in three distinct ways:

1. **Web Browsing (`BROWSE`):** Any chat assistant with web browsing can read `/llms.txt`, `/ai/context.json`, `/ai/manifest.json`, and the web pages. No MCP tool is called.
2. **HTTP / OpenAPI Actions (`REST`):** Custom GPT Actions, API scripts, or HTTP-capable agents can import `https://statistics.reltroner.com/openapi.json` and call `GET`/`POST` routes under `https://statistics.reltroner.com/api/v1/*`.
3. **Connected MCP (`MCP`):** Clients that support remote Streamable HTTP MCP servers can connect `https://statistics.reltroner.com/mcp` to invoke the 13 read-only tools directly. Note: `GET /mcp` returns HTTP `405 Method Not Allowed` by design in stateless Streamable HTTP; MCP clients communicate via `POST /mcp`.

---

## 2. Connecting Clients

### A. MCP Inspector (Local or Remote Smoke Verification)

```powershell
npx @modelcontextprotocol/inspector
```

1. Select transport **Streamable HTTP**.
2. Enter URL: `https://statistics.reltroner.com/mcp` (or `http://127.0.0.1:8789/mcp` when running `npm run verify:runtime` / `npx wrangler@4.161.0 pages dev dist`).
3. Connect, click **List Tools** (13 read-only tools), and invoke `get_statistics_manifest`.

### B. ChatGPT (Custom MCP Connector or OpenAPI Action)

- **Remote MCP Connector (supported plans/workspaces):**
  1. Open ChatGPT **Settings → Connectors / Developer Mode → Add custom MCP server**.
  2. Server URL: `https://statistics.reltroner.com/mcp`
  3. Authentication: **None** (public read-only endpoint).
  4. Enable the connector in the conversation before prompting.
- **Custom GPT Action (OpenAPI alternative):**
  1. In GPT Builder → **Actions → Import from URL**, enter `https://statistics.reltroner.com/openapi.json`.
  2. Authentication: **None**.

### C. Claude (Claude Desktop / Claude Web Custom Integration)

- **Claude Web / Desktop Remote MCP Integration (where supported by plan):**
  1. Open **Settings → Integrations → Add Integration**.
  2. URL: `https://statistics.reltroner.com/mcp`.
- **Claude Desktop / Claude Code (`claude_desktop_config.json` or `.mcp.json`):**
  ```json
  {
    "mcpServers": {
      "reltroner-statistics": {
        "type": "http",
        "url": "https://statistics.reltroner.com/mcp"
      }
    }
  }
  ```

### D. Gemini CLI / Coding Agents

Add to `~/.gemini/settings.json` (or workspace `.gemini/settings.json`):

```json
{
  "mcpServers": {
    "reltroner-statistics": {
      "httpUrl": "https://statistics.reltroner.com/mcp"
    }
  }
}
```

### E. Plain-URL Browsing Fallback (No Connector Needed)

If your client or plan does not support custom MCP connectors:
- Provide `https://statistics.reltroner.com/llms.txt` and `https://statistics.reltroner.com/ai/context.json` in your prompt so the assistant can read the published index URLs (`/data/assistant-index.json`, `/data/creative.json`, `/data/decisions.json`, `/data/findings.json`, `/data/graph.json`) or `/api/v1/*` GET URLs directly.

---

## 3. Reusable Chat Prompt

Copy and paste into your connected chat session:

> Use the connected Reltroner Statistics MCP tools for Asthortera. Read manifest; retrieve pinned evidence; call calculations/scenarios/graph/creative/decision tools as relevant; synthesize insights and new hypotheses in chat. Distinguish CANON, PROPOSED, SCENARIO and INSUFFICIENT_DATA. Provide source citations, assumptions, trade-offs and next creative directions. Never write to repositories or ratify canon. If tools are unavailable, say so and use public read-only endpoints only where accessible.
