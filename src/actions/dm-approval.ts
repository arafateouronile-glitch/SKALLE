"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════════════════
// 🔒 AUTH HELPERS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// 📋 QUEUE D'APPROBATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère la queue d'approbation (interactions avec DM en attente de validation).
 */
export async function getApprovalQueueAction(workspaceId: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const [pending, counts] = await Promise.all([
      prisma.socialInteraction.findMany({
        where: {
          workspaceId,
          dmApprovalStatus: "PENDING_APPROVAL",
          suggestedDMs: { not: Prisma.JsonNull },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.socialInteraction.groupBy({
        by: ["dmApprovalStatus"],
        where: { workspaceId },
        _count: true,
      }),
    ]);

    const stats: Record<string, number> = {};
    for (const c of counts) {
      stats[c.dmApprovalStatus] = c._count;
    }

    return { success: true as const, data: { pending, stats }, error: null };
  } catch (error) {
    console.error("getApprovalQueueAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Soumettre un DM pour approbation (après génération IA).
 */
export async function submitForApprovalAction(
  workspaceId: string,
  interactionId: string,
  dmIndex: number
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await prisma.socialInteraction.update({
      where: { id: interactionId },
      data: {
        dmApprovalStatus: "PENDING_APPROVAL",
        selectedDmIndex: dmIndex,
      },
    });

    return { success: true as const, error: null };
  } catch (error) {
    console.error("submitForApprovalAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Approuver un DM (sera envoyé automatiquement par le worker Inngest).
 */
export async function approveDMAction(
  workspaceId: string,
  interactionId: string
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await prisma.socialInteraction.update({
      where: { id: interactionId },
      data: { dmApprovalStatus: "APPROVED" },
    });

    return { success: true as const, error: null };
  } catch (error) {
    console.error("approveDMAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Approuver avec un texte personnalisé (l'utilisateur a modifié le DM).
 */
export async function approveWithEditAction(
  workspaceId: string,
  interactionId: string,
  customText: string
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await prisma.socialInteraction.update({
      where: { id: interactionId },
      data: {
        dmApprovalStatus: "APPROVED",
        customDmText: customText,
      },
    });

    return { success: true as const, error: null };
  } catch (error) {
    console.error("approveWithEditAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Rejeter un DM.
 */
export async function rejectDMAction(
  workspaceId: string,
  interactionId: string
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await prisma.socialInteraction.update({
      where: { id: interactionId },
      data: { dmApprovalStatus: "REJECTED" },
    });

    return { success: true as const, error: null };
  } catch (error) {
    console.error("rejectDMAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Approuver en batch plusieurs DM.
 */
export async function batchApproveDMsAction(
  workspaceId: string,
  interactionIds: string[]
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await prisma.socialInteraction.updateMany({
      where: {
        id: { in: interactionIds },
        workspaceId,
        dmApprovalStatus: "PENDING_APPROVAL",
      },
      data: { dmApprovalStatus: "APPROVED" },
    });

    return {
      success: true as const,
      data: { approved: interactionIds.length },
      error: null,
    };
  } catch (error) {
    console.error("batchApproveDMsAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Récupère les DM envoyés pour l'onglet historique.
 */
export async function getSentDMsAction(workspaceId: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const sent = await prisma.socialInteraction.findMany({
      where: {
        workspaceId,
        dmApprovalStatus: { in: ["SENT", "FAILED", "MANUAL"] },
      },
      orderBy: { sentAt: "desc" },
    });

    // Stats
    const counts = await prisma.socialInteraction.groupBy({
      by: ["dmApprovalStatus", "sentVia"],
      where: {
        workspaceId,
        dmApprovalStatus: { in: ["SENT", "FAILED", "MANUAL"] },
      },
      _count: true,
    });

    return { success: true as const, data: { sent, counts }, error: null };
  } catch (error) {
    console.error("getSentDMsAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}
