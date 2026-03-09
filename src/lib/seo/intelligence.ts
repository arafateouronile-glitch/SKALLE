/**
 * 🧠 SEO Data Intelligence Service
 *
 * Service principal d'intelligence de marché :
 * 1. getKeywordMetrics()       → Volume, CPC, KD, tendances, mots-clés sémantiques
 * 2. analyzeCompetitorDomain() → Trafic organique, Top Pages, positions
 * 3. calculateContentGap()     → Gaps de mots-clés vs concurrents
 * 4. getDomainAuthority()      → Autorité, backlinks, liens toxiques
 * 5. prepareContentBrief()     → Brief stratégique complet pour le LLM
 *
 * Fallback graceful : DataForSEO → Serper → Heuristique
 */

import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { prisma } from "@/lib/prisma";
import { dataForSEOClient, DataForSEOError } from "./dataforseo-client";
import {
  searchGoogleFull,
  searchGoogle,
  getPeopleAlsoAsk,
  getRelatedKeywords,
} from "@/lib/ai/serper";
import type {
  KeywordMetrics,
  CompetitorDomainAnalysis,
  ContentGapResult,
  DomainAuthorityResult,
  ContentBrief,
  IntelligenceCacheType,
} from "@/types/intelligence";

// Re-import CACHE_TTL_DAYS as value (not type)
const CACHE_TTL: Record<IntelligenceCacheType, number> = {
  keyword_metrics: 30,
  competitor: 14,
  backlink: 14,
  content_gap: 7,
};

// ═══════════════════════════════════════════════════════════════════════════
// 🗄️ CACHE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function cacheKey(type: string, params: Record<string, unknown>): string {
  const normalized = JSON.stringify(params, Object.keys(params).sort());
  return createHash("md5").update(`${type}:${normalized}`).digest("hex");
}

async function getFromCache<T>(
  type: IntelligenceCacheType,
  params: Record<string, unknown>
): Promise<T | null> {
  const key = cacheKey(type, params);
  const cached = await prisma.sEOIntelligenceCache.findUnique({
    where: { type_queryKey: { type, queryKey: key } },
  });

  if (!cached) return null;
  if (cached.expiresAt < new Date()) {
    // Expired — delete asynchronously
    prisma.sEOIntelligenceCache
      .delete({ where: { id: cached.id } })
      .catch(() => {});
    return null;
  }

  return cached.data as T;
}

async function setCache(
  type: IntelligenceCacheType,
  params: Record<string, unknown>,
  data: unknown,
  workspaceId: string
): Promise<void> {
  const key = cacheKey(type, params);
  const ttlDays = CACHE_TTL[type];
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  await prisma.sEOIntelligenceCache.upsert({
    where: { type_queryKey: { type, queryKey: key } },
    update: { data: data as object, expiresAt },
    create: { type, queryKey: key, data: data as object, expiresAt, workspaceId },
  });
}

