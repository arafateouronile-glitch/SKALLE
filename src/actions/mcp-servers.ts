"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/crypto";
import { listWorkspaceMcpTools } from "@/lib/mcp/client-manager";
import type { MCPTransport } from "@prisma/client";

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getWorkspaceId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  return workspace?.id ?? null;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export async function getMcpServers(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      url: string;
      transport: MCPTransport;
      isActive: boolean;
      lastTestedAt: Date | null;
      lastTestOk: boolean | null;
      cachedTools: unknown;
    }>
  >
> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { success: false, error: "Non authentifié" };

  const configs = await prisma.mCPServerConfig.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      url: true,
      transport: true,
      isActive: true,
      lastTestedAt: true,
      lastTestOk: true,
      cachedTools: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return { success: true, data: configs };
}

export async function addMcpServer(input: {
  name: string;
  url: string;
  transport?: MCPTransport;
  token?: string;
}): Promise<ActionResult<{ id: string }>> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { success: false, error: "Non authentifié" };

  let encryptedToken: string | undefined;
  let tokenIv: string | undefined;

  if (input.token?.trim()) {
    const { encrypted, iv } = encryptSecret(input.token.trim());
    encryptedToken = encrypted;
    tokenIv = iv;
  }

  const config = await prisma.mCPServerConfig.create({
    data: {
      workspaceId,
      name: input.name,
      url: input.url,
      transport: input.transport ?? "HTTP",
      encryptedToken,
      tokenIv,
    },
    select: { id: true },
  });

  return { success: true, data: { id: config.id } };
}

export async function updateMcpServer(
  id: string,
  input: {
    name?: string;
    url?: string;
    transport?: MCPTransport;
    token?: string;
    isActive?: boolean;
  }
): Promise<ActionResult> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { success: false, error: "Non authentifié" };

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.url !== undefined) updateData.url = input.url;
  if (input.transport !== undefined) updateData.transport = input.transport;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  if (input.token?.trim()) {
    const { encrypted, iv } = encryptSecret(input.token.trim());
    updateData.encryptedToken = encrypted;
    updateData.tokenIv = iv;
  }

  await prisma.mCPServerConfig.updateMany({
    where: { id, workspaceId },
    data: updateData,
  });

  return { success: true };
}

export async function deleteMcpServer(id: string): Promise<ActionResult> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { success: false, error: "Non authentifié" };

  await prisma.mCPServerConfig.deleteMany({
    where: { id, workspaceId },
  });

  return { success: true };
}

export async function testMcpServer(
  id: string
): Promise<ActionResult<{ toolCount: number; tools: string[] }>> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) return { success: false, error: "Non authentifié" };

  const config = await prisma.mCPServerConfig.findFirst({
    where: { id, workspaceId },
  });
  if (!config) return { success: false, error: "Serveur MCP introuvable" };

  try {
    // listWorkspaceMcpTools handles test and caching for all servers,
    // but we want to test just this one — fetch tools directly
    const { listWorkspaceMcpTools: _ } = await import("@/lib/mcp/client-manager");
    // Re-use the single server test via a temporary workspace call
    const allTools = await listWorkspaceMcpTools(workspaceId);
    const serverTools = allTools.filter((t) => t.serverConfigId === id);

    return {
      success: true,
      data: {
        toolCount: serverTools.length,
        tools: serverTools.map((t) => t.name),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Connexion échouée",
    };
  }
}
