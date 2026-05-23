/**
 * Email discovery for creators and blogs.
 *
 * Strategy 1 — regex from bio/description (immediate, HIGH confidence)
 * Strategy 2 — Google search via Serper, regex in snippets (MEDIUM)
 * Strategy 3 — blog-specific: site:domain contact query (LOW)
 */

import { searchGoogle } from "@/lib/ai/serper";

export interface EmailFindResult {
  email: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: "bio" | "google" | "google_contact" | "not_found";
}

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const FALSE_POSITIVE_DOMAINS = [
  "example.com", "placeholder.com", "domain.com", "email.com",
  "sentry.io", "githubusercontent.com", "npmjs.com",
];

function extractEmail(text: string): string | null {
  const matches = [...new Set(text.match(EMAIL_RE) ?? [])];
  return (
    matches.find((e) => {
      if (e.endsWith(".png") || e.endsWith(".jpg") || e.endsWith(".svg")) return false;
      const domain = e.split("@")[1];
      return !FALSE_POSITIVE_DOMAINS.includes(domain);
    }) ?? null
  );
}

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

export async function findCreatorEmail(params: {
  platform: "youtube" | "linkedin" | "facebook" | "blog" | "instagram";
  name: string;
  bio?: string;
  domain?: string;
}): Promise<EmailFindResult> {
  const { platform, name, bio, domain } = params;

  // Strategy 1: bio/description
  if (bio) {
    const email = extractEmail(bio);
    if (email) return { email, confidence: "HIGH", source: "bio" };
  }

  // Strategy 2: platform-tailored Google query
  const queryMap: Record<string, string> = {
    youtube: `"${name}" email contact partenariat youtube`,
    linkedin: `"${name}" email contact -site:linkedin.com`,
    facebook: `"${name}" email contact -site:facebook.com`,
    instagram: `"${name}" email contact -site:instagram.com`,
    blog: domain ? `site:${domain} contact email` : `"${name}" email contact blog`,
  };

  const email = await googleEmail(queryMap[platform] ?? `"${name}" email contact`);
  if (email) return { email, confidence: "MEDIUM", source: "google" };

  // Strategy 3: fallback for blogs
  if ((platform === "blog" || platform === "youtube") && name) {
    const fallback = await googleEmail(`"${name}" email partenariat affiliation`);
    if (fallback) return { email: fallback, confidence: "LOW", source: "google_contact" };
  }

  return { email: null, confidence: "LOW", source: "not_found" };
}