export async function cleanExpiredCache(): Promise<number> {
  const result = await prisma.sEOIntelligenceCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1️⃣ KEYWORD METRICS
// ═══════════════════════════════════════════════════════════════════════════

export async function getKeywordMetrics(
  seed: string,
  workspaceId: string
): Promise<KeywordMetrics> {
  // Check cache
  const cached = await getFromCache<KeywordMetrics>("keyword_metrics", { seed });
  if (cached) return cached;

  let result: KeywordMetrics;

  if (dataForSEOClient.isConfigured()) {
    try {
      result = await getKeywordMetricsFromDataForSEO(seed);
    } catch (error) {
      console.warn("DataForSEO keyword metrics fallback:", error instanceof Error ? error.message : error);
      result = await getKeywordMetricsFromSerper(seed);
    }
  } else {
    result = await getKeywordMetricsFromSerper(seed);
  }

  // Save to cache
  await setCache("keyword_metrics", { seed }, result, workspaceId);

  // Also save to KeywordResearch for historical tracking
  await prisma.keywordResearch.create({
    data: {
      keyword: seed,
      difficulty: result.kd !== null ? kdToLabel(result.kd) : "medium",
      volumeEstimate: result.volume !== null ? volumeToLabel(result.volume) : "medium",
      volume: result.volume,
      cpc: result.cpc,
      kd: result.kd,
      trend: result.trend.length > 0 ? result.trend : undefined,
      dataSource: result.dataSource,
      topCompetitors: [],
      relatedKeywords: result.relatedKeywords.map((r) => r.keyword),
      paaQuestions: result.paaQuestions,
      serpFeatures: result.serpFeatures,
      searchIntent: result.searchIntent,
      workspaceId,
    },
  });

  return result;
}

async function getKeywordMetricsFromDataForSEO(seed: string): Promise<KeywordMetrics> {
  // Parallel calls for volume + difficulty + related keywords
  const [volumeData, kdData, relatedData] = await Promise.all([
    dataForSEOClient.getSearchVolume([seed]),
    dataForSEOClient.getKeywordDifficulty([seed]),
    dataForSEOClient.getKeywordsForKeyword(seed, 2250, "fr", 20),
  ]);

  const vol = volumeData[0];
  const kd = kdData[0];

  // Also get PAA from Serper (DataForSEO doesn't provide PAA directly)
  const [paaQuestions, fullSerp] = await Promise.all([
    getPeopleAlsoAsk(seed).catch(() => [] as string[]),
    searchGoogleFull(seed).catch(() => null),
  ]);

  const trend = vol?.monthly_searches
    ? vol.monthly_searches.slice(-12).map((m) => m.search_volume)
    : [];

  const relatedKeywords = relatedData.slice(0, 20).map((r) => ({
    keyword: r.keyword,
    volume: r.search_volume,
    cpc: r.cpc,
  }));

  const organic = fullSerp?.organic || [];

  return {
    keyword: seed,
    volume: vol?.search_volume ?? null,
    cpc: vol?.cpc ?? null,
    kd: kd?.keyword_difficulty ?? null,
    competition: vol?.competition ?? null,
    trend,
    relatedKeywords,
    paaQuestions,
    serpFeatures: {
      featuredSnippet: !!fullSerp?.answerBox,
      knowledgePanel: !!fullSerp?.knowledgeGraph,
      localPack: false,
      videoResults: organic.some((r) => r.link.includes("youtube.com")),
      imageResults: false,
    },
    searchIntent: inferSearchIntent(seed, organic),
    dataSource: "dataforseo",
  };
}

async function getKeywordMetricsFromSerper(seed: string): Promise<KeywordMetrics> {
  // Utiliser le nouveau service keyword-analyzer qui garantit des valeurs
  const { analyzeKeyword } = await import("@/lib/seo/keyword-analyzer");
  const result = await analyzeKeyword(seed);
  
  // Convertir le format KeywordMetrics du keyword-analyzer vers le format intelligence
  // competition doit être un nombre 0-1, pas une string
  const competitionValue = result.competition === "high" ? 0.8 : result.competition === "medium" ? 0.5 : 0.2;
  
  return {
    keyword: result.keyword,
    volume: result.volume, // Toujours un nombre maintenant
    cpc: result.cpc, // Toujours un nombre maintenant
    kd: result.kd, // Toujours un nombre maintenant
    competition: competitionValue, // Convertir en nombre 0-1
    trend: result.trend,
    relatedKeywords: result.relatedKeywords.map((r) => ({
      keyword: r.keyword,
      volume: r.volume ?? null,
      cpc: r.cpc ?? (r.volume ? result.cpc * 0.8 : null), // Utiliser le CPC estimé ou calculer
      // Ajouter KD et competition si disponibles dans le nouveau format
      ...(('kd' in r && r.kd !== null) ? { kd: r.kd } : {}),
      ...(('competition' in r && r.competition !== null) ? { competition: r.competition === "high" ? 0.8 : r.competition === "medium" ? 0.5 : 0.2 } : {}),
    })),
    paaQuestions: result.paaQuestions,
    serpFeatures: result.serpFeatures,
    searchIntent: result.searchIntent === "transactional" ? "transactional" : 
                  result.searchIntent === "informational" ? "informational" : 
                  result.searchIntent === "navigational" ? "navigational" : "mixed",
    dataSource: "serper_fallback",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2️⃣ COMPETITOR DOMAIN ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export async function analyzeCompetitorDomain(
  domain: string,
  workspaceId: string
): Promise<CompetitorDomainAnalysis> {
  const cached = await getFromCache<CompetitorDomainAnalysis>("competitor", { domain });
  if (cached) return cached;

  let result: CompetitorDomainAnalysis;

  if (dataForSEOClient.isConfigured()) {
    try {
      result = await analyzeCompetitorFromDataForSEO(domain);
    } catch (error) {
      console.warn("DataForSEO competitor fallback:", error instanceof Error ? error.message : error);
      result = await analyzeCompetitorFromSerper(domain);
    }
  } else {
    result = await analyzeCompetitorFromSerper(domain);
  }

  await setCache("competitor", { domain }, result, workspaceId);
  return result;
}

async function analyzeCompetitorFromDataForSEO(
  domain: string
): Promise<CompetitorDomainAnalysis> {
  const ranked = await dataForSEOClient.getDomainOrganicKeywords(domain, 2250, "fr", 100);

  let top3 = 0, top10 = 0, top100 = 0;
  let totalTraffic = 0;

  const topPages: CompetitorDomainAnalysis["topPages"] = [];
  const seenUrls = new Set<string>();

  for (const item of ranked) {
    const pos = item.rank_absolute;
    if (pos <= 3) top3++;
    if (pos <= 10) top10++;
    if (pos <= 100) top100++;
    totalTraffic += item.etv ?? 0;

    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      topPages.push({
        url: item.url,
        title: item.title,
        trafficEstimate: item.etv ?? null,
        position: pos,
        keyword: item.title, // Approximate
      });
    }
  }

  // Sort by traffic
  topPages.sort((a, b) => (b.trafficEstimate ?? 0) - (a.trafficEstimate ?? 0));

  return {
    domain,
    organicTraffic: totalTraffic,
    keywordsTop3: top3,
    keywordsTop10: top10,
    keywordsTop100: top100,
    topPages: topPages.slice(0, 20),
    dataSource: "dataforseo",
  };
}

async function analyzeCompetitorFromSerper(
  domain: string
): Promise<CompetitorDomainAnalysis> {
  const siteResults = await searchGoogle(`site:${domain}`, 20);

  const topPages = siteResults.map((r, i) => ({
    url: r.link,
    title: r.title,
    trafficEstimate: null,
    position: i + 1,
    keyword: r.snippet.slice(0, 60),
  }));

  return {
    domain,
    organicTraffic: null,
    keywordsTop3: null,
    keywordsTop10: null,
    keywordsTop100: siteResults.length,
    topPages,
    dataSource: "serper_fallback",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3️⃣ CONTENT GAP ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export async function calculateContentGap(
  userDomain: string,
  competitorDomains: string[],
  workspaceId: string
): Promise<ContentGapResult> {
  const cacheParams = { userDomain, competitorDomains: competitorDomains.sort() };
  const cached = await getFromCache<ContentGapResult>("content_gap", cacheParams);
  if (cached) return cached;

  let result: ContentGapResult;

  if (dataForSEOClient.isConfigured()) {
    try {
      result = await calculateContentGapFromDataForSEO(userDomain, competitorDomains);
    } catch (error) {
      console.warn("DataForSEO content gap fallback:", error instanceof Error ? error.message : error);
      result = await calculateContentGapFromSerper(userDomain, competitorDomains);
    }
  } else {
    result = await calculateContentGapFromSerper(userDomain, competitorDomains);
  }

  await setCache("content_gap", cacheParams, result, workspaceId);
  return result;
}

async function calculateContentGapFromDataForSEO(
  userDomain: string,
  competitorDomains: string[]
): Promise<ContentGapResult> {
  // Get keywords for each domain (user + competitors)
  const allDomains = [userDomain, ...competitorDomains];
  const domainKeywords = await Promise.all(
    allDomains.map(async (domain) => {
      const ranked = await dataForSEOClient.getDomainOrganicKeywords(domain, 2250, "fr", 100);
      return { domain, keywords: ranked };
    })
  );

  const userKeywords = new Set(
    domainKeywords[0].keywords.map((k) => k.title.toLowerCase())
  );

  const gaps: ContentGapResult["gaps"] = [];
  const seenKeywords = new Set<string>();

  for (let i = 1; i < domainKeywords.length; i++) {
    const competitor = domainKeywords[i];
    for (const item of competitor.keywords) {
      const kw = item.title.toLowerCase();
      if (!userKeywords.has(kw) && !seenKeywords.has(kw)) {
        seenKeywords.add(kw);

        const competitorPositions: Record<string, number> = {};
        competitorPositions[competitor.domain] = item.rank_absolute;

        // Check if other competitors also rank for this
        for (let j = 1; j < domainKeywords.length; j++) {
          if (j !== i) {
            const otherRank = domainKeywords[j].keywords.find(
              (k) => k.title.toLowerCase() === kw
            );
            if (otherRank) {
              competitorPositions[domainKeywords[j].domain] = otherRank.rank_absolute;
            }
          }
        }

        const avgPosition = Object.values(competitorPositions).reduce((a, b) => a + b, 0) /
          Object.values(competitorPositions).length;

        gaps.push({
          keyword: item.title,
          volume: item.etv ?? null,
          kd: null,
          competitorPositions,
          userPosition: null,
          opportunity: avgPosition <= 5 ? "high" : avgPosition <= 15 ? "medium" : "low",
        });
      }
    }
  }

  // Sort by opportunity then volume
  gaps.sort((a, b) => {
    const opOrder = { high: 0, medium: 1, low: 2 };
    const diff = opOrder[a.opportunity] - opOrder[b.opportunity];
    if (diff !== 0) return diff;
    return (b.volume ?? 0) - (a.volume ?? 0);
  });

  return {
    userDomain,
    competitorDomains,
    gaps: gaps.slice(0, 50),
    totalGaps: gaps.length,
    dataSource: "dataforseo",
  };
}

async function calculateContentGapFromSerper(
  userDomain: string,
  competitorDomains: string[]
): Promise<ContentGapResult> {
  // Get related searches for each competitor's top pages
  const competitorResults = await Promise.all(
    competitorDomains.map(async (domain) => {
      const pages = await searchGoogle(`site:${domain}`, 10);
      return { domain, pages };
    })
  );

  const userPages = await searchGoogle(`site:${userDomain}`, 20);
  const userKeywords = new Set(
    userPages.map((p) => p.title.toLowerCase())
  );

  const gaps: ContentGapResult["gaps"] = [];
  const seenTitles = new Set<string>();

  for (const comp of competitorResults) {
    for (const page of comp.pages) {
      const title = page.title.toLowerCase();
      if (!userKeywords.has(title) && !seenTitles.has(title)) {
        seenTitles.add(title);
        gaps.push({
          keyword: page.title,
          volume: null,
          kd: null,
          competitorPositions: { [comp.domain]: page.position },
          userPosition: null,
          opportunity: page.position <= 5 ? "high" : "medium",
        });
      }
    }
  }

  return {
    userDomain,
    competitorDomains,
    gaps: gaps.slice(0, 50),
    totalGaps: gaps.length,
    dataSource: "serper_fallback",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4️⃣ DOMAIN AUTHORITY
// ═══════════════════════════════════════════════════════════════════════════

export async function getDomainAuthority(
  domain: string,
  workspaceId: string
): Promise<DomainAuthorityResult> {
  const cached = await getFromCache<DomainAuthorityResult>("backlink", { domain });
  if (cached) return cached;

  let result: DomainAuthorityResult;

  if (dataForSEOClient.isConfigured()) {
    try {
      result = await getDomainAuthorityFromDataForSEO(domain);
    } catch (error) {
      console.warn("DataForSEO authority fallback:", error instanceof Error ? error.message : error);
      result = await getDomainAuthorityFromHeuristic(domain);
    }
  } else {
    result = await getDomainAuthorityFromHeuristic(domain);
  }

  await setCache("backlink", { domain }, result, workspaceId);
  return result;
}

async function getDomainAuthorityFromDataForSEO(
  domain: string
): Promise<DomainAuthorityResult> {
  const [summary, referring] = await Promise.all([
    dataForSEOClient.getBacklinkSummary(domain),
    dataForSEOClient.getReferringDomains(domain, 50),
  ]);

  if (!summary) {
    throw new DataForSEOError("Pas de données backlink disponibles");
  }

  // Normalize rank (0-1000) to authority score (0-100)
  const authorityScore = Math.min(100, Math.round(summary.rank / 10));

  const toxicRatio = summary.backlinks > 0
    ? summary.broken_backlinks / summary.backlinks
    : 0;

  return {
    domain,
    authorityScore,
    referringDomains: summary.referring_domains,
    totalBacklinks: summary.backlinks,
    toxicLinksRatio: Math.round(toxicRatio * 100) / 100,
    topReferringDomains: referring.slice(0, 20).map((r) => ({
      domain: r.domain,
      rank: r.rank,
      backlinks: r.backlinks,
    })),
    netlinkingOpportunities: [],
    dataSource: "dataforseo",
  };
}

async function getDomainAuthorityFromHeuristic(
  domain: string
): Promise<DomainAuthorityResult> {
  // Use SERP position as authority proxy
  const results = await searchGoogle(`site:${domain}`, 10);
  const pageCount = results.length;

  // Rough authority: more indexed pages = more authority
  let authorityScore = 20;
  if (pageCount >= 15) authorityScore = 60;
  else if (pageCount >= 10) authorityScore = 45;
  else if (pageCount >= 5) authorityScore = 30;

  return {
    domain,
    authorityScore,
    referringDomains: 0,
    totalBacklinks: 0,
    toxicLinksRatio: 0,
    topReferringDomains: [],
    netlinkingOpportunities: [],
    dataSource: "heuristic",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5️⃣ CONTENT BRIEF (Synthèse pour la SEO Factory)
// ═══════════════════════════════════════════════════════════════════════════

export async function prepareContentBrief(
  targetKeyword: string,
  workspaceId: string
): Promise<ContentBrief> {
  // 1. Get keyword metrics
  const metrics = await getKeywordMetrics(targetKeyword, workspaceId);

  // 2. Get top competitors from SERP and analyze their content
  const serpResults = await searchGoogleFull(targetKeyword);
  const organic = serpResults.organic || [];
  const top5 = organic.slice(0, 5);

  // 3. Scrape competitor content for word count and headings
  const competitorsToOutrank = await Promise.all(
    top5.map(async (result) => {
      const { wordCount, headings } = await scrapePageStats(result.link);
      return {
        domain: extractDomain(result.link),
        title: result.title,
        url: result.link,
        position: result.position,
        wordCount,
        headings,
      };
    })
  );

  // 4. Calculate recommended word count (average of top 3 + 20%)
  const validWordCounts = competitorsToOutrank
    .slice(0, 3)
    .map((c) => c.wordCount)
    .filter((wc): wc is number => wc !== null && wc > 0);

  const avgWordCount = validWordCounts.length > 0
    ? Math.round(validWordCounts.reduce((a, b) => a + b, 0) / validWordCounts.length)
    : 1500;
  const recommendedWordCount = Math.round(avgWordCount * 1.2);

  // 5. Semantic keywords
  const semanticKeywords = metrics.relatedKeywords
    .slice(0, 15)
    .map((r) => r.keyword);

  // 6. Content gaps from PAA
  const paaQuestions = metrics.paaQuestions;

  // 7. Identify gaps not covered by competitors
  const allHeadings = competitorsToOutrank.flatMap((c) => c.headings);
  const competitorTopics = new Set(allHeadings.map((h) => h.toLowerCase()));
  const contentGaps = semanticKeywords.filter(
    (kw) => !Array.from(competitorTopics).some((t) => t.includes(kw.toLowerCase()))
  );

  // 8. Build the LLM prompt
  const difficultyLabel = metrics.kd !== null
    ? metrics.kd >= 70 ? "haute" : metrics.kd >= 40 ? "moyenne" : "basse"
    : "inconnue";

  const competitorList = competitorsToOutrank
    .slice(0, 3)
    .map((c) => `  - ${c.domain} (${c.wordCount ?? "?"} mots, position ${c.position})`)
    .join("\n");

  const briefPrompt = `Tu dois rédiger un article sur "${targetKeyword}".
Le volume de recherche est de ${metrics.volume ?? "inconnu"}/mois, la difficulté est ${difficultyLabel} (KD: ${metrics.kd ?? "?"}/100).
CPC estimé : ${metrics.cpc ? `${metrics.cpc}€` : "inconnu"}.

Pour battre les concurrents suivants :
${competitorList}

Ton article doit faire au moins ${recommendedWordCount} mots.

Mots-clés sémantiques à intégrer obligatoirement :
${semanticKeywords.join(", ")}

Questions "People Also Ask" à traiter dans la FAQ :
${paaQuestions.map((q) => `  - ${q}`).join("\n")}

${contentGaps.length > 0 ? `Sujets non couverts par les concurrents (opportunités de différenciation) :\n${contentGaps.map((g) => `  - ${g}`).join("\n")}` : ""}

Intention de recherche : ${metrics.searchIntent}.
${metrics.serpFeatures.featuredSnippet ? "⚡ Opportunité de Featured Snippet — structure une réponse concise (40-60 mots) en début d'article." : ""}`;

  const result: ContentBrief = {
    targetKeyword,
    metrics: {
      volume: metrics.volume,
      cpc: metrics.cpc,
      kd: metrics.kd,
      trend: metrics.trend,
    },
    competitorsToOutrank,
    recommendedWordCount,
    semanticKeywords,
    paaQuestions,
    contentGaps,
    serpFeatures: {
      featuredSnippet: metrics.serpFeatures.featuredSnippet,
      knowledgePanel: metrics.serpFeatures.knowledgePanel,
      localPack: metrics.serpFeatures.localPack,
      videoResults: metrics.serpFeatures.videoResults,
    },
    briefPrompt,
    dataSource: metrics.dataSource,
  };

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛠️ HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function inferSearchIntent(
  keyword: string,
  organic: Array<{ link: string }>
): "informational" | "transactional" | "navigational" | "mixed" {
  const kw = keyword.toLowerCase();
  const commercialTerms = ["acheter", "prix", "comparatif", "meilleur", "avis", "pas cher", "promo"];
  const infoTerms = ["comment", "pourquoi", "qu'est-ce", "définition", "guide", "tutoriel", "c'est quoi"];

  const isCommercial = commercialTerms.some((t) => kw.includes(t));
  const isInfo = infoTerms.some((t) => kw.includes(t));

  if (isCommercial && !isInfo) return "transactional";
  if (isInfo && !isCommercial) return "informational";
  if (organic.length > 0 && organic[0].link.includes(kw.replace(/\s+/g, ""))) return "navigational";
  return "mixed";
}

function kdToLabel(kd: number): "easy" | "medium" | "hard" {
  if (kd >= 60) return "hard";
  if (kd >= 30) return "medium";
  return "easy";
}

function volumeToLabel(volume: number): "low" | "medium" | "high" {
  if (volume >= 5000) return "high";
  if (volume >= 500) return "medium";
  return "low";
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function scrapePageStats(
  url: string
): Promise<{ wordCount: number | null; headings: string[] }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SkalleBot/1.0)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return { wordCount: null, headings: [] };

    const html = await response.text();
    const $ = cheerio.load(html);

    // Remove script and style tags
    $("script, style, nav, footer, header").remove();

    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const wordCount = bodyText.split(" ").filter((w) => w.length > 0).length;

    const headings: string[] = [];
    $("h1, h2, h3").each((_, el) => {
      const text = $(el).text().trim();
      if (text) headings.push(text);
    });

    return { wordCount, headings };
  } catch {
    return { wordCount: null, headings: [] };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 NETLINKING OPPORTUNITIES
// ═══════════════════════════════════════════════════════════════════════════

export async function findNetlinkingOpportunities(
  userDomain: string,
  competitorDomains: string[],
  workspaceId: string
): Promise<DomainAuthorityResult["netlinkingOpportunities"]> {
  if (!dataForSEOClient.isConfigured()) return [];

  try {
    // Get referring domains for each competitor
    const competitorReferrers = await Promise.all(
      competitorDomains.map(async (domain) => {
        const refs = await dataForSEOClient.getReferringDomains(domain, 30);
        return { domain, referrers: refs };
      })
    );

    // Get user's referring domains
    const userReferrers = await dataForSEOClient.getReferringDomains(userDomain, 100);
    const userRefSet = new Set(userReferrers.map((r) => r.domain));

    // Find domains that link to competitors but not to user
    const opportunities: DomainAuthorityResult["netlinkingOpportunities"] = [];
    const seenDomains = new Set<string>();

    for (const comp of competitorReferrers) {
      for (const ref of comp.referrers) {
        if (!userRefSet.has(ref.domain) && !seenDomains.has(ref.domain)) {
          seenDomains.add(ref.domain);
          opportunities.push({
            domain: ref.domain,
            rank: ref.rank,
            reason: `Fait un lien vers ${comp.domain} mais pas vers vous`,
          });
        }
      }
    }

    return opportunities
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 20);
  } catch {
    return [];
  }
}
