/**
 * 🚀 Campaign Lifecycle — logique métier sans dépendance à une session HTTP
 *
 * Extrait de `src/actions/campaigns.ts` (`personalizeCampaign`/`launchCampaign`,
 * tous deux protégés par `requireAuth()`, donc inappelables depuis une fonction
 * Inngest qui tourne sans session) pour être réutilisé par
 * `personalize-and-launch-campaign.ts` (déclenché automatiquement depuis
 * `CampaignWizard`, sans navigation vers une autre page). Les server actions du
 * même nom dans `campaigns.ts` restent les points d'entrée côté UI (avec leur
 * `requireAuth()`) et délèguent à ces fonctions "Core".
 */

import { prisma } from "@/lib/prisma";
import { personalizeEmail } from "@/lib/email/personalize-email";
import { type StepTemplate } from "@/lib/email/template-personalization";
import { useCredits } from "@/lib/credits";

const PERSONALIZE_BATCH_CONCURRENCY = 3;

interface PersonalizeTask {
  stepId: string;
  prospect: {
    id: string;
    name: string;
    email: string | null;
    company: string;
    jobTitle: string | null;
    industry: string | null;
    location: string | null;
    linkedInUrl: string | null;
  };
  template: StepTemplate;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function personalizeCampaignCore(
  campaignId: string
): Promise<{ success: boolean; personalized?: number; error?: string }> {
  try {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      include: {
        sequences: {
          include: {
            prospect: true,
            steps: { orderBy: { stepNumber: "asc" } },
          },
        },
      },
    });

    if (!campaign) {
      return { success: false, error: "Campagne non trouvée" };
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: campaign.workspaceId },
      select: { userId: true },
    });

    // Récupérer la config SMTP : campagne-spécifique ou default du workspace
    const smtpConfig = campaign.smtpConfigId
      ? await prisma.smtpConfig.findUnique({ where: { id: campaign.smtpConfigId } })
      : await prisma.smtpConfig.findFirst({
          where: { workspaceId: campaign.workspaceId, isDefault: true },
        });

    const sender = {
      name: smtpConfig?.fromName || "Équipe",
      email: smtpConfig?.fromEmail || "",
      company: "Skalle",
    };

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "PERSONALIZING" },
    });

    const stepTemplates = campaign.stepTemplates as unknown as StepTemplate[];
    const mode = campaign.personalizationMode as "ai" | "template";

    const tasks: PersonalizeTask[] = [];
    for (const sequence of campaign.sequences) {
      for (const step of sequence.steps) {
        const template = stepTemplates.find((t) => t.stepNumber === step.stepNumber);
        if (template) tasks.push({ stepId: step.id, prospect: sequence.prospect, template });
      }
    }

    let personalized = 0;
    let creditsExhausted = false;

    // Par lots (au lieu d'un par un séquentiellement) — une campagne de 50+
    // prospects × 2-3 steps dépasserait sinon largement le temps d'exécution
    // raisonnable d'un step Inngest.
    for (const batch of chunk(tasks, PERSONALIZE_BATCH_CONCURRENCY)) {
      if (creditsExhausted) break;

      await Promise.allSettled(
        batch.map(async (task) => {
          // Le mode "template" (mail-merge) est gratuit — seule la
          // personnalisation IA profonde (recherche LinkedIn/actu par
          // prospect) consomme un crédit, avant l'appel pour ne pas facturer
          // une tentative qu'on sait ne pas pouvoir faire.
          if (mode === "ai" && workspace?.userId) {
            const creditResult = await useCredits(workspace.userId, "campaign_ai_personalization");
            if (!creditResult.success) {
              creditsExhausted = true;
              return;
            }
          }

          try {
            const result = await personalizeEmail({ prospect: task.prospect, stepTemplate: task.template, mode, sender });
            await prisma.sequenceStep.update({
              where: { id: task.stepId },
              data: {
                subject: result.subject,
                content: result.content,
                metadata: {
                  personalizationScore: result.personalizationScore,
                  personalizationMode: result.mode,
                  personalizedAt: new Date().toISOString(),
                },
              },
            });
            personalized++;
          } catch (err) {
            console.error(`[PersonalizeCampaign] Erreur step ${task.stepId}:`, err);
          }
        })
      );
    }

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "READY" },
    });

    return { success: true, personalized };
  } catch (error) {
    console.error("Personalize campaign error:", error);
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    }).catch(() => {});
    return { success: false, error: String(error) };
  }
}

export async function launchCampaignCore(
  campaignId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return { success: false, error: "Campagne non trouvée" };
    }

    if (campaign.status !== "READY" && campaign.status !== "PAUSED") {
      return { success: false, error: `Campagne en statut ${campaign.status}, ne peut pas être lancée` };
    }

    // Vérifier SMTP : campagne-spécifique ou default du workspace
    const smtp = campaign.smtpConfigId
      ? await prisma.smtpConfig.findUnique({ where: { id: campaign.smtpConfigId } })
      : await prisma.smtpConfig.findFirst({
          where: { workspaceId: campaign.workspaceId, isDefault: true },
        });

    const hasEmailFallback = !!(process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY);
    if ((!smtp || !smtp.isVerified) && !hasEmailFallback) {
      return { success: false, error: "Aucun provider email configuré. Configurez un SMTP ou ajoutez RESEND_API_KEY / SENDGRID_API_KEY." };
    }

    // Réinitialiser les steps 1 FAILED non envoyés (permet de relancer une campagne)
    await prisma.sequenceStep.updateMany({
      where: {
        sequence: { campaignId },
        stepNumber: 1,
        status: "FAILED",
        sentAt: null,
      },
      data: { status: "PENDING", error: null },
    });

    // Activer les séquences et passer en SENDING
    await prisma.outreachSequence.updateMany({
      where: { campaignId },
      data: { isActive: true },
    });

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: "SENDING" },
    });

    // Déclencher l'envoi via Inngest
    try {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "campaign/launch",
        data: { campaignId },
      });
    } catch (inngestError) {
      // Inngest indisponible → remettre en PAUSED pour permettre un retry
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: "PAUSED" },
      });
      await prisma.outreachSequence.updateMany({
        where: { campaignId },
        data: { isActive: false },
      });
      console.error("Inngest send error:", inngestError);
      return { success: false, error: "Serveur Inngest non disponible. Lancez `npm run dev:all`." };
    }

    return { success: true };
  } catch (error) {
    console.error("Launch campaign error:", error);
    return { success: false, error: String(error) };
  }
}
