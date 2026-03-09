interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface SerperResponse {
  organic: SerperResult[];
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
  };
}

export interface SerperMapsPlace {
  title: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
  position: number;
  placeId?: string;
  category?: string;
  thumbnailUrl?: string;
  latitude?: number;
  longitude?: number;
}

interface SerperMapsResponse {
  places: SerperMapsPlace[];
}

export async function searchGoogle(
  query: string,
  num: number = 10
): Promise<SerperResult[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY || "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "fr",
      hl: "fr",
      num,
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.statusText}`);
  }

  const data: SerperResponse = await response.json();
  return data.organic || [];
}

export async function searchGoogleMaps(
  query: string,
  num: number = 20
): Promise<SerperMapsPlace[]> {
  const response = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY || "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "fr",
      hl: "fr",
      num,
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper Maps API error: ${response.statusText}`);
  }

  const data: SerperMapsResponse = await response.json();
  return data.places || [];
}

export async function getTopPagesForDomain(
  domain: string
): Promise<SerperResult[]> {
  // Search for top pages of a domain
  const query = `site:${domain}`;
  return searchGoogle(query, 20);
}

export async function searchCompetitorContent(
  keyword: string,
  excludeDomain?: string
): Promise<SerperResult[]> {
  let query = keyword;
  if (excludeDomain) {
    query = `${keyword} -site:${excludeDomain}`;
  }
  return searchGoogle(query, 10);
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔎 RECHERCHE COMPLÈTE (réponse Serper non tronquée)
// ═══════════════════════════════════════════════════════════════════════════

import type { FullSerperResponse } from "@/types/seo";

export async function searchGoogleFull(
  query: string,
  num: number = 10
): Promise<FullSerperResponse> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY || "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      gl: "fr",
      hl: "fr",
      num,
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    organic: data.organic || [],
    relatedSearches: data.relatedSearches || [],
    peopleAlsoAsk: data.peopleAlsoAsk || [],
    knowledgeGraph: data.knowledgeGraph || undefined,
    answerBox: data.answerBox || undefined,
    searchParameters: data.searchParameters || { q: query, gl: "fr", hl: "fr" },
  };
}

export async function getPeopleAlsoAsk(
  keyword: string
): Promise<string[]> {
  const fullResponse = await searchGoogleFull(keyword);
  return (fullResponse.peopleAlsoAsk || []).map((r) => r.question);
}

export async function getRelatedKeywords(
  mainKeyword: string
): Promise<string[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY || "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: mainKeyword,
      gl: "fr",
      hl: "fr",
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.relatedSearches?.map((r: { query: string }) => r.query) || [];
}
