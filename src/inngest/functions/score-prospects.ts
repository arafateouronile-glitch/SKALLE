/**
 * 🎯 Inngest Functions: Scoring Dynamique des Prospects
 *
 * - CRON toutes les 6h : re-score les prospects avec lastScoredAt > 6h ou null
 * - Event-driven : re-score immédiat quand un prospect a une nouvelle interaction
 *
 * Coût : 0 crédit (opération interne gratuite)
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { computeLeadScore, updateProspectScoring, prospectToScoringInput } from "@/lib/services/sales/lead-scoring";

// ═══════════════════════════════════════════════════════════════════════════
// 1. CRON — Re-scoring périodique (toutes les 6h)
// ═══════════════════════════════════════════════════════════════════════════

export const scoreProspectsPeriodic = inngest.createFunction(
  {
    id: "score-prospects-periodic",
    name: "Score Prospects - Periodic (6h)",
    retries: 1,
  },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    const sixHoursAgo = new Date();
    sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);

    // Récupérer tous les prospects à re-scorer
    const prospects = await step.run("get-stale-prospects", async () => {
      return prisma.prospect.findMany({
        where: {
          OR: [
            { lastScoredAt: null },
            { lastScoredAt: { lt: sixHoursAgo } },
          ],
        },
        select: {
          id: true,
          sentiment: true,
          notes: true,
          linkedInConnections: true,
          enrichmentData: true,
          platform: true,
          intentScore: true,
        },
        take: 500, // Limiter par batch
      });
    });

    let updated = 0;

    for (const prospect of prospects) {
      try {
        await step.run(`score-${prospect.id}`, async () => {
          const input = prospectToScoringInput(prospect);
          const result = computeLeadScore(input);
          await updateProspectScoring(prospect.id, result);
        });
        updated++;
      } catch (error) {
        console.error(`[ScoreProspects] Erreur prospect ${prospect.id}:`, error);
      }
    }

    return { updated, total: prospects.length };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. EVENT-DRIVEN — Re-score immédiat sur interaction
// ═══════════════════════════════════════════════════════════════════════════

export const rescoreProspectOnEvent = inngest.createFunction(
  {
    id: "rescore-prospect-on-event",
    name: "Rescore Prospect on Interaction",
    retries: 2,
  },
  { event: "prospect/rescore" },
  async ({ event, step }) => {
    const { prospectId } = event.data as { prospectId: string };

    const result = await step.run("rescore", async () => {
      const prospect = await prisma.prospect.findUnique({
        where: { id: prospectId },
        select: {
          id: true,
          sentiment: true,
          notes: true,
          linkedInConnections: true,
          enrichmentData: true,
          platform: true,
          intentScore: true,
        },
      });

      if (!prospect) return { success: false, reason: "Prospect non trouvé" };

      const input = prospectToScoringInput(prospect);
      const scoringResult = computeLeadScore(input);
      await updateProspectScoring(prospect.id, scoringResult);

      return { success: true, score: scoringResult.score, temperature: scoringResult.temperature };
    });

    return result;
  }
);
