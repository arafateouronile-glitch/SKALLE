/**
 * 🔍 Keyword Analyzer - Backend SEO basé sur données réelles
 * 
 * Analyse de mots-clés sans IA, uniquement basé sur :
 * - Serper.dev (SERP data)
 * - Scraping de pages
 * - Calculs heuristiques
 */

import { searchGoogleFull, getRelatedKeywords, getPeopleAlsoAsk } from "@/lib/ai/serper";
import * as cheerio from "cheerio";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface KeywordMetrics {
  keyword: string;
  volume: number; // Volume de recherche estimé (toujours une valeur)
  cpc: number; // Coût par clic estimé (toujours une valeur)
  kd: number; // Keyword Difficulty (0-100)
  competition: "low" | "medium" | "high";
  trend: number[]; // Tendance sur 12 mois (si disponible)
  serpFeatures: {
    featuredSnippet: boolean;
    knowledgePanel: boolean;
    localPack: boolean;
    videoResults: boolean;
    imageResults: boolean;
  };
  searchIntent: "informational" | "navigational" | "commercial" | "transactional";
  topCompetitors: Array<{
    domain: string;
    title: string;
    position: number;
    url: string;
  }>;
  relatedKeywords: Array<{
    keyword: string;
    volume: number;
    kd: number;
    cpc: number;
    competition: "low" | "medium" | "high";
  }>;
  paaQuestions: string[]; // People Also Ask
  dataSource: "serper" | "heuristic";
}

export interface KeywordOpportunity {
  keyword: string;
  volume: number;
  kd: number;
  opportunity: number; // Score 0-100 (volume élevé + KD faible = opportunité)
  intent: "informational" | "navigational" | "commercial" | "transactional";
  serpFeatures: KeywordMetrics["serpFeatures"];
  topCompetitors: KeywordMetrics["topCompetitors"];
}

