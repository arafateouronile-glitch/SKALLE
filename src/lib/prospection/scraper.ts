/**
 * 🔍 Lead Scraper Maison - Google Search → LinkedIn Profiles → Leads
 *
 * Utilise Serper (Google Search API) pour trouver des profils LinkedIn
 * correspondant aux critères de recherche, puis extrait les données
 * des snippets Google pour construire des leads qualifiés.
 */

import { searchGoogle } from "@/lib/ai/serper";
import dns from "dns";
import { promisify } from "util";
import { logger } from "@/lib/logger";

const resolveMx = promisify(dns.resolveMx);

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ScrapedLead {
  name: string;
  email?: string;
  emailVerified: boolean;
  emailScore?: number;
  phone?: string;
  phoneVerified: boolean;
  linkedInUrl: string;
  company: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  companySize?: string;
  revenue?: string;
  linkedInConnections?: number;
  enrichmentData?: Record<string, unknown>;
}

export interface ScraperSearchParams {
  jobTitles?: string[];
  industries?: string[];
  locations?: string[];
  companySizes?: string[];
  keywords?: string[];
  limit?: number;
  requireEmail?: boolean;
  requirePhone?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SEARCH - Recherche Google → LinkedIn
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construit la requête Google optimisée pour trouver des profils LinkedIn
 */
function buildLinkedInSearchQuery(params: ScraperSearchParams): string {
  // Stratégie : combiner les termes les plus importants sans trop restreindre
  // Google sur LinkedIn : les titres de poste et mots-clés sont les plus fiables
  const allTerms: string[] = [];

  // Job titles - les plus importants, entre guillemets
  if (params.jobTitles?.length) {
    allTerms.push(...params.jobTitles);
  }

  // Keywords - termes libres
  if (params.keywords?.length) {
    allTerms.push(...params.keywords);
  }

  // Industries - termes contextuels
  if (params.industries?.length) {
    allTerms.push(...params.industries);
  }

  // Si aucun terme de recherche, ne pas chercher (query vide = résultats random)
  if (allTerms.length === 0) {
    return "site:linkedin.com/in";
  }

  // Construire la query : site:linkedin.com/in + termes principaux
  // On met les termes importants entre guillemets seulement s'ils font >1 mot
  const quotedTerms = allTerms.map((t) =>
    t.includes(" ") ? `"${t}"` : t
  );

  // Locations - ajoutés comme contexte mais pas obligatoires
  if (params.locations?.length) {
    quotedTerms.push(...params.locations);
  }

  return `site:linkedin.com/in ${quotedTerms.join(" ")}`;
}

/**
 * Construit des requêtes supplémentaires pour trouver des emails/sites d'entreprise
 */
function buildCompanySearchQuery(companyName: string): string {
  return `"${companyName}" site officiel email contact`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧹 PARSING - Extraction de données depuis les snippets Google
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extrait le nom depuis le titre d'un résultat LinkedIn Google
 * Format typique: "Prénom Nom - Titre | LinkedIn" ou "Prénom Nom – Titre – Entreprise | LinkedIn"
 */
function extractNameFromTitle(title: string): string | null {
  // Supprimer " | LinkedIn", " - LinkedIn", " – LinkedIn"
  let cleaned = title
    .replace(/\s*[\|–-]\s*LinkedIn\s*$/i, "")
    .trim();

  // Prendre la première partie avant " - " ou " – " ou " | "
  const separators = [" - ", " – ", " — ", " | "];
  for (const sep of separators) {
    const idx = cleaned.indexOf(sep);
    if (idx > 0) {
      cleaned = cleaned.substring(0, idx).trim();
      break;
    }
  }

  // Vérifier que ça ressemble à un nom (2-4 mots, pas trop long)
  const words = cleaned.split(/\s+/);
  if (words.length >= 2 && words.length <= 5 && cleaned.length < 60) {
    return cleaned;
  }

  return null;
}

/**
 * Extrait le titre du poste depuis le titre ou snippet Google
 */
function extractJobTitle(title: string, snippet: string): string | null {
  // Depuis le titre: "Nom - Titre chez/at/| Entreprise | LinkedIn"
  const titleCleaned = title.replace(/\s*[\|–-]\s*LinkedIn\s*$/i, "").trim();
  const separators = [" - ", " – ", " — "];

  for (const sep of separators) {
    const idx = titleCleaned.indexOf(sep);
    if (idx > 0) {
      let afterName = titleCleaned.substring(idx + sep.length).trim();
      // Supprimer la partie entreprise si présente
      const compSeparators = [" chez ", " at ", " - ", " | ", " – "];
      for (const cs of compSeparators) {
        const cIdx = afterName.indexOf(cs);
        if (cIdx > 0) {
          afterName = afterName.substring(0, cIdx).trim();
          break;
        }
      }
      if (afterName.length > 2 && afterName.length < 100) {
        return afterName;
      }
    }
  }

  // Depuis le snippet: chercher des patterns de titre
  const snippetPatterns = [
    /(?:poste actuel|current position|titre)[:\s]*([^.·\n]+)/i,
    /(?:^|\.\s)([A-ZÀ-Ü][a-zà-ü]+(?:\s+[a-zA-ZÀ-ü]+)*)\s+(?:chez|at|@)\s+/,
  ];

  for (const pattern of snippetPatterns) {
    const match = snippet.match(pattern);
    if (match?.[1] && match[1].length < 80) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extrait le nom de l'entreprise depuis le titre ou snippet
 */
function extractCompany(title: string, snippet: string): string | null {
  const titleCleaned = title.replace(/\s*[\|–-]\s*LinkedIn\s*$/i, "").trim();

  // Pattern: "Nom - Titre chez Entreprise" ou "Nom - Titre - Entreprise"
  const chezMatch = titleCleaned.match(/(?:chez|at|@|·)\s+(.+?)$/i);
  if (chezMatch?.[1]) {
    const company = chezMatch[1].trim().replace(/\s*[\|–-]\s*$/, "").trim();
    if (company.length > 1 && company.length < 80) {
      return company;
    }
  }

  // Depuis le titre: dernière partie après séparateur
  const parts = titleCleaned.split(/\s+[-–—|·]\s+/);
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1].trim();
    if (lastPart.length > 1 && lastPart.length < 80) {
      return lastPart;
    }
  }

  // Depuis le snippet
  const snippetPatterns = [
    /(?:chez|at|@)\s+([A-ZÀ-Ü][^\n.·]{2,60})/,
    /(?:entreprise|company|société)[:\s]*([^\n.·]{2,60})/i,
  ];

  for (const pattern of snippetPatterns) {
    const match = snippet.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Fallback: extrait un nom d'entreprise depuis n'importe quel indice
 */
function extractCompanyFallback(title: string, snippet: string): string | null {
  const titleCleaned = title.replace(/\s*[\|–-]\s*LinkedIn\s*$/i, "").trim();

  // Prendre la dernière partie significative du titre
  const parts = titleCleaned.split(/\s+[-–—|·]\s+/);
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1].trim();
    if (lastPart.length > 1 && lastPart.length < 80) {
      return lastPart;
    }
  }

  // Chercher dans le snippet des mots-clés d'entreprise
  const snippetMatch = snippet.match(
    /(?:chez|at|@|pour|with|consultant(?:e)?\s+(?:pour|chez)?)\s+([A-ZÀ-Ü][^\n.·,]{2,40})/i
  );
  if (snippetMatch?.[1]) {
    return snippetMatch[1].trim();
  }

  // Chercher un nom propre dans le snippet (mot commençant par majuscule)
  const orgMatch = snippet.match(
    /(?:^|\.\s+)([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)+)\s/
  );
  if (orgMatch?.[1] && orgMatch[1].length > 3 && orgMatch[1].length < 50) {
    return orgMatch[1];
  }

  return null;
}

/**
 * Extrait la localisation depuis le snippet
 */
function extractLocation(snippet: string): string | null {
  const locationPatterns = [
    /(?:Région de|Region)\s+([A-ZÀ-Ü][a-zà-ü]+(?:[,\s]+[A-ZÀ-Ü][a-zà-ü]+)*)/,
    /(?:📍|Localisation|Location)[:\s]*([^\n.·]{2,40})/i,
    /(Paris|Lyon|Marseille|Toulouse|Bordeaux|Nantes|Lille|Strasbourg|Nice|Rennes|Montpellier|Grenoble)(?:\s+(?:et ses environs|Area|France))?/i,
    /(?:France|Île-de-France|Auvergne-Rhône-Alpes|Occitanie|Nouvelle-Aquitaine|Provence-Alpes-Côte d'Azur)/i,
  ];

  for (const pattern of locationPatterns) {
    const match = snippet.match(pattern);
    if (match) {
      return (match[1] || match[0]).trim();
    }
  }

  return null;
}

/**
 * Extrait l'URL LinkedIn depuis le lien du résultat
 */
function extractLinkedInUrl(link: string): string | null {
  // Supporter www.linkedin.com, fr.linkedin.com, uk.linkedin.com, etc.
  const match = link.match(/(https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 EMAIL GENERATION - Génération + vérification d'emails
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalise un nom pour générer un email (supprime accents, lowercase)
 */
function normalizeForEmail(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

/**
 * Devine le domaine email d'une entreprise
 */
function guessCompanyDomain(company: string): string {
  return company
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*(sas|sarl|sa|eurl|group|groupe|consulting|conseil|france|international)\s*/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20) + ".fr";
}

/**
 * Génère des variantes d'emails probables
 */
function generateEmailVariants(
  firstName: string,
  lastName: string,
  domain: string
): string[] {
  const fn = normalizeForEmail(firstName);
  const ln = normalizeForEmail(lastName);

  return [
    `${fn}.${ln}@${domain}`,
    `${fn[0]}${ln}@${domain}`,
    `${fn}@${domain}`,
    `${fn}${ln}@${domain}`,
    `${fn}-${ln}@${domain}`,
  ];
}

/**
 * Vérifie si un domaine a des enregistrements MX (accepte des emails)
 */
async function verifyDomainMX(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    return records && records.length > 0;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 MAIN SCRAPER - Fonction principale
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recherche des leads qualifiés via Google Search + LinkedIn
 */
export async function scrapeLeads(
  params: ScraperSearchParams
): Promise<{ success: boolean; leads?: ScrapedLead[]; error?: string }> {
  if (!process.env.SERPER_API_KEY) {
    return { success: false, error: "SERPER_API_KEY non configurée" };
  }

  try {
    const limit = Math.min(params.limit || 100, 100);
    const leads: ScrapedLead[] = [];

    // Construire et exécuter la recherche Google → LinkedIn
    const query = buildLinkedInSearchQuery(params);
    logger.debug(`[Scraper] Query Google`, { query });

    // Serper retourne max 100 résultats, on fait des requêtes paginées si besoin
    const numResults = Math.min(limit, 100);
    const results = await searchGoogle(query, numResults);
    logger.debug(`[Scraper] Résultats Google reçus`, { count: results.length, urls: results.map(r => r.link) });

    // Parser chaque résultat
    let skippedNoLinkedIn = 0, skippedNoName = 0;
    for (const result of results) {
      const linkedInUrl = extractLinkedInUrl(result.link);
      if (!linkedInUrl) { skippedNoLinkedIn++; continue; }

      const name = extractNameFromTitle(result.title);
      if (!name) { skippedNoName++; continue; }

      const company = extractCompany(result.title, result.snippet) || extractCompanyFallback(result.title, result.snippet);

      const jobTitle = extractJobTitle(result.title, result.snippet);
      const location = extractLocation(result.snippet);

      // Générer un email probable si on a une entreprise
      const nameParts = name.split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ");
      let primaryEmail: string | undefined;
      let emailVariants: string[] = [];
      let hasMX = false;

      if (company) {
        const domain = guessCompanyDomain(company);
        emailVariants = generateEmailVariants(firstName, lastName, domain);
        primaryEmail = emailVariants[0];
        hasMX = await verifyDomainMX(domain);
      }

      const lead: ScrapedLead = {
        name,
        email: primaryEmail,
        emailVerified: false, // Scraper = email deviné, jamais "vérifié"
        emailScore: hasMX ? 50 : 20, // Score indicatif
        phone: undefined,
        phoneVerified: false,
        linkedInUrl,
        company: company || "Non spécifié",
        jobTitle: jobTitle || undefined,
        location: location || undefined,
        industry: params.industries?.[0] || undefined,
        companySize: undefined,
        enrichmentData: {
          source: "google-linkedin-scraper",
          emailVariants,
          domainHasMX: hasMX,
          googleSnippet: result.snippet,
          scrapedAt: new Date().toISOString(),
        },
      };

      leads.push(lead);

      if (leads.length >= limit) break;
    }

    logger.info(`[Scraper] Parsing terminé`, { leads: leads.length, skippedNoLinkedIn, skippedNoName });

    // Si pas assez de résultats avec LinkedIn, chercher aussi des sites d'entreprise
    if (leads.length < limit && params.keywords?.length) {
      const companyQuery = params.keywords.join(" ") +
        (params.locations?.length ? ` ${params.locations[0]}` : "") +
        " contact email dirigeant";

      const companyResults = await searchGoogle(companyQuery, 20);

      for (const result of companyResults) {
        // Ignorer les résultats LinkedIn (déjà traités)
        if (result.link.includes("linkedin.com")) continue;

        // Extraire des emails depuis les snippets
        const emailMatch = result.snippet.match(
          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
        );

        if (emailMatch) {
          const email = emailMatch[0];
          const domain = email.split("@")[1];
          const hasMX = await verifyDomainMX(domain);

          // Essayer d'extraire un nom depuis le snippet
          const nameMatch = result.snippet.match(
            /(?:contact|dirigé par|fondé par|CEO|directeur|responsable)[:\s]*([A-ZÀ-Ü][a-zà-ü]+\s+[A-ZÀ-Ü][a-zà-ü]+)/i
          );

          if (nameMatch) {
            leads.push({
              name: nameMatch[1],
              email,
              emailVerified: hasMX,
              emailScore: hasMX ? 80 : 30, // Score plus élevé car email trouvé directement
              phone: undefined,
              phoneVerified: false,
              linkedInUrl: "",
              company: extractCompanyFromDomain(domain) || result.title.slice(0, 50),
              jobTitle: undefined,
              location: params.locations?.[0] || undefined,
              industry: params.industries?.[0] || undefined,
              enrichmentData: {
                source: "google-website-scraper",
                domainHasMX: hasMX,
                sourceUrl: result.link,
                scrapedAt: new Date().toISOString(),
              },
            });

            if (leads.length >= limit) break;
          }
        }
      }
    }

    return { success: true, leads };
  } catch (error) {
    logger.error("Scraper error", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

/**
 * Extrait un nom d'entreprise probable depuis un domaine
 */
function extractCompanyFromDomain(domain: string): string | null {
  const name = domain
    .replace(/\.(fr|com|net|org|io|eu|co)$/, "")
    .replace(/[^a-zA-Z]/g, " ")
    .trim();

  if (name.length > 1) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return null;
}
