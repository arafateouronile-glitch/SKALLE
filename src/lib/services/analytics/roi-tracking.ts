/**
 * 📊 ROI Tracking Service — Attribution CMO→CSO
 *
 * Calcule le ROI réel du contenu marketing sur le pipeline commercial :
 * - Quels articles SEO génèrent des leads inbound ?
 * - Quel canal convertit le mieux (SEO, Social, Job Board) ?
 * - Quel est le deal value moyen par source ?
 */

import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// 📌 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SourceROI {
  count: number;
  converted: number;
  conversionRate: number;
  totalValue: number;
  avgDealValue: number;
}

export interface TopArticleROI {
  postId: string;
  title: string;
  leads: number;
  pipeline: number;
  avgDealValue: number;
  seoScore?: number | null;
}

export interface WeeklyPipelinePoint {
  week: string; // "YYYY-WW"
  leads: number;
  converted: number;
  value: number;
}

export interface ROIReport {
  /** Pipeline total (prospects CONVERTED avec value) */
  totalPipelineValue: number;
  /** Nombre total de prospects */
  totalProspects: number;
  /** Nombre de prospects convertis */
  totalConverted: number;
  /** Taux de conversion global */
  conversionRate: number;
  /** Deal value moyen */
  avgDealValue: number;
  /** Attribution par source */
  attributionBySource: Record<string, SourceROI>;
  /** Top articles SEO par ROI (avec attributedPostId) */
  topArticlesByROI: TopArticleROI[];
  /** Évolution du pipeline par semaine (12 dernières semaines) */
  weeklyPipeline: WeeklyPipelinePoint[];
  /** A/B test insights (du brandVoice) */
  abTestInsights?: {
    dominantFramework: string;
    totalTests: number;
    aWins: number;
    bWins: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 CALCUL DU DASHBOARD ROI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère un rapport ROI complet pour un workspace.
 * Données issues de Prisma (prospects, posts, conversions).
 */
export async function getROIDashboard(workspaceId: string): Promise<ROIReport> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Charger tous les prospects des 90 derniers jours
  const prospects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      createdAt: { gte: ninetyDaysAgo },
    },
    select: {
      id: true,
      status: true,
      source: true,
      value: true,
      attributedPostId: true,
      createdAt: true,
    },
  });

  const totalProspects = prospects.length;
  const converted = prospects.filter((p) => p.status === "CONVERTED");
  const totalConverted = converted.length;
  const totalPipelineValue = converted.reduce((sum, p) => sum + (p.value ?? 0), 0);
  const conversionRate = totalProspects > 0 ? Math.round((totalConverted / totalProspects) * 100) : 0;
  const avgDealValue = totalConverted > 0 ? Math.round(totalPipelineValue / totalConverted) : 0;

  // Attribution par source
  const attributionBySource: Record<string, SourceROI> = {};
  for (const p of prospects) {
    const src = p.source ?? "UNKNOWN";
    if (!attributionBySource[src]) {
      attributionBySource[src] = { count: 0, converted: 0, conversionRate: 0, totalValue: 0, avgDealValue: 0 };
    }
    attributionBySource[src].count++;
    if (p.status === "CONVERTED") {
      attributionBySource[src].converted++;
      attributionBySource[src].totalValue += p.value ?? 0;
    }
  }
  for (const src of Object.keys(attributionBySource)) {
    const s = attributionBySource[src];
    s.conversionRate = s.count > 0 ? Math.round((s.converted / s.count) * 100) : 0;
    s.avgDealValue = s.converted > 0 ? Math.round(s.totalValue / s.converted) : 0;
  }

  // Top articles par ROI (prospects avec attributedPostId)
  const articleAttribution: Record<string, { leads: number; pipeline: number; seoScore?: number | null; title?: string }> = {};
  for (const p of prospects) {
    if (!p.attributedPostId) continue;
    if (!articleAttribution[p.attributedPostId]) {
      articleAttribution[p.attributedPostId] = { leads: 0, pipeline: 0 };
    }
    articleAttribution[p.attributedPostId].leads++;
    if (p.status === "CONVERTED") {
      articleAttribution[p.attributedPostId].pipeline += p.value ?? 0;
    }
  }

  const topArticlesByROI: TopArticleROI[] = [];
  if (Object.keys(articleAttribution).length > 0) {
    const posts = await prisma.post.findMany({
      where: { id: { in: Object.keys(articleAttribution) } },
      select: { id: true, title: true, seoScore: true },
    });
    for (const post of posts) {
      const attr = articleAttribution[post.id];
      if (!attr) continue;
      topArticlesByROI.push({
        postId: post.id,
        title: post.title ?? "",
        leads: attr.leads,
        pipeline: attr.pipeline,
        avgDealValue: attr.leads > 0 ? Math.round(attr.pipeline / attr.leads) : 0,
        seoScore: post.seoScore,
      });
    }
    topArticlesByROI.sort((a, b) => b.pipeline - a.pipeline);
  }

  // Pipeline hebdomadaire (12 dernières semaines)
  const weeklyMap: Record<string, WeeklyPipelinePoint> = {};
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

  for (const p of prospects) {
    if (p.createdAt < twelveWeeksAgo) continue;
    const weekKey = getWeekKey(p.createdAt);
    if (!weeklyMap[weekKey]) {
      weeklyMap[weekKey] = { week: weekKey, leads: 0, converted: 0, value: 0 };
    }
    weeklyMap[weekKey].leads++;
    if (p.status === "CONVERTED") {
      weeklyMap[weekKey].converted++;
      weeklyMap[weekKey].value += p.value ?? 0;
    }
  }
  const weeklyPipeline = Object.values(weeklyMap).sort((a, b) => a.week.localeCompare(b.week));

  // A/B test insights depuis le brandVoice
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { brandVoice: true },
  });
  const bv = workspace?.brandVoice as Record<string, unknown> | null;
  const abRaw = (bv?.performanceInsights as Record<string, unknown> | undefined)?.abTestResults as {
    dominantFramework?: string;
    totalPairs?: number;
    aWins?: number;
    bWins?: number;
  } | undefined;

  const abTestInsights = abRaw?.dominantFramework
    ? {
        dominantFramework: abRaw.dominantFramework,
        totalTests: abRaw.totalPairs ?? 0,
        aWins: abRaw.aWins ?? 0,
        bWins: abRaw.bWins ?? 0,
      }
    : undefined;

  return {
    totalPipelineValue,
    totalProspects,
    totalConverted,
    conversionRate,
    avgDealValue,
    attributionBySource,
    topArticlesByROI: topArticlesByROI.slice(0, 10),
    weeklyPipeline,
    abTestInsights,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 ATTRIBUTION — lier un prospect SEO_INBOUND à l'article source
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Attribue un prospect inbound à l'article SEO qui correspond le mieux.
 * Appeler après la création d'un prospect avec source === "SEO_INBOUND".
 */
export async function attributeInboundToPost(
  workspaceId: string,
  prospectId: string,
  keywords: string[]
): Promise<void> {
  if (!keywords.length) return;

  // Chercher l'article SEO le plus récent dont les keywords matchent
  const matchingPost = await prisma.post.findFirst({
    where: {
      workspaceId,
      type: "SEO_ARTICLE",
      status: "PUBLISHED",
      deletedAt: null,
      keywords: { hasSome: keywords },
    },
    orderBy: { publishedAt: "desc" },
    select: { id: true },
  });

  if (!matchingPost) return;

  await prisma.prospect.update({
    where: { id: prospectId },
    data: { attributedPostId: matchingPost.id },
  });
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
