/**
 * 📊 CSO ROI Tracking — Attribution Agent IA → Pipeline
 *
 * Miroir de src/lib/services/analytics/roi-tracking.ts (côté CMO), adapté à
 * l'attribution CSO : au lieu d'attribuer un prospect à un article SEO
 * (attributedPostId), on attribue à la décision de l'Agent CSO qui l'a
 * touché en premier (attributedDecisionId, posé dans executeCsoDecision).
 */

import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface OriginROI {
  count: number;
  converted: number;
  conversionRate: number;
  totalValue: number;
  avgDealValue: number;
}

export interface ActionTypePipeline {
  actionType: string;
  count: number;
  pipeline: number;
  avgDealValue: number;
}

export interface WeeklyPipelinePoint {
  week: string; // "YYYY-WW"
  leads: number;
  converted: number;
  value: number;
}

export interface CsoROIReport {
  /** Pipeline total (prospects CONVERTED avec value) */
  totalPipelineValue: number;
  /** Nombre total de prospects (90j) */
  totalProspects: number;
  /** Nombre de prospects convertis */
  totalConverted: number;
  /** Taux de conversion global */
  conversionRate: number;
  /** Deal value moyen */
  avgDealValue: number;
  /** IA (attributedDecisionId posé) vs manuel */
  attributionByOrigin: { AI_AGENT: OriginROI; MANUAL: OriginROI };
  /** Pipeline généré par type de décision (CSO_LAUNCH_LINKEDIN, etc.) */
  pipelineByActionType: ActionTypePipeline[];
  /** Évolution du pipeline par semaine (12 dernières semaines) */
  weeklyPipeline: WeeklyPipelinePoint[];
}

function emptyOrigin(): OriginROI {
  return { count: 0, converted: 0, conversionRate: 0, totalValue: 0, avgDealValue: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 CALCUL DU DASHBOARD ROI CSO
// ═══════════════════════════════════════════════════════════════════════════

export async function getCsoROIDashboard(workspaceId: string): Promise<CsoROIReport> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const prospects = await prisma.prospect.findMany({
    where: { workspaceId, createdAt: { gte: ninetyDaysAgo } },
    select: {
      id: true,
      status: true,
      value: true,
      attributedDecisionId: true,
      createdAt: true,
    },
  });

  const totalProspects = prospects.length;
  const converted = prospects.filter((p) => p.status === "CONVERTED");
  const totalConverted = converted.length;
  const totalPipelineValue = converted.reduce((sum, p) => sum + (p.value ?? 0), 0);
  const conversionRate = totalProspects > 0 ? Math.round((totalConverted / totalProspects) * 100) : 0;
  const avgDealValue = totalConverted > 0 ? Math.round(totalPipelineValue / totalConverted) : 0;

  // Attribution IA vs manuel
  const attributionByOrigin = { AI_AGENT: emptyOrigin(), MANUAL: emptyOrigin() };
  for (const p of prospects) {
    const bucket = p.attributedDecisionId ? attributionByOrigin.AI_AGENT : attributionByOrigin.MANUAL;
    bucket.count++;
    if (p.status === "CONVERTED") {
      bucket.converted++;
      bucket.totalValue += p.value ?? 0;
    }
  }
  for (const bucket of Object.values(attributionByOrigin)) {
    bucket.conversionRate = bucket.count > 0 ? Math.round((bucket.converted / bucket.count) * 100) : 0;
    bucket.avgDealValue = bucket.converted > 0 ? Math.round(bucket.totalValue / bucket.converted) : 0;
  }

  // Pipeline par type de décision — seulement les prospects convertis attribués
  const decisionPipeline: Record<string, { count: number; pipeline: number }> = {};
  const convertedDecisionIds = converted
    .map((p) => p.attributedDecisionId)
    .filter((id): id is string => !!id);

  if (convertedDecisionIds.length > 0) {
    const decisions = await prisma.agentDecision.findMany({
      where: { id: { in: convertedDecisionIds } },
      select: { id: true, actionType: true },
    });
    const actionTypeById = new Map(decisions.map((d) => [d.id, d.actionType]));

    for (const p of converted) {
      if (!p.attributedDecisionId) continue;
      const actionType = actionTypeById.get(p.attributedDecisionId);
      if (!actionType) continue; // décision supprimée entre-temps — exclu proprement
      if (!decisionPipeline[actionType]) decisionPipeline[actionType] = { count: 0, pipeline: 0 };
      decisionPipeline[actionType].count++;
      decisionPipeline[actionType].pipeline += p.value ?? 0;
    }
  }

  const pipelineByActionType: ActionTypePipeline[] = Object.entries(decisionPipeline)
    .map(([actionType, d]) => ({
      actionType,
      count: d.count,
      pipeline: d.pipeline,
      avgDealValue: d.count > 0 ? Math.round(d.pipeline / d.count) : 0,
    }))
    .sort((a, b) => b.pipeline - a.pipeline);

  // Pipeline hebdomadaire (12 dernières semaines)
  const weeklyMap: Record<string, WeeklyPipelinePoint> = {};
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  for (const p of prospects) {
    if (p.createdAt < twelveWeeksAgo) continue;
    const weekKey = getWeekKey(p.createdAt);
    if (!weeklyMap[weekKey]) weeklyMap[weekKey] = { week: weekKey, leads: 0, converted: 0, value: 0 };
    weeklyMap[weekKey].leads++;
    if (p.status === "CONVERTED") {
      weeklyMap[weekKey].converted++;
      weeklyMap[weekKey].value += p.value ?? 0;
    }
  }
  const weeklyPipeline = Object.values(weeklyMap).sort((a, b) => a.week.localeCompare(b.week));

  return {
    totalPipelineValue,
    totalProspects,
    totalConverted,
    conversionRate,
    avgDealValue,
    attributionByOrigin,
    pipelineByActionType,
    weeklyPipeline,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ UTILS
// ═══════════════════════════════════════════════════════════════════════════

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
