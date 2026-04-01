/**
 * 🔗 LinkedIn Enricher - Enrichissement de profils LinkedIn
 *
 * Extrait les données structurées depuis les profils LinkedIn via :
 * 1. Scrape direct (balises og: du profil public)
 * 2. Snippet Google via Serper (fallback si LinkedIn bloque)
 *
 * Données extraites : jobTitle, company, location, industry,
 * companySize, connections, bio, recentActivity
 */

import * as cheerio from "cheerio";
import { searchGoogle } from "@/lib/ai/serper";
import { logger } from "@/lib/logger";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface LinkedInProfile {
  name?: string;
  jobTitle?: string;
  company?: string;
  location?: string;
  industry?: string;
  companySize?: string;
  connections?: string; // "500+", "1K+", etc.
  bio?: string;
  recentActivity?: string;
  source: "direct" | "google-snippet";
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 PARSERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse le titre Google LinkedIn :
 * "Jean Dupont | Directeur FP&A chez BNP Paribas | LinkedIn"
 * "Jean Dupont - FP&A Director - BNP Paribas | LinkedIn"
 */
function parseTitleParts(title: string): { name?: string; jobTitle?: string; company?: string } {
  const cleaned = title
    .replace(/\s*[|–-]\s*LinkedIn\s*$/i, "")
    .trim();

  // Séparer par " | " ou " - " ou " – "
  const parts = cleaned.split(/\s*[\|–]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) return {};

  const name = parts[0];

  // Chercher "chez/at/·" dans les parties suivantes
  let jobTitle: string | undefined;
  let company: string | undefined;

  for (const part of parts.slice(1)) {
    const chezMatch = part.match(/^(.+?)\s+(?:chez|at|@)\s+(.+)$/i);
    if (chezMatch) {
      jobTitle = chezMatch[1].trim();
      company = chezMatch[2].trim();
      break;
    }
  }

  // Fallback : 2ème partie = jobTitle, 3ème = company
  if (!jobTitle && parts[1]) jobTitle = parts[1];
  if (!company && parts[2]) company = parts[2];

  return { name, jobTitle, company };
}

/**
 * Extrait la localisation depuis un snippet LinkedIn
 * Formats courants : "Paris, Île-de-France · 500+ relations"
 * ou "Localisation : Paris | Secteur : Finance"
 */
function parseLocation(snippet: string): string | undefined {
  const patterns = [
    /^([A-ZÀ-Ü][a-zà-ü\s-]+(?:,\s*[A-ZÀ-Ü][a-zà-ü\s-]+)?)\s*[·•|]/,
    /(?:Localisation|Location|Région)\s*[:\s]+([^·•|\n]+)/i,
    /\b([A-ZÀ-Ü][a-zà-ü]+(?:,\s*[A-ZÀ-Ü][a-zà-ü\s-]+)?),\s*(?:France|Île-de-France|Rhône|Bouches)/,
  ];

  for (const pattern of patterns) {
    const match = snippet.match(pattern);
    if (match) return match[1].trim();
  }

  return undefined;
}

/**
 * Extrait le nombre de relations LinkedIn
 * "500+ relations", "1 000 abonnés", "1K+"
 */
function parseConnections(text: string): string | undefined {
  const match = text.match(/(\d[\d\s]*[KkMm]?\+?)\s*(?:relations?|abonnés?|followers?|connections?)/i);
  return match ? match[1].replace(/\s/g, "").trim() : undefined;
}

/**
 * Infère l'industrie depuis le titre ou snippet
 */
function inferIndustry(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  const industries: [string[], string][] = [
    [["banque", "finance", "fintech", "trading", "investissement", "fp&a", "trésorerie"], "Finance & Banque"],
    [["assurance", "mutuelle", "prévoyance", "réassurance"], "Assurance"],
    [["logiciel", "saas", "software", "tech", "développement", "digital", "ia", "cloud"], "Tech & Logiciel"],
    [["conseil", "consulting", "audit", "stratégie", "management"], "Conseil"],
    [["santé", "médecin", "hôpital", "pharma", "médical", "clinique"], "Santé"],
    [["immobilier", "property", "promotion immobilière"], "Immobilier"],
    [["marketing", "communication", "publicité", "agence"], "Marketing & Com"],
    [["rh", "recrutement", "ressources humaines", "talents"], "RH & Recrutement"],
    [["formation", "éducation", "enseignement", "université"], "Formation & Éducation"],
    [["industrie", "manufacturing", "production", "usine"], "Industrie"],
    [["retail", "commerce", "distribution", "vente"], "Commerce & Retail"],
    [["juridique", "avocat", "droit", "notaire", "cabinet"], "Juridique"],
  ];

  for (const [keywords, label] of industries) {
    if (keywords.some((kw) => lowerText.includes(kw))) return label;
  }

  return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1️⃣ STRATÉGIE 1 - Scrape direct du profil public LinkedIn
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeLinkedInDirect(linkedInUrl: string): Promise<LinkedInProfile | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(linkedInUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    // LinkedIn profil public expose ces balises meta og:
    const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
    const ogDesc = $('meta[property="og:description"]').attr("content") ?? "";

    // Si LinkedIn redirige vers login, le titre sera juste "LinkedIn"
    if (!ogTitle || ogTitle === "LinkedIn" || ogTitle.toLowerCase().includes("sign in")) {
      return null;
    }

    const { name, jobTitle, company } = parseTitleParts(ogTitle);
    const location = parseLocation(ogDesc);
    const connections = parseConnections(ogDesc);
    const industry = inferIndustry(`${ogTitle} ${ogDesc}`);

    return {
      name,
      jobTitle,
      company,
      location,
      connections,
      industry,
      bio: ogDesc.slice(0, 300),
      source: "direct",
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2️⃣ STRATÉGIE 2 - Google Snippet via Serper
// ═══════════════════════════════════════════════════════════════════════════

async function scrapeLinkedInViaGoogle(
  linkedInUrl: string,
  name?: string,
  company?: string
): Promise<LinkedInProfile | null> {
  if (!process.env.SERPER_API_KEY) return null;

  try {
    // Extraire le username depuis l'URL
    const usernameMatch = linkedInUrl.match(/linkedin\.com\/in\/([^/?]+)/);
    const username = usernameMatch?.[1];

    // Query ciblée : priorité au username exact, sinon nom + entreprise
    const query = username
      ? `site:linkedin.com/in/${username}`
      : name && company
      ? `"${name}" "${company}" site:linkedin.com/in`
      : `${name ?? ""} ${company ?? ""} LinkedIn profil`;

    const results = await searchGoogle(query, 3);
    const top = results[0];
    if (!top) return null;

    const { name: parsedName, jobTitle, company: parsedCompany } = parseTitleParts(top.title ?? "");
    const location = parseLocation(top.snippet ?? "");
    const connections = parseConnections(top.snippet ?? "");
    const industry = inferIndustry(`${top.title ?? ""} ${top.snippet ?? ""}`);

    // Activité récente : autres résultats LinkedIn dans la SERP
    const recentActivity = results
      .slice(1)
      .filter((r) => r.link?.includes("linkedin.com"))
      .map((r) => r.snippet?.slice(0, 120))
      .filter(Boolean)
      .join(" | ") || undefined;

    return {
      name: parsedName || name,
      jobTitle,
      company: parsedCompany || company,
      location,
      connections,
      industry,
      bio: top.snippet?.slice(0, 300),
      recentActivity,
      source: "google-snippet",
    };
  } catch (err) {
    logger.debug("[LinkedInEnricher] Google snippet échoué", { error: String(err) });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FONCTION PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════

export async function enrichFromLinkedIn(
  linkedInUrl: string,
  currentName?: string,
  currentCompany?: string
): Promise<LinkedInProfile | null> {
  if (!linkedInUrl) return null;

  // Essai direct (rapide, riche si non bloqué)
  const direct = await scrapeLinkedInDirect(linkedInUrl);
  if (direct?.jobTitle) {
    logger.debug("[LinkedInEnricher] Enrichi via scrape direct", { url: linkedInUrl });
    return direct;
  }

  // Fallback Google snippet
  const fromGoogle = await scrapeLinkedInViaGoogle(linkedInUrl, currentName, currentCompany);
  if (fromGoogle) {
    logger.debug("[LinkedInEnricher] Enrichi via Google snippet", { url: linkedInUrl });
    return fromGoogle;
  }

  return null;
}

/**
 * Enrichit une liste de leads depuis leurs profils LinkedIn (batches de 3)
 */
export async function enrichLeadsFromLinkedIn<
  T extends { linkedInUrl?: string; name: string; company: string; jobTitle?: string; industry?: string; location?: string }
>(leads: T[]): Promise<T[]> {
  const BATCH_SIZE = 3;
  const result: T[] = [];

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const enriched = await Promise.all(
      batch.map(async (lead) => {
        if (!lead.linkedInUrl) return lead;

        const profile = await enrichFromLinkedIn(lead.linkedInUrl, lead.name, lead.company);
        if (!profile) return lead;

        return {
          ...lead,
          // Ne remplace que si on a une valeur meilleure
          jobTitle: lead.jobTitle || profile.jobTitle,
          company: lead.company || profile.company,
          location: lead.location || profile.location,
          industry: lead.industry || profile.industry,
          linkedInConnections: profile.connections ? parseConnectionsCount(profile.connections) : (lead as any).linkedInConnections,
          enrichmentData: {
            ...(lead as any).enrichmentData,
            linkedInBio: profile.bio,
            linkedInConnections: profile.connections,
            linkedInRecentActivity: profile.recentActivity,
            linkedInEnrichSource: profile.source,
          },
        };
      })
    );
    result.push(...enriched);
  }

  return result;
}

function parseConnectionsCount(connections: string): number | undefined {
  const match = connections.match(/(\d+)/);
  if (!match) return undefined;
  const num = parseInt(match[1]);
  if (connections.includes("K") || connections.includes("k")) return num * 1000;
  return num;
}
