/**
 * 🏆 Comparaison Concurrentielle SEO
 *
 * Compare l'audit d'une page avec les top résultats Google
 * pour le même mot-clé.
 */

import * as cheerio from "cheerio";
import { searchCompetitorContent } from "@/lib/ai/serper";
import { runTechnicalAnalysis } from "./technical-analyzer";
import type { CompetitorComparison, EnhancedSEOAuditReport } from "@/types/seo";

interface CompetitorPageData {
  url: string;
  domain: string;
  title: string;
  score: number;
  wordCount: number;
  headingCount: number;
  imageCount: number;
  internalLinks: number;
  externalLinks: number;
  hasStructuredData: boolean;
  hasOpenGraph: boolean;
}

async function analyzeCompetitorPage(
  url: string
): Promise<CompetitorPageData | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Skalle/1.0)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);
    const domain = new URL(url).hostname;

    // Analyse technique rapide
    const technical = runTechnicalAnalysis($, url, html);

    // Contenu
    const contentCopy = cheerio.load(html);
    contentCopy("script, style, nav, header, footer, aside").remove();
    const bodyText = contentCopy("body").text().replace(/\s+/g, " ").trim();
    const wordCount = bodyText.split(" ").filter((w) => w.length > 2).length;

    // Headings
    const headingCount =
      $("h1").length + $("h2").length + $("h3").length;

    // Images
    const imageCount = $("img").length;

    // Liens
    let internalLinks = 0;
    let externalLinks = 0;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.startsWith("/") || href.includes(domain)) {
        internalLinks++;
      } else if (href.startsWith("http")) {
        externalLinks++;
      }
    });

    // Score simplifié basé sur les métriques
    let score = 50;
    if (wordCount > 1500) score += 15;
    else if (wordCount > 800) score += 8;
    if (headingCount > 5) score += 10;
    else if (headingCount > 2) score += 5;
    if (technical.structuredData.hasJsonLd) score += 10;
    if (technical.openGraph.title) score += 5;
    if (technical.ssl) score += 5;
    if (technical.mobileViewport) score += 5;
    score = Math.min(100, score);

    return {
      url,
      domain,
      title: $("title").text().trim() || domain,
      score,
      wordCount,
      headingCount,
      imageCount,
      internalLinks,
      externalLinks,
      hasStructuredData: technical.structuredData.hasJsonLd,
      hasOpenGraph: !!technical.openGraph.title,
    };
  } catch (error) {
    console.error(`Error analyzing competitor ${url}:`, error);
    return null;
  }
}

export async function compareWithCompetitors(
  auditReport: EnhancedSEOAuditReport,
  keyword: string,
  topN: number = 3
): Promise<CompetitorComparison> {
  // Rechercher les concurrents
  const searchResults = await searchCompetitorContent(keyword);
  const topUrls = searchResults.slice(0, topN).map((r) => r.link);

  // Analyser en parallèle
  const competitorResults = await Promise.allSettled(
    topUrls.map((url) => analyzeCompetitorPage(url))
  );

  const competitors: CompetitorPageData[] = competitorResults
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((r): r is CompetitorPageData => r !== null);

  if (competitors.length === 0) {
    return {
      competitors: [],
      averageScore: 0,
      yourScore: auditReport.score,
      scoreDelta: 0,
      strengths: [],
      weaknesses: [],
    };
  }

  // Calculer les moyennes
  const avgScore =
    competitors.reduce((s, c) => s + c.score, 0) / competitors.length;
  const avgWordCount =
    competitors.reduce((s, c) => s + c.wordCount, 0) / competitors.length;
  const avgHeadings =
    competitors.reduce((s, c) => s + c.headingCount, 0) / competitors.length;
  const avgImages =
    competitors.reduce((s, c) => s + c.imageCount, 0) / competitors.length;
  const avgInternalLinks =
    competitors.reduce((s, c) => s + c.internalLinks, 0) / competitors.length;

  // Identifier forces et faiblesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (auditReport.content.wordCount > avgWordCount * 1.2) {
    strengths.push(
      `Contenu plus riche (${auditReport.content.wordCount} vs ${Math.round(avgWordCount)} mots en moyenne)`
    );
  } else if (auditReport.content.wordCount < avgWordCount * 0.8) {
    weaknesses.push(
      `Contenu plus court que la concurrence (${auditReport.content.wordCount} vs ${Math.round(avgWordCount)} mots)`
    );
  }

  const totalHeadings =
    auditReport.headings.h1Count +
    auditReport.headings.h2Count +
    auditReport.headings.h3Count;
  if (totalHeadings > avgHeadings) {
    strengths.push("Meilleure structure de titres que la concurrence");
  } else if (totalHeadings < avgHeadings * 0.5) {
    weaknesses.push("Moins de sous-titres que les concurrents");
  }

  if (auditReport.images.total > avgImages) {
    strengths.push("Plus d'images que la moyenne des concurrents");
  } else if (auditReport.images.total < avgImages * 0.5 && avgImages > 2) {
    weaknesses.push("Moins d'images que les concurrents");
  }

  if (auditReport.links.internal > avgInternalLinks) {
    strengths.push("Bon maillage interne par rapport aux concurrents");
  } else if (auditReport.links.internal < avgInternalLinks * 0.5) {
    weaknesses.push("Maillage interne plus faible que la concurrence");
  }

  if (auditReport.technical.structuredData.hasJsonLd) {
    const competitorsWithSD = competitors.filter(
      (c) => c.hasStructuredData
    ).length;
    if (competitorsWithSD < competitors.length / 2) {
      strengths.push(
        "Données structurées présentes (avantage sur certains concurrents)"
      );
    }
  } else {
    const competitorsWithSD = competitors.filter(
      (c) => c.hasStructuredData
    ).length;
    if (competitorsWithSD > 0) {
      weaknesses.push(
        "Pas de données structurées alors que des concurrents en ont"
      );
    }
  }

  return {
    competitors,
    averageScore: Math.round(avgScore),
    yourScore: auditReport.score,
    scoreDelta: Math.round(auditReport.score - avgScore),
    strengths,
    weaknesses,
  };
}
