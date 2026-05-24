/**
 * LinkedIn Reply Checker — détecte les réponses LinkedIn toutes les 4h.
 *
 * Pour chaque workspace avec LinkedInAutomationConfig actif :
 *   1. Lit la boîte LinkedIn via l'API Voyager (cookie li_at)
 *   2. Mappe les participants sur les prospects connus (par linkedInUrl)
 *   3. Persiste les nouvelles réponses dans LinkedInReply
 *   4. Met à jour le statut prospect → RESPONDED si était CONTACTED
 *   5. Met à jour lastInteractionAt
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { fetchLinkedInReplies } from "@/lib/services/prospects/linkedin-inbox";

export const linkedInReplyChecker = inngest.createFunction(
  {
    id: "linkedin-reply-checker",
    name: "LinkedIn — Détection des réponses (toutes les 4h)",
    concurrency: { limit: 5 },
    retries: 1,
  },
  { cron: "0 */4 * * *" }, // toutes les 4h
  async ({ step, logger }) => {
    const configs = await step.run("load-configs", async () => {
      return prisma.linkedInAutomationConfig.findMany({
        where: { liAt: { not: "" } },
        select: { workspaceId: true, liAt: true, lastRunAt: true },
      });
    });

    logger.info(`LinkedIn reply check — ${configs.length} workspaces`);
    const summary: Array<{ workspaceId: string; newReplies: number }> = [];

    for (const cfg of configs) {
      const count = await step.run(`check-replies-${cfg.workspaceId}`, async () => {
        // On cherche les messages depuis le dernier run ou depuis 7 jours
        const sinceMs = cfg.lastRunAt
          ? new Date(cfg.lastRunAt).getTime()
          : Date.now() - 7 * 24 * 60 * 60 * 1_000;

        const replies = await fetchLinkedInReplies(cfg.liAt, sinceMs);
        if (!replies.length) return 0;

        logger.info(`Workspace ${cfg.workspaceId} — ${replies.length} conversations avec nouvelles réponses`);

        // Charge tous les prospects du workspace indexés par linkedInUrl (normalisé)
        const prospects = await prisma.prospect.findMany({
          where: { workspaceId: cfg.workspaceId },
          select: { id: true, linkedInUrl: true, status: true },
        });

        const prospectByUrl = new Map(
          prospects.map((p) => [normalizeUrl(p.linkedInUrl), p])
        );

        let newCount = 0;

        for (const reply of replies) {
          const prospect = prospectByUrl.get(normalizeUrl(reply.linkedInUrl));

          // Upsert reply (on écrase si la conversation existe déjà)
          await prisma.linkedInReply.upsert({
            where: {
              workspaceId_conversationUrn: {
                workspaceId: cfg.workspaceId,
                conversationUrn: reply.conversationUrn,
              },
            },
            create: {
              workspaceId: cfg.workspaceId,
              prospectId: prospect?.id,
              linkedInUrl: reply.linkedInUrl,
              senderName: reply.participantName,
              messageText: reply.messageText,
              conversationUrn: reply.conversationUrn,
              receivedAt: reply.receivedAt,
            },
            update: {
              messageText: reply.messageText,
              receivedAt: reply.receivedAt,
              prospectId: prospect?.id,
            },
          });
          newCount++;

          // Met à jour le prospect si on l'a reconnu
          if (prospect) {
            const updates: Record<string, unknown> = {
              lastInteractionAt: reply.receivedAt,
            };
            // CONTACTED → RESPONDED (ne rétrograde pas les statuts avancés)
            const advancedStatuses = new Set([
              "RESPONDED", "MEETING_BOOKED", "CONVERTED", "REJECTED", "UNSUBSCRIBED",
            ]);
            if (!advancedStatuses.has(prospect.status)) {
              updates.status = "RESPONDED";
            }
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: updates,
            });
          }
        }

        return newCount;
      });

      summary.push({ workspaceId: cfg.workspaceId, newReplies: count });
    }

    const total = summary.reduce((a, s) => a + s.newReplies, 0);
    logger.info(`LinkedIn reply check terminé — ${total} nouvelles réponses`);
    return { checked: configs.length, total, summary };
  }
);

// Déclenchement manuel depuis le dashboard
export const linkedInReplyCheckerManual = inngest.createFunction(
  { id: "linkedin-reply-checker-manual", name: "LinkedIn — Vérification manuelle des réponses", retries: 0 },
  { event: "linkedin/replies.check" },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };

    return step.run("check", async () => {
      const cfg = await prisma.linkedInAutomationConfig.findUnique({
        where: { workspaceId },
        select: { liAt: true, lastRunAt: true },
      });
      if (!cfg?.liAt) return { error: "Pas de cookie LinkedIn configuré" };

      const sinceMs = cfg.lastRunAt
        ? new Date(cfg.lastRunAt).getTime()
        : Date.now() - 7 * 24 * 60 * 60 * 1_000;

      const replies = await fetchLinkedInReplies(cfg.liAt, sinceMs);

      const prospects = await prisma.prospect.findMany({
        where: { workspaceId },
        select: { id: true, linkedInUrl: true, status: true },
      });
      const prospectByUrl = new Map(prospects.map((p) => [normalizeUrl(p.linkedInUrl), p]));

      let newCount = 0;
      for (const reply of replies) {
        const prospect = prospectByUrl.get(normalizeUrl(reply.linkedInUrl));
        await prisma.linkedInReply.upsert({
          where: { workspaceId_conversationUrn: { workspaceId, conversationUrn: reply.conversationUrn } },
          create: {
            workspaceId,
            prospectId: prospect?.id,
            linkedInUrl: reply.linkedInUrl,
            senderName: reply.participantName,
            messageText: reply.messageText,
            conversationUrn: reply.conversationUrn,
            receivedAt: reply.receivedAt,
          },
          update: { messageText: reply.messageText, receivedAt: reply.receivedAt, prospectId: prospect?.id },
        });
        if (prospect) {
          const advanced = new Set(["RESPONDED", "MEETING_BOOKED", "CONVERTED", "REJECTED", "UNSUBSCRIBED"]);
          await prisma.prospect.update({
            where: { id: prospect.id },
            data: {
              lastInteractionAt: reply.receivedAt,
              ...(!advanced.has(prospect.status) ? { status: "RESPONDED" } : {}),
            },
          });
        }
        newCount++;
      }
      return { newReplies: newCount };
    });
  }
);

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "").toLowerCase().replace(/^https?:\/\/(www\.)?/, "");
}
