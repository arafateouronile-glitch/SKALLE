"use server";

import * as cheerio from "cheerio";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { z } from "zod";
import { withCredits } from "@/lib/credits";
import { runTechnicalAnalysis } from "@/lib/seo/technical-analyzer";
import { runOnPageAnalysis } from "@/lib/seo/onpage-analyzer";
import { generateAIRecommendations } from "@/lib/seo/ai-recommendations";
import { compareWithCompetitors } from "@/lib/seo/competitor-comparison";
import type {
  EnhancedSEOAuditReport,
  KeywordResearchResult,
  ArticleOutline,
  ContentOptimizationScore,
  ArticleFilters,
  PaginatedResponse,
} from "@/types/seo";

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorisé");
  }
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  });
  if (!workspace) {
    throw new Error("Workspace non trouvé");
  }
  return workspace;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 AUDIT SEO BASIQUE (backward compatible)
// ═══════════════════════════════════════════════════════════════════════════

// SEO Audit Types (backward compatible)
interface SEOAuditReport {
  score: number;
  title: {
    value: string | null;
    length: number;
    score: number;
    issues: string[];
  };
  metaDescription: {
    value: string | null;
    length: number;
    score: number;
    issues: string[];
  };
  headings: {
    h1Count: number;
    h2Count: number;
    h3Count: number;
    score: number;
    issues: string[];
  };
  images: {
    total: number;
    withAlt: number;
    score: number;
    issues: string[];
  };
  links: {
    internal: number;
    external: number;
    score: number;
    issues: string[];
  };
  content: {
    wordCount: number;
    score: number;
    issues: string[];
  };
}

export async function runSEOAudit(
  workspaceId: string,
  url: string
): Promise<{ success: boolean; data?: SEOAuditReport; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    // Résoudre le vrai workspace de l'utilisateur
    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
    });
    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }
    workspaceId = workspace.id;

    const urlSchema = z.string().url();
    const parsed = urlSchema.safeParse(url);
    if (!parsed.success) {
      return { success: false, error: "URL invalide" };
    }

    const result = await withCredits("seo_audit", workspaceId, async () => {
    // Fetch the page
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ViralTrends/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error("Impossible d'accéder à la page");
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Analyze Title
    const title = $("title").text().trim();
    const titleIssues: string[] = [];
    let titleScore = 100;
    if (!title) {
      titleIssues.push("Titre manquant");
      titleScore = 0;
    } else if (title.length < 30) {
      titleIssues.push("Titre trop court (< 30 caractères)");
      titleScore = 50;
    } else if (title.length > 60) {
      titleIssues.push("Titre trop long (> 60 caractères)");
      titleScore = 70;
    }

    // Analyze Meta Description
    const metaDescription = $('meta[name="description"]').attr("content") || "";
    const metaIssues: string[] = [];
    let metaScore = 100;
    if (!metaDescription) {
      metaIssues.push("Meta description manquante");
      metaScore = 0;
    } else if (metaDescription.length < 120) {
      metaIssues.push("Meta description trop courte (< 120 caractères)");
      metaScore = 50;
    } else if (metaDescription.length > 160) {
      metaIssues.push("Meta description trop longue (> 160 caractères)");
      metaScore = 70;
    }

    // Analyze Headings
    const h1Count = $("h1").length;
    const h2Count = $("h2").length;
    const h3Count = $("h3").length;
    const headingIssues: string[] = [];
    let headingScore = 100;
    if (h1Count === 0) {
      headingIssues.push("Aucun H1 trouvé");
      headingScore -= 30;
    } else if (h1Count > 1) {
      headingIssues.push("Plusieurs H1 trouvés (recommandé: 1)");
      headingScore -= 15;
    }
    if (h2Count === 0) {
      headingIssues.push("Aucun H2 trouvé");
      headingScore -= 20;
    }

    // Analyze Images
    const images = $("img");
    const imagesWithAlt = $("img[alt]").filter((_, el) => $(el).attr("alt")?.trim() !== "").length;
    const imageIssues: string[] = [];
    let imageScore = 100;
    if (images.length > 0) {
      const altRatio = imagesWithAlt / images.length;
      if (altRatio < 0.5) {
        imageIssues.push(`${images.length - imagesWithAlt} images sans attribut alt`);
        imageScore = Math.round(altRatio * 100);
      } else if (altRatio < 1) {
        imageIssues.push(`Quelques images sans alt (${images.length - imagesWithAlt})`);
        imageScore = Math.round(altRatio * 100);
      }
    }

    // Analyze Links
    const allLinks = $("a[href]");
    const currentDomain = new URL(url).hostname;
    let internalLinks = 0;
    let externalLinks = 0;
    allLinks.each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.startsWith("/") || href.includes(currentDomain)) {
        internalLinks++;
      } else if (href.startsWith("http")) {
        externalLinks++;
      }
    });
    const linkIssues: string[] = [];
    let linkScore = 100;
    if (internalLinks < 3) {
      linkIssues.push("Peu de liens internes");
      linkScore -= 20;
    }
    if (externalLinks === 0) {
      linkIssues.push("Aucun lien externe (sources)");
      linkScore -= 10;
    }

    // Analyze Content
    $("script, style, nav, header, footer").remove();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const wordCount = bodyText.split(" ").filter((w) => w.length > 2).length;
    const contentIssues: string[] = [];
    let contentScore = 100;
    if (wordCount < 300) {
      contentIssues.push("Contenu trop court (< 300 mots)");
      contentScore = 30;
    } else if (wordCount < 600) {
      contentIssues.push("Contenu court (< 600 mots)");
      contentScore = 60;
    } else if (wordCount < 1000) {
      contentScore = 80;
    }

    // Calculate overall score
    const weights = {
      title: 0.15,
      meta: 0.15,
      headings: 0.15,
      images: 0.1,
      links: 0.15,
      content: 0.3,
    };
    const overallScore = Math.round(
      titleScore * weights.title +
        metaScore * weights.meta +
        headingScore * weights.headings +
        imageScore * weights.images +
        linkScore * weights.links +
        contentScore * weights.content
    );

    const report: SEOAuditReport = {
      score: overallScore,
      title: { value: title, length: title.length, score: titleScore, issues: titleIssues },
      metaDescription: { value: metaDescription, length: metaDescription.length, score: metaScore, issues: metaIssues },
      headings: { h1Count, h2Count, h3Count, score: headingScore, issues: headingIssues },
      images: { total: images.length, withAlt: imagesWithAlt, score: imageScore, issues: imageIssues },
      links: { internal: internalLinks, external: externalLinks, score: linkScore, issues: linkIssues },
      content: { wordCount, score: contentScore, issues: contentIssues },
    };

    // Save audit
    await prisma.sEOAudit.create({
      data: {
        url,
        globalScore: overallScore,
        score: overallScore,
        report: JSON.parse(JSON.stringify(report)),
        workspaceId,
      },
    });

    return report;
    });
    return result;
  } catch (error) {
    console.error("SEO Audit error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function startBulkGeneration(
  workspaceId: string,
  keywords: string[]
): Promise<{ success: boolean; batchJobId?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Non autorisé" };
    }

    // Résoudre le vrai workspace de l'utilisateur
    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
      select: { id: true, brandVoice: true },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }
    workspaceId = workspace.id;

    // Create batch job
    const batchJob = await prisma.batchJob.create({
      data: {
        name: `Génération de ${keywords.length} articles`,
        totalItems: keywords.length,
        workspaceId,
      },
    });

    // Trigger Inngest function
    await inngest.send({
      name: "articles/bulk.generate",
      data: {
        batchJobId: batchJob.id,
        workspaceId,
        keywords,
        brandVoice: workspace.brandVoice as Record<string, unknown> | undefined,
      },
    });

    return { success: true, batchJobId: batchJob.id };
  } catch (error) {
    console.error("Bulk generation error:", error);
    return { success: false, error: "Une erreur est survenue" };
  }
}

