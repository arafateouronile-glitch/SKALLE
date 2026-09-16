/**
 * 🎯 Résolution nocturne des décideurs Signals Radar / Local Radar
 *
 * Ces deux radars ne produisent que des leads "entreprise" (pas de nom de
 * personne) — sans intervention, ils ne peuvent jamais entrer dans le cascade
 * générique d'enrichissement (`auto-enrichment.ts`, Serper → Dropcontact →
 * Apollo), qui a besoin d'un prénom + nom réels. Ce cron cherche un décideur
 * nommé (Serper, gratuit) et, en cas de succès, lève le placeholder email du
 * prospect pour le rendre éligible à cet enrichissement dès le prochain
 * passage (`prospect/created` est émis directement en cas de résolution).
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { useCredits } from "@/lib/credits";
import {
  findRadarProspectsNeedingDecisionMaker,
  resolveDecisionMaker,
} from "@/lib/services/prospects/decision-maker-resolver";

export const resolveRadarDecisionMakersNightly = inngest.createFunction(
  {
    id: "resolve-radar-decision-makers-nightly",
    name: "Resolve Radar Decision Makers - Nightly Batch (Signals/Local Radar)",
    retries: 1,
  },
  { cron: "45 2 * * *" }, // après auto-enrich (2h) et warm-lead-enrichment (2h30)
  async ({ step }) => {
    const workspaces = await step.run("get-workspaces", async () => {
      const rows = await prisma.workspace.findMany({
        where: { prospects: { some: { source: { in: ["JOB_BOARD_SIGNAL", "LOCAL_MAPS"] } } } },
        select: { id: true, userId: true },
      });
      return rows.map((w) => ({ workspaceId: w.id, userId: w.userId }));
    });

    let totalResolved = 0;
    let totalAttempted = 0;

    for (const ws of workspaces) {
      try {
        const { resolved, attempted } = await step.run(`resolve-${ws.workspaceId}`, async () => {
          const candidates = await findRadarProspectsNeedingDecisionMaker(ws.workspaceId, 10);
          let resolvedCount = 0;
          let attemptedCount = 0;

          for (const candidate of candidates) {
            const creditResult = await useCredits(ws.userId, "decision_maker_resolve");
            if (!creditResult.success) break; // Plus de crédits

            attemptedCount++;
            const result = await resolveDecisionMaker(candidate.id, ws.userId);
            if (result.resolved) resolvedCount++;
          }

          return { resolved: resolvedCount, attempted: attemptedCount };
        });
        totalResolved += resolved;
        totalAttempted += attempted;
      } catch (error) {
        console.error(`[ResolveRadarDecisionMakers] Erreur workspace ${ws.workspaceId}:`, error);
      }
    }

    return { totalResolved, totalAttempted, workspacesProcessed: workspaces.length };
  }
);
