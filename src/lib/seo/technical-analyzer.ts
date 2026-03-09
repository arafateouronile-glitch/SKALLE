/**
 * 🔧 Analyseur Technique SEO
 *
 * Fonctions pures qui analysent le HTML via cheerio
 * pour extraire les métriques techniques SEO.
 */

import * as cheerio from "cheerio";
import type { TechnicalSEOReport } from "@/types/seo";

type CheerioAPI = ReturnType<typeof cheerio.load>;

interface ResponseHeaders {
  get(name: string): string | null;
}

export function analyzeRobotsMeta(
  $: CheerioAPI,
  headers?: ResponseHeaders
): TechnicalSEOReport["robotsMeta"] {
  const robotsMeta = $('meta[name="robots"]').attr("content") || null;
  const xRobotsTag = headers?.get("x-robots-tag") || null;
  const raw = robotsMeta || xRobotsTag;

  let index = true;
  let follow = true;

  if (raw) {
    const lower = raw.toLowerCase();
    if (lower.includes("noindex")) index = false;
    if (lower.includes("nofollow")) follow = false;
  }

  return { index, follow, raw };
}

export function analyzeCanonical(
  $: CheerioAPI,
  pageUrl: string
): TechnicalSEOReport["canonical"] {
  const canonical = $('link[rel="canonical"]').attr("href") || null;
  let isSelfReferencing = false;

  if (canonical) {
    try {
      const canonicalUrl = new URL(canonical, pageUrl);
      const currentUrl = new URL(pageUrl);
      isSelfReferencing =
        canonicalUrl.origin + canonicalUrl.pathname ===
        currentUrl.origin + currentUrl.pathname;
    } catch {
      // URL invalide
    }
  }

  return { url: canonical, isSelfReferencing };
}

export function analyzeSSL(url: string): boolean {
  return url.startsWith("https://");
}

export function analyzeMobileViewport($: CheerioAPI): boolean {
  const viewport = $('meta[name="viewport"]').attr("content");
  return !!viewport && viewport.includes("width=");
}

export function analyzePageSpeed(
  $: CheerioAPI,
  html: string
): TechnicalSEOReport["pageSpeedHeuristics"] {
  const domSize = $("*").length;
  const scriptCount = $("script[src]").length;
  const stylesheetCount = $('link[rel="stylesheet"]').length;
  const resourceCount = scriptCount + stylesheetCount + $("img").length;

  // Taille des styles inline
  let inlineStyleSize = 0;
  $("style").each((_: number, el: any) => {
    inlineStyleSize += $(el).text().length;
  });
  $("[style]").each((_: number, el: any) => {
    inlineStyleSize += ($(el).attr("style") || "").length;
  });

  // Heuristique de performance basée sur le DOM
  let estimatedScore: "fast" | "moderate" | "slow" = "fast";
  if (domSize > 3000 || resourceCount > 100 || html.length > 500000) {
    estimatedScore = "slow";
  } else if (domSize > 1500 || resourceCount > 50 || html.length > 200000) {
    estimatedScore = "moderate";
  }

  return {
    domSize,
    resourceCount,
    scriptCount,
    stylesheetCount,
    inlineStyleSize,
    estimatedScore,
  };
}

export function analyzeStructuredData(
  $: CheerioAPI
): TechnicalSEOReport["structuredData"] {
  const jsonLdScripts: unknown[] = [];
  const types: string[] = [];

  $('script[type="application/ld+json"]').each((_: number, el: any) => {
    try {
      const data = JSON.parse($(el).text());
      jsonLdScripts.push(data);
      if (data["@type"]) {
        types.push(
          Array.isArray(data["@type"]) ? data["@type"].join(", ") : data["@type"]
        );
      }
    } catch {
      // JSON invalide, on ignore
    }
  });

  return {
    hasJsonLd: jsonLdScripts.length > 0,
    types,
    raw: jsonLdScripts,
  };
}

