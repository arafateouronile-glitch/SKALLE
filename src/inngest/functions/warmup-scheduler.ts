/**
 * 🔥 Email Warm-Up Scheduler
 *
 * Cron quotidien qui gère automatiquement le warm-up de toutes les boites mail.
 *
 * Responsabilités :
 * 1. Réinitialiser le compteur d'envois journaliers (currentDailySent → 0)
 * 2. Calculer et mettre à jour la progression warm-up (warmupProgress 0→100%)
 * 3. Auto-compléter le warm-up après 30 jours
 * 4. Mettre à jour la limite journalière effective selon le plan warm-up
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { getOptimalWarmupPlan } from "@/lib/prospection/deliverability-optimization";
import { dailyLimitForDay, WARMUP_DURATION } from "@/lib/email/warmup";

// Durée standard du warm-up : 30 jours
const WARMUP_DURATION_DAYS = 30;

export const warmupDailyScheduler = inngest.createFunction(
  {
    id: "warmup-daily-scheduler",
    name: "Email Warm-Up — Reset & Progression Quotidienne",
    concurrency: { limit: 1 },
  },
  { cron: "0 6 * * *" }, // Tous les jours à 6h UTC
  async ({ step }) => {
    // Récupérer tous les workspaces avec warm-up actif
    const configs = await step.run("load-warmup-configs", async () => {
      return prisma.emailDeliverabilityConfig.findMany({
        where: { warmupEnabled: true },
        select: {
          workspaceId: true,
          dailySendingLimit: true,
          warmupProgress: true,
          lastResetDate: true,
          currentDailySent: true,
        },
      });
    });

    let updated = 0;
    let completed = 0;

    for (const config of configs) {
      await step.run(`process-warmup-${config.workspaceId}`, async () => {
        const now = new Date();
        const lastReset = new Date(config.lastResetDate);
        const daysSinceStart = Math.floor(
          (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Warm-up terminé après WARMUP_DURATION_DAYS jours
        if (daysSinceStart >= WARMUP_DURATION_DAYS) {
          await prisma.emailDeliverabilityConfig.update({
            where: { workspaceId: config.workspaceId },
            data: {
              warmupEnabled: false,
              warmupProgress: 100,
              currentDailySent: 0,
            },
          });
          completed++;
          return;
        }

        // Calculer le plan warm-up optimal
        const plan = getOptimalWarmupPlan(config.dailySendingLimit, WARMUP_DURATION_DAYS);
        const todaySchedule = plan.dailySchedule.find((s) => s.day === daysSinceStart + 1);
        const targetToday = todaySchedule?.emails ?? config.dailySendingLimit;

        // Progression en pourcentage (basée sur les jours écoulés)
        const progress = Math.min(
          Math.round((daysSinceStart / WARMUP_DURATION_DAYS) * 100),
          99 // Max 99% tant que pas terminé
        );

        // Reset quotidien + mise à jour de la limite effective
        await prisma.emailDeliverabilityConfig.update({
          where: { workspaceId: config.workspaceId },
          data: {
            currentDailySent: 0,          // Reset le compteur
            warmupProgress: progress,
            dailySendingLimit: targetToday, // Limit effective du jour
          },
        });

        updated++;
      });
    }

    // ── Per-mailbox SmtpConfig warmup ────────────────────────────────────────
    const smtpConfigs = await step.run("load-smtp-warmup-configs", async () => {
      return prisma.smtpConfig.findMany({
        where: { warmupEnabled: true, warmupCompleted: false },
        select: {
          id: true,
          warmupDay: true,
          warmupTargetVol: true,
          warmupLastResetAt: true,
        },
      });
    });

    let smtpUpdated = 0;
    let smtpCompleted = 0;

    for (const sc of smtpConfigs) {
      await step.run(`process-smtp-warmup-${sc.id}`, async () => {
        const now = new Date();
        const lastReset = sc.warmupLastResetAt ? new Date(sc.warmupLastResetAt) : now;
        const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);

        // Only advance if at least 20 hours have passed (prevents double-counting)
        if (hoursSinceReset < 20) return;

        const nextDay = sc.warmupDay + 1;

        if (nextDay > WARMUP_DURATION) {
          await prisma.smtpConfig.update({
            where: { id: sc.id },
            data: {
              warmupEnabled: false,
              warmupCompleted: true,
              warmupSentToday: 0,
              warmupLastResetAt: now,
            },
          });
          smtpCompleted++;
        } else {
          await prisma.smtpConfig.update({
            where: { id: sc.id },
            data: {
              warmupDay: nextDay,
              warmupSentToday: 0,
              warmupLastResetAt: now,
            },
          });
          smtpUpdated++;
        }
      });
    }

    return {
      processed: configs.length,
      updated,
      completed,
      smtpProcessed: smtpConfigs.length,
      smtpUpdated,
      smtpCompleted,
      runAt: new Date().toISOString(),
    };
  }
);

/**
 * Vérifie si un workspace peut encore envoyer des emails aujourd'hui.
 * Retourne la limite restante (null = pas de warm-up actif = illimité par warm-up).
 */
export async function checkWarmupAllowance(workspaceId: string): Promise<{
  canSend: boolean;
  remainingToday: number | null;
  warmupActive: boolean;
}> {
  const config = await prisma.emailDeliverabilityConfig.findUnique({
    where: { workspaceId },
    select: {
      warmupEnabled: true,
      dailySendingLimit: true,
      currentDailySent: true,
    },
  });

  if (!config || !config.warmupEnabled) {
    return { canSend: true, remainingToday: null, warmupActive: false };
  }

  const remaining = config.dailySendingLimit - config.currentDailySent;
  return {
    canSend: remaining > 0,
    remainingToday: Math.max(0, remaining),
    warmupActive: true,
  };
}

/**
 * Incrémente le compteur d'envois journaliers pour un workspace.
 * À appeler après chaque email envoyé avec succès.
 */
export async function incrementWarmupCounter(workspaceId: string): Promise<void> {
  await prisma.emailDeliverabilityConfig.updateMany({
    where: { workspaceId, warmupEnabled: true },
    data: { currentDailySent: { increment: 1 } },
  });
}
