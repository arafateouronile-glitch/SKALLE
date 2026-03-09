/**
 * 📤 Meta DM Sender Worker
 *
 * Envoie automatiquement les DM approuvés via l'API Meta :
 * - Commentaires → Private Reply API (fiable, officiel)
 * - Likes/Follows → Send API (si conversation ouverte)
 * - Fallback → Marqué MANUAL (l'utilisateur devra copier/ouvrir)
 *
 * Rate limit : ~180 messages/heure (20s entre chaque)
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { refreshTokenIfNeeded } from "@/lib/services/meta/token-manager";
import {
  sendPrivateReply,
  sendInstagramMessage,
  sendFacebookMessage,
  hasOpenConversation,
} from "@/lib/services/meta/messaging";
import type { DMVariant } from "@/lib/services/social/prospector";

export const sendApprovedDMs = inngest.createFunction(
  {
    id: "meta-dm-sender",
    name: "Send Approved Meta DMs",
    retries: 2,
    concurrency: { limit: 1 },
  },
  { cron: "*/5 * * * *" }, // Toutes les 5 minutes
  async ({ step }) => {
    // Trouver les DM approuvés à envoyer
    const approved = await step.run("find-approved-dms", async () => {
      return prisma.socialInteraction.findMany({
        where: { dmApprovalStatus: "APPROVED" },
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
        take: 20, // Batch de 20 max
        orderBy: { updatedAt: "asc" }, // FIFO
      });
    });

    if (approved.length === 0) {
      return { sent: 0, failed: 0, manual: 0 };
    }

    let sent = 0;
    let failed = 0;
    let manual = 0;

    for (let i = 0; i < approved.length; i++) {
      const interaction = approved[i];

      // Rate limiting : 20 secondes entre chaque envoi (~180/heure)
      if (i > 0) {
        await step.sleep(`rate-limit-${i}`, "20s");
      }

      await step.run(`send-dm-${interaction.id}`, async () => {
        const metaAccount = interaction.workspace.metaSocialAccounts?.[0];

        if (!metaAccount) {
          await prisma.socialInteraction.update({
            where: { id: interaction.id },
            data: {
              dmApprovalStatus: "MANUAL",
              sentVia: "MANUAL",
              errorMessage: "Aucun compte Meta connecté",
            },
          });
          manual++;
          return;
        }

        // Récupérer le texte du DM à envoyer
        const dmText = getDMText(interaction);
        if (!dmText) {
          await prisma.socialInteraction.update({
            where: { id: interaction.id },
            data: {
              dmApprovalStatus: "FAILED",
              errorMessage: "Aucun texte de DM disponible",
            },
          });
          failed++;
          return;
        }

        try {
          const pageToken = await refreshTokenIfNeeded(metaAccount.id);

          // STRATÉGIE 1 : Commentaire → Private Reply
          if (interaction.type === "COMMENT" && interaction.metaCommentId) {
            const result = await sendPrivateReply(
              interaction.metaCommentId,
              dmText,
              pageToken
            );

            if (result.success) {
              await markAsSent(interaction.id, "PRIVATE_REPLY");
              sent++;
            } else if (result.requiresManual) {
              await markAsManual(interaction.id, result.error || "Private Reply impossible");
              manual++;
            } else {
              await markAsFailed(interaction.id, result.error || "Erreur d'envoi");
              failed++;
            }
            return;
          }

          // STRATÉGIE 2 : Like/Follow avec metaUserId → vérifier conversation
          if (interaction.metaUserId) {
            const igAccountId =
              interaction.platform === "INSTAGRAM"
                ? metaAccount.instagramAccountId
                : metaAccount.facebookPageId;

            if (!igAccountId) {
              await markAsManual(interaction.id, "Compte IG non lié");
              manual++;
              return;
            }

            // Vérifier s'il y a une conversation ouverte
            const hasConvo = await hasOpenConversation(
              igAccountId,
              interaction.metaUserId,
              pageToken
            );

            if (hasConvo) {
              const sendFn =
                interaction.platform === "INSTAGRAM"
                  ? sendInstagramMessage
                  : sendFacebookMessage;

              const result = await sendFn(
                igAccountId,
                interaction.metaUserId,
                dmText,
                pageToken,
                "human_agent" // Étend la fenêtre à 7 jours
              );

              if (result.success) {
                await markAsSent(interaction.id, "SEND_API");
                sent++;
              } else if (result.requiresManual) {
                await markAsManual(interaction.id, result.error || "Envoi impossible via API");
                manual++;
              } else {
                await markAsFailed(interaction.id, result.error || "Erreur d'envoi");
                failed++;
              }
            } else {
              // Pas de conversation ouverte → mode manuel
              await markAsManual(
                interaction.id,
                "Pas de conversation ouverte. L'utilisateur n'a pas encore envoyé de message à votre page."
              );
              manual++;
            }
            return;
          }

          // STRATÉGIE 3 : Pas de metaUserId → mode manuel obligatoire
          await markAsManual(interaction.id, "Identifiant Meta manquant");
          manual++;
        } catch (error) {
          console.error(`Error sending DM for ${interaction.id}:`, error);
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

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getDMText(interaction: {
  customDmText: string | null;
  suggestedDMs: unknown;
  selectedDmIndex: number | null;
}): string | null {
  // Priorité au texte personnalisé
  if (interaction.customDmText) return interaction.customDmText;

  // Sinon, utiliser la variante sélectionnée
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
    data: {
      dmApprovalStatus: "FAILED",
      errorMessage,
    },
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
