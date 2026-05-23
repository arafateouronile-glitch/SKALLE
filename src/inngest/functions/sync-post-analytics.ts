import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { syncWorkspacePostInsights } from "@/lib/services/social/post-analytics-sync";

export const syncPostAnalyticsCron = inngest.createFunction(
  { id: "sync-post-analytics-cron", name: "Sync LinkedIn Post Analytics", retries: 1 },
  { cron: "0 8 * * *" }, // Chaque matin à 8h
  async ({ step, logger }) => {
    const workspaces = await step.run("get-workspaces", async () => {
      return prisma.workspace.findMany({
        where: {
          externalIntegrations: {
            some: { provider: "LINKEDIN_OAUTH" },
          },
        },
        select: { id: true },
      });
    });

    logger.info(`Syncing analytics for ${workspaces.length} workspaces`);

    let totalSynced = 0;
    for (const ws of workspaces) {
      const result = await step.run(`sync-${ws.id}`, async () =>
        syncWorkspacePostInsights(ws.id)
      );
      totalSynced += result.synced;
    }

    return { workspaces: workspaces.length, totalSynced };
  }
);

export const syncPostAnalyticsManual = inngest.createFunction(
  { id: "sync-post-analytics-manual", name: "Sync LinkedIn Analytics (Manual)", retries: 1 },
  { event: "social-analytics/sync.manual" },
  async ({ event, step }) => {
    const workspaceId = event.data?.workspaceId as string | undefined;
    if (!workspaceId) throw new Error("workspaceId requis");
    return step.run("sync", () => syncWorkspacePostInsights(workspaceId));
  }
);
