/**
 * Apify scrapers pour les bibliothèques publicitaires
 *
 * Acteurs utilisés :
 * - Facebook Ads Library : apify/facebook-ads-scraper
 * - TikTok Creative Center : clockworks/tiktok-creative-center-top-ads
 * - LinkedIn Ads Library  : curious_coder~linkedin-ads-library
 * - Google Ads Transparency: apify/google-ads-transparency-scraper
 *
 * Nécessite : APIFY_API_TOKEN dans les variables d'environnement.
 * Si absent → caller doit utiliser les données mockées.
 */

import type { RawScrapedAd, AdPlatform } from "./intelligence";

const APIFY_BASE = "https://api.apify.com/v2";

// ─────────────────────────────────────────────────────────────────────────────
// RUNNER GÉNÉRIQUE
// ─────────────────────────────────────────────────────────────────────────────

async function runActor<T>(actorId: string, input: unknown): Promise<T[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN manquant");

  const res = await fetch(
    `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${token}&memory=256&timeout=90`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(100_000),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify ${actorId} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function daysFromNow(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr).getTime();
  if (isNaN(d)) return 0;
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FACEBOOK / META ADS LIBRARY  (apify/facebook-ads-scraper)
// ─────────────────────────────────────────────────────────────────────────────

interface ApifyFbAd {
  adId?: string;
  id?: string;
  adCreativeBody?: string;
  adCreativeLinkCaption?: string;
  adCreativeLinkTitle?: string;
  pageId?: string;
  pageName?: string;
  adDeliveryStartTime?: string;
  adDeliveryStopTime?: string;
  adSnapshotUrl?: string;
  snapshotUrl?: string;
  impressionsLowerBound?: number;
  impressionsUpperBound?: number;
  spendLowerBound?: number;
  currency?: string;
}

export async function fetchMetaAdsApify(
  keyword: string,
  country: string,
  limit: number
): Promise<RawScrapedAd[]> {
  const items = await runActor<ApifyFbAd>("apify/facebook-ads-scraper", {
    queries: [keyword],
    country: country === "ALL" ? "FR" : country.split(",")[0].trim(),
    maxAdsPerQuery: Math.min(limit, 30),
    activeStatus: "ALL",
  });

  return items
    .filter((item) => item.adCreativeBody || item.adCreativeLinkTitle)
    .map((item) => {
      const body = [item.adCreativeBody, item.adCreativeLinkCaption, item.adCreativeLinkTitle]
        .filter(Boolean)
        .join(" — ");
      const started = item.adDeliveryStartTime;
      const stopped = item.adDeliveryStopTime;
      const daysActive = daysFromNow(started);
      const isActive = !stopped || new Date(stopped).getTime() > Date.now();
      const views = item.impressionsLowerBound
        ? Math.round((item.impressionsLowerBound + (item.impressionsUpperBound ?? item.impressionsLowerBound)) / 2)
        : null;

      return {
        platform: "META" as AdPlatform,
        adLibraryId: `META-APF-${item.adId ?? item.id ?? Math.random().toString(36).slice(2)}`,
        advertiserName: item.pageName ?? "Annonceur inconnu",
        advertiserDomain: null,
        industry: null,
        adContent: body,
        mediaUrl: item.adSnapshotUrl ?? item.snapshotUrl ?? null,
        isActive,
        daysActive,
        viewCount: views,
        likeCount: null,
        commentCount: null,
        startDate: started,
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TIKTOK CREATIVE CENTER  (clockworks/tiktok-creative-center-top-ads)
// ─────────────────────────────────────────────────────────────────────────────

interface ApifyTikTokAd {
  itemId?: string;
  video_id?: string;
  brand_name?: string;
  brand?: { brand_name?: string };
  video_cover?: { url_list?: string[] };
  video_info?: { duration?: number };
  ad_title?: string;
  ad_text?: string;
  ctr_str?: string;
  play_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

export async function fetchTikTokAdsApify(
  keyword: string,
  country: string,
  limit: number
): Promise<RawScrapedAd[]> {
  const cc = country === "ALL" ? "FR" : country.split(",")[0].trim().toUpperCase();

  const items = await runActor<ApifyTikTokAd>("clockworks/tiktok-creative-center-top-ads", {
    country: cc,
    industry: keyword,
    objective: "CONVERSIONS",
    period: 30,
    maxItems: Math.min(limit, 50),
  });

  return items.map((item, i) => {
    const brand = item.brand?.brand_name ?? item.brand_name ?? "Annonceur TikTok";
    const text = item.ad_title ?? item.ad_text ?? `Publicité TikTok — ${brand}`;
    const mediaUrl = item.video_cover?.url_list?.[0] ?? null;

    return {
      platform: "TIKTOK" as AdPlatform,
      adLibraryId: `TK-${item.itemId ?? item.video_id ?? `${Date.now()}-${i}`}`,
      advertiserName: brand,
      advertiserDomain: null,
      industry: keyword,
      adContent: text,
      mediaUrl,
      isActive: true,
      daysActive: 30,
      viewCount: item.play_count ?? null,
      likeCount: item.like_count ?? null,
      commentCount: item.comment_count ?? null,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LINKEDIN ADS LIBRARY  (curious_coder~linkedin-ads-library)
// ─────────────────────────────────────────────────────────────────────────────

interface ApifyLinkedInAd {
  adId?: string;
  id?: string;
  advertiserName?: string;
  companyName?: string;
  adContent?: string;
  description?: string;
  headline?: string;
  mediaUrl?: string;
  imageUrl?: string;
  startDate?: string;
  impressions?: number;
  clicks?: number;
  likes?: number;
  comments?: number;
  industry?: string;
}

export async function fetchLinkedInAdsApify(
  keyword: string,
  country: string,
  limit: number
): Promise<RawScrapedAd[]> {
  const items = await runActor<ApifyLinkedInAd>("curious_coder~linkedin-ads-library", {
    keywords: [keyword],
    country: country === "ALL" ? "FR" : country.split(",")[0].trim(),
    maxResults: Math.min(limit, 30),
  });

  return items.map((item, i) => {
    const content = [item.adContent, item.headline, item.description].filter(Boolean).join(" — ");

    return {
      platform: "LINKEDIN" as AdPlatform,
      adLibraryId: `LI-${item.adId ?? item.id ?? `${Date.now()}-${i}`}`,
      advertiserName: item.advertiserName ?? item.companyName ?? "Annonceur LinkedIn",
      advertiserDomain: null,
      industry: item.industry ?? keyword,
      adContent: content || `Publicité LinkedIn — ${item.advertiserName ?? keyword}`,
      mediaUrl: item.mediaUrl ?? item.imageUrl ?? null,
      isActive: true,
      daysActive: item.startDate ? daysFromNow(item.startDate) : 30,
      viewCount: item.impressions ?? null,
      likeCount: item.likes ?? null,
      commentCount: item.comments ?? null,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GOOGLE ADS TRANSPARENCY CENTER  (apify/google-ads-transparency-scraper)
// ─────────────────────────────────────────────────────────────────────────────

interface ApifyGoogleAd {
  adId?: string;
  advertiserName?: string;
  advertiserDomain?: string;
  adCreativeText?: string;
  headline?: string;
  description?: string;
  imageUrl?: string;
  firstShownDate?: string;
  lastShownDate?: string;
  impressionsRange?: string;
  region?: string;
}

export async function fetchGoogleAdsApify(
  keyword: string,
  country: string,
  limit: number
): Promise<RawScrapedAd[]> {
  const cc = country === "ALL" ? "FR" : country.split(",")[0].trim().toUpperCase();

  const items = await runActor<ApifyGoogleAd>("apify/google-ads-transparency-scraper", {
    query: keyword,
    country: cc,
    maxResults: Math.min(limit, 25),
  });

  return items.map((item, i) => {
    const content = [item.adCreativeText, item.headline, item.description].filter(Boolean).join(" — ");
    const estViews = parseImpressionsRange(item.impressionsRange);

    return {
      platform: "META" as AdPlatform, // pas de type GOOGLE — on l'encode en META avec un prefix ID
      adLibraryId: `GOOGLE-${item.adId ?? `${Date.now()}-${i}`}`,
      advertiserName: item.advertiserName ?? "Annonceur Google",
      advertiserDomain: item.advertiserDomain ?? null,
      industry: keyword,
      adContent: content || `Publicité Google — ${item.advertiserName ?? keyword}`,
      mediaUrl: item.imageUrl ?? null,
      isActive: !item.lastShownDate || new Date(item.lastShownDate).getTime() > Date.now() - 7 * 86_400_000,
      daysActive: item.firstShownDate ? daysFromNow(item.firstShownDate) : 0,
      viewCount: estViews,
      likeCount: null,
      commentCount: null,
    };
  });
}

function parseImpressionsRange(range?: string): number | null {
  if (!range) return null;
  // "10K - 100K" → midpoint
  const numbers = range.replace(/K/gi, "000").replace(/M/gi, "000000").match(/\d+/g);
  if (!numbers) return null;
  const vals = numbers.map(Number).filter(Boolean);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
