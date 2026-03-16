import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  createSmtpTransporter,
  sendEmailViaSMTP,
  calculateSendDelay,
} from "@/lib/email/smtp-transport";
import { decryptIfNeeded } from "@/lib/encryption";
import {
  checkWarmupAllowance,
  incrementWarmupCounter,
} from "./warmup-scheduler";

function injectEmailExtras(html: string, stepId: string, prospectId: string): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const pixel = `<img src="${baseUrl}/api/track/open/${stepId}" width="1" height="1" alt="" style="display:none" />`;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateUnsubscribeToken } = require("../../lib/unsubscribe-token");
  const unsubToken = generateUnsubscribeToken(prospectId);
  const unsubUrl = `${baseUrl}/api/unsubscribe/${unsubToken}`;
  const unsubLink = `\n<div style="text-align:center;margin-top:24px;font-size:11px;color:#9ca3af;">` +
    `<a href="${unsubUrl}" style="color:#9ca3af;text-decoration:underline;">Se désinscrire</a></div>`;
  const extras = pixel + unsubLink;
  if (html.includes("</body>")) return html.replace("</body>", `${extras}</body>`);
  return html + extras;
}

/**
 * Campaign Sender - Worker Inngest
 *
 * Envoi de campagnes email en masse avec rate limiting :
 * - Envoi des premiers emails (step 1)
 * - Programmation des follow-ups (steps 2, 3)
 * - Skip auto si le prospect a repondu
 * - Mise a jour des stats campagne
 */

