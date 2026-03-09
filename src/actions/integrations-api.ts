"use server";

/**
 * Actions pour l'Integration Hub : clés API Skalle (Inbound) et connecteurs externes (Outbound).
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashApiKey, getKeyDisplayPrefix, encryptSecret } from "@/lib/security/crypto";
import { randomBytes } from "crypto";
import type { ExternalIntegrationProvider } from "@/lib/constants/integrations";
import { PLAN_LIMITS } from "@/lib/credits";

async function requireWorkspaceId(
  workspaceId?: string
): Promise<{ workspaceId: string; userId: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Non autorisé" };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });
  if (!user || !PLAN_LIMITS[user.plan].apiAccess) {
    return { error: "L'accès API nécessite un plan AGENCY ou supérieur" };
  }

  const workspace = await prisma.workspace.findFirst({
    where: workspaceId
      ? { id: workspaceId, userId: session.user.id }
      : { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return { error: "Workspace introuvable" };

  return { workspaceId: workspace.id, userId: session.user.id };
}

/** Génère une clé API au format sk_live_<random>. */
function generateSkalleApiKey(): string {
  const suffix = randomBytes(24).toString("base64url");
  return `sk_live_${suffix}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// INBOUND — Clés API Skalle
// ═══════════════════════════════════════════════════════════════════════════

export async function createSkalleApiKeyAction(name: string, workspaceId?: string): Promise<{
  success: boolean;
  key?: string;
  keyPrefix?: string;
  error?: string;
}> {
  const ctx = await requireWorkspaceId(workspaceId);
  if ("error" in ctx) return { success: false, error: ctx.error };

  const plainKey = generateSkalleApiKey();
  const hashedKey = hashApiKey(plainKey);
  const keyPrefix = getKeyDisplayPrefix(plainKey);

  await prisma.skalleApiKey.create({
    data: {
      name: name.trim() || "Clé API",
      hashedKey,
      keyPrefix,
      workspaceId: ctx.workspaceId,
    },
  });

  return {
    success: true,
    key: plainKey,
    keyPrefix: `sk_...${keyPrefix}`,
  };
}

export async function listSkalleApiKeysAction(workspaceId?: string): Promise<{
  success: boolean;
  keys?: Array<{ id: string; name: string; keyPrefix: string; lastUsedAt: Date | null; createdAt: Date }>;
  error?: string;
}> {
  const ctx = await requireWorkspaceId(workspaceId);
  if ("error" in ctx) return { success: false, error: ctx.error };

  const keys = await prisma.skalleApiKey.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, createdAt: true },
  });

  return {
    success: true,
    keys: keys.map((k: { id: string; name: string; keyPrefix: string; lastUsedAt: Date | null; createdAt: Date }) => ({
      ...k,
      keyPrefix: `sk_...${k.keyPrefix}`,
    })),
  };
}

export async function revokeSkalleApiKeyAction(id: string, workspaceId?: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await requireWorkspaceId(workspaceId);
  if ("error" in ctx) return { success: false, error: ctx.error };

  await prisma.skalleApiKey.deleteMany({
    where: { id, workspaceId: ctx.workspaceId },
  });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTBOUND — Connecteurs externes
// ═══════════════════════════════════════════════════════════════════════════

export async function createExternalIntegrationAction(
  provider: ExternalIntegrationProvider,
  apiKeyPlain: string,
  workspaceId?: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await requireWorkspaceId(workspaceId);
  if ("error" in ctx) return { success: false, error: ctx.error };

  const trimmed = apiKeyPlain.trim();
  if (!trimmed) return { success: false, error: "La clé API est requise" };

  const { encrypted, iv } = encryptSecret(trimmed);

  await prisma.externalIntegration.upsert({
    where: {
      workspaceId_provider: { workspaceId: ctx.workspaceId, provider },
    },
    create: {
      provider,
      encryptedApiKey: encrypted,
      iv,
      workspaceId: ctx.workspaceId,
    },
    update: {
      encryptedApiKey: encrypted,
      iv,
      updatedAt: new Date(),
    },
  });

  return { success: true };
}

export async function listExternalIntegrationsAction(workspaceId?: string): Promise<{
  success: boolean;
  integrations?: Array<{ id: string; provider: string; createdAt: Date }>;
  error?: string;
}> {
  const ctx = await requireWorkspaceId(workspaceId);
  if ("error" in ctx) return { success: false, error: ctx.error };

  const list = await prisma.externalIntegration.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: { id: true, provider: true, createdAt: true },
  });

  return { success: true, integrations: list };
}

export async function deleteExternalIntegrationAction(id: string, workspaceId?: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await requireWorkspaceId(workspaceId);
  if ("error" in ctx) return { success: false, error: ctx.error };

  await prisma.externalIntegration.deleteMany({
    where: { id, workspaceId: ctx.workspaceId },
  });
  return { success: true };
}
