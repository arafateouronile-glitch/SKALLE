/**
 * Inngest — Sequence Optimizer
 *
 * Weekly cron: analyses all active workspaces and generates AI suggestions
 * for improving outreach sequences.
 *
 * Also triggered manually via event "sales/sequences.optimize"
 * with optional data.workspaceId to target a single workspace.
 */

import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { runSequenceOptimizer } from "@/lib/services/sales/sequence-optimizer";

export const sequenceOptimizerFunction = inngest.createFunction(
  {
    id: "sequence-optimizer",
    name: "AI Sequence Optimizer",
    concurrency: { limit: 3 },
  },
  [
    { cron: "0 8 * * 1" }, // Every Monday at 08:00 UTC
    { event: "sales/sequences.optimize" },
  ],
  async ({ event, step }) => {
    const targetWorkspaceId = (event as { data?: { workspaceId?: string } })?.data?.workspaceId;

    const workspaceIds = await step.run("load-workspaces", async () => {
      if (targetWorkspaceId) return [targetWorkspaceId];

      const workspaces = await prisma.workspace.findMany({
        where: { hasCsoAccess: true },
        select: { id: true },
      });
      return workspaces.map((w) => w.id);
    });

    const results: Array<{ workspaceId: string; analyzed: number; generated: number }> = [];

    for (const workspaceId of workspaceIds) {
      const result = await step.run(`optimize-${workspaceId}`, async () => {
        return runSequenceOptimizer(workspaceId);
      });
      results.push({ workspaceId, ...result });
    }

    const totalGenerated = results.reduce((sum, r) => sum + r.generated, 0);
    const totalAnalyzed = results.reduce((sum, r) => sum + r.analyzed, 0);

    return {
      workspacesProcessed: workspaceIds.length,
      totalAnalyzed,
      totalGenerated,
      results,
    };
  }
);
