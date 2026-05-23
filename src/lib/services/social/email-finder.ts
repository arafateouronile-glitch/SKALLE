/**
 * Email discovery for creators and blogs.
 *
 * Strategy 1 — businessEmail from Instagram scraper (HIGH, passed in params)
 * Strategy 2 — regex from bio/description (HIGH)
 * Strategy 3 — Apify: bebity/youtube-channel-email-finder (YouTube, HIGH)
 * Strategy 4 — Apify: vdrmota/contact-info-scraper (blogs/websites, HIGH)
 * Strategy 5 — Serper Google search with platform-specific query (MEDIUM)
 * Strategy 6 — Serper fallback affiliation query (LOW)
 */

import { searchGoogle } from "@/lib/ai/serper";
import { runApifyActor } from "@/lib/services/social/viral-monitor";

export interface EmailFindResult {
  email: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: "instagram_api" | "bio" | "apify_youtube" | "apify_web" | "google" | "google_contact" | "not_found";
}

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const FALSE_POSITIVE_DOMAINS = [
  "example.com", "placeholder.com", "domain.com", "email.com",
  "sentry.io", "githubusercontent.com", "npmjs.com", "wixpress.com",
  "squarespace.com", "shopify.com",
];

export function extractEmail(text: string): string | null {
  const matches = [...new Set(text.match(EMAIL_RE) ?? [])];
  return (
    matches.find((e) => {
      if (/\.(png|jpg|svg|gif|webp|css|js)$/i.test(e)) return false;
      const domain = e.split("@")[1];
      return !FALSE_POSITIVE_DOMAINS.includes(domain);
    }) ?? null
  );
}

// ─── Apify strategies ─────────────────────────────────────────────────────────

interface ApifyYTEmailResult {
  channelId?: string;
  email?: string;
  businessEmail?: string;
  emails?: string[];
}

async function apifyYoutubeEmail(channelId: string): Promise<string | null> {
  if (!process.env.APIFY_API_TOKEN) return null;
  try {
    const results = await runApifyActor<ApifyYTEmailResult>(
      "bebity/youtube-channel-email-finder",
      { channelIds: [channelId], maxItems: 1 }
    );
    const item = results[0];
    if (!item) return null;
    const candidates = [
      item.email,
      item.businessEmail,
      ...(item.emails ?? []),
    ].filter(Boolean) as string[];
    return candidates.find((e) => extractEmail(e) === e) ?? null;
  } catch {
    return null;
  }
}

interface ApifyContactResult {
  emails?: string[];
  email?: string;
  phones?: string[];
}

async function apifyWebEmail(domain: string): Promise<string | null> {
  if (!process.env.APIFY_API_TOKEN) return null;
  try {
    const results = await runApifyActor<ApifyContactResult>(
      "vdrmota/contact-info-scraper",
      {
        startUrls: [
          { url: `https://${domain}/contact` },
          { url: `https://${domain}/about` },
          { url: `https://${domain}` },
        ],
        maxDepth: 1,
        maxPagesPerStartUrl: 2,
      }
    );
    for (const r of results) {
      const candidates = [...(r.emails ?? []), ...(r.email ? [r.email] : [])];
      const found = candidates.find(
        (e) => !FALSE_POSITIVE_DOMAINS.includes(e.split("@")[1])
      );
      if (found) return found;
    }
  } catch {
    return null;
  }
  return null;
}

// ─── Serper fallback ──────────────────────────────────────────────────────────

async function googleEmail(query: string): Promise<string | null> {
  if (!process.env.SERPER_API_KEY) return null;
  try {
    const results = await searchGoogle(query, 5);
    for (const r of results) {
      const email = extractEmail(`${r.title} ${r.snippet} ${r.link}`);
      if (email) return email;
    }
  } catch {
    // silently ignore
  }
  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function findCreatorEmail(params: {
  platform: "youtube" | "linkedin" | "facebook" | "blog" | "instagram";
  name: string;
  bio?: string;
  domain?: string;
  channelId?: string;
  businessEmail?: string;
}): Promise<EmailFindResult> {
  const { platform, name, bio, domain, channelId, businessEmail } = params;

  // Strategy 1: Instagram businessEmail from scraper
  if (platform === "instagram" && businessEmail) {
    const clean = extractEmail(businessEmail);
    if (clean) return { email: clean, confidence: "HIGH", source: "instagram_api" };
  }

  // Strategy 2: regex from bio/description
  if (bio) {
    const email = extractEmail(bio);
    if (email) return { email, confidence: "HIGH", source: "bio" };
  }

  // Strategy 3: Apify YouTube email finder (requires channelId)
  if (platform === "youtube" && channelId) {
    const email = await apifyYoutubeEmail(channelId);
    if (email) return { email, confidence: "HIGH", source: "apify_youtube" };
  }

  // Strategy 4: Apify contact-info scraper for blogs and websites
  if ((platform === "blog" || platform === "youtube") && domain) {
    const email = await apifyWebEmail(domain);
    if (email) return { email, confidence: "HIGH", source: "apify_web" };
  }

  // Strategy 5: Serper platform-tailored query
  const queryMap: Record<string, string> = {
    youtube: `"${name}" email contact partenariat youtube`,
    linkedin: `"${name}" email contact -site:linkedin.com`,
    facebook: `"${name}" email contact -site:facebook.com`,
    instagram: `"${name}" email contact -site:instagram.com`,
    blog: domain ? `site:${domain} contact email` : `"${name}" email contact blog`,
  };
  const googleResult = await googleEmail(queryMap[platform] ?? `"${name}" email contact`);
  if (googleResult) return { email: googleResult, confidence: "MEDIUM", source: "google" };

  // Strategy 6: generic affiliation fallback
  if (platform !== "linkedin") {
    const fallback = await googleEmail(`"${name}" email partenariat affiliation`);
    if (fallback) return { email: fallback, confidence: "LOW", source: "google_contact" };
  }

  return { email: null, confidence: "LOW", source: "not_found" };
}