export async function getBatchJobStatus(batchJobId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  return prisma.batchJob.findFirst({
    where: {
      id: batchJobId,
      workspace: { userId: session.user.id },
    },
    include: {
      _count: { select: { posts: true } },
    },
  });
}

export async function getWorkspacePosts(workspaceId: string) {
  const session = await auth();
  if (!session?.user?.id) return [];

  return prisma.post.findMany({
    where: {
      workspaceId,
      workspace: { userId: session.user.id },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔬 AUDIT SEO AVANCÉ
// ═══════════════════════════════════════════════════════════════════════════

const enhancedAuditSchema = z.object({
  workspaceId: z.string().min(1),
  url: z.string().url(),
  targetKeyword: z.string().min(1).optional(),
  includeCompetitors: z.boolean().optional().default(false),
});

export async function runEnhancedSEOAudit(
  input: z.input<typeof enhancedAuditSchema>
): Promise<{ success: boolean; data?: EnhancedSEOAuditReport; error?: string }> {
  try {
    const session = await requireAuth();
    const parsed = enhancedAuditSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Données invalides : " + parsed.error.issues[0].message };
    }

    const { workspaceId, url, targetKeyword, includeCompetitors } = parsed.data;
    await requireWorkspace(workspaceId, session.user!.id!);

    const creditOp = includeCompetitors ? "seo_audit_competitor" as const : "seo_audit_enhanced" as const;

    return await withCredits(creditOp, workspaceId, async () => {
      // Fetch la page
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Skalle/1.0)" },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error("Impossible d'accéder à la page");
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const currentDomain = new URL(url).hostname;

      // ---- Analyse basique (backward compatible) ----
      const title = $("title").text().trim();
      const titleIssues: string[] = [];
      let titleScore = 100;
      if (!title) { titleIssues.push("Titre manquant"); titleScore = 0; }
      else if (title.length < 30) { titleIssues.push("Titre trop court (< 30 caractères)"); titleScore = 50; }
      else if (title.length > 60) { titleIssues.push("Titre trop long (> 60 caractères)"); titleScore = 70; }

      const metaDesc = $('meta[name="description"]').attr("content") || "";
      const metaIssues: string[] = [];
      let metaScore = 100;
      if (!metaDesc) { metaIssues.push("Meta description manquante"); metaScore = 0; }
      else if (metaDesc.length < 120) { metaIssues.push("Meta description trop courte (< 120 caractères)"); metaScore = 50; }
      else if (metaDesc.length > 160) { metaIssues.push("Meta description trop longue (> 160 caractères)"); metaScore = 70; }

      const h1Count = $("h1").length;
      const h2Count = $("h2").length;
      const h3Count = $("h3").length;
      const headingIssues: string[] = [];
      let headingScore = 100;
      if (h1Count === 0) { headingIssues.push("Aucun H1 trouvé"); headingScore -= 30; }
      else if (h1Count > 1) { headingIssues.push("Plusieurs H1 trouvés (recommandé: 1)"); headingScore -= 15; }
      if (h2Count === 0) { headingIssues.push("Aucun H2 trouvé"); headingScore -= 20; }

      const imgElements = $("img");
      const imagesWithAlt = $("img[alt]").filter((_, el) => $(el).attr("alt")?.trim() !== "").length;
      const imagesWithoutAlt: string[] = [];
      imgElements.each((_, el) => {
        const alt = $(el).attr("alt")?.trim();
        if (!alt) imagesWithoutAlt.push($(el).attr("src") || "unknown");
      });
      let imageScore = 100;
      const imageIssues: string[] = [];
      if (imgElements.length > 0) {
        const altRatio = imagesWithAlt / imgElements.length;
        if (altRatio < 0.5) { imageIssues.push(`${imgElements.length - imagesWithAlt} images sans alt`); imageScore = Math.round(altRatio * 100); }
        else if (altRatio < 1) { imageIssues.push(`Quelques images sans alt (${imgElements.length - imagesWithAlt})`); imageScore = Math.round(altRatio * 100); }
      }

      let internalLinks = 0;
      let externalLinks = 0;
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (href.startsWith("/") || href.includes(currentDomain)) internalLinks++;
        else if (href.startsWith("http")) externalLinks++;
      });
      const linkIssues: string[] = [];
      let linkScore = 100;
      if (internalLinks < 3) { linkIssues.push("Peu de liens internes"); linkScore -= 20; }
      if (externalLinks === 0) { linkIssues.push("Aucun lien externe (sources)"); linkScore -= 10; }

      // Extraire le texte du body (copie pour ne pas modifier le DOM original)
      const contentCopy = cheerio.load(html);
      contentCopy("script, style, nav, header, footer, aside").remove();
      const bodyText = contentCopy("body").text().replace(/\s+/g, " ").trim();
      const wordCount = bodyText.split(" ").filter((w) => w.length > 2).length;
      const contentIssues: string[] = [];
      let contentScore = 100;
      if (wordCount < 300) { contentIssues.push("Contenu trop court (< 300 mots)"); contentScore = 30; }
      else if (wordCount < 600) { contentIssues.push("Contenu court (< 600 mots)"); contentScore = 60; }
      else if (wordCount < 1000) { contentScore = 80; }

      // ---- Analyse technique ----
      const technical = runTechnicalAnalysis($, url, html, response.headers);

      // ---- Analyse on-page ----
      const onPage = runOnPageAnalysis($, bodyText, currentDomain, targetKeyword);

      // Score global pondéré
      const weights = {
        title: 0.10,
        meta: 0.10,
        headings: 0.10,
        images: 0.05,
        links: 0.10,
        content: 0.20,
        technical: 0.20,
        onPage: 0.15,
      };
      const overallScore = Math.round(
        titleScore * weights.title +
        metaScore * weights.meta +
        headingScore * weights.headings +
        imageScore * weights.images +
        linkScore * weights.links +
        contentScore * weights.content +
        technical.score * weights.technical +
        onPage.score * weights.onPage
      );

      const h1Text = h1Count > 0 ? $("h1").first().text().trim() : null;
      const hierarchy: string[] = [];
      $("h1, h2, h3").each((_, el) => {
        const tag = $(el).prop("tagName")?.toLowerCase() || "";
        hierarchy.push(`${tag}: ${$(el).text().trim().slice(0, 80)}`);
      });

      const report: EnhancedSEOAuditReport = {
        score: overallScore,
        title: { value: title, length: title.length, score: titleScore, issues: titleIssues },
        metaDescription: { value: metaDesc, length: metaDesc.length, score: metaScore, issues: metaIssues },
        headings: { h1Count, h2Count, h3Count, h1Text, hierarchy, score: headingScore, issues: headingIssues },
        images: { total: imgElements.length, withAlt: imagesWithAlt, withoutAlt: imagesWithoutAlt.slice(0, 10), score: imageScore, issues: imageIssues },
        links: { internal: internalLinks, external: externalLinks, score: linkScore, issues: linkIssues },
        content: { wordCount, score: contentScore, issues: contentIssues },
        technical,
        onPage,
      };

      // ---- Recommandations IA ----
      try {
        const aiRecs = await generateAIRecommendations(report, url, targetKeyword);
        report.aiRecommendations = aiRecs;
      } catch (err) {
        console.error("AI recommendations failed:", err);
      }

      // ---- Comparaison concurrents (optionnel) ----
      let competitorData = undefined;
      if (includeCompetitors && targetKeyword) {
        try {
          competitorData = await compareWithCompetitors(report, targetKeyword);
          report.competitorData = competitorData;
        } catch (err) {
          console.error("Competitor comparison failed:", err);
        }
      }

      // Sauvegarder l'audit
      await prisma.sEOAudit.create({
        data: {
          url,
          score: overallScore,
          report: JSON.parse(JSON.stringify(report)),
          targetKeyword: targetKeyword || null,
          technicalReport: JSON.parse(JSON.stringify(technical)),
          onPageReport: JSON.parse(JSON.stringify(onPage)),
          aiRecommendations: report.aiRecommendations ? JSON.parse(JSON.stringify(report.aiRecommendations)) : null,
          competitorData: competitorData ? JSON.parse(JSON.stringify(competitorData)) : null,
          workspaceId,
        },
      });

      return report;
    }) as { success: boolean; data?: EnhancedSEOAuditReport; error?: string };
  } catch (error) {
    console.error("Enhanced SEO Audit error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📜 HISTORIQUE DES AUDITS
// ═══════════════════════════════════════════════════════════════════════════

export async function getAuditHistory(
  workspaceId: string,
  url?: string,
  limit: number = 20
): Promise<{ success: boolean; data?: Array<{ id: string; url: string; score: number; targetKeyword: string | null; createdAt: Date }>; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const audits = await prisma.sEOAudit.findMany({
      where: {
        workspaceId,
        ...(url ? { url } : {}),
      },
      select: {
        id: true,
        url: true,
        score: true,
        targetKeyword: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });

    return {
      success: true,
      data: audits.map((a) => ({
        id: a.id,
        url: a.url,
        score: a.score ?? 0,
        targetKeyword: a.targetKeyword,
        createdAt: a.createdAt,
      })),
    };
  } catch (error) {
    console.error("Audit history error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function getAuditDetail(
  workspaceId: string,
  auditId: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const audit = await prisma.sEOAudit.findFirst({
      where: {
        id: auditId,
        workspaceId,
      },
    });

    if (!audit) {
      return { success: false, error: "Audit non trouvé" };
    }

    return { success: true, data: audit };
  } catch (error) {
    console.error("Audit detail error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔎 RECHERCHE DE MOTS-CLÉS
// ═══════════════════════════════════════════════════════════════════════════

export async function researchKeyword(
  workspaceId: string,
  keyword: string
): Promise<{ success: boolean; data?: KeywordResearchResult; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const keywordSchema = z.string().min(2).max(200);
    const parsed = keywordSchema.safeParse(keyword);
    if (!parsed.success) {
      return { success: false, error: "Mot-clé invalide (2-200 caractères)" };
    }

    return await withCredits("keyword_research", workspaceId, async () => {
      const { searchGoogleFull } = await import("@/lib/ai/serper");
      const fullResponse = await searchGoogleFull(keyword);

      // Analyse de la difficulté
      const organic = fullResponse.organic || [];
      const bigBrands = ["wikipedia.org", "amazon.fr", "fnac.com", "lemonde.fr", "lefigaro.fr", "bfmtv.com"];
      const brandCount = organic.filter((r) =>
        bigBrands.some((b) => r.link.includes(b))
      ).length;

      let difficulty: "easy" | "medium" | "hard" = "easy";
      if (brandCount >= 4) difficulty = "hard";
      else if (brandCount >= 2) difficulty = "medium";

      // Estimation du volume
      const hasAds = false; // Serper ne retourne pas toujours les ads
      let volumeEstimate: "low" | "medium" | "high" = "medium";
      if (keyword.split(" ").length >= 4) volumeEstimate = "low";
      else if (keyword.split(" ").length <= 2 && organic.length >= 10) volumeEstimate = "high";

      // Concurrents
      const topCompetitors = organic.slice(0, 10).map((r) => ({
        domain: new URL(r.link).hostname,
        title: r.title,
        position: r.position,
      }));

      // Mots-clés liés
      const relatedKeywords = (fullResponse.relatedSearches || []).map((r) => r.query);

      // Questions PAA
      const paaQuestions = (fullResponse.peopleAlsoAsk || []).map((r) => r.question);

      // Features SERP
      const serpFeatures = {
        featuredSnippet: !!fullResponse.answerBox,
        knowledgePanel: !!fullResponse.knowledgeGraph,
        localPack: false,
        videoResults: organic.some((r) => r.link.includes("youtube.com")),
        imageResults: false,
      };

      // Intention de recherche
      const commercialTerms = ["acheter", "prix", "comparatif", "meilleur", "avis", "pas cher"];
      const isCommercial = commercialTerms.some((t) => keyword.toLowerCase().includes(t));
      const infoTerms = ["comment", "pourquoi", "qu'est-ce", "définition", "guide", "tutoriel"];
      const isInfo = infoTerms.some((t) => keyword.toLowerCase().includes(t));

      let searchIntent: "informational" | "transactional" | "navigational" | "mixed" = "mixed";
      if (isCommercial && !isInfo) searchIntent = "transactional";
      else if (isInfo && !isCommercial) searchIntent = "informational";
      else if (organic.length > 0 && organic[0].link.includes(keyword.replace(/\s+/g, ""))) searchIntent = "navigational";

      const result: KeywordResearchResult = {
        keyword,
        difficulty,
        volumeEstimate,
        topCompetitors,
        relatedKeywords,
        paaQuestions,
        serpFeatures,
        searchIntent,
      };

      // Sauvegarder
      await prisma.keywordResearch.create({
        data: {
          keyword,
          difficulty,
          volumeEstimate,
          topCompetitors: JSON.parse(JSON.stringify(topCompetitors)),
          relatedKeywords,
          paaQuestions,
          serpFeatures: JSON.parse(JSON.stringify(serpFeatures)),
          searchIntent,
          workspaceId,
        },
      });

      return result;
    }) as { success: boolean; data?: KeywordResearchResult; error?: string };
  } catch (error) {
    console.error("Keyword research error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 GÉNÉRATION D'OUTLINE
// ═══════════════════════════════════════════════════════════════════════════

export async function generateOutline(
  workspaceId: string,
  keyword: string
): Promise<{ success: boolean; data?: ArticleOutline; error?: string }> {
  try {
    const session = await requireAuth();
    const workspace = await requireWorkspace(workspaceId, session.user!.id!);

    return await withCredits("article_outline", workspaceId, async () => {
      const { generateArticleOutline } = await import("@/lib/seo/outline-generator");
      const outline = await generateArticleOutline(
        keyword,
        workspace.brandVoice as Record<string, unknown> | undefined
      );
      return outline;
    }) as { success: boolean; data?: ArticleOutline; error?: string };
  } catch (error) {
    console.error("Outline generation error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✍️ GÉNÉRATION D'ARTICLE UNIQUE
// ═══════════════════════════════════════════════════════════════════════════

export async function generateSingleArticle(
  workspaceId: string,
  keyword: string,
  outline?: ArticleOutline,
  options?: { generateImages?: boolean; targetPersona?: string }
): Promise<{ success: boolean; data?: { id: string; title: string; seoScore: number | null }; error?: string }> {
  try {
    const session = await requireAuth();
    const workspace = await requireWorkspace(workspaceId, session.user!.id!);

    return await withCredits("seo_article_single", workspaceId, async () => {
      const { generateEliteArticle } = await import("@/lib/services/seo/writer");

      // Récupérer les titres existants pour les liens internes
      const existingPosts = await prisma.post.findMany({
        where: { workspaceId, type: "SEO_ARTICLE", deletedAt: null },
        select: { title: true },
        take: 50,
      });
      const existingTitles = existingPosts
        .map((p) => p.title)
        .filter((t): t is string => !!t);

      const article = await generateEliteArticle({
        keyword,
        outline,
        brandVoice: workspace.brandVoice as Record<string, unknown> | undefined,
        existingArticleTitles: existingTitles,
        generateImages: options?.generateImages ?? false,
        targetPersona: options?.targetPersona,
        userId: session.user!.id!,
        workspaceId,
      });

      // Sauvegarder — champs élite inclus (imageUrl, sources)
      const post = await prisma.post.create({
        data: {
          type: "SEO_ARTICLE",
          title: article.title,
          content: article.content,
          excerpt: article.excerpt,
          metaTitle: article.metaTitle,
          metaDescription: article.metaDescription,
          outline: JSON.parse(JSON.stringify(article.outline)),
          keywords: [keyword, ...article.relatedKeywords.slice(0, 5)],
          seoScore: article.seoScore,
          readabilityScore: article.readabilityScore,
          seoFeedback: JSON.parse(JSON.stringify(article.seoFeedback)),
          faqContent: JSON.parse(JSON.stringify(article.faqContent)),
          tableOfContents: JSON.parse(JSON.stringify(article.tableOfContents)),
          wordCount: article.wordCount,
          imageUrl: article.featuredImageUrl ?? undefined,
          sources: article.sources.length > 0
            ? JSON.parse(JSON.stringify(article.sources))
            : undefined,
          status: "DRAFT",
          workspaceId,
        },
      });

      return { id: post.id, title: post.title || keyword, seoScore: post.seoScore };
    }) as { success: boolean; data?: { id: string; title: string; seoScore: number | null }; error?: string };
  } catch (error) {
    console.error("Single article generation error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📈 SCORING DE CONTENU
// ═══════════════════════════════════════════════════════════════════════════

export async function scoreExistingArticle(
  workspaceId: string,
  articleId: string
): Promise<{ success: boolean; data?: ContentOptimizationScore; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    return await withCredits("content_optimization", workspaceId, async () => {
      const post = await prisma.post.findFirst({
        where: { id: articleId, workspaceId, deletedAt: null },
      });
      if (!post) throw new Error("Article non trouvé");

      const { scoreArticleContent } = await import("@/lib/seo/content-optimizer");
      const keyword = post.keywords[0] || "";
      const score = scoreArticleContent(
        post.content,
        keyword,
        post.metaTitle || undefined,
        post.metaDescription || undefined
      );

      // Mettre à jour le post
      await prisma.post.update({
        where: { id: articleId },
        data: {
          seoScore: score.overallScore,
          seoFeedback: JSON.parse(JSON.stringify(score)),
          readabilityScore: score.readability.fleschKincaid,
        },
      });

      return score;
    }) as { success: boolean; data?: ContentOptimizationScore; error?: string };
  } catch (error) {
    console.error("Score article error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📚 CRUD ARTICLES
// ═══════════════════════════════════════════════════════════════════════════

const listArticlesSchema = z.object({
  workspaceId: z.string().min(1),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "FAILED"]).optional(),
  keyword: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "title", "seoScore"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.number().int().min(1).optional().default(1),
  perPage: z.number().int().min(1).max(100).optional().default(20),
});

export async function listArticles(
  input: z.input<typeof listArticlesSchema>
): Promise<{ success: boolean; data?: PaginatedResponse<unknown>; error?: string }> {
  try {
    const session = await requireAuth();
    const parsed = listArticlesSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Paramètres invalides" };
    }

    const { workspaceId, status, keyword, dateFrom, dateTo, sortBy, sortOrder, page, perPage } = parsed.data;
    await requireWorkspace(workspaceId, session.user!.id!);

    const where = {
      workspaceId,
      type: "SEO_ARTICLE" as const,
      deletedAt: null,
      ...(status ? { status: status as "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED" } : {}),
      ...(keyword ? { keywords: { has: keyword } } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const [articles, total] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { [sortBy!]: sortOrder },
        skip: (page! - 1) * perPage!,
        take: perPage,
        select: {
          id: true,
          title: true,
          excerpt: true,
          keywords: true,
          status: true,
          seoScore: true,
          readabilityScore: true,
          wordCount: true,
          imageUrl: true,
          metaTitle: true,
          publishedAt: true,
          scheduledAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.post.count({ where }),
    ]);

    return {
      success: true,
      data: {
        items: articles,
        total,
        page: page!,
        perPage: perPage!,
        totalPages: Math.ceil(total / perPage!),
      },
    };
  } catch (error) {
    console.error("List articles error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function getArticle(
  workspaceId: string,
  articleId: string
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const article = await prisma.post.findFirst({
      where: { id: articleId, workspaceId, deletedAt: null },
    });

    if (!article) {
      return { success: false, error: "Article non trouvé" };
    }

    return { success: true, data: article };
  } catch (error) {
    console.error("Get article error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

const updateArticleSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(170).optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED"]).optional(),
  scheduledAt: z.string().datetime().optional(),
});

export async function updateArticle(
  workspaceId: string,
  articleId: string,
  data: z.input<typeof updateArticleSchema>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const parsed = updateArticleSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: "Données invalides" };
    }

    const updateData: Record<string, unknown> = { ...parsed.data };

    // Si le contenu change, recalculer les métriques
    if (parsed.data.content) {
      const { scoreArticleContent } = await import("@/lib/seo/content-optimizer");
      const post = await prisma.post.findFirst({
        where: { id: articleId, workspaceId, deletedAt: null },
        select: { keywords: true, metaTitle: true, metaDescription: true },
      });
      if (post) {
        const keyword = post.keywords[0] || "";
        const score = scoreArticleContent(
          parsed.data.content,
          keyword,
          parsed.data.metaTitle || post.metaTitle || undefined,
          parsed.data.metaDescription || post.metaDescription || undefined
        );
        updateData.wordCount = score.contentLength.wordCount;
        updateData.seoScore = score.overallScore;
        updateData.readabilityScore = score.readability.fleschKincaid;
        updateData.seoFeedback = JSON.parse(JSON.stringify(score));
      }
    }

    if (parsed.data.scheduledAt) {
      updateData.scheduledAt = new Date(parsed.data.scheduledAt);
    }

    const article = await prisma.post.update({
      where: { id: articleId, workspaceId },
      data: updateData,
    });

    return { success: true, data: article };
  } catch (error) {
    console.error("Update article error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function deleteArticle(
  workspaceId: string,
  articleId: string,
  hard: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    if (hard) {
      await prisma.post.delete({
        where: { id: articleId, workspaceId },
      });
    } else {
      await prisma.post.update({
        where: { id: articleId, workspaceId },
        data: { deletedAt: new Date() },
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Delete article error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function duplicateArticle(
  workspaceId: string,
  articleId: string
): Promise<{ success: boolean; data?: { id: string; title: string }; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const original = await prisma.post.findFirst({
      where: { id: articleId, workspaceId, deletedAt: null },
    });
    if (!original) {
      return { success: false, error: "Article non trouvé" };
    }

    const toJson = (val: unknown) =>
      val == null ? undefined : JSON.parse(JSON.stringify(val));

    const copy = await prisma.post.create({
      data: {
        type: original.type,
        title: (original.title || "Article") + " (copie)",
        content: original.content,
        excerpt: original.excerpt,
        imageUrl: original.imageUrl,
        keywords: original.keywords,
        sources: toJson(original.sources),
        metaTitle: original.metaTitle,
        metaDescription: original.metaDescription,
        outline: toJson(original.outline),
        readabilityScore: original.readabilityScore,
        seoScore: original.seoScore,
        seoFeedback: toJson(original.seoFeedback),
        faqContent: toJson(original.faqContent),
        tableOfContents: toJson(original.tableOfContents),
        wordCount: original.wordCount,
        status: "DRAFT",
        workspaceId,
      },
    });

    return { success: true, data: { id: copy.id, title: copy.title || "" } };
  } catch (error) {
    console.error("Duplicate article error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function exportArticle(
  workspaceId: string,
  articleId: string,
  format: "html" | "markdown" = "markdown"
): Promise<{ success: boolean; data?: { content: string; filename: string }; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const post = await prisma.post.findFirst({
      where: { id: articleId, workspaceId, deletedAt: null },
    });
    if (!post) {
      return { success: false, error: "Article non trouvé" };
    }

    const slug = (post.title || "article")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");

    if (format === "markdown") {
      return {
        success: true,
        data: { content: post.content, filename: `${slug}.md` },
      };
    }

    // Conversion Markdown → HTML basique
    let html = post.content;
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");
    html = html.replace(/\n\n/g, "</p><p>");
    html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.metaTitle || post.title || ""}</title>
  <meta name="description" content="${post.metaDescription || post.excerpt || ""}">
</head>
<body>
  <article><p>${html}</p></article>
</body>
</html>`;

    return {
      success: true,
      data: { content: html, filename: `${slug}.html` },
    };
  } catch (error) {
    console.error("Export article error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 BULK GENERATION - CONTRÔLES
// ═══════════════════════════════════════════════════════════════════════════

export async function getBatchJobProgress(
  batchJobId: string
): Promise<{
  success: boolean;
  data?: {
    status: string;
    totalItems: number;
    completed: number;
    failed: number;
    itemStatuses: Record<string, string> | null;
    posts: Array<{ id: string; title: string | null; seoScore: number | null }>;
    startedAt: Date | null;
    estimatedCompletion: Date | null;
  };
  error?: string;
}> {
  try {
    const session = await requireAuth();

    const job = await prisma.batchJob.findFirst({
      where: {
        id: batchJobId,
        workspace: { userId: session.user!.id! },
      },
      include: {
        posts: {
          select: { id: true, title: true, seoScore: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!job) {
      return { success: false, error: "Batch job non trouvé" };
    }

    // Estimation du temps restant
    let estimatedCompletion: Date | null = null;
    if (job.startedAt && job.completed > 0 && job.status === "RUNNING") {
      const elapsed = Date.now() - job.startedAt.getTime();
      const avgPerItem = elapsed / job.completed;
      const remaining = (job.totalItems - job.completed - job.failed) * avgPerItem;
      estimatedCompletion = new Date(Date.now() + remaining);
    }

    return {
      success: true,
      data: {
        status: job.status,
        totalItems: job.totalItems,
        completed: job.completed,
        failed: job.failed,
        itemStatuses: job.itemStatuses as Record<string, string> | null,
        posts: job.posts,
        startedAt: job.startedAt,
        estimatedCompletion,
      },
    };
  } catch (error) {
    console.error("Batch progress error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function cancelBulkGeneration(
  workspaceId: string,
  batchJobId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await prisma.batchJob.update({
      where: { id: batchJobId, workspaceId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    return { success: true };
  } catch (error) {
    console.error("Cancel bulk error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function pauseBulkGeneration(
  workspaceId: string,
  batchJobId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await prisma.batchJob.update({
      where: { id: batchJobId, workspaceId },
      data: { status: "PAUSED" },
    });

    return { success: true };
  } catch (error) {
    console.error("Pause bulk error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function resumeBulkGeneration(
  workspaceId: string,
  batchJobId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await prisma.batchJob.update({
      where: { id: batchJobId, workspaceId },
      data: { status: "RUNNING" },
    });

    return { success: true };
  } catch (error) {
    console.error("Resume bulk error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SEO INTELLIGENCE - Analyse complète et stratégie
// ═══════════════════════════════════════════════════════════════════════════

export async function runSEOIntelligence(
  workspaceId: string,
  url: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const urlSchema = z.string().url();
    const parsed = urlSchema.safeParse(url);
    if (!parsed.success) {
      return { success: false, error: "URL invalide" };
    }

    return await withCredits("seo_intelligence", workspaceId, async () => {
      const { runSEOIntelligence: runIntelligence } = await import("@/lib/seo/discovery");
      const result = await runIntelligence(url, workspaceId);
      return result.data;
    }) as { success: boolean; data?: any; error?: string };
  } catch (error) {
    console.error("SEO Intelligence error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function getSEOIntelligenceReport(
  workspaceId: string,
  auditId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const audit = await prisma.sEOAudit.findFirst({
      where: {
        id: auditId,
        workspaceId,
      },
    });

    if (!audit) {
      return { success: false, error: "Rapport non trouvé" };
    }

    return { success: true, data: audit };
  } catch (error) {
    console.error("Get SEO Intelligence report error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function getLatestAudit(
  workspaceId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const { getLatestSEOAudit } = await import("@/lib/seo/audit-helpers");
    const audit = await getLatestSEOAudit(workspaceId);

    if (!audit) {
      return { success: false, error: "Aucun audit trouvé" };
    }

    return { success: true, data: audit };
  } catch (error) {
    console.error("Get latest audit error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 SEO DATA INTELLIGENCE - Métriques réelles (DataForSEO / Serper)
// ═══════════════════════════════════════════════════════════════════════════

import type {
  KeywordMetrics,
  CompetitorDomainAnalysis,
  ContentGapResult,
  DomainAuthorityResult,
  ContentBrief,
} from "@/types/intelligence";

export async function getKeywordIntelligence(
  workspaceId: string,
  keyword: string
): Promise<{ success: boolean; data?: KeywordMetrics; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const kwSchema = z.string().min(2).max(200);
    const parsed = kwSchema.safeParse(keyword);
    if (!parsed.success) {
      return { success: false, error: "Mot-clé invalide (2-200 caractères)" };
    }

    return await withCredits("seo_keyword_intelligence", workspaceId, async () => {
      const { getKeywordMetrics } = await import("@/lib/seo/intelligence");
      return await getKeywordMetrics(keyword, workspaceId);
    }) as { success: boolean; data?: KeywordMetrics; error?: string };
  } catch (error) {
    console.error("Keyword intelligence error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function analyzeCompetitor(
  workspaceId: string,
  domain: string
): Promise<{ success: boolean; data?: CompetitorDomainAnalysis; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const domainSchema = z.string().min(3).max(253);
    const parsed = domainSchema.safeParse(domain);
    if (!parsed.success) {
      return { success: false, error: "Domaine invalide" };
    }

    return await withCredits("seo_competitor_analysis", workspaceId, async () => {
      const { analyzeCompetitorDomain } = await import("@/lib/seo/intelligence");
      return await analyzeCompetitorDomain(domain, workspaceId);
    }) as { success: boolean; data?: CompetitorDomainAnalysis; error?: string };
  } catch (error) {
    console.error("Competitor analysis error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function getContentGap(
  workspaceId: string,
  userDomain: string,
  competitorDomains: string[]
): Promise<{ success: boolean; data?: ContentGapResult; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const schema = z.object({
      userDomain: z.string().min(3),
      competitorDomains: z.array(z.string().min(3)).min(1).max(5),
    });
    const parsed = schema.safeParse({ userDomain, competitorDomains });
    if (!parsed.success) {
      return { success: false, error: "Paramètres invalides. 1 à 5 domaines concurrents requis." };
    }

    return await withCredits("seo_content_gap", workspaceId, async () => {
      const { calculateContentGap } = await import("@/lib/seo/intelligence");
      return await calculateContentGap(userDomain, competitorDomains, workspaceId);
    }) as { success: boolean; data?: ContentGapResult; error?: string };
  } catch (error) {
    console.error("Content gap error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function getDomainAuthorityAction(
  workspaceId: string,
  domain: string
): Promise<{ success: boolean; data?: DomainAuthorityResult; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const domainSchema = z.string().min(3).max(253);
    const parsed = domainSchema.safeParse(domain);
    if (!parsed.success) {
      return { success: false, error: "Domaine invalide" };
    }

    return await withCredits("seo_domain_authority", workspaceId, async () => {
      const { getDomainAuthority } = await import("@/lib/seo/intelligence");
      return await getDomainAuthority(domain, workspaceId);
    }) as { success: boolean; data?: DomainAuthorityResult; error?: string };
  } catch (error) {
    console.error("Domain authority error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}

export async function generateContentBrief(
  workspaceId: string,
  keyword: string
): Promise<{ success: boolean; data?: ContentBrief; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const kwSchema = z.string().min(2).max(200);
    const parsed = kwSchema.safeParse(keyword);
    if (!parsed.success) {
      return { success: false, error: "Mot-clé invalide (2-200 caractères)" };
    }

    return await withCredits("seo_content_brief", workspaceId, async () => {
      const { prepareContentBrief } = await import("@/lib/seo/intelligence");
      return await prepareContentBrief(keyword, workspaceId);
    }) as { success: boolean; data?: ContentBrief; error?: string };
  } catch (error) {
    console.error("Content brief error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Une erreur est survenue" };
  }
}
