/**
 * 📤 Batch Cold DM - Membres Groupes Facebook
 *
 * Traite les DM approuvés pour les membres de groupes Facebook (type GROUP_MEMBER).
 * Déclenché par événement ou cron.
 * L'API Meta n'autorise pas les DM froids : si pas de conversation ouverte → MANUAL.
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/services/meta/token-manager";
import {
  sendFacebookMessage,
  hasOpenConversation,
} from "@/lib/services/meta/messaging";
import type { DMVariant } from "@/lib/services/social/prospector";

export const processGroupMemberColdDMs = inngest.createFunction(
  {
    id: "facebook-groups-cold-dm",
    name: "Process Facebook Group Member Cold DMs",
    retries: 2,
    concurrency: { limit: 1 },
  },
  [
    { event: "facebook-groups/process-cold-dms" },
    { cron: "0 */2 * * *" },
  ], // Événement + toutes les 2h
  async ({ step, event }) => {
    const workspaceId = event.data?.workspaceId as string | undefined;

    const approved = await step.run("find-approved-group-members", async () => {
      return prisma.socialInteraction.findMany({
        where: {
          type: "GROUP_MEMBER",
          platform: "FACEBOOK",
          dmApprovalStatus: "APPROVED",
          ...(workspaceId ? { workspaceId } : {}),
        },
        include: {
          workspace: {
            include: {
              metaSocialAccounts: {
                where: { isActive: true },
                take: 1,
              },
            },
          },
        },
        take: 30,
        orderBy: { updatedAt: "asc" },
      });
    });

    if (approved.length === 0) {
      return { sent: 0, failed: 0, manual: 0, total: 0 };
    }

    let sent = 0;
    let failed = 0;
    let manual = 0;

    for (let i = 0; i < approved.length; i++) {
      const interaction = approved[i];

      if (i > 0) {
        await step.sleep(`rate-limit-${i}`, "25s");
      }

      await step.run(`send-dm-${interaction.id}`, async () => {
        const metaAccount = interaction.workspace.metaSocialAccounts?.[0];

        if (!metaAccount) {
          await markAsManual(interaction.id, "Aucun compte Meta connecté");
          manual++;
          return;
        }

        const dmText = getDMText(interaction);
        if (!dmText) {
          await markAsFailed(interaction.id, "Aucun texte de DM disponible");
          failed++;
          return;
        }

        if (!interaction.metaUserId) {
          await markAsManual(interaction.id, "Identifiant Meta (PSID) manquant");
          manual++;
          return;
        }

        try {
          const pageToken = await refreshTokenIfNeeded(metaAccount.id);

          const hasConvo = await hasOpenConversation(
            metaAccount.facebookPageId,
            interaction.metaUserId,
            pageToken
          );

          if (!hasConvo) {
            await markAsManual(
              interaction.id,
              "Pas de conversation ouverte. L'API Meta n'autorise pas les DM froids."
            );
            manual++;
            return;
          }

          const result = await sendFacebookMessage(
            metaAccount.facebookPageId,
            interaction.metaUserId,
            dmText,
            pageToken,
            "human_agent"
          );

          if (result.success) {
            await markAsSent(interaction.id, "SEND_API");
            sent++;
          } else if (result.requiresManual) {
            await markAsManual(interaction.id, result.error || "Envoi impossible");
            manual++;
          } else {
            await markAsFailed(interaction.id, result.error || "Erreur d'envoi");
            failed++;
          }
        } catch (error) {
          await markAsFailed(
            interaction.id,
            error instanceof Error ? error.message : "Erreur inattendue"
          );
          failed++;
        }
      });
    }

    return { sent, failed, manual, total: approved.length };
  }
);

function getDMText(interaction: {
  customDmText: string | null;
  suggestedDMs: unknown;
  selectedDmIndex: number | null;
}): string | null {
  if (interaction.customDmText) return interaction.customDmText;
  const dms = interaction.suggestedDMs as DMVariant[] | null;
  if (dms && dms.length > 0) {
    const index = interaction.selectedDmIndex ?? 0;
    return dms[index]?.message || dms[0]?.message || null;
  }
  return null;
}

async function markAsSent(interactionId: string, sentVia: string) {
  await prisma.socialInteraction.update({
    where: { id: interactionId },
    data: {
      dmApprovalStatus: "SENT",
      status: "CONTACTED",
      sentAt: new Date(),
      sentVia,
    },
  });
}

async function markAsFailed(interactionId: string, errorMessage: string) {
  await prisma.socialInteraction.update({
    where: { id: interactionId },
    data: { dmApprovalStatus: "FAILED", errorMessage },
  });
}

async function markAsManual(interactionId: string, reason: string) {
  await prisma.socialInteraction.update({
    where: { id: interactionId },
    data: {
      dmApprovalStatus: "MANUAL",
      sentVia: "MANUAL",
      errorMessage: reason,
    },
  });
}
