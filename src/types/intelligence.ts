/**
 * 🧠 Types pour le SEO Data Intelligence Backend
 *
 * Interfaces strictes pour DataForSEO, le cache, et les résultats d'intelligence.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 📡 RÉPONSES DATAFORSEO (API)
// ═══════════════════════════════════════════════════════════════════════════

export interface DataForSEOResponse<T> {
  version: string;
  status_code: number;
  status_message: string;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    result: T[] | null;
  }>;
}

export interface DataForSEOKeywordVolume {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  competition: number | null;
  competition_level: "LOW" | "MEDIUM" | "HIGH" | null;
  monthly_searches: Array<{
    year: number;
    month: number;
    search_volume: number;
  }> | null;
}

export interface DataForSEOKeywordDifficulty {
  keyword: string;
  keyword_difficulty: number; // 0-100
}

export interface DataForSEORelatedKeyword {
  keyword_data: {
    keyword: string;
    search_volume: number | null;
    cpc: number | null;
    competition: number | null;
  };
  related_keywords: string[] | null;
}

export interface DataForSEOKeywordForKeyword {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  competition: number | null;
}

export interface DataForSEOBacklinkSummary {
  target: string;
  rank: number; // Domain rank (0-1000)
  backlinks: number;
  referring_domains: number;
  referring_domains_nofollow: number;
  broken_backlinks: number;
  referring_ips: number;
  referring_subnets: number;
}

export interface DataForSEOReferringDomain {
  domain: string;
  rank: number;
  backlinks: number;
  first_seen: string;
  last_seen: string;
  broken_backlinks: number;
}

export interface DataForSEOSerpItem {
  type: string;
  rank_group: number;
  rank_absolute: number;
  domain: string;
  title: string;
  url: string;
  description: string;
  etv: number | null; // estimated traffic volume
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 RÉSULTATS D'INTELLIGENCE (internes)
// ═══════════════════════════════════════════════════════════════════════════

export type DataSource = "dataforseo" | "serper_fallback" | "heuristic";

export interface KeywordMetrics {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  kd: number | null; // keyword difficulty 0-100
  competition: number | null; // 0-1
  trend: number[]; // 12 mois de volumes
  relatedKeywords: Array<{
    keyword: string;
    volume: number | null;
    cpc: number | null;
    kd?: number | null; // Keyword Difficulty (optionnel pour compatibilité)
    competition?: number | string | null; // Concurrence (optionnel pour compatibilité)
  }>;
  paaQuestions: string[];
  serpFeatures: {
    featuredSnippet: boolean;
    knowledgePanel: boolean;
    localPack: boolean;
    videoResults: boolean;
    imageResults: boolean;
  };
  searchIntent: "informational" | "transactional" | "navigational" | "mixed";
  dataSource: DataSource;
}

export interface CompetitorDomainAnalysis {
  domain: string;
  organicTraffic: number | null;
  keywordsTop3: number | null;
  keywordsTop10: number | null;
  keywordsTop100: number | null;
  topPages: Array<{
    url: string;
    title: string;
    trafficEstimate: number | null;
    position: number;
    keyword: string;
  }>;
  dataSource: DataSource;
}

export interface ContentGapResult {
  userDomain: string;
  competitorDomains: string[];
  gaps: Array<{
    keyword: string;
    volume: number | null;
    kd: number | null;
    competitorPositions: Record<string, number>; // domain → position
    userPosition: number | null; // null = absent
    opportunity: "high" | "medium" | "low";
  }>;
  totalGaps: number;
  dataSource: DataSource;
}

export interface DomainAuthorityResult {
  domain: string;
  authorityScore: number; // 0-100 (normalisé depuis rank DataForSEO)
  referringDomains: number;
  totalBacklinks: number;
  toxicLinksRatio: number; // 0-1
  topReferringDomains: Array<{
    domain: string;
    rank: number;
    backlinks: number;
  }>;
  netlinkingOpportunities: Array<{
    domain: string;
    rank: number;
    reason: string;
  }>;
  dataSource: DataSource;
}

export interface ContentBrief {
  targetKeyword: string;
  metrics: {
    volume: number | null;
    cpc: number | null;
    kd: number | null;
    trend: number[];
  };
  competitorsToOutrank: Array<{
    domain: string;
    title: string;
    url: string;
    position: number;
    wordCount: number | null;
    headings: string[];
  }>;
  recommendedWordCount: number;
  semanticKeywords: string[];
  paaQuestions: string[];
  contentGaps: string[];
  serpFeatures: {
    featuredSnippet: boolean;
    knowledgePanel: boolean;
    localPack: boolean;
    videoResults: boolean;
  };
  briefPrompt: string;
  dataSource: DataSource;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🗄️ CACHE
// ═══════════════════════════════════════════════════════════════════════════

export type IntelligenceCacheType =
  | "keyword_metrics"
  | "competitor"
  | "backlink"
  | "content_gap";

export const CACHE_TTL_DAYS: Record<IntelligenceCacheType, number> = {
  keyword_metrics: 30,
  competitor: 14,
  backlink: 14,
  content_gap: 7,
};
