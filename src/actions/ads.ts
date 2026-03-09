"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasEnoughCredits, useCredits, CREDIT_COSTS } from "@/lib/credits";
import type { OperationType } from "@/lib/credits";
import {
  fetchCompetitorAds,
  analyzeAdCreative,
  generateAdRemix,
  type AdPlatform,
} from "@/lib/services/ads/intelligence";

const AD_ANALYSIS_OP: OperationType = "ad_analysis";
const AD_REMIX_OP: OperationType = "ad_remix";

export async function getWorkspaceScrapedAds(workspaceId: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Non autorisé", data: null };

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
  });
  if (!workspace) return { success: false as const, error: "Workspace non trouvé", data: null };

  if (typeof (prisma as { scrapedAd?: unknown }).scrapedAd === "undefined") {
    console.error("Prisma client missing scrapedAd model. Run: npx prisma generate && restart dev server.");
    return {
      success: false as const,
      error: "Modèle Ad-Intelligence non chargé. Redémarrez le serveur (npx prisma generate puis npm run dev).",
      data: null,
    };
  }

  const ads = await prisma.scrapedAd.findMany({
    where: { workspaceId },
    orderBy: [{ daysActive: "desc" }, { createdAt: "desc" }],
  });

  return { success: true as const, data: ads, error: null };
}

export async function searchCompetitorAds(
  workspaceId: string,
  keyword: string,
  platform: AdPlatform
) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Non autorisé", data: null };

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
  });
  if (!workspace) return { success: false as const, error: "Workspace non trouvé", data: null };

  if (typeof (prisma as { scrapedAd?: unknown }).scrapedAd === "undefined") {
    return {
      success: false as const,
      error: "Modèle Ad-Intelligence non chargé. Redémarrez le serveur (Ctrl+C puis npm run dev).",
      data: null,
    };
  }

  try {
    const result = await fetchCompetitorAds(keyword, platform, workspaceId, { limit: 20 });
    const list = result.list ?? [];
    const PLATFORM_LABELS: Record<string, string> = {
      TIKTOK: "TikTok Ad Library",
      LINKEDIN: "LinkedIn Ad Library",
      PINTEREST: "Pinterest Ads",
    };
    const warning = result.platformFallback
      ? `${PLATFORM_LABELS[platform] ?? platform} : API non intégrée — données de démonstration affichées. Configurez les clés API pour accéder aux vraies publicités.`
      : result.metaFallback
        ? "Meta Ad Library a renvoyé une erreur 500 (côté Meta). Données de démo affichées."
        : undefined;
    return { success: true as const, data: list, error: null, warning };
  } catch (e) {
    console.error("searchCompetitorAds", e);
    return {
      success: false as const,
      error: e instanceof Error ? e.message : "Erreur lors de la recherche",
      data: null,
    };
  }
}

export async function runAdAnalysis(workspaceId: string, adId: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Non autorisé", data: null };

  const check = await hasEnoughCredits(session.user.id, AD_ANALYSIS_OP);
  if (!check.hasCredits) {
    return {
      success: false as const,
      error: `Crédits insuffisants. Requis: ${CREDIT_COSTS.ad_analysis}, Disponibles: ${check.currentCredits}.`,
      data: null,
    };
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
  });
  if (!workspace) return { success: false as const, error: "Workspace non trouvé", data: null };

  if (typeof (prisma as { scrapedAd?: unknown }).scrapedAd === "undefined") {
    return {
      success: false as const,
      error: "Modèle Ad-Intelligence non chargé. Redémarrez le serveur (Ctrl+C puis npm run dev).",
      data: null,
    };
  }

  const ad = await prisma.scrapedAd.findFirst({
    where: { id: adId, workspaceId },
  });
  if (!ad) return { success: false as const, error: "Publicité non trouvée", data: null };

  try {
    const result = await analyzeAdCreative(adId);
    if (!result) {
      return { success: false as const, error: "Impossible d'analyser la publicité", data: null };
    }

    await useCredits(session.user.id, AD_ANALYSIS_OP);
    await prisma.aPIUsage.create({
      data: {
        service: "openai",
        operation: "ad_analysis",
        credits: CREDIT_COSTS.ad_analysis,
        workspaceId,
      },
    });

    const updated = await prisma.scrapedAd.findUnique({
      where: { id: adId },
    });

    return {
      success: true as const,
      data: { analysis: result, ad: updated },
      error: null,
    };
  } catch (e) {
    console.error("runAdAnalysis", e);
    return {
      success: false as const,
      error: e instanceof Error ? e.message : "Erreur lors de l'analyse",
      data: null,
    };
  }
}

export async function runAdRemix(
  workspaceId: string,
  sourceAdId: string,
  targetNetwork: string
) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Non autorisé", data: null };

  const check = await hasEnoughCredits(session.user.id, AD_REMIX_OP);
  if (!check.hasCredits) {
    return {
      success: false as const,
      error: `Crédits insuffisants. Requis: ${CREDIT_COSTS.ad_remix}, Disponibles: ${check.currentCredits}.`,
      data: null,
    };
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
  });
  if (!workspace) return { success: false as const, error: "Workspace non trouvé", data: null };

  if (typeof (prisma as { scrapedAd?: unknown }).scrapedAd === "undefined") {
    return {
      success: false as const,
      error: "Modèle Ad-Intelligence non chargé. Redémarrez le serveur (Ctrl+C puis npm run dev).",
      data: null,
    };
  }

  try {
    const result = await generateAdRemix(sourceAdId, workspaceId, targetNetwork);
    if (!result) {
      return { success: false as const, error: "Impossible de générer le remix", data: null };
    }

    await useCredits(session.user.id, AD_REMIX_OP);
    await prisma.aPIUsage.create({
      data: {
        service: "openai",
        operation: "ad_remix",
        credits: CREDIT_COSTS.ad_remix,
        workspaceId,
      },
    });

    return { success: true as const, data: result, error: null };
  } catch (e) {
    console.error("runAdRemix", e);
    return {
      success: false as const,
      error: e instanceof Error ? e.message : "Erreur lors du remix",
      data: null,
    };
  }
}