export function analyzeOpenGraph(
  $: CheerioAPI
): TechnicalSEOReport["openGraph"] {
  return {
    title: $('meta[property="og:title"]').attr("content") || null,
    description: $('meta[property="og:description"]').attr("content") || null,
    image: $('meta[property="og:image"]').attr("content") || null,
    type: $('meta[property="og:type"]').attr("content") || null,
    url: $('meta[property="og:url"]').attr("content") || null,
  };
}

export function analyzeTwitterCards(
  $: CheerioAPI
): TechnicalSEOReport["twitterCards"] {
  return {
    card: $('meta[name="twitter:card"]').attr("content") || null,
    title: $('meta[name="twitter:title"]').attr("content") || null,
    description:
      $('meta[name="twitter:description"]').attr("content") || null,
    image: $('meta[name="twitter:image"]').attr("content") || null,
  };
}

export function analyzeHreflang($: CheerioAPI): string[] {
  const hreflangs: string[] = [];
  $('link[rel="alternate"][hreflang]').each((_: number, el: any) => {
    const lang = $(el).attr("hreflang");
    if (lang) hreflangs.push(lang);
  });
  return hreflangs;
}

/**
 * Orchestre toutes les analyses techniques et retourne un rapport complet avec score.
 */
export function runTechnicalAnalysis(
  $: CheerioAPI,
  url: string,
  html: string,
  headers?: ResponseHeaders
): TechnicalSEOReport {
  const robotsMeta = analyzeRobotsMeta($, headers);
  const canonical = analyzeCanonical($, url);
  const ssl = analyzeSSL(url);
  const mobileViewport = analyzeMobileViewport($);
  const pageSpeedHeuristics = analyzePageSpeed($, html);
  const structuredData = analyzeStructuredData($);
  const openGraph = analyzeOpenGraph($);
  const twitterCards = analyzeTwitterCards($);
  const hreflang = analyzeHreflang($);

  // Scoring technique
  const issues: string[] = [];
  let score = 100;

  // Robots
  if (!robotsMeta.index) {
    issues.push("La page est marquée noindex - elle ne sera pas indexée");
    score -= 30;
  }
  if (!robotsMeta.follow) {
    issues.push("La page est marquée nofollow");
    score -= 10;
  }

  // Canonical
  if (!canonical.url) {
    issues.push("Aucune balise canonical trouvée");
    score -= 10;
  } else if (!canonical.isSelfReferencing) {
    issues.push("La canonical pointe vers une autre page");
    score -= 5;
  }

  // SSL
  if (!ssl) {
    issues.push("La page n'utilise pas HTTPS");
    score -= 15;
  }

  // Mobile
  if (!mobileViewport) {
    issues.push("Pas de meta viewport - problème mobile");
    score -= 15;
  }

  // Performance
  if (pageSpeedHeuristics.estimatedScore === "slow") {
    issues.push(
      `DOM trop lourd (${pageSpeedHeuristics.domSize} éléments, ${pageSpeedHeuristics.resourceCount} ressources)`
    );
    score -= 10;
  } else if (pageSpeedHeuristics.estimatedScore === "moderate") {
    issues.push(
      `DOM modéré (${pageSpeedHeuristics.domSize} éléments) - optimisations possibles`
    );
    score -= 5;
  }

  // Structured Data
  if (!structuredData.hasJsonLd) {
    issues.push("Aucun schema.org / JSON-LD détecté");
    score -= 10;
  }

  // Open Graph
  if (!openGraph.title || !openGraph.description || !openGraph.image) {
    const missing: string[] = [];
    if (!openGraph.title) missing.push("og:title");
    if (!openGraph.description) missing.push("og:description");
    if (!openGraph.image) missing.push("og:image");
    issues.push(`Balises Open Graph manquantes : ${missing.join(", ")}`);
    score -= 5;
  }

  // Twitter Cards
  if (!twitterCards.card) {
    issues.push("Pas de Twitter Card configurée");
    score -= 3;
  }

  return {
    robotsMeta,
    canonical,
    ssl,
    mobileViewport,
    pageSpeedHeuristics,
    structuredData,
    openGraph,
    twitterCards,
    hreflang,
    score: Math.max(0, score),
    issues,
  };
}