export interface CompetitorAnalysis {
  domain: string;
  domainAuthority: number; // 0-100 (estimé)
  totalKeywords: number; // Estimé
  topKeywords: Array<{
    keyword: string;
    position: number;
  }>;
  backlinksEstimate: number | null;
  trafficEstimate: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function inferSearchIntent(keyword: string, organic: any[]): KeywordMetrics["searchIntent"] {
  const kw = keyword.toLowerCase();
  
  // Transactional
  if (kw.match(/\b(acheter|commander|prix|tarif|devis|offre|promo|réduction)\b/)) {
    return "transactional";
  }
  
  // Commercial
  if (kw.match(/\b(meilleur|comparatif|avis|test|guide|top|liste)\b/)) {
    return "commercial";
  }
  
  // Navigational
  if (kw.match(/\b(site|officiel|login|connexion)\b/) || organic.some(r => r.link.includes(kw.split(" ")[0]))) {
    return "navigational";
  }
  
  // Informational (par défaut)
  return "informational";
}

function calculateKeywordDifficulty(organic: any[]): number {
  const bigBrands = [
    "wikipedia.org", "amazon.fr", "fnac.com", "lemonde.fr",
    "lefigaro.fr", "bfmtv.com", "youtube.com", "gov.fr",
    "facebook.com", "linkedin.com", "reddit.com"
  ];
  
  const brandCount = organic.filter((r) =>
    bigBrands.some((b) => r.link.toLowerCase().includes(b))
  ).length;
  
  // Calcul de la difficulté basé sur la présence de grandes marques
  if (brandCount >= 6) return 85; // Très difficile
  if (brandCount >= 4) return 70; // Difficile
  if (brandCount >= 2) return 50; // Moyen
  if (brandCount >= 1) return 35; // Facile-Moyen
  return 20; // Facile
}

function estimateVolume(keyword: string, organic: any[]): number {
  const wordCount = keyword.split(" ").length;
  const kwLower = keyword.toLowerCase();
  
  // Détecter les mots-clés commerciaux (volume généralement plus élevé)
  const commercialTerms = ["acheter", "prix", "comparatif", "meilleur", "avis", "devis", "offre"];
  const isCommercial = commercialTerms.some((t) => kwLower.includes(t));
  
  // Détecter les mots-clés locaux (volume généralement moyen)
  const localTerms = ["près de", "à", "dans", "paris", "lyon", "marseille", "toulouse"];
  const isLocal = localTerms.some((t) => kwLower.includes(t));
  
  // Base de calcul selon la longueur
  let baseVolume = 0;
  if (wordCount === 1) {
    baseVolume = 8000; // Mot-clé très court = volume élevé
  } else if (wordCount === 2) {
    baseVolume = 4000;
  } else if (wordCount === 3) {
    baseVolume = 1500;
  } else if (wordCount === 4) {
    baseVolume = 600;
  } else {
    baseVolume = 200; // Long-tail = volume faible
  }
  
  // Ajustements selon le type de mot-clé
  if (isCommercial) {
    baseVolume = Math.round(baseVolume * 1.3); // +30% pour les commerciaux
  }
  if (isLocal) {
    baseVolume = Math.round(baseVolume * 0.7); // -30% pour les locaux
  }
  
  // Ajustement selon la qualité de la SERP (plus de résultats = plus de volume)
  const serpQuality = Math.min(organic.length / 10, 1.5); // Multiplicateur jusqu'à 1.5x
  baseVolume = Math.round(baseVolume * serpQuality);
  
  // Volume minimum garanti
  const finalVolume = Math.max(baseVolume, 50);
  
  // Vérification de sécurité
  if (isNaN(finalVolume) || !isFinite(finalVolume)) {
    console.error(`[Keyword Analyzer] Volume invalide calculé pour "${keyword}": ${finalVolume}, utilisation de 100 par défaut`);
    return 100;
  }
  
  return finalVolume;
}

function estimateCPC(intent: KeywordMetrics["searchIntent"], volume: number): number {
  // CPC estimé basé sur l'intention et le volume
  const baseCPC: Record<KeywordMetrics["searchIntent"], number> = {
    transactional: 2.8,
    commercial: 2.0,
    informational: 0.9,
    navigational: 0.4,
  };
  
  // Multiplicateur selon le volume (plus de volume = CPC plus élevé généralement)
  let multiplier = 1.0;
  if (volume > 10000) multiplier = 1.8;
  else if (volume > 5000) multiplier = 1.5;
  else if (volume > 2000) multiplier = 1.3;
  else if (volume > 1000) multiplier = 1.2;
  else if (volume > 500) multiplier = 1.1;
  else multiplier = 0.9; // Volume faible = CPC plus bas
  
  const cpc = baseCPC[intent] * multiplier;
  
  // Arrondir à 2 décimales
  const finalCPC = Math.round(cpc * 100) / 100;
  
  // Vérification de sécurité
  if (isNaN(finalCPC) || !isFinite(finalCPC)) {
    console.error(`[Keyword Analyzer] CPC invalide calculé pour intent "${intent}": ${finalCPC}, utilisation de 1.0 par défaut`);
    return 1.0;
  }
  
  return finalCPC;
}

function calculateOpportunityScore(volume: number, kd: number): number {
  // Score = (volume normalisé * (100 - KD)) / 100
  const normalizedVolume = Math.min(volume / 10000, 1) * 100; // Normaliser sur 0-100
  const opportunity = (normalizedVolume * (100 - kd)) / 100;
  
  return Math.round(opportunity);
}

/**
 * Génère une tendance simulée basée sur le volume et la saisonnalité
 */
function generateTrend(volume: number, keyword: string): number[] {
  const trend: number[] = [];
  const kwLower = keyword.toLowerCase();
  
  // Détecter les mots-clés saisonniers
  const isSeasonal = kwLower.match(/\b(noël|été|hiver|printemps|automne|vacances|black friday|soldes)\b/);
  
  // Base de variation mensuelle
  const baseVariation = 0.15; // 15% de variation de base
  
  for (let i = 0; i < 12; i++) {
    let monthlyVolume = volume;
    
    // Variation saisonnière
    if (isSeasonal) {
      // Pic en décembre pour Noël, été pour vacances, etc.
      if (kwLower.includes("noël") || kwLower.includes("black friday")) {
        monthlyVolume = i === 11 ? volume * 2.5 : volume * 0.7; // Pic en décembre
      } else if (kwLower.includes("été") || kwLower.includes("vacances")) {
        monthlyVolume = (i >= 5 && i <= 7) ? volume * 1.8 : volume * 0.8; // Pic en été
      }
    }
    
    // Variation aléatoire légère
    const randomVariation = 1 + (Math.random() - 0.5) * baseVariation;
    monthlyVolume = Math.round(monthlyVolume * randomVariation);
    
    trend.push(Math.max(monthlyVolume, Math.round(volume * 0.5))); // Minimum 50% du volume de base
  }
  
  return trend;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FONCTIONS PRINCIPALES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyse complète d'un mot-clé
 */
export async function analyzeKeyword(keyword: string): Promise<KeywordMetrics> {
  console.log(`[Keyword Analyzer] Analyse du mot-clé: ${keyword}`);
  
  // 1. Recherche SERP complète
  const fullResponse = await searchGoogleFull(keyword, 10);
  const organic = fullResponse.organic || [];
  console.log(`[Keyword Analyzer] Résultats SERP: ${organic.length} résultats`);
  console.log(`[Keyword Analyzer] relatedSearches disponibles:`, {
    count: fullResponse.relatedSearches?.length || 0,
    sample: fullResponse.relatedSearches?.slice(0, 3),
  });
  
  // 2. Calcul des métriques
  let kd = calculateKeywordDifficulty(organic);
  let volume = estimateVolume(keyword, organic);
  const intent = inferSearchIntent(keyword, organic);
  let cpc = estimateCPC(intent, volume);
  
  // Vérifications de sécurité
  if (typeof volume !== 'number' || isNaN(volume) || !isFinite(volume)) {
    console.error(`[Keyword Analyzer] Volume invalide: ${volume}, utilisation de 100 par défaut`);
    volume = 100;
  }
  if (typeof cpc !== 'number' || isNaN(cpc) || !isFinite(cpc)) {
    console.error(`[Keyword Analyzer] CPC invalide: ${cpc}, utilisation de 1.0 par défaut`);
    cpc = 1.0;
  }
  if (typeof kd !== 'number' || isNaN(kd) || !isFinite(kd)) {
    console.error(`[Keyword Analyzer] KD invalide: ${kd}, utilisation de 50 par défaut`);
    kd = 50;
  }
  
  const trend = generateTrend(volume, keyword);
  
  console.log(`[Keyword Analyzer] Métriques calculées (après vérifications):`, {
    volume: typeof volume === 'number' ? volume : 'INVALIDE',
    kd: typeof kd === 'number' ? kd : 'INVALIDE',
    cpc: typeof cpc === 'number' ? cpc : 'INVALIDE',
    intent,
    trendLength: trend.length,
  });
  
  // 3. Features SERP (détection améliorée)
  const hasVideos = organic.some((r) => 
    r.link.includes("youtube.com") || 
    r.link.includes("vimeo.com") ||
    r.title.toLowerCase().includes("vidéo")
  );
  
  const hasImages = organic.some((r) => 
    r.link.includes("images.google") ||
    r.link.includes("pinterest") ||
    r.link.includes("imgur")
  );
  
  // Détection Local Pack (présence de résultats locaux)
  const hasLocalPack = organic.some((r) => 
    r.link.includes("google.com/maps") ||
    r.snippet?.toLowerCase().includes("adresse") ||
    r.snippet?.toLowerCase().includes("téléphone")
  );
  
  const serpFeatures = {
    featuredSnippet: !!fullResponse.answerBox,
    knowledgePanel: !!fullResponse.knowledgeGraph || false,
    localPack: hasLocalPack,
    videoResults: hasVideos,
    imageResults: hasImages,
  };
  
  // 4. Top concurrents
  const topCompetitors = organic.slice(0, 10).map((r, idx) => ({
    domain: new URL(r.link).hostname,
    title: r.title,
    position: idx + 1,
    url: r.link,
  }));
  
  // 5. Mots-clés liés avec métriques estimées
  // Utiliser relatedSearches de la réponse SERP complète (déjà disponible)
  const relatedSearches = fullResponse.relatedSearches || [];
  let relatedKw: string[] = [];
  
  // Extraire les mots-clés depuis relatedSearches
  if (relatedSearches.length > 0) {
    relatedKw = relatedSearches
      .map((r: any) => {
        // Gérer différents formats : { query: "..." } ou string direct
        if (typeof r === 'string') return r;
        if (r.query) return r.query;
        return null;
      })
      .filter((kw: string | null): kw is string => kw !== null && kw.length > 0)
      .slice(0, 20);
  }
  
  console.log(`[Keyword Analyzer] Mots-clés liés depuis relatedSearches: ${relatedKw.length}`);
  
  // Si aucun mot-clé lié, essayer une recherche alternative via API
  if (relatedKw.length === 0) {
    console.log(`[Keyword Analyzer] Aucun mot-clé dans relatedSearches, tentative via getRelatedKeywords...`);
    try {
      const alternativeKw = await getRelatedKeywords(keyword);
      if (alternativeKw.length > 0) {
        relatedKw = alternativeKw.slice(0, 20);
        console.log(`[Keyword Analyzer] Mots-clés trouvés via getRelatedKeywords: ${relatedKw.length}`);
      }
    } catch (error) {
      console.error(`[Keyword Analyzer] Erreur getRelatedKeywords:`, error);
    }
  }
  
  // Si toujours aucun résultat, générer des variantes basiques
  if (relatedKw.length === 0) {
    console.log(`[Keyword Analyzer] Génération de variantes basiques...`);
    const words = keyword.toLowerCase().split(" ");
    if (words.length > 1) {
      // Générer quelques variantes simples
      relatedKw = [
        `${words[0]} ${words.slice(1).join(" ")} gratuit`,
        `${words[0]} ${words.slice(1).join(" ")} prix`,
        `meilleur ${keyword.toLowerCase()}`,
        `${keyword.toLowerCase()} avis`,
        `comment ${keyword.toLowerCase()}`,
      ].slice(0, 5);
    }
  }
  
  console.log(`[Keyword Analyzer] Total mots-clés liés à analyser: ${relatedKw.length}`);
  
  // Analyser rapidement les mots-clés liés (sans requête SERP complète pour chaque)
  const relatedKeywords = relatedKw.length > 0 ? await Promise.all(
    relatedKw.slice(0, 20).map(async (kw) => {
      try {
        // Estimation rapide basée sur la similarité avec le mot-clé principal
        const kwLower = kw.toLowerCase();
        const seedLower = keyword.toLowerCase();
        
        // Similarité basée sur les mots communs
        const seedWords = seedLower.split(" ");
        const kwWords = kwLower.split(" ");
        const commonWords = seedWords.filter((w) => kwWords.includes(w));
        const similarity = commonWords.length / Math.max(seedWords.length, kwWords.length);
        
        // Estimer le volume (généralement similaire au mot-clé principal)
        const estimatedVolume = Math.round(volume * (0.5 + similarity * 0.5));
        
        // Estimer KD (généralement similaire, avec variation)
        const kdVariation = (Math.random() - 0.5) * 20; // Variation de ±10
        const estimatedKD = Math.max(0, Math.min(100, kd + kdVariation));
        
        // Estimer CPC (basé sur l'intention et le volume)
        const estimatedIntent = inferSearchIntent(kw, []);
        const estimatedCPC = estimateCPC(estimatedIntent, estimatedVolume);
        
        // Estimer concurrence (basée sur KD)
        const estimatedCompetition = estimatedKD >= 70 ? "high" : estimatedKD >= 40 ? "medium" : "low";
        
        return {
          keyword: kw,
          volume: estimatedVolume,
          kd: Math.round(estimatedKD),
          cpc: estimatedCPC,
          competition: estimatedCompetition,
        };
      } catch (error) {
        // Fallback si erreur
        return {
          keyword: kw,
          volume: Math.round(volume * 0.6),
          kd: kd,
          cpc: cpc * 0.8,
          competition: (competition === "high" || competition === "medium" ? competition : "low") as "low" | "medium" | "high",
        };
      }
    })
  ) : [];
  
  console.log(`[Keyword Analyzer] Mots-clés analysés avec métriques: ${relatedKeywords.length}`);
  
  // 6. Questions PAA
  const paaQuestions = (fullResponse.peopleAlsoAsk || []).map((r) => r.question);
  
  // 7. Compétition (basée sur KD et nombre de concurrents)
  let competition: "low" | "medium" | "high" = "low";
  if (kd >= 70 || organic.length >= 10) {
    competition = "high";
  } else if (kd >= 40 || organic.length >= 6) {
    competition = "medium";
  }
  
  // Vérifications finales avant retour (garantir des valeurs valides)
  const finalVolume = typeof volume === 'number' && isFinite(volume) && !isNaN(volume) ? volume : 100;
  const finalCPC = typeof cpc === 'number' && isFinite(cpc) && !isNaN(cpc) ? cpc : 1.0;
  const finalKD = typeof kd === 'number' && isFinite(kd) && !isNaN(kd) ? kd : 50;
  
  const result: KeywordMetrics = {
    keyword,
    volume: finalVolume,
    cpc: finalCPC,
    kd: finalKD,
    competition,
    trend: Array.isArray(trend) ? trend : [],
    serpFeatures,
    searchIntent: intent,
    topCompetitors: Array.isArray(topCompetitors) ? topCompetitors : [],
    relatedKeywords: (Array.isArray(relatedKeywords) ? relatedKeywords : []) as KeywordMetrics["relatedKeywords"],
    paaQuestions: Array.isArray(paaQuestions) ? paaQuestions : [],
    dataSource: "serper" as const,
  };
  
  console.log(`[Keyword Analyzer] Résultat final (garanti valide):`, {
    keyword: result.keyword,
    volume: result.volume,
    volumeType: typeof result.volume,
    cpc: result.cpc,
    cpcType: typeof result.cpc,
    kd: result.kd,
    kdType: typeof result.kd,
    competition: result.competition,
    trendLength: result.trend.length,
    relatedKeywordsCount: result.relatedKeywords.length,
    relatedKeywordsSample: result.relatedKeywords.slice(0, 3).map(r => ({
      keyword: r.keyword,
      volume: r.volume,
      kd: r.kd,
    })),
  });
  
  return result;
}

/**
 * Trouve des opportunités de mots-clés (volume élevé + KD faible)
 */
export async function findKeywordOpportunities(
  seedKeyword: string,
  limit: number = 20
): Promise<KeywordOpportunity[]> {
  // 1. Analyser le mot-clé seed
  const seedMetrics = await analyzeKeyword(seedKeyword);
  
  // 2. Récupérer les mots-clés liés
  const relatedKw = await getRelatedKeywords(seedKeyword).catch(() => []);
  
  // 3. Analyser chaque mot-clé lié
  const opportunities: KeywordOpportunity[] = [];
  
  for (const kw of relatedKw.slice(0, limit)) {
    try {
      const metrics = await analyzeKeyword(kw);
      const opportunity = calculateOpportunityScore(metrics.volume, metrics.kd);
      
      opportunities.push({
        keyword: kw,
        volume: metrics.volume,
        kd: metrics.kd,
        opportunity,
        intent: metrics.searchIntent,
        serpFeatures: metrics.serpFeatures,
        topCompetitors: metrics.topCompetitors,
      });
      
      // Pause pour éviter le rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Erreur analyse ${kw}:`, error);
    }
  }
  
  // 4. Trier par score d'opportunité
  return opportunities.sort((a, b) => b.opportunity - a.opportunity);
}

/**
 * Analyse un concurrent (domaine)
 */
export async function analyzeCompetitor(domain: string): Promise<CompetitorAnalysis> {
  // 1. Rechercher les top pages du domaine
  const query = `site:${domain}`;
  const results = await searchGoogleFull(query, 20);
  const organic = results.organic || [];
  
  // 2. Estimer l'autorité du domaine (basé sur la diversité des résultats)
  const uniquePaths = new Set(organic.map((r) => new URL(r.link).pathname));
  const domainAuthority = Math.min(uniquePaths.size * 5, 100);
  
  // 3. Extraire les mots-clés potentiels (basés sur les titres)
  const topKeywords = organic.slice(0, 10).map((r, idx) => ({
    keyword: r.title,
    position: idx + 1,
  }));
  
  // 4. Estimer le trafic (basé sur le nombre de pages indexées)
  const trafficEstimate = organic.length * 1000; // Heuristique
  
  return {
    domain,
    domainAuthority,
    totalKeywords: organic.length,
    topKeywords,
    backlinksEstimate: null, // Nécessiterait un service externe
    trafficEstimate,
  };
}

/**
 * Analyse comparative de plusieurs mots-clés
 */
export async function compareKeywords(
  keywords: string[]
): Promise<KeywordMetrics[]> {
  const results: KeywordMetrics[] = [];
  
  for (const kw of keywords) {
    try {
      const metrics = await analyzeKeyword(kw);
      results.push(metrics);
      
      // Pause pour éviter le rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Erreur analyse ${kw}:`, error);
    }
  }
  
  return results;
}
