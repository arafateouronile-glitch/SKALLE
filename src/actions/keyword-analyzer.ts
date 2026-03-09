"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  analyzeKeyword,
  findKeywordOpportunities,
  analyzeCompetitor,
  compareKeywords,
  type KeywordMetrics,
  type KeywordOpportunity,
  type CompetitorAnalysis,
} from "@/lib/seo/keyword-analyzer";
import { z } from "zod";
import { withCredits } from "@/lib/credits";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorisé");
  }
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      userId: userId,
    },
  });
  if (!workspace) {
    throw new Error("Workspace non trouvé ou accès refusé");
  }
  return workspace;
}

/**
 * Analyse un mot-clé unique
 */
export async function analyzeKeywordAction(
  workspaceId: string,
  keyword: string
): Promise<{ success: boolean; data?: KeywordMetrics; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const keywordSchema = z.string().min(2).max(200);
    const parsed = keywordSchema.safeParse(keyword);
    if (!parsed.success) {
      return { success: false, error: "Mot-clé invalide (2-200 caractères)" };
    }

    return await withCredits("keyword_research", workspaceId, async () => {
      const metrics = await analyzeKeyword(keyword);
      
      console.log(`[Keyword Analyzer Action] Métriques reçues:`, {
        volume: metrics.volume,
        cpc: metrics.cpc,
        kd: metrics.kd,
        competition: metrics.competition,
        volumeType: typeof metrics.volume,
        cpcType: typeof metrics.cpc,
      });

      // Sauvegarder en base pour historique
      const existing = await prisma.keywordResearch.findFirst({
        where: { workspaceId, keyword },
      });
      const payload = {
        difficulty: metrics.kd >= 70 ? "hard" : metrics.kd >= 40 ? "medium" : "easy",
        volumeEstimate: metrics.volume > 5000 ? "high" : metrics.volume > 1000 ? "medium" : "low",
        volume: metrics.volume,
        cpc: metrics.cpc,
        kd: metrics.kd,
        topCompetitors: metrics.topCompetitors.map((c) => c.domain),
        relatedKeywords: metrics.relatedKeywords.map((r) => r.keyword),
        paaQuestions: metrics.paaQuestions,
        serpFeatures: metrics.serpFeatures as object,
        searchIntent: metrics.searchIntent,
      };
      if (existing) {
        await prisma.keywordResearch.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await prisma.keywordResearch.create({
          data: {
            keyword,
            workspaceId,
            ...payload,
          },
        });
      }

      return metrics;
    });
  } catch (error) {
    console.error("Erreur analyse mot-clé:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de l'analyse",
    };
  }
}

/**
 * Trouve des opportunités de mots-clés
 */
export async function findOpportunitiesAction(
  workspaceId: string,
  seedKeyword: string,
  limit: number = 20
): Promise<{ success: boolean; data?: KeywordOpportunity[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const keywordSchema = z.string().min(2).max(200);
    const parsed = keywordSchema.safeParse(seedKeyword);
    if (!parsed.success) {
      return { success: false, error: "Mot-clé invalide (2-200 caractères)" };
    }

    return await withCredits("keyword_research", workspaceId, async () => {
      const opportunities = await findKeywordOpportunities(seedKeyword, limit);
      return opportunities;
    });
  } catch (error) {
    console.error("Erreur recherche opportunités:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la recherche",
    };
  }
}

/**
 * Analyse un concurrent
 */
export async function analyzeCompetitorAction(
  workspaceId: string,
  domain: string
): Promise<{ success: boolean; data?: CompetitorAnalysis; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const domainSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/);
    const parsed = domainSchema.safeParse(domain);
    if (!parsed.success) {
      return { success: false, error: "Domaine invalide" };
    }

    return await withCredits("competitor_analysis", workspaceId, async () => {
      const analysis = await analyzeCompetitor(domain);
      return analysis;
    });
  } catch (error) {
    console.error("Erreur analyse concurrent:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de l'analyse",
    };
  }
}

/**
 * Compare plusieurs mots-clés
 */
export async function compareKeywordsAction(
  workspaceId: string,
  keywords: string[]
): Promise<{ success: boolean; data?: KeywordMetrics[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    if (keywords.length < 2 || keywords.length > 10) {
      return { success: false, error: "Entre 2 et 10 mots-clés requis" };
    }

    return await withCredits("keyword_research", workspaceId, async () => {
      const results = await compareKeywords(keywords);
      return results;
    });
  } catch (error) {
    console.error("Erreur comparaison mots-clés:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la comparaison",
    };
  }
}

/**
 * Récupère l'historique des recherches de mots-clés
 */
export async function getKeywordHistory(
  workspaceId: string,
  limit: number = 50
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const history = await prisma.keywordResearch.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return { success: true, data: history };
  } catch (error) {
    console.error("Erreur récupération historique:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de la récupération",
    };
  }
}
