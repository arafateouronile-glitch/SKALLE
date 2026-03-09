/**
 * 📡 Client DataForSEO
 *
 * Client HTTP pour l'API DataForSEO avec :
 * - Authentification Base64 (login/password)
 * - Retry automatique (1 retry avec backoff)
 * - Typage strict des réponses
 * - Détection d'absence de clé API
 */

import type {
  DataForSEOResponse,
  DataForSEOKeywordVolume,
  DataForSEOKeywordDifficulty,
  DataForSEOKeywordForKeyword,
  DataForSEOBacklinkSummary,
  DataForSEOReferringDomain,
  DataForSEOSerpItem,
} from "@/types/intelligence";

const DATAFORSEO_BASE_URL = "https://api.dataforseo.com";

class DataForSEOClient {
  private authHeader: string | null;

  constructor() {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;

    if (login && password) {
      this.authHeader = `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
    } else {
      this.authHeader = null;
    }
  }

  isConfigured(): boolean {
    return this.authHeader !== null;
  }

  private async request<T>(
    endpoint: string,
    body: unknown[]
  ): Promise<DataForSEOResponse<T>> {
    if (!this.authHeader) {
      throw new DataForSEOError("DataForSEO non configuré (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD manquants)");
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`${DATAFORSEO_BASE_URL}${endpoint}`, {
          method: "POST",
          headers: {
            Authorization: this.authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new DataForSEOError(
            `API DataForSEO erreur ${response.status}: ${response.statusText}. ${text}`,
            response.status
          );
        }

        const data: DataForSEOResponse<T> = await response.json();

        if (data.status_code !== 20000) {
          throw new DataForSEOError(
            `DataForSEO status ${data.status_code}: ${data.status_message}`,
            data.status_code
          );
        }

        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    throw lastError!;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🔑 KEYWORDS DATA
  // ═══════════════════════════════════════════════════════════════════════

  async getSearchVolume(
    keywords: string[],
    locationCode: number = 2250, // France
    languageCode: string = "fr"
  ): Promise<DataForSEOKeywordVolume[]> {
    const response = await this.request<DataForSEOKeywordVolume>(
      "/v3/keywords_data/google_ads/search_volume/live",
      [{ keywords, location_code: locationCode, language_code: languageCode }]
    );

    return response.tasks?.[0]?.result || [];
  }

  async getKeywordsForKeyword(
    keyword: string,
    locationCode: number = 2250,
    languageCode: string = "fr",
    limit: number = 20
  ): Promise<DataForSEOKeywordForKeyword[]> {
    const response = await this.request<DataForSEOKeywordForKeyword>(
      "/v3/keywords_data/google_ads/keywords_for_keywords/live",
      [
        {
          keywords: [keyword],
          location_code: locationCode,
          language_code: languageCode,
          limit,
        },
      ]
    );

    return response.tasks?.[0]?.result || [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🧪 DATAFORSEO LABS
  // ═══════════════════════════════════════════════════════════════════════

  async getKeywordDifficulty(
    keywords: string[],
    locationCode: number = 2250,
    languageCode: string = "fr"
  ): Promise<DataForSEOKeywordDifficulty[]> {
    const response = await this.request<DataForSEOKeywordDifficulty>(
      "/v3/dataforseo_labs/google/keyword_difficulty/live",
      [{ keywords, location_code: locationCode, language_code: languageCode }]
    );

    return response.tasks?.[0]?.result || [];
  }

  async getDomainOrganicKeywords(
    domain: string,
    locationCode: number = 2250,
    languageCode: string = "fr",
    limit: number = 100
  ): Promise<DataForSEOSerpItem[]> {
    const response = await this.request<DataForSEOSerpItem>(
      "/v3/dataforseo_labs/google/ranked_keywords/live",
      [
        {
          target: domain,
          location_code: locationCode,
          language_code: languageCode,
          limit,
          order_by: ["keyword_data.keyword_info.search_volume,desc"],
        },
      ]
    );

    return response.tasks?.[0]?.result || [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🔗 BACKLINKS
  // ═══════════════════════════════════════════════════════════════════════

  async getBacklinkSummary(
    target: string
  ): Promise<DataForSEOBacklinkSummary | null> {
    const response = await this.request<DataForSEOBacklinkSummary>(
      "/v3/backlinks/summary/live",
      [{ target, internal_list_limit: 0, backlinks_status_type: "live" }]
    );

    return response.tasks?.[0]?.result?.[0] || null;
  }

  async getReferringDomains(
    target: string,
    limit: number = 50
  ): Promise<DataForSEOReferringDomain[]> {
    const response = await this.request<DataForSEOReferringDomain>(
      "/v3/backlinks/referring_domains/live",
      [
        {
          target,
          limit,
          order_by: ["rank,desc"],
          backlinks_status_type: "live",
        },
      ]
    );

    return response.tasks?.[0]?.result || [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🔍 SERP
  // ═══════════════════════════════════════════════════════════════════════

  async getLiveSerpResults(
    keyword: string,
    locationCode: number = 2250,
    languageCode: string = "fr",
    depth: number = 20
  ): Promise<DataForSEOSerpItem[]> {
    const response = await this.request<{
      items: DataForSEOSerpItem[];
    }>(
      "/v3/serp/google/organic/live/regular",
      [
        {
          keyword,
          location_code: locationCode,
          language_code: languageCode,
          depth,
        },
      ]
    );

    const result = response.tasks?.[0]?.result?.[0];
    if (result && "items" in result) {
      return (result as { items: DataForSEOSerpItem[] }).items || [];
    }
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ❌ ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class DataForSEOError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "DataForSEOError";
    this.statusCode = statusCode;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

const globalForDataForSEO = globalThis as unknown as {
  dataForSEOClient: DataForSEOClient | undefined;
};

export const dataForSEOClient =
  globalForDataForSEO.dataForSEOClient ?? new DataForSEOClient();

if (process.env.NODE_ENV !== "production") {
  globalForDataForSEO.dataForSEOClient = dataForSEOClient;
}