// Helper : resoudre la config SMTP pour une campagne
async function resolveSmtpConfig(campaign: { smtpConfigId: string | null; workspaceId: string }) {
  if (campaign.smtpConfigId) {
    return prisma.smtpConfig.findUnique({ where: { id: campaign.smtpConfigId } });
  }
  return prisma.smtpConfig.findFirst({
    where: { workspaceId: campaign.workspaceId, isDefault: true },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCH CAMPAIGN
// ═══════════════════════════════════════════════════════════════════════════

export const launchCampaignFn = inngest.createFunction(
  {
    id: "campaign-launch",
    name: "Launch Email Campaign",
    retries: 2,
    concurrency: { limit: 1, scope: "account", key: "event.data.workspaceId" },
  },
  { event: "campaign/launch" },
  async ({ event, step }) => {
    const { campaignId } = event.data;

    // Charger la campagne et ses sequences
    const campaign = await step.run("load-campaign", async () => {
      const c = await prisma.emailCampaign.findUnique({
        where: { id: campaignId },
        include: {
          sequences: {
            where: { isActive: true },
            include: {
              prospect: true,
              steps: {
                where: { stepNumber: 1, status: "PENDING" },
                orderBy: { stepNumber: "asc" },
              },
            },
          },
        },
      });

      if (!c || c.status !== "SENDING") {
        throw new Error("Campagne non trouvee ou pas en mode SENDING");
      }

      return c;
    });

    // Charger la config SMTP : campagne-specifique ou default du workspace
    const smtpConfig = await step.run("load-smtp", async () => {
      const config = await resolveSmtpConfig(campaign);
      if (!config || !config.isVerified) {
        throw new Error("SMTP non configure ou non verifie");
      }
      return config;
    });

    const delay = calculateSendDelay(smtpConfig.perMinuteLimit);
    let sent = 0;
    let failed = 0;

    // Vérifier la limite warm-up avant de commencer
    const warmup = await step.run("check-warmup", async () => {
      return checkWarmupAllowance(campaign.workspaceId);
    });

    if (warmup.warmupActive && !warmup.canSend) {
      // Limite journalière warm-up atteinte : pause automatique
      await step.run("pause-campaign-warmup", async () => {
        await prisma.emailCampaign.update({
          where: { id: campaignId },
          data: { status: "PAUSED" },
        });
      });
      return {
        campaignId,
        sent: 0,
        failed: 0,
        pausedByWarmup: true,
        message: "Limite journalière warm-up atteinte. La campagne reprendra demain.",
      };
    }

    const warmupRemainingSlots = warmup.remainingToday;

    // Envoyer les premiers emails un par un avec rate limiting
    for (const sequence of campaign.sequences) {
      // Respecter la limite warm-up restante
      if (warmup.warmupActive && warmupRemainingSlots !== null && sent >= warmupRemainingSlots) {
        break;
      }

      const firstStep = sequence.steps[0];
      if (!firstStep || !sequence.prospect.email) {
        failed++;
        continue;
      }

      // Rate limit : attendre entre chaque envoi
      if (sent > 0) {
        await step.sleep(`rate-limit-${sent}`, `${delay}ms`);
      }

      // Verifier que la campagne n'a pas ete mise en pause
      const stillActive = await step.run(`check-active-${sent}`, async () => {
        const c = await prisma.emailCampaign.findUnique({
          where: { id: campaignId },
          select: { status: true },
        });
        return c?.status === "SENDING";
      });

      if (!stillActive) {
        break;
      }

      // Envoyer l'email
      const sendResult = await step.run(
        `send-email-${sequence.prospect.id}`,
        async () => {
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
            to: sequence.prospect.email!,
            subject: firstStep.subject || "",
            html: injectEmailExtras(firstStep.content, firstStep.id, sequence.prospect.id),
          });

          transporter.close();

          // Stocker le Message-ID pour le tracking de replies
          await prisma.sequenceStep.update({
            where: { id: firstStep.id },
            data: {
              status: result.success ? "SENT" : "FAILED",
              sentAt: result.success ? new Date() : undefined,
              messageId: result.messageId || undefined,
              error: result.error || undefined,
            },
          });

          // Mettre a jour le statut du prospect
          if (result.success) {
            await prisma.prospect.update({
              where: { id: sequence.prospect.id },
              data: { status: "CONTACTED" },
            });
            // Incrémenter le compteur warm-up
            await incrementWarmupCounter(campaign.workspaceId);
          }

          return result;
        }
      );

      if (sendResult.success) {
        sent++;
      } else {
        failed++;
      }
    }

    // Mettre a jour les stats de la campagne
    await step.run("update-stats", async () => {
      const allSteps = await prisma.sequenceStep.findMany({
        where: {
          sequence: { campaignId },
          stepNumber: 1,
        },
        select: { status: true },
      });

      const totalSent = allSteps.filter((s) => s.status === "SENT").length;
      const totalFailed = allSteps.filter((s) => s.status === "FAILED").length;
      const allDone = allSteps.every(
        (s) => s.status === "SENT" || s.status === "FAILED"
      );

      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: {
          totalSent,
          totalFailed,
          status: allDone ? "COMPLETED" : "SENDING",
        },
      });
    });

    return { sent, failed, total: campaign.sequences.length };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE NEXT CAMPAIGN STEPS (Follow-ups) + Reply detection skip
// ═══════════════════════════════════════════════════════════════════════════

export const scheduleNextCampaignSteps = inngest.createFunction(
  {
    id: "campaign-schedule-next-steps",
    name: "Schedule Campaign Follow-up Steps",
    concurrency: { limit: 1, scope: "account", key: "\"campaign-schedule-next-steps\"" },
  },
  { cron: "*/30 * * * *" }, // Toutes les 30 minutes
  async ({ step }) => {
    // Trouver les steps de suivi dont le delai est ecoule
    const pendingFollowups = await step.run("find-followups", async () => {
      const now = new Date();

      const steps = await prisma.sequenceStep.findMany({
        where: {
          status: "PENDING",
          stepNumber: { gt: 1 },
          sequence: {
            isActive: true,
            campaign: {
              status: "SENDING",
            },
          },
        },
        include: {
          sequence: {
            include: {
              prospect: true,
              campaign: true,
              steps: { orderBy: { stepNumber: "asc" } },
            },
          },
        },
        take: 50,
      });

      // Filtrer : delai ecoule ET le prospect n'a pas repondu
      return steps.filter((s) => {
        const previousStep = s.sequence.steps.find(
          (ps) => ps.stepNumber === s.stepNumber - 1
        );
        if (!previousStep || previousStep.status !== "SENT" || !previousStep.sentAt) {
          return false;
        }

        // Si n'importe quel step de la sequence a recu une reponse, skip
        const hasReply = s.sequence.steps.some((ps) => ps.status === "REPLIED");
        if (hasReply) {
          return false; // Sera SKIPPED plus bas
        }

        const delayMs = s.delayDays * 24 * 60 * 60 * 1000;
        const readyAt = new Date(previousStep.sentAt.getTime() + delayMs);
        return now >= readyAt;
      });
    });

    // Skip les follow-ups dont le prospect a repondu
    const toSkip = await step.run("skip-replied", async () => {
      const stepsToSkip = await prisma.sequenceStep.findMany({
        where: {
          status: "PENDING",
          stepNumber: { gt: 1 },
          sequence: {
            isActive: true,
            steps: { some: { status: "REPLIED" } },
          },
        },
        select: { id: true },
      });

      if (stepsToSkip.length > 0) {
        await prisma.sequenceStep.updateMany({
          where: { id: { in: stepsToSkip.map((s) => s.id) } },
          data: { status: "SKIPPED" },
        });
      }

      return stepsToSkip.length;
    });

    if (pendingFollowups.length === 0) {
      return { sent: 0, skipped: toSkip };
    }

    let sent = 0;
    let failed = 0;

    // Envoyer chaque follow-up
    for (const followup of pendingFollowups) {
      // Resoudre la config SMTP pour la campagne du follow-up
      const smtpConfig = await step.run(
        `load-smtp-${followup.id}`,
        async () => {
          return resolveSmtpConfig({
            smtpConfigId: followup.sequence.campaign?.smtpConfigId || null,
            workspaceId: followup.sequence.workspaceId,
          });
        }
      );

      if (!smtpConfig || !smtpConfig.isVerified || !followup.sequence.prospect.email) {
        failed++;
        continue;
      }

      // Rate limit
      if (sent > 0) {
        const delay = calculateSendDelay(smtpConfig.perMinuteLimit);
        await step.sleep(`rate-limit-followup-${sent}`, `${delay}ms`);
      }

      const result = await step.run(`send-followup-${followup.id}`, async () => {
        const transporter = createSmtpTransporter({
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.secure,
          username: smtpConfig.username,
          password: decryptIfNeeded(smtpConfig.password),
        });

        const sendResult = await sendEmailViaSMTP(transporter, {
          from: smtpConfig.fromEmail,
          fromName: smtpConfig.fromName,
          to: followup.sequence.prospect.email!,
          subject: followup.subject || "",
          html: followup.content,
        });

        transporter.close();

        await prisma.sequenceStep.update({
          where: { id: followup.id },
          data: {
            status: sendResult.success ? "SENT" : "FAILED",
            sentAt: sendResult.success ? new Date() : undefined,
            messageId: sendResult.messageId || undefined,
            error: sendResult.error || undefined,
          },
        });

        return sendResult;
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }

    // Mettre a jour les stats des campagnes affectees
    const campaignIds = [
      ...new Set(pendingFollowups.map((f) => f.sequence.campaignId).filter(Boolean)),
    ];

    for (const cId of campaignIds) {
      await step.run(`update-stats-${cId}`, async () => {
        const allSteps = await prisma.sequenceStep.findMany({
          where: { sequence: { campaignId: cId! } },
          select: { status: true },
        });

        const totalSent = allSteps.filter((s) => s.status === "SENT").length;
        const totalFailed = allSteps.filter((s) => s.status === "FAILED").length;
        const totalReplied = allSteps.filter((s) => s.status === "REPLIED").length;
        const allDone = allSteps.every(
          (s) => s.status !== "PENDING"
        );

        await prisma.emailCampaign.update({
          where: { id: cId! },
          data: {
            totalSent,
            totalFailed,
            totalReplied,
            ...(allDone ? { status: "COMPLETED" } : {}),
          },
        });
      });
    }

    return { sent, failed, skipped: toSkip, total: pendingFollowups.length };
  }
);
