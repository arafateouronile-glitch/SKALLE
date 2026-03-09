/**
 * 🔐 Authentification API publique Skalle (Inbound)
 *
 * Vérifie le Bearer token (clé API), compare le hash à SkalleApiKey,
 * récupère le workspace et vérifie les crédits utilisateur.
 */

import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/security/crypto";
import { hasEnoughCredits, useCredits, CREDIT_COSTS, PLAN_LIMITS } from "@/lib/credits";
import type { OperationType } from "@/lib/credits";

export interface SkalleApiContext {
  workspaceId: string;
  userId: string;
  apiKeyId: string;
}

export interface SkalleApiAuthError {
  error: string;
  status: number;
}

/**
 * Authentifie une requête API v1 via Bearer token (clé Skalle).
 * 1. Extrait Authorization: Bearer <token>
 * 2. Hash du token et recherche dans SkalleApiKey
 * 3. Vérifie le solde de crédits du user du workspace
 */
export async function authenticateSkalleApi(
  req: Request,
  operation: OperationType = "api_lead"
): Promise<SkalleApiContext | SkalleApiAuthError> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Authorization: Bearer <token> requis", status: 401 };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { error: "Token manquant", status: 401 };
  }

  const hashedKey = hashApiKey(token);

  const apiKey = await prisma.skalleApiKey.findFirst({
    where: { hashedKey },
    include: {
      workspace: {
        select: { userId: true },
      },
    },
  });

  if (!apiKey) {
    return { error: "Clé API invalide", status: 401 };
  }

  const userId = apiKey.workspace.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  if (!user || !PLAN_LIMITS[user.plan].apiAccess) {
    return {
      error: "L'accès API nécessite un plan AGENCY ou supérieur",
      status: 403,
    };
  }

  const creditCheck = await hasEnoughCredits(userId, operation);
  if (!creditCheck.hasCredits) {
    return {
      error: `Crédits insuffisants. Requis: ${creditCheck.cost}, Disponibles: ${creditCheck.currentCredits}`,
      status: 402,
    };
  }

  // Mise à jour lastUsedAt (fire-and-forget)
  prisma.skalleApiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return {
    workspaceId: apiKey.workspaceId,
    userId,
    apiKeyId: apiKey.id,
  };
}

/**
 * Consomme les crédits après une action API réussie.
 */
export async function consumeApiCredits(
  userId: string,
  operation: OperationType,
  workspaceId: string
): Promise<{ success: boolean; error?: string }> {
  const cost = CREDIT_COSTS[operation];
  const result = await useCredits(userId, operation);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  await prisma.aPIUsage.create({
    data: {
      service: "api",
      operation,
      credits: cost,
      workspaceId,
    },
  });
  return { success: true };
}
