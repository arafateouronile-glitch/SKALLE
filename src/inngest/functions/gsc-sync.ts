/**
 * 🔍 GSC Sync — Synchronisation Google Search Console (CRON quotidien 6h)
 *
 * Avant le cycle quotidien du Brain (7h), synchronise les données GSC
 * pour tous les workspaces connectés → met à jour le cache topPages/topKeywords.
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { syncGSCData } from "@/lib/services/integrations/google-search-console";

export const syncGscDataDaily = inngest.createFunction(
  {
    id: "gsc-sync-daily",
    name: "Sync Google Search Console Data",
    concurrency: { limit: 3 },
    retries: 2,
  },
  { cron: "0 6 * * *" }, // 6h du matin (avant le Brain daily à 7h)
  async ({ step }) => {
    // Trouver tous les workspaces GSC connectés
    const gscConfigs = await step.run("load-gsc-configs", async () => {
      return prisma.googleSearchConsoleConfig.findMany({
        where: { isConnected: true },
        select: { workspaceId: true },
      });
    });

    if (gscConfigs.length === 0) {
      return { synced: 0 };
    }

    let synced = 0;

    for (const config of gscConfigs) {
      const success = await step.run(`sync-gsc-${config.workspaceId}`, async () => {
        try {
          await syncGSCData(config.workspaceId);
          return true;
        } catch (err) {
          console.error(`[GSC Sync] Failed for workspace ${config.workspaceId}:`, err);
          return false;
        }
      });

      if (success) synced++;
    }

    return { synced, total: gscConfigs.length };
  }
);
