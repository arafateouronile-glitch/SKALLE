/**
 * 🏢 Google Business Scraper - Google Maps → Entreprises locales → Leads
 *
 * Utilise Serper Maps API pour trouver des entreprises/PME,
 * puis extrait les emails de contact depuis leurs sites web via cheerio.
 */

import { searchGoogleMaps, type SerperMapsPlace } from "@/lib/ai/serper";
import type { ScrapedLead } from "./scraper";
import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GoogleBusinessSearchParams {
  keywords: string[];
  locations: string[];
  requireEmail?: boolean;
  requirePhone?: boolean;
  requireWebsite?: boolean;
  minRating?: number;
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 QUERY BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildGoogleMapsQueries(params: GoogleBusinessSearchParams): string[] {
  const keywordsStr = params.keywords.join(" ");

  if (params.locations.length > 0) {
    return params.locations.map((loc) => `${keywordsStr} ${loc}`);
  }

  return [keywordsStr];
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 EMAIL EXTRACTION FROM WEBSITE
// ═══════════════════════════════════════════════════════════════════════════

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const EXCLUDED_EMAIL_PATTERNS = [
  "noreply",
  "no-reply",
  "unsubscribe",
  "@sentry",
  "@example",
  "wixpress",
  "@wix.com",
  "@wordpress",
  "@w3.org",
  "@schema.org",
  "@googlemail",
];

function filterEmails(emails: string[]): string[] {
  return [...new Set(emails)].filter((email) => {
    const lower = email.toLowerCase();
    return (
      !EXCLUDED_EMAIL_PATTERNS.some((p) => lower.includes(p)) &&
      !lower.endsWith(".png") &&
      !lower.endsWith(".jpg") &&
      !lower.endsWith(".svg") &&
      !lower.endsWith(".gif") &&
      lower.length < 60
    );
  });
}

async function fetchPage(url: string, timeoutMs: number = 8000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractEmailsFromHtml($: ReturnType<typeof cheerio.load>): string[] {
  const emails: string[] = [];

  // From mailto: links
  $('a[href^="mailto:"]').each((_, el) => {
    const mailto = $(el).attr("href")?.replace("mailto:", "").split("?")[0]?.trim();
    if (mailto) emails.push(mailto);
  });

  // From page text via regex
  const bodyText = $("body").text();
  const regexEmails = bodyText.match(EMAIL_REGEX) || [];
  emails.push(...regexEmails);

  return emails;
}

function extractPhoneFromHtml($: ReturnType<typeof cheerio.load>): string | undefined {
  let phone: string | undefined;
  $('a[href^="tel:"]').each((_, el) => {
    if (!phone) {
      phone = $(el).attr("href")?.replace("tel:", "").trim();
    }
  });
  return phone;
}

async function scrapeContactEmailFromWebsite(
  websiteUrl: string
): Promise<{ email?: string; emails: string[]; phone?: string }> {
  // Fetch main page
  const mainHtml = await fetchPage(websiteUrl);
  if (!mainHtml) return { emails: [] };

  const $ = cheerio.load(mainHtml);
  let allEmails = extractEmailsFromHtml($);
  let phone = extractPhoneFromHtml($);

  // If no emails found, try the contact page
  if (allEmails.length === 0) {
    const contactLink = $(
      'a[href*="contact"], a[href*="nous-contacter"], a[href*="about"], a[href*="a-propos"]'
    )
      .first()
      .attr("href");

    if (contactLink) {
      const contactUrl = contactLink.startsWith("http")
        ? contactLink
        : new URL(contactLink, websiteUrl).toString();

      const contactHtml = await fetchPage(contactUrl, 5000);
      if (contactHtml) {
        const $c = cheerio.load(contactHtml);
        allEmails.push(...extractEmailsFromHtml($c));
        if (!phone) phone = extractPhoneFromHtml($c);
      }
    }
  }

  const filtered = filterEmails(allEmails);

  return {
    email: filtered[0],
    emails: filtered,
    phone,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 CONVERSION Maps → ScrapedLead
// ═══════════════════════════════════════════════════════════════════════════

function convertPlaceToLead(
  place: SerperMapsPlace,
  emailData: { email?: string; phone?: string },
  industry: string
): ScrapedLead {
  return {
    name: place.title,
    email: emailData.email,
    emailVerified: false,
    emailScore: emailData.email ? 60 : 0,
    phone: place.phone || emailData.phone,
    phoneVerified: !!place.phone,
    linkedInUrl: "",
    company: place.title,
    jobTitle: undefined,
    location: place.address,
    industry: place.category || industry,
    enrichmentData: {
      source: "google-business-scraper",
      googleRating: place.rating,
      googleReviewCount: place.ratingCount,
      googleCategory: place.category,
      googlePlaceId: place.placeId,
      websiteUrl: place.website,
      googleAddress: place.address,
      coordinates:
        place.latitude && place.longitude
          ? { lat: place.latitude, lng: place.longitude }
          : undefined,
      emailSource: emailData.email ? "website-scrape" : undefined,
      scrapedAt: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export async function scrapeGoogleBusinessLeads(
  params: GoogleBusinessSearchParams
): Promise<{ success: boolean; leads?: ScrapedLead[]; error?: string }> {
  if (!process.env.SERPER_API_KEY) {
    return { success: false, error: "SERPER_API_KEY non configurée" };
  }

  if (!params.keywords?.length) {
    return { success: false, error: "Mots-clés requis pour la recherche Google Business" };
  }

  try {
    const limit = Math.min(params.limit || 50, 100);
    const leads: ScrapedLead[] = [];
    const industry = params.keywords.join(", ");

    // Limiter à 3 requêtes max pour éviter les timeouts (prendre les lieux les plus pertinents)
    const allQueries = buildGoogleMapsQueries(params);
    const queries = allQueries.slice(0, 3);
    logger.debug(`[GoogleBiz] ${queries.length} requête(s) Maps à exécuter`, { count: queries.length });

    for (const query of queries) {
      if (leads.length >= limit) break;

      logger.debug(`[GoogleBiz] Query`, { query });
      const places = await searchGoogleMaps(query, Math.min(limit - leads.length, 20));
      logger.debug(`[GoogleBiz] résultats Maps`, { count: places.length });

      // Filtrer en premier (sans scraping)
      const filtered = places.filter((place) => {
        if (params.minRating && place.rating != null && place.rating < params.minRating) return false;
        if (params.requirePhone && !place.phone) return false;
        if (params.requireWebsite && !place.website) return false;
        return true;
      });

      if (!params.requireEmail) {
        // Sans email requis : retourner directement les résultats Maps sans scraping
        for (const place of filtered) {
          if (leads.length >= limit) break;
          leads.push(convertPlaceToLead(place, {}, industry));
        }
      } else {
        // Avec email requis : scraper les sites en parallèle (max 5 simultanés)
        const toScrape = filtered.slice(0, limit - leads.length);
        const batches = chunkArray(toScrape, 5);

        for (const batch of batches) {
          if (leads.length >= limit) break;

          const results = await Promise.all(
            batch.map(async (place) => {
              if (!place.website) return { place, emailData: {} as { email?: string; phone?: string } };
              logger.debug(`[GoogleBiz] Scraping`, { url: place.website });
              const scraped = await scrapeContactEmailFromWebsite(place.website);
              return { place, emailData: { email: scraped.email, phone: scraped.phone } };
            })
          );

          for (const { place, emailData } of results) {
            if (leads.length >= limit) break;
            if (!emailData.email) continue;
            leads.push(convertPlaceToLead(place, emailData, industry));
          }
        }
      }
    }

    logger.info(`[GoogleBiz] Extraction terminée`, { leads: leads.length });
    return { success: true, leads };
  } catch (error) {
    logger.error("Google Business scraper error", { error: String(error) });
    return { success: false, error: String(error) };
  }
}
