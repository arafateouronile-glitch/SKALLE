/**
 * 🚀 Inngest Function: Superscale Ad Agent
 *
 * Event: marketing/superscale.run
 * Payload: { workspaceId, userId, niche, campaignId, brandContext? }
 *
 * Orchestre le pipeline end-to-end en background :
 *   1. Research compétiteurs (Meta Ad Library)
 *   2. Copywriting 3 variantes (GPT-4o)
 *   3. Génération visuelle (Nano Banana)
 *   4. Resizing 3 formats (Bannerbear)
 *   5. Persistance + statut READY
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { runSuperscaleAdPipeline } from "@/lib/services/marketing/superscale-agent";

export const runSuperscaleAd = inngest.createFunction(
  {
    id: "superscale-ad-run",
    name: "Superscale Ad Agent — End-to-End Pipeline",
    retries: 1,
    timeouts: { finish: "10m" },
  },
  { event: "marketing/superscale.run" },
  async ({ event, step }) => {
    const { workspaceId, userId, niche, campaignId, brandContext } = event.data as {
      workspaceId: string;
      userId: string;
      niche: string;
      campaignId: string;
      brandContext?: string;
    };

    // Vérifier que la campagne existe toujours
    const campaign = await step.run("check-campaign", async () => {
      return prisma.adCampaign.findUnique({
        where: { id: campaignId },
        select: { id: true, status: true },
      });
    });

    if (!campaign) {
      console.error(`[Superscale] Campaign ${campaignId} not found`);
      return { success: false, error: "Campaign not found" };
    }

    try {
      // Lancer le pipeline complet
      const result = await step.run("run-pipeline", async () => {
        return runSuperscaleAdPipeline(campaignId, niche, workspaceId, brandContext);
      });

      return {
        success: true,
        campaignId,
        variantsGenerated: result.variants.length,
        adsAnalyzed: result.competitorInsights.adsAnalyzed,
        usedFallback: result.competitorInsights.usedFallback,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Superscale] Pipeline failed for campaign ${campaignId}:`, error);

      // Marquer la campagne comme échouée
      await step.run("mark-failed", async () => {
        await prisma.adCampaign.update({
          where: { id: campaignId },
          data: {
            status: "FAILED",
            errorMessage: errorMessage.slice(0, 500),
          },
        });
      });

      return { success: false, campaignId, error: errorMessage };
    }
  }
);
