/**
 * 🧠 Inngest Function: Apprentissage CSO hebdomadaire (Goskalle)
 *
 * Pas de dépendance à `autopilotConfig` (spécifique au cycle marketing) —
 * cible les workspaces ayant une activité CSO réelle (au moins une décision
 * exécutée dans les 30 derniers jours), auto-sélection par l'usage plutôt
 * que par un flag dédié.
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { learnFromCsoPerformance } from "@/lib/services/sales/cso-learning";
import type { CsoActionType } from "@/lib/services/sales/cso-agent";

const CSO_ACTION_TYPES: CsoActionType[] = [
  "CSO_LAUNCH_LINKEDIN",
  "CSO_LAUNCH_EMAIL",
  "CSO_FOLLOWUP",
  "CSO_STALE_REJECT",
];

export const csoAgentWeeklyLearn = inngest.createFunction(
  {
    id: "cso-agent-weekly-learn",
    name: "CSO Agent - Weekly Performance Learning",
    retries: 1,
  },
  { cron: "30 23 * * 0" }, // Dimanche 23h30 — 30 min après le learning marketing
  async ({ step }) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeWorkspaces = await step.run("get-active-cso-workspaces", async () => {
      const rows = await prisma.agentDecision.findMany({
        where: {
          status: "EXECUTED",
          actionType: { in: CSO_ACTION_TYPES },
          executedAt: { gte: thirtyDaysAgo },
        },
        select: { workspaceId: true },
        distinct: ["workspaceId"],
      });
      return rows.map((r) => r.workspaceId);
    });

    let learned = 0;

    for (const workspaceId of activeWorkspaces) {
      try {
        await step.run(`cso-learn-${workspaceId}`, async () => {
          // Pas d'appel Claude côté CSO learning (agrégation déterministe) — rien à tracker
          return learnFromCsoPerformance(workspaceId);
        });
        learned++;
      } catch (error) {
        console.error(`[CsoLearning Weekly] Erreur workspace ${workspaceId}:`, error);
      }
    }

    return { learned, workspacesProcessed: activeWorkspaces.length };
  }
);
