/**
 * 🔍 SEO Discovery & Competitive Intelligence Service
 * 
 * Module d'intelligence SEO complet pour :
 * 1. Scraping et analyse du site utilisateur
 * 2. Extraction de mots-clés et intentions
 * 3. Analyse concurrentielle (SERP)
 * 4. Audit de différentiel (Gap Analysis)
 * 5. Plan d'action opérationnel
 */

import * as cheerio from "cheerio";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { searchGoogleFull, searchGoogle } from "@/lib/ai/serper";
import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UserSiteAnalysis {
  url: string;
  domain: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  h2s: string[];
  mainContent: string;
  theme: string; // Thématique principale résumée par IA
  intentKeywords: string[]; // 10 mots-clés "intentions" extraits
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
}

export interface CompetitorData {
  domain: string;
  title: string;
  snippet: string;
  position: number;
  url: string;
}

export interface MarketInsight {
  keyword: string;
  competitors: CompetitorData[];
  topDomains: string[]; // Domaines récurrents dans la SERP
  difficulty: "easy" | "medium" | "hard";
  volumeEstimate: "low" | "medium" | "high";
  serpFeatures: {
    featuredSnippet: boolean;
    knowledgePanel: boolean;
    videoResults: boolean;
  };
}

export interface CompetitorAnalysis {
  domain: string;
  strengths: string[];
  weaknesses: string[];
  contentLength: number | null;
  headingCount: number | null;
  imageCount: number | null;
  internalLinks: number | null;
  externalLinks: number | null;
  hasStructuredData: boolean;
  hasOpenGraph: boolean;
  authorityScore: number; // 0-100 (heuristique basée sur position SERP)
}

export interface SEOStrategy {
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  quickWins: Array<{
    keyword: string;
    difficulty: "easy" | "medium" | "hard";
    opportunity: string;
    estimatedImpact: number; // 1-5
  }>;
  semanticGaps: Array<{
    topic: string;
    competitors: string[];
    recommendation: string;
  }>;
  technicalActions: Array<{
    priority: "high" | "medium" | "low";
    action: string;
    description: string;
    estimatedImpact: number; // 1-5
  }>;
  internalLinkingStrategy: {
    priorityPages: string[];
    suggestedStructure: string;
    hubPages: string[];
  };
}

