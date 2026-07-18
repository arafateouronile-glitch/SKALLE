/**
 * LinkedIn Engagement Poller
 *
 * Gap A — Extraction : toutes les 30 min, fetch les likes + commentaires
 *   des posts LinkedIn publiés dans les 14 derniers jours et les insère
 *   dans SocialInteraction.
 *
 * Gap B — Priorisation : sur l'événement "linkedin/dms.generated", tague le
 *   Prospect correspondant comme signal chaud (warmSignalType/At + score).
 *   Aucune séquence ni message n'est créé ici — le prospect est repris par
 *   le cycle quotidien du CSO Agent et proposé comme décision PENDING.
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  trackLinkedInPostEngagement,
  generatePersonalizedDM,
  captureWarmProspect,
} from "@/lib/services/social/prospector";
import { scrapeWarmLeadsServerSide } from "@/lib/services/social/linkedin-warm-scraper";

// ═══════════════════════════════════════════════════════════════════════════
// 1️⃣ POLLING — extraction likes + commentaires (cron 30 min)
// ═══════════════════════════════════════════════════════════════════════════

export const pollLinkedInEngagement = inngest.createFunction(
  {
    id: "linkedin-engagement-poller",
    name: "Poll LinkedIn Post Engagers",
    concurrency: { limit: 2 },
  },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    // Trouver tous les workspaces avec LinkedIn connecté
    const integrations = await step.run("find-linkedin-workspaces", async () => {
      return prisma.externalIntegration.findMany({
        where: { provider: "LINKEDIN_OAUTH" },
        select: { workspaceId: true },
      });
    });

    const workspaceIds = integrations.map((i) => i.workspaceId);
    if (workspaceIds.length === 0) return { processed: 0, newInteractions: 0 };

    let totalNew = 0;

    for (const workspaceId of workspaceIds) {
      const newCount = await step.run(`poll-workspace-${workspaceId}`, async () => {
        // Posts LinkedIn publiés dans les 14 derniers jours avec cmsPostId
        const posts = await prisma.post.findMany({
          where: {
            workspaceId,
            type: "LINKEDIN",
            status: "PUBLISHED",
            cmsPostId: { not: null },
            publishedAt: { gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) },
            deletedAt: null,
          },
          select: { id: true, cmsPostId: true, publishedAt: true },
          orderBy: { publishedAt: "desc" },
          take: 20,
        });

        let imported = 0;
        for (const post of posts) {
          if (!post.cmsPostId) continue;
          const sourceUrl = `https://www.linkedin.com/feed/update/${post.cmsPostId}/`;
          const result = await trackLinkedInPostEngagement(workspaceId, post.cmsPostId, sourceUrl);
          imported += result.imported;
        }
        return imported;
      });

      totalNew += newCount;

      // Auto-générer les DMs pour les nouvelles interactions PENDING sans DM
      if (newCount > 0) {
        await step.run(`auto-generate-dms-${workspaceId}`, async () => {
          const pending = await prisma.socialInteraction.findMany({
            where: {
              workspaceId,
              platform: "LINKEDIN",
              status: "PENDING",
              suggestedDMs: { equals: Prisma.DbNull },
            },
            select: { id: true },
            take: 20,
          });

          const ids: string[] = [];
          for (const interaction of pending) {
            try {
              await generatePersonalizedDM(interaction.id);
              ids.push(interaction.id);
            } catch {
              // DM génération non bloquante
            }
          }

          if (ids.length > 0) {
            await inngest.send({
              name: "linkedin/dms.generated",
              data: { workspaceId, interactionIds: ids },
            });
          }
        });
      }
    }

    return { processed: workspaceIds.length, newInteractions: totalNew };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 2️⃣ DÉCLENCHEMENT MANUEL — un seul post par URL (event)
// ═══════════════════════════════════════════════════════════════════════════

export const pollLinkedInEngagementManual = inngest.createFunction(
  {
    id: "linkedin-engagement-poller-manual",
    name: "Poll LinkedIn Engagers (Manual)",
  },
  { event: "linkedin/engagers.scan" },
  async ({ event, step }) => {
    const { workspaceId, shareUrn, sourceUrl } = event.data as {
      workspaceId: string;
      shareUrn: string;
      sourceUrl: string;
    };

    const result = await step.run("extract-engagers", async () => {
      return trackLinkedInPostEngagement(workspaceId, shareUrn, sourceUrl);
    });

    if (result.imported > 0) {
      await step.run("generate-dms", async () => {
        const pending = await prisma.socialInteraction.findMany({
          where: {
            workspaceId,
            platform: "LINKEDIN",
            status: "PENDING",
            suggestedDMs: { equals: Prisma.DbNull },
            sourceUrl,
          },
          select: { id: true },
        });

        const ids: string[] = [];
        for (const interaction of pending) {
          try {
            await generatePersonalizedDM(interaction.id);
            ids.push(interaction.id);
          } catch { /* non bloquant */ }
        }

        if (ids.length > 0) {
          await inngest.send({
            name: "linkedin/dms.generated",
            data: { workspaceId, interactionIds: ids },
          });
        }
      });
    }

    return result;
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 3️⃣ PRIORISATION WARM (Gap B) — event "linkedin/dms.generated"
// ═══════════════════════════════════════════════════════════════════════════

