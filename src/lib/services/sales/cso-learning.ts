/**
 * 🧠 CSO Learning — boucle d'apprentissage dédiée (Goskalle)
 *
 * Équivalent CSO de `learnFromPerformance` (Marketing Brain), mais volontairement
 * séparé : pas d'appel Claude, agrégation déterministe uniquement — les stats de
 * conversion par type de décision sont déjà auto-suffisantes, contrairement au
 * contenu marketing qui a besoin d'interprétation qualitative (mots-clés,
 * frameworks A/B). Écrit dans une clé distincte de `brandVoice` pour ne jamais
 * entrer en collision avec le learning marketing.
 */

import { prisma } from "@/lib/prisma";
import { scoreDecisionPerformance } from "@/lib/services/agent/brain";
import type { CsoActionType } from "@/lib/services/sales/cso-agent";

const CSO_ACTION_TYPES: CsoActionType[] = [
  "CSO_LAUNCH_LINKEDIN",
  "CSO_LAUNCH_EMAIL",
  "CSO_FOLLOWUP",
  "CSO_STALE_REJECT",
];

const SUCCESS_THRESHOLD = 70; // même seuil sémantique que le learning marketing

export interface CsoPerformanceInsights {
  avgScoreByType: Record<string, number>;
  successRateByType: Record<string, number>;
  sampleSizeByType: Record<string, number>;
  updatedAt: string;
}

export async function learnFromCsoPerformance(
  workspaceId: string
): Promise<{ success: boolean; insights?: CsoPerformanceInsights }> {
  try {
    // 1. Scorer les décisions CSO exécutées pas encore notées
    await scoreDecisionPerformance(workspaceId);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const decisions = await prisma.agentDecision.findMany({
      where: {
        workspaceId,
        status: "EXECUTED",
        actionType: { in: CSO_ACTION_TYPES },
        performanceScore: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { actionType: true, performanceScore: true },
    });

    // 2. Agrégation déterministe par type
    const byType: Record<string, { total: number; successCount: number; count: number }> = {};
    for (const d of decisions) {
      if (d.performanceScore == null) continue;
      if (!byType[d.actionType]) byType[d.actionType] = { total: 0, successCount: 0, count: 0 };
      byType[d.actionType].total += d.performanceScore;
      byType[d.actionType].count += 1;
      if (d.performanceScore > SUCCESS_THRESHOLD) byType[d.actionType].successCount += 1;
    }

    const avgScoreByType: Record<string, number> = {};
    const successRateByType: Record<string, number> = {};
    const sampleSizeByType: Record<string, number> = {};
    for (const [type, { total, successCount, count }] of Object.entries(byType)) {
      avgScoreByType[type] = Math.round(total / count);
      successRateByType[type] = Math.round((successCount / count) * 100);
      sampleSizeByType[type] = count;
    }

    const insights: CsoPerformanceInsights = {
      avgScoreByType,
      successRateByType,
      sampleSizeByType,
      updatedAt: new Date().toISOString(),
    };

    // 3. Sauvegarde dans une clé dédiée de brandVoice (jamais `performanceInsights`)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { brandVoice: true },
    });
    const brandVoice = (workspace?.brandVoice as Record<string, unknown>) ?? {};

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        brandVoice: JSON.parse(
          JSON.stringify({ ...brandVoice, csoPerformanceInsights: insights })
        ),
      },
    });

    return { success: true, insights };
  } catch (error) {
    console.error("[CsoLearning] Erreur apprentissage:", error);
    return { success: false };
  }
}
