import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  createSmtpTransporter,
  sendEmailViaSMTP,
} from "@/lib/email/smtp-transport";
import { decryptIfNeeded } from "@/lib/encryption";

function injectTrackingExtras(html: string, stepId: string, prospectId: string): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const pixel = `<img src="${baseUrl}/api/track/open/${stepId}" width="1" height="1" alt="" style="display:none" />`;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateUnsubscribeToken } = require("../../lib/unsubscribe-token");
  const unsubToken = generateUnsubscribeToken(prospectId);
  const unsubUrl = `${baseUrl}/api/unsubscribe/${unsubToken}`;
  const unsubLink = `\n<div style="text-align:center;margin-top:24px;font-size:11px;color:#9ca3af;"><a href="${unsubUrl}" style="color:#9ca3af;text-decoration:underline;">Se désinscrire</a></div>`;
  const extras = pixel + unsubLink;
  if (html.includes("</body>")) return html.replace("</body>", `${extras}</body>`);
  return html + extras;
}

async function sendEmailForStep(params: {
  to: string;
  subject: string;
  html: string;
  workspaceId: string;
  campaignId?: string | null;
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  // Résoudre SMTP : campagne → workspace default
  const smtpConfig = params.campaignId
    ? await prisma.smtpConfig.findFirst({
        where: { campaigns: { some: { id: params.campaignId } } },
      }) ?? await prisma.smtpConfig.findFirst({ where: { workspaceId: params.workspaceId, isDefault: true } })
    : await prisma.smtpConfig.findFirst({ where: { workspaceId: params.workspaceId, isDefault: true } });

  if (smtpConfig && smtpConfig.isVerified) {
    const transporter = createSmtpTransporter({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      username: smtpConfig.username,
      password: decryptIfNeeded(smtpConfig.password),
    });
    const result = await sendEmailViaSMTP(transporter, {
      from: smtpConfig.fromEmail,
      fromName: smtpConfig.fromName,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    transporter.close();
    return result;
  }

  // Fallback Resend
  if (process.env.RESEND_API_KEY) {
    const fromEmail = process.env.FROM_EMAIL || "Skalle <noreply@skalle.io>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: params.to, subject: params.subject, html: params.html }),
    });
    const data = await res.json();
    return res.ok ? { success: true, messageId: data.id } : { success: false, error: data.message || "Erreur Resend" };
  }

  return { success: false, error: "Aucun provider email configuré" };
}

/**
 * 🚀 Sequence Sender - Worker Inngest
 * 
 * Envoi automatique des séquences multi-canal selon délais:
 * - Planification des étapes selon délais
 * - Envoi LinkedIn, Email, Phone, SMS
 * - Tracking complet (sent, delivered, opened, replied)
 * - Retry automatique en cas d'échec
 */

interface SequenceStepEvent {
  data: {
    stepId: string;
    sequenceId: string;
    delayDays: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 SEND SEQUENCE STEP - Envoyer une étape de séquence
// ═══════════════════════════════════════════════════════════════════════════

export const sendSequenceStep = inngest.createFunction(
  {
    id: "send-sequence-step",
    name: "Send Sequence Step",
    retries: 3,
  },
  { event: "sequence/step.send" },
  async ({ event, step }) => {
    const { stepId, sequenceId, delayDays } = event.data;

    // Charger le step, la séquence et le prospect
    const context = await step.run("check-sequence", async () => {
      const seq = await prisma.outreachSequence.findUnique({
        where: { id: sequenceId },
        include: {
          prospect: true,
          steps: { where: { id: stepId } },
        },
      });

      if (!seq) throw new Error("Séquence non trouvée");
      if (!seq.isActive) throw new Error("Séquence mise en pause");

      const currentStep = seq.steps[0];
      if (!currentStep || currentStep.status !== "PENDING") {
        throw new Error("Étape déjà envoyée ou annulée");
      }

      return { seq, currentStep };
    });

    const currentStep = context.currentStep;
    const prospect = context.seq.prospect;

    // Envoyer selon le canal
    const result = await step.run(`send-step-${stepId}`, async () => {
      if (currentStep.channel !== "EMAIL" || !prospect.email) {
        // LinkedIn/Phone/SMS : envoi manuel, on laisse en PENDING
        return { success: true, manual: true };
      }

      // Marquer comme SENT avant l'envoi
      await prisma.sequenceStep.update({
        where: { id: stepId },
        data: { status: "SENT", sentAt: new Date() },
      });

      const html = injectTrackingExtras(currentStep.content, stepId, prospect.id);
      const sendResult = await sendEmailForStep({
        to: prospect.email,
        subject: currentStep.subject || "",
        html,
        workspaceId: context.seq.workspaceId,
        campaignId: context.seq.campaignId,
      });

      await prisma.sequenceStep.update({
        where: { id: stepId },
        data: {
          status: sendResult.success ? "DELIVERED" : "FAILED",
          deliveredAt: sendResult.success ? new Date() : undefined,
          messageId: sendResult.messageId || undefined,
          error: sendResult.error || undefined,
        },
      });

      return sendResult;
    });

    if (!result.success && !(result as any).manual) {
      throw new Error((result as any).error || "Erreur d'envoi");
    }

    // Si succès, planifier la prochaine étape
    await step.run("schedule-next-step", async () => {
      const nextStep = await prisma.sequenceStep.findFirst({
        where: {
          sequenceId: sequenceId,
          stepNumber: currentStep.stepNumber + 1,
          status: "PENDING",
        },
      });

      const seq = await prisma.outreachSequence.findUnique({
        where: { id: sequenceId },
      });

      if (nextStep && seq?.isActive) {
        // Planifier l'envoi de la prochaine étape selon le délai
        await inngest.send({
          name: "sequence/step.send",
          data: {
            stepId: nextStep.id,
            sequenceId: sequenceId,
            delayDays: nextStep.delayDays,
          },
          // Planifier dans X jours
          ts: Date.now() + nextStep.delayDays * 24 * 60 * 60 * 1000,
        });
      }
    });

    return { success: true, stepId };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// ▶️ START SEQUENCE - Démarrer une séquence et planifier la première étape
// ═══════════════════════════════════════════════════════════════════════════

interface StartSequenceEvent {
  data: {
    sequenceId: string;
  };
}

export const startSequence = inngest.createFunction(
  {
    id: "start-sequence",
    name: "Start Sequence",
  },
  { event: "sequence/start" },
  async ({ event, step }) => {
    const { sequenceId } = event.data;

    // Activer la séquence
    const sequence = await step.run("activate-sequence", async () => {
      const seq = await prisma.outreachSequence.findUnique({
        where: { id: sequenceId },
        include: {
          steps: {
            orderBy: { stepNumber: "asc" },
            where: { status: "PENDING" },
          },
        },
      });

      if (!seq) {
        throw new Error("Séquence non trouvée");
      }

      // Activer la séquence
      await prisma.outreachSequence.update({
        where: { id: sequenceId },
        data: { isActive: true },
      });

      return seq;
    });

    // Planifier l'envoi de la première étape
    const firstStep = sequence.steps[0];
    if (firstStep) {
      await step.run("schedule-first-step", async () => {
        // Si délai = 0, envoyer immédiatement
        if (firstStep.delayDays === 0) {
          await inngest.send({
            name: "sequence/step.send",
            data: {
              stepId: firstStep.id,
              sequenceId: sequenceId,
              delayDays: firstStep.delayDays,
            },
          });
        } else {
          // Sinon, planifier selon le délai
          await inngest.send({
            name: "sequence/step.send",
            data: {
              stepId: firstStep.id,
              sequenceId: sequenceId,
              delayDays: firstStep.delayDays,
            },
            ts: Date.now() + firstStep.delayDays * 24 * 60 * 60 * 1000,
          });
        }
      });
    }

    return { success: true, sequenceId };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TRACK EMAIL EVENTS - Suivre les événements email (opens, clicks, replies)
// ═══════════════════════════════════════════════════════════════════════════

interface EmailEvent {
  data: {
    stepId: string;
    eventType: "opened" | "clicked" | "replied" | "bounced" | "unsubscribed" | "spam_complaint";
    metadata?: Record<string, unknown>;
  };
}

export const trackEmailEvent = inngest.createFunction(
  {
    id: "track-email-event",
    name: "Track Email Event",
  },
  { event: "email/event" },
  async ({ event, step }) => {
    const { stepId, eventType, metadata } = event.data;

    await step.run(`track-${eventType}`, async () => {
      const updateData: any = {};

      switch (eventType) {
        case "opened":
          updateData.openedAt = new Date();
          updateData.status = "OPENED";
          if (metadata?.openedCount) {
            updateData.metadata = { openedCount: metadata.openedCount };
          }
          break;
        case "clicked":
          updateData.clickedAt = new Date();
          updateData.status = "OPENED";
          if (metadata?.clickedUrl) {
            updateData.metadata = { clickedUrl: metadata.clickedUrl };
          }
          break;
        case "replied":
          updateData.repliedAt = new Date();
          updateData.status = "REPLIED";
          break;
        case "bounced":
          updateData.status = "FAILED";
          updateData.error = "Email bounced";
          break;
        case "unsubscribed":
          updateData.status = "SKIPPED";
          break;
        case "spam_complaint":
          updateData.status = "FAILED";
          updateData.error = "Spam complaint";
          break;
      }

      await prisma.sequenceStep.update({
        where: { id: stepId },
        data: updateData,
      });

      // Pour bounce, unsubscribe et spam : mettre à jour le prospect et stopper la séquence
      if (eventType === "bounced" || eventType === "unsubscribed" || eventType === "spam_complaint") {
        const currentStep = await prisma.sequenceStep.findUnique({
          where: { id: stepId },
          include: { sequence: { include: { prospect: true } } },
        });

        if (currentStep) {
          const emailStatusMap = {
            bounced: "bounced",
            unsubscribed: "unsubscribed",
            spam_complaint: "spam_complaint",
          } as const;
          type StatusKey = keyof typeof emailStatusMap;

          // Mettre à jour l'emailStatus du prospect
          await prisma.prospect.update({
            where: { id: currentStep.sequence.prospectId },
            data: { emailStatus: emailStatusMap[eventType as StatusKey] },
          });

          // Annuler tous les steps PENDING restants de la séquence
          await prisma.sequenceStep.updateMany({
            where: {
              sequenceId: currentStep.sequenceId,
              stepNumber: { gt: currentStep.stepNumber },
              status: "PENDING",
            },
            data: { status: "SKIPPED" },
          });
        }
      }
    });

    // Sur reply : skip tous les steps suivants et mettre a jour le prospect
    if (eventType === "replied") {
      await step.run("skip-subsequent-steps", async () => {
        const currentStep = await prisma.sequenceStep.findUnique({
          where: { id: stepId },
          include: { sequence: { include: { prospect: true } } },
        });

        if (!currentStep) return;

        // Marquer tous les PENDING steps suivants comme SKIPPED
        await prisma.sequenceStep.updateMany({
          where: {
            sequenceId: currentStep.sequenceId,
            stepNumber: { gt: currentStep.stepNumber },
            status: "PENDING",
          },
          data: { status: "SKIPPED" },
        });

        // Mettre a jour le prospect en REPLIED
        await prisma.prospect.update({
          where: { id: currentStep.sequence.prospectId },
          data: { status: "REPLIED" },
        });

        // Mettre a jour les stats de la campagne si applicable
        if (currentStep.sequence.campaignId) {
          const repliedCount = await prisma.sequenceStep.count({
            where: {
              sequence: { campaignId: currentStep.sequence.campaignId },
              status: "REPLIED",
            },
          });
          await prisma.emailCampaign.update({
            where: { id: currentStep.sequence.campaignId },
            data: { totalReplied: repliedCount },
          });
        }
      });
    }

    return { success: true, stepId, eventType };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 RETRY FAILED STEPS - Réessayer les étapes échouées
// ═══════════════════════════════════════════════════════════════════════════

export const retryFailedSteps = inngest.createFunction(
  {
    id: "retry-failed-steps",
    name: "Retry Failed Steps",
  },
  { cron: "0 9 * * *" }, // Tous les jours à 9h
  async ({ step }) => {
    // Récupérer les étapes échouées dans les dernières 24h
    const failedSteps = await step.run("get-failed-steps", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      return await prisma.sequenceStep.findMany({
        where: {
          status: "FAILED",
          sentAt: {
            gte: yesterday,
          },
          sequence: {
            isActive: true,
          },
        },
        include: {
          sequence: true,
        },
        take: 100, // Limiter à 100 par run
      });
    });

    // Réessayer chaque étape
    const results = await step.run("retry-steps", async () => {
      const retryPromises = failedSteps.map(async (step) => {
        try {
          // Réinitialiser le statut
          await prisma.sequenceStep.update({
            where: { id: step.id },
            data: {
              status: "PENDING",
              error: null,
            },
          });

          // Réessayer l'envoi
          await inngest.send({
            name: "sequence/step.send",
            data: {
              stepId: step.id,
              sequenceId: step.sequenceId,
              delayDays: 0, // Réessayer immédiatement
            },
          });

          return { stepId: step.id, success: true };
        } catch (error) {
          return { stepId: step.id, success: false, error: String(error) };
        }
      });

      return Promise.all(retryPromises);
    });

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return {
      success: true,
      retried: results.length,
      successCount,
      failCount,
    };
  }
);