export const autoEnrollWarmLeads = inngest.createFunction(
  {
    id: "linkedin-warm-lead-enroller",
    name: "Tag LinkedIn Warm Leads for CSO Agent",
    concurrency: { limit: 5 },
  },
  { event: "linkedin/dms.generated" },
  async ({ event, step }) => {
    const { workspaceId, interactionIds } = event.data as {
      workspaceId: string;
      interactionIds: string[];
    };

    const tagged: string[] = [];

    for (const interactionId of interactionIds) {
      const result = await step.run(`capture-${interactionId}`, async () => {
        return captureWarmProspect(interactionId);
      });

      if (!result.skipped) {
        tagged.push(result.prospectId);
      }
    }

    return { workspaceId, tagged: tagged.length };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 4️⃣ SERVER-SIDE WARM LEADS — viewers + followers sans extension (cron 6h)
// ═══════════════════════════════════════════════════════════════════════════

export const serverSideWarmLeadsCron = inngest.createFunction(
  {
    id: "linkedin-server-side-warm-leads",
    name: "LinkedIn Warm Leads — Viewers + Followers (server-side)",
    concurrency: { limit: 3 },
  },
  { cron: "0 */6 * * *" }, // toutes les 6h
  async ({ step }) => {
    // Workspaces avec LinkedInAutomationConfig actif (li_at configuré)
    const configs = await step.run("find-configured-workspaces", async () => {
      return prisma.linkedInAutomationConfig.findMany({
        where: { isActive: true, liAt: { not: "" } },
        select: { workspaceId: true },
      });
    });

    if (!configs.length) return { processed: 0 };

    const results = [];
    for (const cfg of configs) {
      const result = await step.run(`warm-scrape-${cfg.workspaceId}`, async () => {
        return scrapeWarmLeadsServerSide(cfg.workspaceId);
      });
      results.push(result);
    }

    const totalImported = results.reduce(
      (acc, r) => acc + r.viewers.imported + r.followers.imported, 0
    );
    const totalEnrolled = results.reduce(
      (acc, r) => acc + r.viewers.enrolled + r.followers.enrolled, 0
    );

    return { processed: configs.length, totalImported, totalEnrolled };
  }
);

export const serverSideWarmLeadsManual = inngest.createFunction(
  {
    id: "linkedin-server-side-warm-leads-manual",
    name: "LinkedIn Warm Leads — Déclenchement manuel",
  },
  { event: "linkedin/warm-leads.scan" },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };
    return step.run("scrape", () => scrapeWarmLeadsServerSide(workspaceId));
  }
);
