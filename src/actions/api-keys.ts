"use server";

/**
 * Actions serveur pour la gestion des clés API Skalle (inbound).
 * Réservé aux plans AGENCY et SCALE.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/security/crypto";
import { randomBytes } from "crypto";

async function getWorkspaceAndUser(): Promise<{
  workspaceId: string;
  userId: string;
  plan: string;
} | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const ws = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, user: { select: { plan: true } } },
  });

  if (!ws) return null;
  return {
    workspaceId: ws.id,
    userId: session.user.id,
    plan: ws.user.plan,
  };
}

export async function listApiKeysAction(): Promise<{
  success: boolean;
  keys?: Array<{
    id: string;
    name: string;
    keyPrefix: string;
    lastUsedAt: Date | null;
    createdAt: Date;
  }>;
  plan?: string;
  error?: string;
}> {
  const ctx = await getWorkspaceAndUser();
  if (!ctx) return { success: false, error: "Non autorisé" };

  const keys = await prisma.skalleApiKey.findMany({
    where: { workspaceId: ctx.workspaceId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return { success: true, keys, plan: ctx.plan };
}

export async function createApiKeyAction(name: string): Promise<{
  success: boolean;
  key?: string; // clé en clair, affichée une seule fois
  keyPrefix?: string;
  id?: string;
  error?: string;
}> {
  const ctx = await getWorkspaceAndUser();
  if (!ctx) return { success: false, error: "Non autorisé" };

  if (!["AGENCY", "SCALE"].includes(ctx.plan)) {
    return {
      success: false,
      error: "L'accès API nécessite un plan AGENCY ou SCALE",
    };
  }

  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 100) {
    return { success: false, error: "Nom invalide (1-100 caractères)" };
  }

  // Limite : 10 clés max par workspace
  const count = await prisma.skalleApiKey.count({
    where: { workspaceId: ctx.workspaceId },
  });
  if (count >= 10) {
    return {
      success: false,
      error: "Maximum 10 clés API par workspace",
    };
  }

  // Génération : sk_live_<64 hex chars>
  const rawKey = `sk_live_${randomBytes(32).toString("hex")}`;
  const hashedKey = hashApiKey(rawKey);
  // Préfixe affiché : "sk_live_...xxxx" (8 premiers + 4 derniers)
  const keyPrefix = rawKey.slice(0, 15) + "..." + rawKey.slice(-4);

  const created = await prisma.skalleApiKey.create({
    data: {
      name: trimmedName,
      hashedKey,
      keyPrefix,
      workspaceId: ctx.workspaceId,
    },
  });

  return {
    success: true,
    key: rawKey,
    keyPrefix,
    id: created.id,
  };
}

export async function revokeApiKeyAction(keyId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const ctx = await getWorkspaceAndUser();
  if (!ctx) return { success: false, error: "Non autorisé" };

  const deleted = await prisma.skalleApiKey.deleteMany({
    where: { id: keyId, workspaceId: ctx.workspaceId },
  });

  if (deleted.count === 0) {
    return { success: false, error: "Clé introuvable" };
  }

  return { success: true };
}
