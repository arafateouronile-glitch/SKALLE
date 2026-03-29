/**
 * MCP Server factory — creates a per-request McpServer instance.
 * Uses stateless WebStandardStreamableHTTP transport (no session management needed).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerResources } from "./resources";
import { registerTools } from "./tools";

/**
 * Creates a fully configured MCP server for the given workspace and handles the request.
 * Each request gets its own stateless transport — no server-side session storage needed.
 */
export async function handleMcpRequest(
  req: Request,
  workspaceId: string
): Promise<Response> {
  const server = new McpServer(
    { name: "skalle", version: "1.0.0" },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
      instructions:
        "SKALLE Marketing OS — Accédez aux prospects, posts, mots-clés SEO et statistiques de votre workspace. " +
        "Utilisez les outils pour créer des prospects, planifier des posts et consulter vos données CRM.",
    }
  );

  registerResources(server, workspaceId);
  registerTools(server, workspaceId);

  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless: no sessionIdGenerator
  });

  await server.connect(transport);
  const response = await transport.handleRequest(req);
  await server.close();
  return response;
}