export interface SEOIntelligenceReport {
  userSite: UserSiteAnalysis;
  marketInsights: MarketInsight[];
  competitorAnalysis: CompetitorAnalysis[];
  strategy: SEOStrategy;
  recommendations: {
    technical: Array<{
      priority: "high" | "medium" | "low";
      action: string;
      description: string;
      example?: string;
    }>;
    content: Array<{
      keyword: string;
      opportunity: string;
      estimatedImpact: number;
    }>;
    semantic: Array<{
      topic: string;
      gap: string;
      recommendation: string;
    }>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SCRAPER DE DIAGNOSTIC (User Site)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyse complète du site utilisateur
 * 
 * Extrait : Title, Meta-description, H1, H2, texte principal
 * Utilise GPT-4o pour résumer la thématique et extraire 10 mots-clés "intentions"
 */
export async function analyzeUserSite(url: string): Promise<UserSiteAnalysis> {
  console.log(`[SEO Discovery] Scraping du site utilisateur: ${url}`);

  // Fetch la page
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Skalle/1.0; SEO Intelligence)",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Impossible d'accéder à la page: ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const domain = new URL(url).hostname;

  // Extraire les éléments SEO
  const title = $("title").text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr("content") || null;
  const h1 = $("h1").first().text().trim() || null;
  const h2s = $("h2")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((text) => text.length > 0);

  // Nettoyer le contenu principal (retirer scripts, styles, nav, etc.)
  $("script, style, nav, header, footer, aside, .menu, .sidebar").remove();
  const mainContent = $("body").text().replace(/\s+/g, " ").trim();

  // Compter les liens
  const allLinks = $("a[href]");
  let internalLinks = 0;
  let externalLinks = 0;
  allLinks.each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.startsWith("/") || href.includes(domain)) {
      internalLinks++;
    } else if (href.startsWith("http")) {
      externalLinks++;
    }
  });

  const wordCount = mainContent.split(" ").filter((w) => w.length > 2).length;

  // Utiliser GPT-4o pour analyser la thématique et extraire les mots-clés d'intention
  console.log(`[SEO Discovery] Analyse IA de la thématique et extraction de mots-clés...`);

  const analysisPrompt = `
Analyse ce site web et extrais les informations suivantes :

**CONTENU DU SITE:**
URL: ${url}
Titre: ${title || "Non spécifié"}
Meta Description: ${metaDescription || "Non spécifiée"}
H1: ${h1 || "Non spécifié"}
H2: ${h2s.slice(0, 10).join(", ") || "Aucun"}
Contenu principal (extrait): ${mainContent.substring(0, 2000)}...

**TÂCHES:**
1. Résume la thématique principale du site en 1-2 phrases (ce que le site vend/explique).
2. Extrais 10 mots-clés "intentions" qui représentent ce sur quoi le site essaie de se positionner.
   - Ces mots-clés doivent refléter l'intention de recherche des visiteurs cibles
   - Inclus des variations (longue traîne, questions, etc.)
   - Priorise les mots-clés avec fort potentiel commercial ou informationnel

**SORTIE JSON:**
{
  "theme": "Résumé de la thématique principale",
  "intentKeywords": ["mot-clé 1", "mot-clé 2", ..., "mot-clé 10"]
}

IMPORTANT: Retourne UNIQUEMENT le JSON, pas de texte avant ou après.
`;

  try {
    const claude = getClaude();
    const parser = getStringParser();
    const chain = claude.pipe(parser);
    const aiResponse = await chain.invoke(analysisPrompt);

    // Parser la réponse JSON
    let theme = "Site web non analysé";
    let intentKeywords: string[] = [];

    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        theme = parsed.theme || theme;
        intentKeywords = parsed.intentKeywords || [];
      }
    } catch (error) {
      console.error("[SEO Discovery] Erreur parsing JSON IA:", error);
      // Fallback: extraire les mots-clés manuellement depuis le contenu
      const words = mainContent
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .filter((w) => !["dans", "pour", "avec", "sont", "cette", "comme"].includes(w));
      intentKeywords = [...new Set(words)].slice(0, 10);
    }

    console.log(`[SEO Discovery] ✅ Analyse terminée: ${intentKeywords.length} mots-clés extraits`);

    return {
      url,
      domain,
      title,
      metaDescription,
      h1,
      h2s,
      mainContent: mainContent.substring(0, 10000), // Limiter à 10k caractères
      theme,
      intentKeywords,
      wordCount,
      internalLinks,
      externalLinks,
    };
  } catch (error) {
    console.error("[SEO Discovery] Erreur lors de l'analyse IA:", error);
    // Fallback sans IA
    return {
      url,
      domain,
      title,
      metaDescription,
      h1,
      h2s,
      mainContent: mainContent.substring(0, 10000),
      theme: "Thématique non analysée (erreur IA)",
      intentKeywords: [],
      wordCount,
      internalLinks,
      externalLinks,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. RECHERCHE DE MOTS-CLÉS & CONCURRENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyse du marché pour chaque mot-clé
 * 
 * Pour chaque mot-clé :
 * - Récupère les 10 premiers résultats SERP via Serper.dev
 * - Identifie les domaines récurrents (concurrents directs)
 * - Analyse la difficulté et le volume estimé
 */
export async function getMarketInsights(
  keywords: string[]
): Promise<MarketInsight[]> {
  console.log(`[SEO Discovery] Analyse du marché pour ${keywords.length} mots-clés...`);

  const insights: MarketInsight[] = [];

  for (const keyword of keywords) {
    try {
      console.log(`[SEO Discovery] Recherche SERP pour: "${keyword}"`);

      const serpData = await searchGoogleFull(keyword, 10);
      const organic = serpData.organic || [];

      // Identifier les domaines récurrents
      const domainCounts: Record<string, number> = {};
      organic.forEach((result) => {
        try {
          const domain = new URL(result.link).hostname.replace("www.", "");
          domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        } catch {
          // Ignorer les URLs invalides
        }
      });

      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain]) => domain);

      // Analyser la difficulté (basée sur les grandes marques)
      const bigBrands = [
        "wikipedia.org",
        "amazon.fr",
        "fnac.com",
        "lemonde.fr",
        "lefigaro.fr",
        "bfmtv.com",
        "youtube.com",
        "facebook.com",
      ];
      const brandCount = organic.filter((r) =>
        bigBrands.some((b) => r.link.includes(b))
      ).length;

      let difficulty: "easy" | "medium" | "hard" = "easy";
      if (brandCount >= 4) difficulty = "hard";
      else if (brandCount >= 2) difficulty = "medium";

      // Estimation du volume (heuristique)
      let volumeEstimate: "low" | "medium" | "high" = "medium";
      if (keyword.split(" ").length >= 4) volumeEstimate = "low";
      else if (keyword.split(" ").length <= 2 && organic.length >= 10)
        volumeEstimate = "high";

      // Features SERP
      const serpFeatures = {
        featuredSnippet: !!serpData.answerBox,
        knowledgePanel: !!serpData.knowledgeGraph,
        videoResults: organic.some((r) => r.link.includes("youtube.com")),
      };

      // Mapper les résultats en CompetitorData
      const competitors: CompetitorData[] = organic.map((result) => ({
        domain: new URL(result.link).hostname.replace("www.", ""),
        title: result.title,
        snippet: result.snippet,
        position: result.position || 0,
        url: result.link,
      }));

      insights.push({
        keyword,
        competitors,
        topDomains,
        difficulty,
        volumeEstimate,
        serpFeatures,
      });

      console.log(`[SEO Discovery] ✅ "${keyword}": ${competitors.length} concurrents identifiés`);
    } catch (error) {
      console.error(`[SEO Discovery] Erreur pour "${keyword}":`, error);
      // Continuer avec les autres mots-clés
    }
  }

  console.log(`[SEO Discovery] ✅ Analyse du marché terminée: ${insights.length} insights générés`);

  return insights;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ANALYSE DE POSITIONNEMENT (SWOT SEO)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyse SWOT SEO complète
 * 
 * Compare le site utilisateur aux leaders de la SERP
 * Identifie forces/faiblesses, opportunités, gaps sémantiques
 */
