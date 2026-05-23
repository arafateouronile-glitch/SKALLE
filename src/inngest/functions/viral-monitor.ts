/**
 * Viral Monitor Cron — scrape 2x/jour les posts viraux LinkedIn & Twitter
 * Cible les niches de chaque workspace actif
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { scrapeViralPosts } from "@/lib/services/social/viral-monitor";

const DEFAULT_QUERIES = [
  "growth hacking",
  "entrepreneuriat",
  "marketing digital",
  "startup",
  "personal branding",
  "productivité",
  "SaaS",
  "leadership",
];

export const scrapeViralPostsCron = inngest.createFunction(
  {
    id: "viral-monitor-scrape",
    name: "Viral Monitor — Scrape Posts Viraux",
    concurrency: { limit: 1 },
    retries: 1,
  },
  { cron: "0 7,19 * * *" }, // 7h et 19h
  async ({ step }) => {
    // Récupérer les niches de tous les workspaces actifs
    const workspaces = await step.run("load-workspace-niches", async () => {
      return prisma.workspace.findMany({
        select: {
          id: true,
          brandVoice: true,
        },
        take: 50,
      });
    });

    // Construire les queries à partir des niches des workspaces
    const nicheQueries = new Set<string>(DEFAULT_QUERIES);
    for (const ws of workspaces) {
      const bv = ws.brandVoice as Record<string, unknown> | null;
      if (bv?.niche && typeof bv.niche === "string") nicheQueries.add(bv.niche);
      if (Array.isArray(bv?.contentPillars)) {
        (bv.contentPillars as string[]).slice(0, 3).forEach((p) => nicheQueries.add(p));
      }
    }

    const queries = Array.from(nicheQueries).slice(0, 15);

    const result = await step.run("scrape-viral-posts", async () => {
      return scrapeViralPosts({ queries, maxPostsPerPlatform: 60 });
    });

    // Purger les posts > 90 jours avec score < 50 (garder la DB propre)
    const cleaned = await step.run("cleanup-old-posts", async () => {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const { count } = await prisma.viralPost.deleteMany({
        where: {
          scrapedAt: { lt: cutoff },
          viralScore: { lt: 50 },
          isBookmarked: false,
        },
      });
      return count;
    });

    return {
      saved: result.saved,
      errors: result.errors,
      cleaned,
      queries,
    };
  }
);

/** Déclenchement manuel depuis l'UI */
export const scrapeViralPostsManual = inngest.createFunction(
  {
    id: "viral-monitor-manual",
    name: "Viral Monitor — Scrape Manuel",
    concurrency: { limit: 1 },
    retries: 0,
  },
  { event: "viral-monitor/scrape.manual" },
  async ({ event, step }) => {
    const { queries = DEFAULT_QUERIES, workspaceId } = event.data as {
      queries?: string[];
      workspaceId?: string;
    };

    const result = await step.run("scrape", async () => {
      return scrapeViralPosts({ queries, maxPostsPerPlatform: 30, workspaceId });
    });

    return result;
  }
);
