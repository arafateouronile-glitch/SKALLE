"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasEnoughCredits, useCredits, CREDIT_COSTS } from "@/lib/credits";
import type { OperationType } from "@/lib/credits";
import {
  trackPostEngagement,
  importInteractions,
  generatePersonalizedDM,
  regenerateDM,
  getInteractionsWithStats,
  markAsContacted,
  markAsIgnored,
  deleteInteraction,
  type SocialPlatform,
  type RawInteraction,
} from "@/lib/services/social/prospector";
import {
  checkAndConsumeDmQuota,
  getRemainingDailyDmQuota,
} from "@/lib/services/social/instagram";

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
// 📥 IMPORT & TRACKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tracker l'engagement d'un post (V1 : mock data).
 */
export async function trackPostEngagementAction(
  workspaceId: string,
  postUrl: string,
  platform: SocialPlatform
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const check = await hasEnoughCredits(session.user!.id!, "social_prospector_track" as OperationType);
    if (!check.hasCredits) {
      return {
        success: false as const,
        error: `Crédits insuffisants. Requis: ${CREDIT_COSTS.social_prospector_track}, Disponibles: ${check.currentCredits}.`,
      };
    }

    const interactions = await trackPostEngagement(postUrl, platform, workspaceId);

    await useCredits(session.user!.id!, "social_prospector_track" as OperationType);
    await prisma.aPIUsage.create({
      data: {
        service: "social",
        operation: "social_prospector_track",
        credits: CREDIT_COSTS.social_prospector_track,
        workspaceId,
      },
    });

    return {
      success: true as const,
      data: { count: interactions.length },
      error: null,
    };
  } catch (error) {
    console.error("trackPostEngagementAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur lors du tracking",
    };
  }
}

/**
 * Import manuel d'interactions (depuis CSV ou extension Chrome).
 */
export async function importInteractionsAction(
  workspaceId: string,
  interactions: RawInteraction[]
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const result = await importInteractions(workspaceId, interactions);

    return {
      success: true as const,
      data: result,
      error: null,
    };
  } catch (error) {
    console.error("importInteractionsAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur lors de l'import",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 GÉNÉRATION DE DM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère 3 variantes de DM pour une interaction.
 */
export async function generateDMAction(
  workspaceId: string,
  interactionId: string
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const check = await hasEnoughCredits(session.user!.id!, "social_prospector_dm" as OperationType);
    if (!check.hasCredits) {
      return {
        success: false as const,
        error: `Crédits insuffisants. Requis: ${CREDIT_COSTS.social_prospector_dm}, Disponibles: ${check.currentCredits}.`,
      };
    }

    // Vérifier que l'interaction appartient au workspace
    const interaction = await prisma.socialInteraction.findFirst({
      where: { id: interactionId, workspaceId },
    });
    if (!interaction) {
      return { success: false as const, error: "Interaction non trouvée" };
    }

    // Quota warm-up Instagram : max 20 suggestions DM/jour
    if (interaction.platform === "INSTAGRAM") {
      const quotaCheck = await checkAndConsumeDmQuota(workspaceId);
      if (!quotaCheck.allowed) {
        return {
          success: false as const,
          error: `Quota Instagram atteint (20/jour). Réessaie demain pour protéger ton compte.`,
        };
      }
    }

    const variants = await generatePersonalizedDM(interactionId);

    await useCredits(session.user!.id!, "social_prospector_dm" as OperationType);
    await prisma.aPIUsage.create({
      data: {
        service: "anthropic",
        operation: "social_prospector_dm",
        credits: CREDIT_COSTS.social_prospector_dm,
        workspaceId,
      },
    });

    return {
      success: true as const,
      data: variants,
      error: null,
    };
  } catch (error) {
    console.error("generateDMAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur lors de la génération",
    };
  }
}

/**
 * Régénère les DM (rotation de messages).
 */
export async function regenerateDMAction(
  workspaceId: string,
  interactionId: string
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const check = await hasEnoughCredits(session.user!.id!, "social_prospector_dm" as OperationType);
    if (!check.hasCredits) {
      return {
        success: false as const,
        error: `Crédits insuffisants. Requis: ${CREDIT_COSTS.social_prospector_dm}, Disponibles: ${check.currentCredits}.`,
      };
    }

    const variants = await regenerateDM(interactionId);

    await useCredits(session.user!.id!, "social_prospector_dm" as OperationType);

    return {
      success: true as const,
      data: variants,
      error: null,
    };
  } catch (error) {
    console.error("regenerateDMAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur lors de la régénération",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 GESTION DU WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Récupère les interactions avec statistiques.
 */
export async function getInteractionsAction(workspaceId: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const result = await getInteractionsWithStats(workspaceId);

    return {
      success: true as const,
      data: result,
      error: null,
    };
  } catch (error) {
    console.error("getInteractionsAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur lors du chargement",
    };
  }
}

/**
 * Marquer une interaction comme contactée.
 */
export async function markAsContactedAction(
  workspaceId: string,
  interactionId: string
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await markAsContacted(interactionId);
    return { success: true as const, error: null };
  } catch (error) {
    console.error("markAsContactedAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Marquer une interaction comme ignorée.
 */
export async function markAsIgnoredAction(
  workspaceId: string,
  interactionId: string
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await markAsIgnored(interactionId);
    return { success: true as const, error: null };
  } catch (error) {
    console.error("markAsIgnoredAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Récupère le quota DM Instagram restant (warm-up : 20/jour).
 */
export async function getIGDmQuotaAction(workspaceId: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const quota = await getRemainingDailyDmQuota(workspaceId);

    return {
      success: true as const,
      data: quota,
      error: null,
    };
  } catch (error) {
    console.error("getIGDmQuotaAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Supprimer une interaction.
 */
export async function deleteInteractionAction(
  workspaceId: string,
  interactionId: string
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await deleteInteraction(interactionId);
    return { success: true as const, error: null };
  } catch (error) {
    console.error("deleteInteractionAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur lors de la suppression",
    };
  }
}
