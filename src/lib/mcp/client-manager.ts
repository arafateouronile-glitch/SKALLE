/**
 * MCP Client Manager — connects SKALLE agents to external MCP servers.
 * Manages a per-workspace cache of connected MCP clients.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { decryptSecret } from "@/lib/security/crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverConfigId: string;
  serverName: string;
}

/**
 * Lists all available tools from all active MCP servers for a given workspace.
 * Caches tool lists in MCPServerConfig.cachedTools (refreshed on connect).
 */
export async function listWorkspaceMcpTools(workspaceId: string): Promise<MCPTool[]> {
  const configs = await prisma.mCPServerConfig.findMany({
    where: { workspaceId, isActive: true },
  });

  const allTools: MCPTool[] = [];

  for (const config of configs) {
    try {
      const tools = await listServerTools(config);
      allTools.push(...tools);

      // Update cached tools + test status
      await prisma.mCPServerConfig.update({
        where: { id: config.id },
        data: {
          cachedTools: tools as unknown as Prisma.InputJsonValue,
          lastTestedAt: new Date(),
          lastTestOk: true,
        },
      });
    } catch {
      await prisma.mCPServerConfig.update({
        where: { id: config.id },
        data: { lastTestedAt: new Date(), lastTestOk: false },
      });
    }
  }

  return allTools;
}

/**
 * Calls a specific tool on a specific MCP server.
 */
export async function callMcpTool(
  serverConfigId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const config = await prisma.mCPServerConfig.findUnique({
    where: { id: serverConfigId },
  });

  if (!config || !config.isActive) {
    throw new Error(`MCP server config ${serverConfigId} not found or inactive`);
  }

  const client = await createClient(config);

  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    return result;
  } finally {
    await client.close();
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function createClient(config: {
  url: string;
  encryptedToken?: string | null;
  name: string;
}): Promise<Client> {
  const headers: Record<string, string> = {};

  if (config.encryptedToken) {
    const token = decryptSecret(config.encryptedToken);
    headers["Authorization"] = `Bearer ${token}`;
  }

  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: { headers },
  });

  const client = new Client(
    { name: "skalle-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  return client;
}

async function listServerTools(config: {
  id: string;
  url: string;
  name: string;
  encryptedToken?: string | null;
}): Promise<MCPTool[]> {
  const client = await createClient(config);

  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
      serverConfigId: config.id,
      serverName: config.name,
    }));
  } finally {
    await client.close();
  }
}
