"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGSCAuthUrl } from "@/lib/services/integrations/google-search-console";

// Helper : résoudre et valider le workspaceId de l'utilisateur
async function resolveWorkspaceId(userId: string, workspaceId?: string): Promise<string | null> {
  const ws = await prisma.workspace.findFirst({
    where: workspaceId ? { id: workspaceId, userId } : { userId },
    select: { id: true },
  });
  return ws?.id ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Google Search Console
// ═══════════════════════════════════════════════════════════════════════════

/** Retourne l'URL OAuth2 GSC pour le workspace de l'utilisateur connecté */
export async function getGSCAuthUrlAction(workspaceId?: string): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non autorisé" };

  const resolvedWorkspaceId = await resolveWorkspaceId(session.user.id, workspaceId);
  if (!resolvedWorkspaceId) return { success: false, error: "Workspace introuvable" };
  workspaceId = resolvedWorkspaceId;

  try {
    const url = getGSCAuthUrl(workspaceId!);
    return { success: true, url };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "GOOGLE_GSC_CLIENT_ID non configuré",
    };
  }
}

/** Retourne le statut de connexion GSC pour le workspace de l'utilisateur connecté */
export async function getGSCStatusAction(workspaceId?: string): Promise<{
  isConnected: boolean;
  siteUrl?: string;
  lastSyncedAt?: Date | null;
}> {
  const session = await auth();
  if (!session?.user?.id) return { isConnected: false };

  const resolvedId = await resolveWorkspaceId(session.user.id, workspaceId);
  if (!resolvedId) return { isConnected: false };

  const config = await prisma.googleSearchConsoleConfig.findUnique({
    where: { workspaceId: resolvedId },
    select: { isConnected: true, siteUrl: true, lastSyncedAt: true },
  });

  return {
    isConnected: config?.isConnected ?? false,
    siteUrl: config?.siteUrl ?? undefined,
    lastSyncedAt: config?.lastSyncedAt ?? null,
  };
}

/** Déconnecte GSC pour le workspace de l'utilisateur connecté */
export async function disconnectGSCAction(workspaceId?: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non autorisé" };

  const resolvedId = await resolveWorkspaceId(session.user.id, workspaceId);
  if (!resolvedId) return { success: false, error: "Workspace introuvable" };

  await prisma.googleSearchConsoleConfig.updateMany({
    where: { workspaceId: resolvedId },
    data: { isConnected: false, accessToken: "", refreshToken: "" },
  });

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Competitor Alerts
// ═══════════════════════════════════════════════════════════════════════════

export async function getCompetitorAlertsCountAction(workspaceId: string): Promise<{
  count: number;
  alerts: Array<{ id: string; competitorDomain: string; contentTitle: string | null; matchedKeyword: string | null; newContentUrl: string; createdAt: Date }>;
}> {
  const [count, alerts] = await Promise.all([
    prisma.competitorAlert.count({
      where: { workspaceId, isRead: false },
    }),
    prisma.competitorAlert.findMany({
      where: { workspaceId, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, competitorDomain: true, contentTitle: true, matchedKeyword: true, newContentUrl: true, createdAt: true },
    }),
  ]);
  return { count, alerts };
}

export async function markAlertsReadAction(workspaceId: string): Promise<void> {
  await prisma.competitorAlert.updateMany({
    where: { workspaceId, isRead: false },
    data: { isRead: true },
  });
}
