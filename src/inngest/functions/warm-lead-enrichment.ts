/**
 * 🏢 Inngest Function: Batch nocturne d'enrichissement entreprise des warm leads (Goskalle)
 *
 * Scope volontairement restreint aux workspaces avec `hasGoskalleAccess` —
 * ce correctif sert uniquement le score composite Goskalle, pas l'autopilot
 * marketing général (contrairement à `autoEnrichBatchNightly`).
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { findWarmLeadsNeedingCompany, enrichWarmLeadCompany } from "@/lib/services/social/warm-lead-enrichment";

export const enrichWarmLeadsNightly = inngest.createFunction(
  {
    id: "enrich-warm-leads-nightly",
    name: "Enrich Warm Leads Company - Nightly Batch (Goskalle)",
    retries: 1,
  },
  { cron: "30 2 * * *" }, // juste après le batch d'auto-enrichissement existant à 2h
  async ({ step }) => {
    const workspaces = await step.run("get-workspaces", async () => {
      const rows = await prisma.workspace.findMany({
        where: { hasGoskalleAccess: true },
        select: { id: true, userId: true },
      });
      return rows.map((w) => ({ workspaceId: w.id, userId: w.userId }));
    });

    let totalEnriched = 0;

    for (const ws of workspaces) {
      try {
        const enriched = await step.run(`enrich-warm-leads-${ws.workspaceId}`, async () => {
          const leads = await findWarmLeadsNeedingCompany(ws.workspaceId, 10);
          let count = 0;

          for (const lead of leads) {
            const creditResult = await useCredits(ws.userId, "warm_lead_company_enrich");
            if (!creditResult.success) break; // Plus de crédits

            const result = await enrichWarmLeadCompany(lead.id);
            if (result.enriched) count++;
          }

          return count;
        });
        totalEnriched += enriched;
      } catch (error) {
        console.error(`[WarmLeadEnrich Batch] Erreur workspace ${ws.workspaceId}:`, error);
      }
    }

    return { totalEnriched, workspacesProcessed: workspaces.length };
  }
);