export async function generateSeoStrategy(
  userData: UserSiteAnalysis,
  competitorsData: CompetitorAnalysis[],
  marketInsights: MarketInsight[]
): Promise<SEOStrategy> {
  console.log(`[SEO Discovery] Génération de la stratégie SEO SWOT...`);

  // Préparer les données pour l'IA
  const competitorsSummary = competitorsData
    .slice(0, 5)
    .map((c) => ({
      domain: c.domain,
      strengths: c.strengths.slice(0, 3).join(", "),
      weaknesses: c.weaknesses.slice(0, 3).join(", "),
      authorityScore: c.authorityScore,
    }));

  const quickWinsData = marketInsights
    .filter((m) => m.difficulty === "easy" || m.difficulty === "medium")
    .slice(0, 10)
    .map((m) => ({
      keyword: m.keyword,
      difficulty: m.difficulty,
      topCompetitor: m.competitors[0]?.domain || "N/A",
    }));

  const prompt = `
Tu es un expert SEO senior. Analyse cette situation et génère une stratégie SEO complète.

**SITE UTILISATEUR:**
- URL: ${userData.url}
- Thématique: ${userData.theme}
- Titre: ${userData.title || "Non optimisé"}
- Meta Description: ${userData.metaDescription || "Manquante"}
- H1: ${userData.h1 || "Manquant"}
- Mots-clés cibles: ${userData.intentKeywords.join(", ")}
- Contenu: ${userData.wordCount} mots
- Liens internes: ${userData.internalLinks}
- Liens externes: ${userData.externalLinks}

**CONCURRENTS ANALYSÉS (Top 5):**
${competitorsSummary.map((c, i) => `
${i + 1}. ${c.domain} (Autorité: ${c.authorityScore}/100)
   - Forces: ${c.strengths}
   - Faiblesses: ${c.weaknesses}
`).join("\n")}

**OPPORTUNITÉS DE MOTS-CLÉS (Quick Wins):**
${quickWinsData.map((q) => `- "${q.keyword}" (${q.difficulty}, concurrent: ${q.topCompetitor})`).join("\n")}

**TÂCHES:**
1. Analyse SWOT complète (Forces, Faiblesses, Opportunités, Menaces)
2. Identifie 10 mots-clés "Quick Wins" avec opportunités concrètes
3. Identifie les gaps sémantiques (sujets traités par concurrents mais pas par l'utilisateur)
4. Génère 5 actions techniques prioritaires
5. Propose une stratégie de maillage interne

**SORTIE JSON:**
{
  "swot": {
    "strengths": ["Force 1", "Force 2", ...],
    "weaknesses": ["Faiblesse 1", "Faiblesse 2", ...],
    "opportunities": ["Opportunité 1", "Opportunité 2", ...],
    "threats": ["Menace 1", "Menace 2", ...]
  },
  "quickWins": [
    {
      "keyword": "mot-clé",
      "difficulty": "easy",
      "opportunity": "Description de l'opportunité",
      "estimatedImpact": 4
    }
  ],
  "semanticGaps": [
    {
      "topic": "Sujet non traité",
      "competitors": ["concurrent1.com", "concurrent2.com"],
      "recommendation": "Recommandation concrète"
    }
  ],
  "technicalActions": [
    {
      "priority": "high",
      "action": "Action technique",
      "description": "Description détaillée",
      "estimatedImpact": 5
    }
  ],
  "internalLinkingStrategy": {
    "priorityPages": ["/page1", "/page2"],
    "suggestedStructure": "Description de la structure",
    "hubPages": ["/hub1", "/hub2"]
  }
}

IMPORTANT: Retourne UNIQUEMENT le JSON valide, pas de texte avant ou après.
`;

  try {
    const claude = getClaude();
    const parser = getStringParser();
    const chain = claude.pipe(parser);
    const aiResponse = await chain.invoke(prompt);

    // Parser la réponse JSON
    let strategy: SEOStrategy;

    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        strategy = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch (error) {
      console.error("[SEO Discovery] Erreur parsing JSON stratégie:", error);
      // Fallback: stratégie basique
      strategy = generateFallbackStrategy(userData, competitorsData, marketInsights);
    }

    console.log(`[SEO Discovery] ✅ Stratégie SEO générée`);

    return strategy;
  } catch (error) {
    console.error("[SEO Discovery] Erreur génération stratégie:", error);
    return generateFallbackStrategy(userData, competitorsData, marketInsights);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. ANALYSE DES CONCURRENTS (Scraping approfondi)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyse approfondie des concurrents
 * 
 * Scrape les pages des concurrents pour analyser :
 * - Structure du contenu
 * - Longueur des articles
 * - Nombre de titres, images, liens
 * - Présence de structured data, Open Graph
 */
export async function analyzeCompetitors(
  competitors: CompetitorData[]
): Promise<CompetitorAnalysis[]> {
  console.log(`[SEO Discovery] Analyse approfondie de ${competitors.length} concurrents...`);

  const analyses: CompetitorAnalysis[] = [];

  for (const competitor of competitors.slice(0, 5)) {
    // Limiter à 5 concurrents pour éviter trop d'appels
    try {
      console.log(`[SEO Discovery] Scraping: ${competitor.domain}`);

      const response = await fetch(competitor.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Skalle/1.0; SEO Intelligence)",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Analyser le contenu
      $("script, style, nav, header, footer, aside").remove();
      const bodyText = $("body").text().replace(/\s+/g, " ").trim();
      const wordCount = bodyText.split(" ").filter((w) => w.length > 2).length;

      const headingCount = $("h1, h2, h3").length;
      const imageCount = $("img").length;
      const internalLinks = $("a[href^='/'], a[href*='" + competitor.domain + "']").length;
      const externalLinks = $("a[href^='http']").filter(
        (_, el) => !$(el).attr("href")?.includes(competitor.domain)
      ).length;

      // Vérifier structured data
      const hasStructuredData = $('script[type="application/ld+json"]').length > 0;

      // Vérifier Open Graph
      const hasOpenGraph = $('meta[property^="og:"]').length > 0;

      // Calculer un score d'autorité (heuristique basée sur position SERP)
      // Position 1-3 = 90-100, 4-6 = 70-89, 7-10 = 50-69
      let authorityScore = 50;
      if (competitor.position <= 3) authorityScore = 90 + (4 - competitor.position) * 3;
      else if (competitor.position <= 6) authorityScore = 70 + (7 - competitor.position) * 5;
      else authorityScore = 50 + (10 - competitor.position) * 5;

      // Analyser forces/faiblesses avec IA (optionnel, peut être fait plus tard)
      const strengths: string[] = [];
      const weaknesses: string[] = [];

      if (wordCount > 2000) strengths.push("Contenu long et détaillé");
      else if (wordCount < 500) weaknesses.push("Contenu court");

      if (headingCount >= 5) strengths.push("Structure claire avec nombreux titres");
      else weaknesses.push("Peu de structure (titres manquants)");

      if (hasStructuredData) strengths.push("Structured data présent");
      else weaknesses.push("Pas de structured data");

      if (hasOpenGraph) strengths.push("Open Graph configuré");
      else weaknesses.push("Open Graph manquant");

      analyses.push({
        domain: competitor.domain,
        strengths,
        weaknesses,
        contentLength: wordCount,
        headingCount,
        imageCount,
        internalLinks,
        externalLinks,
        hasStructuredData,
        hasOpenGraph,
        authorityScore,
      });

      console.log(`[SEO Discovery] ✅ ${competitor.domain} analysé`);
    } catch (error) {
      console.error(`[SEO Discovery] Erreur scraping ${competitor.domain}:`, error);
      // Continuer avec les autres concurrents
    }
  }

  console.log(`[SEO Discovery] ✅ Analyse concurrentielle terminée: ${analyses.length} analyses`);

  return analyses;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. FONCTION PRINCIPALE - SEO INTELLIGENCE COMPLÈTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyse SEO Intelligence complète
 * 
 * Workflow complet :
 * 1. Scraping du site utilisateur
 * 2. Extraction de mots-clés
 * 3. Analyse concurrentielle
 * 4. Audit de différentiel
 * 5. Plan d'action
 */
export async function runSEOIntelligence(
  url: string,
  workspaceId: string
): Promise<{ success: boolean; data?: SEOIntelligenceReport; error?: string }> {
  try {
    console.log(`[SEO Intelligence] 🚀 Démarrage de l'analyse complète pour: ${url}`);

    // 1. Scraping du site utilisateur
    const userSite = await analyzeUserSite(url);
    console.log(`[SEO Intelligence] ✅ Site utilisateur analysé: ${userSite.intentKeywords.length} mots-clés extraits`);

    // 2. Recherche de mots-clés & concurrents
    const marketInsights = await getMarketInsights(userSite.intentKeywords);
    console.log(`[SEO Intelligence] ✅ Marché analysé: ${marketInsights.length} insights`);

    // 3. Analyser les concurrents principaux
    const allCompetitors = marketInsights.flatMap((m) => m.competitors);
    const uniqueCompetitors = Array.from(
      new Map(allCompetitors.map((c) => [c.domain, c])).values()
    ).slice(0, 5); // Top 5 domaines uniques

    const competitorAnalysis = await analyzeCompetitors(uniqueCompetitors);
    console.log(`[SEO Intelligence] ✅ ${competitorAnalysis.length} concurrents analysés en profondeur`);

    // 4. Générer la stratégie SEO
    const strategy = await generateSeoStrategy(userSite, competitorAnalysis, marketInsights);
    console.log(`[SEO Intelligence] ✅ Stratégie SEO générée`);

    // 5. Compiler le rapport complet
    const report: SEOIntelligenceReport = {
      userSite,
      marketInsights,
      competitorAnalysis,
      strategy,
      recommendations: {
        technical: strategy.technicalActions.map((a) => ({
          priority: a.priority,
          action: a.action,
          description: a.description,
        })),
        content: strategy.quickWins.map((q) => ({
          keyword: q.keyword,
          opportunity: q.opportunity,
          estimatedImpact: q.estimatedImpact,
        })),
        semantic: strategy.semanticGaps.map((g) => ({
          topic: g.topic,
          gap: `Sujet traité par ${g.competitors.join(", ")} mais pas par vous`,
          recommendation: g.recommendation,
        })),
      },
    };

    // 6. Sauvegarder dans Prisma avec le nouveau format optimisé
    const globalScore = calculateOverallScore(userSite, competitorAnalysis);
    
    // Formater les données selon le nouveau schéma
    const metadata = {
      title: userSite.title,
      description: userSite.metaDescription,
      h1: userSite.h1,
      h2s: userSite.h2s,
      lang: "fr", // Peut être détecté depuis le HTML
      wordCount: userSite.wordCount,
      internalLinks: userSite.internalLinks,
      externalLinks: userSite.externalLinks,
      theme: userSite.theme,
    };

    // Formater les mots-clés cibles
    const targetKeywordsFormatted = marketInsights.map((insight) => ({
      term: insight.keyword,
      intent: insight.volumeEstimate === "high" ? "commercial" : "informationnel", // Heuristique
      difficulty: insight.difficulty,
      priority: insight.difficulty === "easy" || insight.difficulty === "medium",
      volumeEstimate: insight.volumeEstimate,
      competitors: insight.competitors.slice(0, 3).map((c) => ({
        domain: c.domain,
        title: c.title,
        position: c.position,
      })),
    }));

    // Formater les concurrents
    const competitorsFormatted = competitorAnalysis.map((comp) => ({
      domain: comp.domain,
      strength: comp.strengths,
      weakness: comp.weaknesses,
      topPages: [], // Peut être enrichi avec getTopPagesForDomain
      authorityScore: comp.authorityScore,
      contentLength: comp.contentLength,
      hasStructuredData: comp.hasStructuredData,
      hasOpenGraph: comp.hasOpenGraph,
    }));

    // Formater le plan d'action
    const actionPlanFormatted = {
      technicalActions: strategy.technicalActions.map((a) => ({
        priority: a.priority,
        action: a.action,
        description: a.description,
        estimatedImpact: a.estimatedImpact,
      })),
      semanticGap: strategy.semanticGaps.map((g) => ({
        topic: g.topic,
        competitors: g.competitors,
        recommendation: g.recommendation,
      })),
      quickWins: strategy.quickWins.map((q) => ({
        keyword: q.keyword,
        difficulty: q.difficulty,
        opportunity: q.opportunity,
        estimatedImpact: q.estimatedImpact,
      })),
      swot: strategy.swot,
      internalLinkingStrategy: strategy.internalLinkingStrategy,
    };

    // Sauvegarder dans Prisma
    // Pour l'instant, stocker toutes les données dans report (backward compatible)
    // Les nouveaux champs seront disponibles après que les migrations soient correctement appliquées
    const reportData = {
      ...report,
      // Ajouter les nouvelles données structurées dans report
      metadata: metadata,
      targetKeywords: targetKeywordsFormatted,
      competitors: competitorsFormatted,
      actionPlan: actionPlanFormatted,
      globalScore: globalScore,
    };

    await prisma.sEOAudit.create({
      data: {
        url,
        score: globalScore, // Utiliser score (globalScore sera disponible après migration)
        workspaceId,
        // Utiliser report pour stocker toutes les données (backward compatible)
        report: JSON.parse(JSON.stringify(reportData)),
        aiRecommendations: JSON.parse(JSON.stringify(report.recommendations)),
        competitorData: JSON.parse(JSON.stringify({
          competitors: competitorAnalysis,
          marketInsights: marketInsights.slice(0, 5),
        })),
      },
    });

    console.log(`[SEO Intelligence] ✅ Rapport sauvegardé en base de données`);

    return { success: true, data: report };
  } catch (error) {
    console.error("[SEO Intelligence] Erreur:", error);
    return { success: false, error: error instanceof Error ? error.message : "Erreur inconnue" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function generateFallbackStrategy(
  userData: UserSiteAnalysis,
  competitorsData: CompetitorAnalysis[],
  marketInsights: MarketInsight[]
): SEOStrategy {
  return {
    swot: {
      strengths: userData.wordCount > 1000 ? ["Contenu substantiel"] : [],
      weaknesses: [
        ...(userData.title ? [] : ["Titre manquant"]),
        ...(userData.metaDescription ? [] : ["Meta description manquante"]),
        ...(userData.h1 ? [] : ["H1 manquant"]),
      ],
      opportunities: marketInsights
        .filter((m) => m.difficulty === "easy")
        .slice(0, 5)
        .map((m) => `Mots-clé "${m.keyword}" à faible difficulté`),
      threats: competitorsData
        .filter((c) => c.authorityScore > 80)
        .map((c) => `${c.domain} a une forte autorité (${c.authorityScore}/100)`),
    },
    quickWins: marketInsights
      .filter((m) => m.difficulty === "easy" || m.difficulty === "medium")
      .slice(0, 10)
      .map((m) => ({
        keyword: m.keyword,
        difficulty: m.difficulty,
        opportunity: `Opportunité de ranking pour "${m.keyword}"`,
        estimatedImpact: m.difficulty === "easy" ? 4 : 3,
      })),
    semanticGaps: [],
    technicalActions: [
      {
        priority: userData.title ? "medium" : "high",
        action: userData.title ? "Optimiser le titre" : "Ajouter un titre",
        description: userData.title
          ? `Titre actuel: "${userData.title}" - Optimiser pour inclure le mot-clé principal`
          : "Ajouter une balise <title> optimisée",
        estimatedImpact: 5,
      },
      {
        priority: userData.metaDescription ? "medium" : "high",
        action: userData.metaDescription ? "Optimiser la meta description" : "Ajouter une meta description",
        description: "La meta description améliore le CTR dans les résultats de recherche",
        estimatedImpact: 4,
      },
      {
        priority: userData.h1 ? "low" : "high",
        action: userData.h1 ? "Optimiser le H1" : "Ajouter un H1",
        description: "Le H1 est crucial pour le SEO on-page",
        estimatedImpact: 5,
      },
    ],
    internalLinkingStrategy: {
      priorityPages: [],
      suggestedStructure: "Créer un maillage interne autour des pages principales",
      hubPages: [],
    },
  };
}

function calculateOverallScore(
  userSite: UserSiteAnalysis,
  competitors: CompetitorAnalysis[]
): number {
  let score = 50; // Base

  // Titre
  if (userSite.title) {
    if (userSite.title.length >= 30 && userSite.title.length <= 60) score += 10;
    else score += 5;
  }

  // Meta description
  if (userSite.metaDescription) {
    if (userSite.metaDescription.length >= 120 && userSite.metaDescription.length <= 160) score += 10;
    else score += 5;
  }

  // H1
  if (userSite.h1) score += 10;

  // Contenu
  if (userSite.wordCount > 1000) score += 10;
  else if (userSite.wordCount > 500) score += 5;

  // Liens internes
  if (userSite.internalLinks >= 5) score += 10;
  else if (userSite.internalLinks >= 3) score += 5;

  // Comparaison avec concurrents
  const avgCompetitorScore = competitors.reduce((sum, c) => sum + c.authorityScore, 0) / competitors.length;
  if (score < avgCompetitorScore - 20) score -= 10; // En retard
  else if (score > avgCompetitorScore + 10) score += 10; // En avance

  return Math.min(100, Math.max(0, score));
}

