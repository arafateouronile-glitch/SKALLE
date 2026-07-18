"use server";

/**
 * Concurrents LinkedIn à surveiller — liste persistante par workspace.
 * Alimente le scan des followers de pages entreprise concurrentes
 * (serverSideWarmLeadsCron), au même titre que les viewers/followers.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  });
  if (!workspace) throw new Error("Workspace non trouvé");
  return workspace;
}

export async function listCompetitorWatchesAction(workspaceId: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const watches = await prisma.competitorWatch.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    return { success: true as const, data: watches };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

export async function addCompetitorWatchAction(
  workspaceId: string,
  name: string,
  linkedInCompanyUrl: string
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const trimmedName = name.trim();
    const trimmedUrl = linkedInCompanyUrl.trim();
    if (!trimmedName || !trimmedUrl) {
      return { success: false as const, error: "Nom et URL requis" };
    }
    if (!/linkedin\.com\/company\//i.test(trimmedUrl)) {
      return { success: false as const, error: "URL de page entreprise LinkedIn invalide (attendu : linkedin.com/company/...)" };
    }

    const watch = await prisma.competitorWatch.create({
      data: { workspaceId, name: trimmedName, linkedInCompanyUrl: trimmedUrl },
    });

    return { success: true as const, data: watch };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

export async function deleteCompetitorWatchAction(workspaceId: string, id: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const watch = await prisma.competitorWatch.findFirst({ where: { id, workspaceId } });
    if (!watch) return { success: false as const, error: "Concurrent introuvable" };

    await prisma.competitorWatch.delete({ where: { id } });
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}
