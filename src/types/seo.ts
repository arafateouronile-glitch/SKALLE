/**
 * 🔍 Types partagés pour le module SEO Factory
 *
 * Utilisés par : server actions, API routes, Inngest functions, frontend
 */

// ═══════════════════════════════════════════════════════════════════════════
// 📊 AUDIT SEO
// ═══════════════════════════════════════════════════════════════════════════

export interface TechnicalSEOReport {
  robotsMeta: {
    index: boolean;
    follow: boolean;
    raw: string | null;
  };
  canonical: {
    url: string | null;
    isSelfReferencing: boolean;
  };
  ssl: boolean;
  mobileViewport: boolean;
  pageSpeedHeuristics: {
    domSize: number;
    resourceCount: number;
    scriptCount: number;
    stylesheetCount: number;
    inlineStyleSize: number;
    estimatedScore: "fast" | "moderate" | "slow";
  };
  structuredData: {
    hasJsonLd: boolean;
    types: string[];
    raw: unknown[];
  };
  openGraph: {
    title: string | null;
    description: string | null;
    image: string | null;
    type: string | null;
    url: string | null;
  };
  twitterCards: {
    card: string | null;
    title: string | null;
    description: string | null;
    image: string | null;
  };
  hreflang: string[];
  score: number;
  issues: string[];
}

export interface OnPageSEOReport {
  keywordDensity: {
    keyword: string;
    count: number;
    density: number;
    status: "optimal" | "faible" | "suroptimise";
  } | null;
  readability: {
    score: number;
    level: "facile" | "moyen" | "difficile";
    avgSentenceLength: number;
    avgWordLength: number;
  };
  headingHierarchy: {
    isValid: boolean;
    h1Text: string | null;
    structure: string[];
    issues: string[];
  };
  internalLinkingDepth: number;
  score: number;
  issues: string[];
}

export interface AIRecommendation {
  priority: "high" | "medium" | "low";
  category: "technical" | "content" | "onPage" | "structure";
  title: string;
  description: string;
  estimatedImpact: number; // 1-5
}

export interface CompetitorComparison {
  competitors: Array<{
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
  }>;
  averageScore: number;
  yourScore: number;
  scoreDelta: number;
  strengths: string[];
  weaknesses: string[];
}

export interface EnhancedSEOAuditReport {
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
    h1Text: string | null;
    hierarchy: string[];
    score: number;
    issues: string[];
  };
  images: {
    total: number;
    withAlt: number;
    withoutAlt: string[];
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
  technical: TechnicalSEOReport;
  onPage: OnPageSEOReport;
  aiRecommendations?: AIRecommendation[];
  competitorData?: CompetitorComparison;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔎 KEYWORD RESEARCH
// ═══════════════════════════════════════════════════════════════════════════

export interface KeywordResearchResult {
  keyword: string;
  difficulty: "easy" | "medium" | "hard";
  volumeEstimate: "low" | "medium" | "high";
  topCompetitors: Array<{
    domain: string;
    title: string;
    position: number;
  }>;
  relatedKeywords: string[];
  paaQuestions: string[];
  serpFeatures: {
    featuredSnippet: boolean;
    knowledgePanel: boolean;
    localPack: boolean;
    videoResults: boolean;
    imageResults: boolean;
  };
  searchIntent: "informational" | "transactional" | "navigational" | "mixed";
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 ARTICLE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ArticleOutline {
  title: string;
  metaTitle: string;
  metaDescription: string;
  sections: Array<{
    heading: string;
    level: 2 | 3;
    keyPoints: string[];
    suggestedWordCount: number;
  }>;
  faqQuestions: string[];
  estimatedWordCount: number;
  internalLinkSuggestions: string[];
}

export interface GeneratedArticle {
  title: string;
  content: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  outline: ArticleOutline;
  faqContent: Array<{ question: string; answer: string }>;
  tableOfContents: Array<{ text: string; level: number; id: string }>;
  wordCount: number;
  readabilityScore: number;
  seoScore: number;
  seoFeedback: ContentOptimizationScore;
  relatedKeywords: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 📈 CONTENT OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ContentOptimizationScore {
  overallScore: number;
  keywordDensity: {
    score: number;
    value: number;
    recommendation: string;
  };
  readability: {
    score: number;
    fleschKincaid: number;
    level: string;
    recommendation: string;
  };
  headingStructure: {
    score: number;
    issues: string[];
  };
  contentLength: {
    score: number;
    wordCount: number;
    recommendation: string;
  };
  metaQuality: {
    titleScore: number;
    descriptionScore: number;
    issues: string[];
  };
  internalLinks: {
    score: number;
    count: number;
    suggestion: string;
  };
  faq: {
    present: boolean;
    questionCount: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 FILTRES & PAGINATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ArticleFilters {
  status?: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "createdAt" | "updatedAt" | "title" | "seoScore";
  sortOrder?: "asc" | "desc";
  page?: number;
  perPage?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 SERPER FULL RESPONSE
// ═══════════════════════════════════════════════════════════════════════════

export interface FullSerperResponse {
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
  }>;
  relatedSearches?: Array<{ query: string }>;
  peopleAlsoAsk?: Array<{
    question: string;
    snippet: string;
    link: string;
  }>;
  knowledgeGraph?: {
    title: string;
    type: string;
    description: string;
  };
  answerBox?: {
    title: string;
    answer: string;
  };
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
  };
}
