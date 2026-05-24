/**
 * LinkedIn Outreach Daily Cron — traite la queue d'actions LinkedIn PENDING.
 *
 * Sécurité anti-ban :
 *   1. Warm-up : limites réduites les 21 premiers jours (25 → 40 → 60 → 80 → 100 %)
 *   2. Abort : si LinkedIn renvoie challenge / rate-limit / cookie expiré,
 *              le batch s'arrête, les steps restants restent PENDING,
 *              l'automation est désactivée jusqu'à correction manuelle.
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  processBatch,
  getEffectiveLimits,
  type LinkedInAction,
} from "@/lib/services/prospects/linkedin-sender";

const ABORT_LABELS: Record<string, string> = {
  RATE_LIMITED: "LinkedIn rate-limit détecté — réessaie demain",
  CHALLENGE:    "LinkedIn challenge / CAPTCHA — reconnecte-toi manuellement",
  EXPIRED_COOKIE: "Cookie li_at expiré — colle un nouveau cookie",
  RESTRICTED:   "Compte LinkedIn restreint — contact LinkedIn support",
};

export const linkedInOutreachDaily = inngest.createFunction(
  {
    id: "linkedin-outreach-daily",
    name: "LinkedIn Outreach — Envoi quotidien autonome",
    concurrency: { limit: 3 },
    retries: 0,
  },
  { cron: "0 10 * * 1-5" },
  async ({ step, logger }) => {
    const configs = await step.run("load-active-configs", async () => {
      return prisma.linkedInAutomationConfig.findMany({
        where: { isActive: true },
        select: {
          id: true,
          workspaceId: true,
          liAt: true,
          dailyConnectLimit: true,
          dailyMessageLimit: true,
          connectActor: true,
          messageActor: true,
          warmupDay: true,
          warmupStartedAt: true,
        },
      });
    });

    logger.info(`LinkedIn outreach — ${configs.length} workspaces actifs`);

    const summary: Array<{
      workspaceId: string;
      sent: number;
      failed: number;
      skipped: number;
      aborted: boolean;
      warmupPct: number;
    }> = [];

    for (const cfg of configs) {
      const stats = await step.run(`process-workspace-${cfg.workspaceId}`, async () => {
        const { effectiveConnect, effectiveMessage, warmupPct } = getEffectiveLimits(
          cfg.warmupDay,
          cfg.dailyConnectLimit,
          cfg.dailyMessageLimit
        );

        logger.info(
          `Workspace ${cfg.workspaceId} — warmupDay=${cfg.warmupDay} (${warmupPct}%) ` +
          `→ connect=${effectiveConnect}, message=${effectiveMessage}`
        );

        const pendingSteps = await prisma.sequenceStep.findMany({
          where: {
            status: "PENDING",
            channel: "LINKEDIN",
            sequence: { workspaceId: cfg.workspaceId },
          },
          include: {
            sequence: {
              include: {
                prospect: { select: { linkedInUrl: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: Math.max(effectiveConnect, effectiveMessage),
        });

        if (!pendingSteps.length) return { sent: 0, failed: 0, skipped: 0, aborted: false, warmupPct };

        const connectSteps = pendingSteps
          .filter((s) => s.linkedInAction === "connect")
          .slice(0, effectiveConnect);
        const messageSteps = pendingSteps
          .filter((s) => s.linkedInAction === "message" || s.linkedInAction === "inmail")
          .slice(0, effectiveMessage);

        const batch: Array<LinkedInAction & { stepId: string }> = [
          ...connectSteps.map((s) => ({
            stepId: s.id,
            profileUrl: s.sequence.prospect.linkedInUrl,
            message: s.content,
            type: "connect" as const,
          })),
          ...messageSteps.map((s) => ({
            stepId: s.id,
            profileUrl: s.sequence.prospect.linkedInUrl,
            message: s.content,
            type: "message" as const,
          })),
        ];

        const skipped = pendingSteps.length - batch.length;

        const { results, aborted, abortCode } = await processBatch(
          batch.map(({ stepId: _id, ...action }) => action),
          cfg.liAt,
          { connectActor: cfg.connectActor, messageActor: cfg.messageActor }
        );

        let sent = 0;
        let failed = 0;

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const stepId = batch[i].stepId;
          if (r.success) {
            await prisma.sequenceStep.update({
              where: { id: stepId },
              data: { status: "SENT", sentAt: new Date() },
            });
            sent++;
          } else if (!r.abortCode) {
            // erreur non-critique : on marque FAILED
            await prisma.sequenceStep.update({
              where: { id: stepId },
              data: { status: "FAILED", error: r.error?.slice(0, 255) },
            });
            failed++;
          }
          // si abortCode présent : step reste PENDING
        }

        if (aborted && abortCode) {
          logger.warn(`Workspace ${cfg.workspaceId} — abort (${abortCode}), automation désactivée`);
          await prisma.linkedInAutomationConfig.update({
            where: { id: cfg.id },
            data: {
              isActive: false,
              lastRunAt: new Date(),
              lastRunStats: {
                sent, failed, skipped,
                abortReason: ABORT_LABELS[abortCode] ?? abortCode,
              },
            },
          });
          return { sent, failed, skipped, aborted: true, warmupPct };
        }

        return { sent, failed, skipped, aborted: false, warmupPct };
      });

      // Persiste stats + incrémente warmupDay
      await step.run(`update-stats-${cfg.workspaceId}`, async () => {
        const newWarmupDay = Math.min(cfg.warmupDay + 1, 30);
        await prisma.linkedInAutomationConfig.update({
          where: { id: cfg.id },
          data: {
            lastRunAt: new Date(),
            lastRunStats: {
              sent: stats.sent,
              failed: stats.failed,
              skipped: stats.skipped,
              warmupPct: stats.warmupPct,
            },
            warmupDay: newWarmupDay,
            warmupStartedAt: cfg.warmupStartedAt ?? new Date(),
          },
        });
      });

      summary.push({ workspaceId: cfg.workspaceId, ...stats });
    }

    const totalSent = summary.reduce((acc, s) => acc + s.sent, 0);
    logger.info(`LinkedIn outreach terminé — ${totalSent} messages envoyés`);
    return { workspacesProcessed: configs.length, summary };
  }
);

// ─── Manuel ───────────────────────────────────────────────────────────────────

export const linkedInOutreachManual = inngest.createFunction(
  {
    id: "linkedin-outreach-manual",
    name: "LinkedIn Outreach — Envoi manuel",
    retries: 0,
  },
  { event: "linkedin/outreach.trigger" },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };

    return step.run("process", async () => {
      const cfg = await prisma.linkedInAutomationConfig.findUnique({
        where: { workspaceId },
      });
      if (!cfg?.isActive || !cfg.liAt) return { error: "Automation non configurée" };

      const { effectiveConnect, effectiveMessage, warmupPct } = getEffectiveLimits(
        cfg.warmupDay,
        cfg.dailyConnectLimit,
        cfg.dailyMessageLimit
      );

      const pendingSteps = await prisma.sequenceStep.findMany({
        where: {
          status: "PENDING",
          channel: "LINKEDIN",
          sequence: { workspaceId },
        },
        include: {
          sequence: {
            include: { prospect: { select: { linkedInUrl: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
        take: Math.max(effectiveConnect, effectiveMessage),
      });

      if (!pendingSteps.length) return { sent: 0, failed: 0, message: "Queue vide", warmupPct };

      const connectSteps = pendingSteps.filter((s) => s.linkedInAction === "connect").slice(0, effectiveConnect);
      const messageSteps = pendingSteps.filter((s) => s.linkedInAction !== "connect").slice(0, effectiveMessage);
      const batch: Array<{ stepId: string; profileUrl: string; message: string; type: "connect" | "message" }> = [
        ...connectSteps.map((s) => ({ stepId: s.id, profileUrl: s.sequence.prospect.linkedInUrl, message: s.content, type: "connect" as const })),
        ...messageSteps.map((s) => ({ stepId: s.id, profileUrl: s.sequence.prospect.linkedInUrl, message: s.content, type: "message" as const })),
      ];

      const { results, aborted, abortCode } = await processBatch(
        batch.map(({ stepId: _id, ...a }) => a),
        cfg.liAt,
        { connectActor: cfg.connectActor, messageActor: cfg.messageActor }
      );

      let sent = 0;
      let failed = 0;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const stepId = batch[i].stepId;
        if (r.success) {
          await prisma.sequenceStep.update({ where: { id: stepId }, data: { status: "SENT", sentAt: new Date() } });
          sent++;
        } else if (!r.abortCode) {
          await prisma.sequenceStep.update({ where: { id: stepId }, data: { status: "FAILED", error: r.error?.slice(0, 255) } });
          failed++;
        }
      }

      const newWarmupDay = Math.min(cfg.warmupDay + 1, 30);
      await prisma.linkedInAutomationConfig.update({
        where: { workspaceId },
        data: {
          lastRunAt: new Date(),
          lastRunStats: {
            sent, failed,
            abortReason: aborted && abortCode ? (ABORT_LABELS[abortCode] ?? abortCode) : undefined,
            warmupPct,
          },
          isActive: aborted ? false : cfg.isActive,
          warmupDay: newWarmupDay,
          warmupStartedAt: cfg.warmupStartedAt ?? new Date(),
        },
      });

      return { sent, failed, warmupPct, aborted, abortCode };
    });
  }
);
