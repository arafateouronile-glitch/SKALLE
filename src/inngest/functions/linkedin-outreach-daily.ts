/**
 * LinkedIn Outreach Daily Cron — traite la queue PENDING LinkedIn.
 *
 * Sécurité anti-ban :
 *   1. Cookie check : vérifie li_at avant tout envoi (abort si expiré)
 *   2. Warm-up : limites réduites les 21 premiers jours
 *   3. Batch splitté en 2 sessions avec 2h d'intervalle (≥4 actions)
 *   4. Proxy résidentiel Apify (opt-in APIFY_PROXY_ENABLED=true)
 *   5. Abort immédiat sur challenge / rate-limit → automation désactivée
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import {
  processBatch,
  getEffectiveLimits,
  checkLinkedInCookie,
  type LinkedInAction,
  type LinkedInAbortCode,
} from "@/lib/services/prospects/linkedin-sender";

const ABORT_LABELS: Record<string, string> = {
  RATE_LIMITED:   "LinkedIn rate-limit détecté — réessaie demain",
  CHALLENGE:      "LinkedIn challenge / CAPTCHA — reconnecte-toi manuellement",
  EXPIRED_COOKIE: "Cookie li_at expiré — colle un nouveau cookie",
  RESTRICTED:     "Compte LinkedIn restreint — contact LinkedIn support",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SessionStats = { sent: number; failed: number; aborted: boolean; abortCode?: LinkedInAbortCode };

async function runSessionAndUpdateSteps(
  batch: Array<LinkedInAction & { stepId: string }>,
  liAt: string,
  cfg: { connectActor: string; messageActor: string; proxyCountry: string }
): Promise<SessionStats> {
  const { results, aborted, abortCode } = await processBatch(
    batch.map(({ stepId: _id, ...action }) => action),
    liAt,
    cfg
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
    // abortCode présent → step reste PENDING
  }

  return { sent, failed, aborted, abortCode };
}

// ─── Cron daily ───────────────────────────────────────────────────────────────

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
          id: true, workspaceId: true, liAt: true,
          dailyConnectLimit: true, dailyMessageLimit: true,
          connectActor: true, messageActor: true,
          warmupDay: true, warmupStartedAt: true, proxyCountry: true,
        },
      });
    });

    logger.info(`LinkedIn outreach — ${configs.length} workspaces actifs`);

    const summary: Array<{ workspaceId: string; sent: number; failed: number; skipped: number; aborted: boolean }> = [];

    for (const cfg of configs) {
      // ── 1. Cookie check ────────────────────────────────────────────────────
      const cookieOk = await step.run(`check-cookie-${cfg.workspaceId}`, async () => {
        return checkLinkedInCookie(cfg.liAt);
      });

      if (!cookieOk.valid) {
        logger.warn(`Workspace ${cfg.workspaceId} — cookie expiré, automation désactivée`);
        await step.run(`abort-cookie-${cfg.workspaceId}`, async () => {
          await prisma.linkedInAutomationConfig.update({
            where: { id: cfg.id },
            data: {
              isActive: false,
              lastRunAt: new Date(),
              lastRunStats: { sent: 0, failed: 0, abortReason: ABORT_LABELS.EXPIRED_COOKIE },
            },
          });
        });
        summary.push({ workspaceId: cfg.workspaceId, sent: 0, failed: 0, skipped: 0, aborted: true });
        continue;
      }

      // ── 2. Prépare le batch ────────────────────────────────────────────────
      const prepared = await step.run(`prepare-batch-${cfg.workspaceId}`, async () => {
        const { effectiveConnect, effectiveMessage, warmupPct } = getEffectiveLimits(
          cfg.warmupDay, cfg.dailyConnectLimit, cfg.dailyMessageLimit
        );
        logger.info(
          `Workspace ${cfg.workspaceId} — warmupDay=${cfg.warmupDay} (${warmupPct}%) ` +
          `→ connect=${effectiveConnect}, message=${effectiveMessage}`
        );

        const pendingSteps = await prisma.sequenceStep.findMany({
          where: { status: "PENDING", channel: "LINKEDIN", sequence: { workspaceId: cfg.workspaceId } },
          include: { sequence: { include: { prospect: { select: { linkedInUrl: true, name: true } } } } },
          orderBy: { createdAt: "asc" },
          take: Math.max(effectiveConnect, effectiveMessage),
        });

        const connectSteps = pendingSteps.filter((s) => s.linkedInAction === "connect").slice(0, effectiveConnect);
        const messageSteps = pendingSteps
          .filter((s) => s.linkedInAction === "message" || s.linkedInAction === "inmail")
          .slice(0, effectiveMessage);

        const batch: Array<{ stepId: string; profileUrl: string; message: string; type: "connect" | "message" }> = [
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

        return { batch, skipped: pendingSteps.length - batch.length, warmupPct };
      });

      if (prepared.batch.length === 0) {
        summary.push({ workspaceId: cfg.workspaceId, sent: 0, failed: 0, skipped: 0, aborted: false });
        continue;
      }

      const sessionCfg = {
        connectActor: cfg.connectActor,
        messageActor: cfg.messageActor,
        proxyCountry: cfg.proxyCountry,
      };

      // ── 3. Split batch → 2 sessions espacées de 2h ────────────────────────
      const splitAt = prepared.batch.length >= 4 ? Math.ceil(prepared.batch.length / 2) : prepared.batch.length;
      const batch1 = prepared.batch.slice(0, splitAt);
      const batch2 = prepared.batch.slice(splitAt);

      const stats1 = await step.run(`session1-${cfg.workspaceId}`, async () => {
        return runSessionAndUpdateSteps(batch1, cfg.liAt, sessionCfg);
      });

      let totalSent   = stats1.sent;
      let totalFailed = stats1.failed;
      let finalAborted   = stats1.aborted;
      let finalAbortCode = stats1.abortCode;

      if (!stats1.aborted && batch2.length > 0) {
        await step.sleep(`gap-${cfg.workspaceId}`, "2h");

        const stats2 = await step.run(`session2-${cfg.workspaceId}`, async () => {
          return runSessionAndUpdateSteps(batch2, cfg.liAt, sessionCfg);
        });

        totalSent   += stats2.sent;
        totalFailed += stats2.failed;
        if (stats2.aborted) { finalAborted = true; finalAbortCode = stats2.abortCode; }
      }

      // ── 4. Persiste stats + warm-up ────────────────────────────────────────
      await step.run(`update-stats-${cfg.workspaceId}`, async () => {
        const abortReason = finalAborted && finalAbortCode
          ? (ABORT_LABELS[finalAbortCode] ?? finalAbortCode)
          : undefined;

        await prisma.linkedInAutomationConfig.update({
          where: { id: cfg.id },
          data: {
            lastRunAt: new Date(),
            lastRunStats: {
              sent: totalSent, failed: totalFailed,
              skipped: prepared.skipped, warmupPct: prepared.warmupPct,
              ...(abortReason ? { abortReason } : {}),
            },
            isActive: finalAborted ? false : true,
            warmupDay: Math.min(cfg.warmupDay + 1, 30),
            warmupStartedAt: cfg.warmupStartedAt ?? new Date(),
          },
        });
      });

      summary.push({
        workspaceId: cfg.workspaceId,
        sent: totalSent,
        failed: totalFailed,
        skipped: prepared.skipped,
        aborted: finalAborted,
      });
    }

    const totalSent = summary.reduce((a, s) => a + s.sent, 0);
    logger.info(`LinkedIn outreach terminé — ${totalSent} envoyés`);
    return { workspacesProcessed: configs.length, summary };
  }
);

// ─── Manuel ───────────────────────────────────────────────────────────────────

export const linkedInOutreachManual = inngest.createFunction(
  { id: "linkedin-outreach-manual", name: "LinkedIn Outreach — Envoi manuel", retries: 0 },
  { event: "linkedin/outreach.trigger" },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };

    return step.run("process", async () => {
      const cfg = await prisma.linkedInAutomationConfig.findUnique({ where: { workspaceId } });
      if (!cfg?.isActive || !cfg.liAt) return { error: "Automation non configurée" };

      // Cookie check
      const { valid } = await checkLinkedInCookie(cfg.liAt);
      if (!valid) {
        await prisma.linkedInAutomationConfig.update({
          where: { workspaceId },
          data: {
            isActive: false,
            lastRunAt: new Date(),
            lastRunStats: { sent: 0, failed: 0, abortReason: ABORT_LABELS.EXPIRED_COOKIE },
          },
        });
        return { error: ABORT_LABELS.EXPIRED_COOKIE };
      }

      const { effectiveConnect, effectiveMessage, warmupPct } = getEffectiveLimits(
        cfg.warmupDay, cfg.dailyConnectLimit, cfg.dailyMessageLimit
      );

      const pendingSteps = await prisma.sequenceStep.findMany({
        where: { status: "PENDING", channel: "LINKEDIN", sequence: { workspaceId } },
        include: { sequence: { include: { prospect: { select: { linkedInUrl: true } } } } },
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

      const { sent, failed, aborted, abortCode } = await runSessionAndUpdateSteps(batch, cfg.liAt, {
        connectActor: cfg.connectActor,
        messageActor: cfg.messageActor,
        proxyCountry: cfg.proxyCountry,
      });

      const abortReason = aborted && abortCode ? (ABORT_LABELS[abortCode] ?? abortCode) : undefined;

      await prisma.linkedInAutomationConfig.update({
        where: { workspaceId },
        data: {
          lastRunAt: new Date(),
          lastRunStats: { sent, failed, warmupPct, ...(abortReason ? { abortReason } : {}) },
          isActive: aborted ? false : cfg.isActive,
          warmupDay: Math.min(cfg.warmupDay + 1, 30),
          warmupStartedAt: cfg.warmupStartedAt ?? new Date(),
        },
      });

      return { sent, failed, warmupPct, aborted, abortCode };
    });
  }
);
