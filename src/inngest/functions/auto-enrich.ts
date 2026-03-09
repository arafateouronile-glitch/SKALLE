/**
 * 🔍 Inngest Functions: Auto-Enrichissement des Prospects
 *
 * - Event-driven : enrichit un prospect à sa création
 * - CRON nightly (2h) : batch enrichissement des prospects existants sans email
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import { autoEnrichProspect, findUnenrichedProspects } from "@/lib/prospection/auto-enrichment";

// ═══════════════════════════════════════════════════════════════════════════
// 1. EVENT-DRIVEN — Enrichissement à la création d'un prospect
// ═══════════════════════════════════════════════════════════════════════════

export const autoEnrichOnCreate = inngest.createFunction(
  {
    id: "auto-enrich-on-create",
    name: "Auto Enrich Prospect on Create",
    retries: 2,
  },
  { event: "prospect/created" },
  async ({ event, step }) => {
    const { prospectId, workspaceId, userId } = event.data as {
      prospectId: string;
      workspaceId: string;
      userId: string;
    };

    // Vérifier les crédits (3 crédits par enrichissement)
    const creditResult = await step.run("check-credits", async () => {
      return useCredits(userId, "auto_enrichment");
    });

    if (!creditResult.success) {
      console.warn(`[AutoEnrich] Crédits insuffisants pour workspace ${workspaceId}`);
      return { success: false, reason: "Crédits insuffisants" };
    }

    const result = await step.run("enrich-prospect", async () => {
      const prospect = await prisma.prospect.findUnique({
        where: { id: prospectId },
        select: { id: true, name: true, company: true, jobTitle: true, email: true, workspaceId: true },
      });

      if (!prospect) return { enriched: false, reason: "Prospect non trouvé" };

      return autoEnrichProspect(prospect);
    });

    return result;
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. CRON NIGHTLY — Batch enrichissement des prospects existants
// ═══════════════════════════════════════════════════════════════════════════

export const autoEnrichBatchNightly = inngest.createFunction(
  {
    id: "auto-enrich-batch-nightly",
    name: "Auto Enrich Prospects - Nightly Batch",
    retries: 1,
  },
  { cron: "0 2 * * *" }, // 2h du matin
  async ({ step }) => {
    // Récupérer tous les workspaces avec autopilot actif
    const workspaces = await step.run("get-workspaces", async () => {
      const configs = await prisma.autopilotConfig.findMany({
        where: { isActive: true, prospectionEnabled: true },
        include: { workspace: { select: { id: true, userId: true } } },
      });
      return configs.map((c) => ({ workspaceId: c.workspace.id, userId: c.workspace.userId }));
    });

    let totalEnriched = 0;

    for (const ws of workspaces) {
      try {
        const enriched = await step.run(`enrich-batch-${ws.workspaceId}`, async () => {
          const unenriched = await findUnenrichedProspects(ws.workspaceId, 10);
          let count = 0;

          for (const prospect of unenriched) {
            const creditResult = await useCredits(ws.userId, "auto_enrichment");
            if (!creditResult.success) break; // Plus de crédits

            const result = await autoEnrichProspect(prospect);
            if (result.enriched) count++;
          }

          return count;
        });
        totalEnriched += enriched;
      } catch (error) {
        console.error(`[AutoEnrich Batch] Erreur workspace ${ws.workspaceId}:`, error);
      }
    }

    return { totalEnriched, workspacesProcessed: workspaces.length };
  }
);
