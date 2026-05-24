/**
 * LinkedIn Outreach Daily Cron — traite la queue d'actions LinkedIn PENDING.
 *
 * Tourne chaque jour à 10h pour tous les workspaces avec
 * LinkedInAutomationConfig.isActive = true.
 *
 * Pour chaque workspace :
 *   1. Récupère les SequenceStep PENDING de channel LINKEDIN dans l'ordre
 *   2. Respecte dailyConnectLimit / dailyMessageLimit
 *   3. Envoie via processBatch (Apify actors)
 *   4. Marque chaque step SENT ou FAILED
 *   5. Met à jour lastRunAt + lastRunStats
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { processBatch, type LinkedInAction } from "@/lib/services/prospects/linkedin-sender";

export const linkedInOutreachDaily = inngest.createFunction(
  {
    id: "linkedin-outreach-daily",
    name: "LinkedIn Outreach — Envoi quotidien autonome",
    concurrency: { limit: 3 },
    retries: 0, // pas de retry — éviter les doubles envois
  },
  { cron: "0 10 * * 1-5" }, // lun–ven à 10h (pas le weekend)
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
        },
      });
    });

    logger.info(`LinkedIn outreach — ${configs.length} workspaces actifs`);

    const summary: Array<{ workspaceId: string; sent: number; failed: number; skipped: number }> = [];

    for (const cfg of configs) {
      const stats = await step.run(`process-workspace-${cfg.workspaceId}`, async () => {
        // Récupère les steps PENDING LinkedIn pour ce workspace
        const pendingSteps = await prisma.sequenceStep.findMany({
          where: {
            status: "PENDING",
            channel: "LINKEDIN",
            sequence: { workspaceId: cfg.workspaceId },
          },
          include: {
            sequence: {
              include: {
                prospect: {
                  select: { linkedInUrl: true, name: true },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: Math.max(cfg.dailyConnectLimit, cfg.dailyMessageLimit),
        });

        if (!pendingSteps.length) return { sent: 0, failed: 0, skipped: 0 };

        // Sépare connexions vs messages et applique les limites
        const connectSteps = pendingSteps
          .filter((s) => s.linkedInAction === "connect")
          .slice(0, cfg.dailyConnectLimit);
        const messageSteps = pendingSteps
          .filter((s) => s.linkedInAction === "message" || s.linkedInAction === "inmail")
          .slice(0, cfg.dailyMessageLimit);

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

        // Envoie le batch
        const results = await processBatch(
          batch.map(({ stepId: _id, ...action }) => action),
          cfg.liAt,
          { connectActor: cfg.connectActor, messageActor: cfg.messageActor }
        );

        // Met à jour le statut de chaque step
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
          } else {
            await prisma.sequenceStep.update({
              where: { id: stepId },
              data: { status: "FAILED", error: r.error?.slice(0, 255) },
            });
            failed++;
          }
        }

        return { sent, failed, skipped };
      });

      // Persiste les stats
      await step.run(`update-stats-${cfg.workspaceId}`, async () => {
        await prisma.linkedInAutomationConfig.update({
          where: { id: cfg.id },
          data: {
            lastRunAt: new Date(),
            lastRunStats: stats,
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

// Event déclenché manuellement depuis le dashboard
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
        take: Math.max(cfg.dailyConnectLimit, cfg.dailyMessageLimit),
      });

      if (!pendingSteps.length) return { sent: 0, failed: 0, message: "Queue vide" };

      const connectSteps = pendingSteps.filter((s) => s.linkedInAction === "connect").slice(0, cfg.dailyConnectLimit);
      const messageSteps = pendingSteps.filter((s) => s.linkedInAction !== "connect").slice(0, cfg.dailyMessageLimit);
      const batch: Array<{ stepId: string; profileUrl: string; message: string; type: "connect" | "message" }> = [
        ...connectSteps.map((s) => ({ stepId: s.id, profileUrl: s.sequence.prospect.linkedInUrl, message: s.content, type: "connect" as const })),
        ...messageSteps.map((s) => ({ stepId: s.id, profileUrl: s.sequence.prospect.linkedInUrl, message: s.content, type: "message" as const })),
      ];

      const results = await processBatch(
        batch.map(({ stepId: _id, ...a }) => a),
        cfg.liAt,
        { connectActor: cfg.connectActor, messageActor: cfg.messageActor }
      );

      let sent = 0; let failed = 0;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const stepId = batch[i].stepId;
        if (r.success) {
          await prisma.sequenceStep.update({ where: { id: stepId }, data: { status: "SENT", sentAt: new Date() } });
          sent++;
        } else {
          await prisma.sequenceStep.update({ where: { id: stepId }, data: { status: "FAILED", error: r.error?.slice(0, 255) } });
          failed++;
        }
      }

      await prisma.linkedInAutomationConfig.update({
        where: { workspaceId },
        data: { lastRunAt: new Date(), lastRunStats: { sent, failed } },
      });

      return { sent, failed };
    });
  }
);
