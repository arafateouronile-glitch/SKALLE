import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { runFullSync } from "@/lib/crm/hubspot-sync";

/**
 * Bidirectional HubSpot sync — runs every 30 minutes.
 * For each workspace with a HubSpot integration:
 *   - Push new/stale prospects to HubSpot contacts
 *   - Pull recently modified HubSpot contacts back as prospects
 */
export const hubspotSyncFunction = inngest.createFunction(
  {
    id: "hubspot-sync",
    name: "HubSpot Bidirectional Sync",
    concurrency: { limit: 2 },
  },
  [
    { cron: "*/30 * * * *" },
    { event: "crm/hubspot.sync" },
  ],
  async ({ event, step }) => {
    const targetWorkspaceId = (event as { data?: { workspaceId?: string } })?.data?.workspaceId;

    const workspaces = await step.run("load-hubspot-workspaces", async () => {
      return prisma.externalIntegration.findMany({
        where: {
          provider: "hubspot",
          ...(targetWorkspaceId ? { workspaceId: targetWorkspaceId } : {}),
        },
        select: { workspaceId: true },
      });
    });

    if (workspaces.length === 0) {
      return { synced: 0 };
    }

    const results = [];

    for (const { workspaceId } of workspaces) {
      const result = await step.run(`sync-${workspaceId}`, async () => {
        try {
          return await runFullSync(workspaceId);
        } catch (err) {
          return { error: String(err) };
        }
      });
      results.push({ workspaceId, ...result });
    }

    return { synced: workspaces.length, results };
  }
);
