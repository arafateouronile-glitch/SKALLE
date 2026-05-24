/**
 * Hunter.io domain search — trouve les emails professionnels des décideurs
 * d'une entreprise à partir de son domaine web.
 *
 * API: GET https://api.hunter.io/v2/domain-search?domain=xxx&api_key=KEY
 * Filtre sur les rôles exécutifs pour ne retourner que les décideurs.
 */

export interface EnrichedEmail {
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  position?: string;
  confidence: number; // 0–100
  linkedinUrl?: string;
}

interface HunterEmail {
  value: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  confidence?: number;
  linkedin?: string;
  seniority?: string;
  department?: string;
}

interface HunterDomainResponse {
  data?: {
    emails?: HunterEmail[];
    domain?: string;
    organization?: string;
  };
  errors?: Array<{ details: string }>;
}

const DECISION_MAKER_ROLES = [
  "ceo", "cto", "cmo", "coo", "cfo", "founder", "co-founder",
  "directeur", "directrice", "president", "président",
  "head of", "vp", "vice president", "managing director",
  "gérant", "associé", "partner",
];

function isDecisionMaker(position?: string): boolean {
  if (!position) return true; // keep if no position (better to have too many)
  const lower = position.toLowerCase();
  return DECISION_MAKER_ROLES.some((role) => lower.includes(role));
}

function extractDomain(company: string, website?: string): string | null {
  if (website) {
    try {
      return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
    } catch { /* fallback */ }
  }
  // Guess domain from company name as last resort
  const slug = company.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug.length > 2 ? `${slug}.com` : null;
}

export async function findEmailsByDomain(
  domain: string,
  limit = 5
): Promise<EnrichedEmail[]> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return [];

  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=20&type=personal&api_key=${key}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return [];

  const data: HunterDomainResponse = await res.json();
  if (!data.data?.emails?.length) return [];

  return data.data.emails
    .filter((e) => e.value && isDecisionMaker(e.position))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, limit)
    .map((e) => ({
      email: e.value,
      firstName: e.first_name ?? "",
      lastName: e.last_name ?? "",
      fullName: [e.first_name, e.last_name].filter(Boolean).join(" ") || e.value.split("@")[0],
      position: e.position,
      confidence: e.confidence ?? 0,
      linkedinUrl: e.linkedin,
    }));
}

export async function findEmailsByCompany(
  companyName: string,
  website?: string,
  limit = 5
): Promise<EnrichedEmail[]> {
  const domain = extractDomain(companyName, website);
  if (!domain) return [];
  return findEmailsByDomain(domain, limit);
}
