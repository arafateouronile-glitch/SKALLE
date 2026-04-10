/**
 * 🔍 Lead Enrichment - Enrichissement de Leads Qualifiés
 * 
 * Intégrations avec:
 * - Apollo.io (recherche de leads avec emails vérifiés)
 * - Clay.com (enrichissement de données)
 * - Hunter.io (vérification d'emails)
 * - ZoomInfo (données B2B)
 */

import { z } from "zod";
import { enrichMultiSource, verifyEmailCascade } from "./multi-source-enrichment";
import { calculateLeadScore, type ICPCriteria, type LeadScore } from "./lead-scoring";
import { scrapeLeads } from "./scraper";
import { scrapeGoogleBusinessLeads } from "./google-business-scraper";
import { enrichLeadsWithEmails } from "./email-finder";
import { enrichLeadsFromLinkedIn } from "./linkedin-enricher";
import { logger } from "@/lib/logger";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface EnrichedLead {
  name: string;
  email?: string;
  emailVerified: boolean;
  emailScore?: number; // 0-100
  phone?: string;
  phoneVerified: boolean;
  linkedInUrl?: string;
  company: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  companySize?: string;
  revenue?: string;
  linkedInConnections?: number;
  enrichmentData?: Record<string, unknown>;
  // Top 1% additions
  leadScore?: LeadScore; // Score complet du lead
  enrichmentSources?: string[]; // Sources utilisées pour l'enrichissement
  dataAccuracy?: number; // 0-100, précision des données
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 APOLLO.IO - Recherche de Leads Qualifiés
// ═══════════════════════════════════════════════════════════════════════════

interface ApolloSearchParams {
  personTitles?: string[];
  industries?: string[];
  locations?: string[];
  companySizes?: string[];
  seniorityLevels?: string[];
  companyNames?: string[];
  keywords?: string[];
  page?: number;
  perPage?: number;
}

// Mapping des régions françaises vers les équivalents qu'Apollo comprend
function normalizeApolloLocations(locations: string[]): string[] {
  const map: Record<string, string> = {
    "île-de-france": "Paris, France",
    "ile-de-france": "Paris, France",
    "grand paris": "Paris, France",
    "rhône": "Lyon, France",
    "rhone": "Lyon, France",
    "auvergne-rhône-alpes": "Lyon, France",
    "provence-alpes-côte d'azur": "Marseille, France",
    "occitanie": "Toulouse, France",
    "nouvelle-aquitaine": "Bordeaux, France",
    "bretagne": "Rennes, France",
    "hauts-de-france": "Lille, France",
    "grand est": "Strasbourg, France",
    "pays de la loire": "Nantes, France",
    "normandie": "Rouen, France",
  };

  return locations.map((loc) => map[loc.toLowerCase()] ?? loc).filter(Boolean);
}

// Garde seulement les titres en anglais (Apollo a une meilleure couverture EN)
function filterEnglishTitles(titles: string[]): string[] {
  const frenchMarkers = ["directeur", "responsable", "chargé", "gérant", "contrôleur", "trésorier", "chef", "président"];
  return titles.filter((t) => !frenchMarkers.some((m) => t.toLowerCase().includes(m)));
}

export async function searchLeadsApollo(
  params: ApolloSearchParams
): Promise<{ success: boolean; leads?: EnrichedLead[]; error?: string }> {
  if (!process.env.APOLLO_API_KEY) {
    return { success: false, error: "APOLLO_API_KEY non configurée" };
  }

  const apiKey = process.env.APOLLO_API_KEY;

  try {
    // Normaliser les localisations (Apollo comprend mieux "France" que "Île-de-France")
    const normalizedLocations = normalizeApolloLocations(params.locations || []);
    // Garder uniquement les titres en anglais si possible (Apollo est principalement anglophone)
    const englishTitles = filterEnglishTitles(params.personTitles || []);
    const titlesToUse = englishTitles.length > 0 ? englishTitles : params.personTitles;

    // ── Étape 1 : Search (ne consomme pas de crédits, last_name obfusqué) ──
    // Apollo indexe surtout en anglais → on n'utilise PAS q_keywords (trop de faux-zéros en FR)
    // Les filtres structurés (titres EN, seniority, location, taille) sont suffisants

    const buildBody = (titles?: string[], locations?: string[]) => ({
      person_titles: titles?.length ? titles.slice(0, 8) : undefined,
      person_seniorities: params.seniorityLevels?.length ? params.seniorityLevels : undefined,
      person_locations: locations?.length ? locations : undefined,
      organization_num_employees_ranges: params.companySizes?.length ? params.companySizes : undefined,
      organization_names: params.companyNames?.length ? params.companyNames.slice(0, 5) : undefined,
      page: params.page || 1,
      per_page: Math.min(params.perPage || 25, 100),
    });

    const trySearch = async (body: object) => {
      logger.debug(`[Apollo] Search body`, { body: JSON.stringify(body) });
      const r = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": apiKey },
        body: JSON.stringify(body),
      });
      return { response: r, data: await r.json() };
    };

    // Tentative 1 : titres anglais + locations normalisées
    let { response: searchResponse, data: searchData } = await trySearch(
      buildBody(titlesToUse, normalizedLocations)
    );

    // Fallback 1 : si 0 résultats → tous les titres (FR + EN)
    if (searchResponse.ok && (searchData.total_entries ?? 0) === 0 && params.personTitles?.length) {
      logger.debug(`[Apollo] 0 résultats, retry avec tous les titres`);
      ({ response: searchResponse, data: searchData } = await trySearch(
        buildBody(params.personTitles, normalizedLocations)
      ));
    }

    // Fallback 2 : si 0 résultats → location "France" uniquement
    if (searchResponse.ok && (searchData.total_entries ?? 0) === 0) {
      logger.debug(`[Apollo] Encore 0 résultats, retry avec location=France`);
      ({ response: searchResponse, data: searchData } = await trySearch(
        buildBody(titlesToUse, ["France"])
      ));
    }

    if (!searchResponse.ok) {
      logger.error(`[Apollo] Search HTTP ${searchResponse.status}`, { body: JSON.stringify(searchData).slice(0, 300) });
      return { success: false, error: `Apollo ${searchResponse.status}: ${searchData.error || JSON.stringify(searchData).slice(0, 100)}` };
    }

    const rawPeople: any[] = searchData.people || [];
    logger.info(`[Apollo] Search OK`, { total: searchData.total_entries, returned: rawPeople.length });

    if (rawPeople.length === 0) return { success: true, leads: [] };

    // ── Étape 2 : Enrichissement par Apollo ID (nom complet + email) ──
    // On enrichit les personnes avec has_email=true en priorité (par batches de 5)
    const toEnrich = rawPeople.filter((p: any) => p.has_email);
    const noEmail = rawPeople.filter((p: any) => !p.has_email);

    const enrichedByApollo: Map<string, any> = new Map();

    if (toEnrich.length > 0) {
      // Tous en parallèle — Apollo supporte les appels concurrents
      const results = await Promise.allSettled(
        toEnrich.map(async (p: any) => {
          const r = await fetch("https://api.apollo.io/api/v1/people/match", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": apiKey },
            body: JSON.stringify({ id: p.id, reveal_personal_emails: false, reveal_phone_number: false }),
          });
          if (!r.ok) return null;
          const d = await r.json();
          return d.person ? { ...p, ...d.person } : null;
        })
      );
      for (const res of results) {
        if (res.status === "fulfilled" && res.value) {
          enrichedByApollo.set(res.value.id, res.value);
        }
      }
      logger.info(`[Apollo] People match OK`, {
        requested: toEnrich.length,
        enriched: enrichedByApollo.size,
        withEmail: [...enrichedByApollo.values()].filter((p) => p.email).length,
      });
    }

    // Fusionner : données enrichies si disponibles, sinon données brutes du search
    const allPeople = rawPeople.map((p: any) => enrichedByApollo.get(p.id) ?? p);

    const leads: EnrichedLead[] = allPeople.map((person: any) => {
      const firstName = person.first_name || "";
      const lastName = person.last_name || ""; // vide si toujours obfusqué
      const name = `${firstName} ${lastName}`.trim() || firstName || "Inconnu";
      const email = person.email || undefined;
      return {
        name,
        email,
        emailVerified: person.email_status === "verified",
        emailScore: person.email_status === "verified" ? 95 : email ? 65 : 0,
        phone: person.phone_numbers?.[0]?.raw_number || undefined,
        phoneVerified: false,
        linkedInUrl: person.linkedin_url || undefined,
        company: person.organization?.name || person.employment_history?.[0]?.organization_name || "",
        jobTitle: person.title || undefined,
        location: [person.city, person.state, person.country].filter(Boolean).join(", ") || undefined,
        industry: person.organization?.industry || undefined,
        companySize: person.organization?.estimated_num_employees?.toString() || undefined,
        revenue: person.organization?.estimated_annual_revenue || undefined,
        linkedInConnections: undefined,
        enrichmentData: {
          apolloId: person.id,
          hasEmail: person.has_email,
          emailSource: email ? "apollo" : undefined,
        },
      };
    });

    return { success: true, leads };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 HUNTER.IO - Vérification d'Emails
// ═══════════════════════════════════════════════════════════════════════════

export async function verifyEmailHunter(
  email: string,
  domain?: string
): Promise<{ success: boolean; verified?: boolean; score?: number; error?: string }> {
  if (!process.env.HUNTER_API_KEY) {
    return { success: false, error: "HUNTER_API_KEY non configurée" };
  }

  try {
    const url = domain
      ? `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&domain=${domain}&api_key=${process.env.HUNTER_API_KEY}`
      : `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${process.env.HUNTER_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.errors?.[0]?.details || "Erreur Hunter.io" };
    }

    const result = data.data;
    const verified = result.result === "deliverable";
    const score = result.score || 0;

    return { success: true, verified, score };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 CLAY.COM - Enrichissement Multi-Sources
// ═══════════════════════════════════════════════════════════════════════════

export async function enrichLeadClay(
  linkedInUrl: string,
  company?: string
): Promise<{ success: boolean; data?: EnrichedLead; error?: string }> {
  if (!process.env.CLAY_API_KEY) {
    return { success: false, error: "CLAY_API_KEY non configurée" };
  }

  try {
    // Clay API pour enrichir depuis LinkedIn URL
    const response = await fetch("https://api.clay.com/v1/enrichment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CLAY_API_KEY}`,
      },
      body: JSON.stringify({
        linkedin_url: linkedInUrl,
        company_name: company,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || "Erreur Clay" };
    }

    const enriched: EnrichedLead = {
      name: data.full_name || "",
      email: data.email,
      emailVerified: data.email_verified || false,
      emailScore: data.email_score || 0,
      phone: data.phone,
      phoneVerified: data.phone_verified || false,
      linkedInUrl,
      company: data.company_name || company || "",
      jobTitle: data.title,
      location: data.location,
      industry: data.industry,
      companySize: data.company_size,
      revenue: data.revenue,
      enrichmentData: data,
    };

    return { success: true, data: enriched };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 FIND QUALIFIED LEADS - Fonction Unifiée
// ═══════════════════════════════════════════════════════════════════════════

export interface QualifiedLeadSearch {
  jobTitles?: string[];
  industries?: string[];
  locations?: string[];
  companySizes?: string[];
  seniorityLevels?: string[];
  companyNames?: string[];
  keywords?: string[];
  minConnections?: number;
  requireEmail?: boolean;
  requirePhone?: boolean;
  limit?: number;
  provider?: "apollo" | "clay" | "both" | "multi"; // "multi" = multi-source (Top 1%)
  // Top 1% additions
  icpCriteria?: ICPCriteria; // Critères ICP pour scoring
  minLeadScore?: number; // Score minimum accepté (0-100)
  minEmailScore?: number; // Score email minimum (0-100, default: 95 pour Top 1%)
  enrichmentMode?: "basic" | "advanced" | "complete"; // Niveau d'enrichissement
  // Google Business mode
  searchMode?: "linkedin" | "google_business";
  minRating?: number;
  requireWebsite?: boolean;
}

export async function findQualifiedLeads(
  search: QualifiedLeadSearch
): Promise<{ success: boolean; leads?: EnrichedLead[]; error?: string }> {
  const {
    provider = "apollo",
    limit = 100,
    requireEmail = false, // Par défaut false : retourner tous les leads (sans forcer email)
    minEmailScore = 50, // Score minimum raisonnable pour les emails scrapés
    enrichmentMode = "basic",
    icpCriteria,
    minLeadScore,
  } = search;

  try {
    // ── Google Business Mode ──
    if (search.searchMode === "google_business") {
      const gbResult = await scrapeGoogleBusinessLeads({
        keywords: search.keywords || [],
        locations: search.locations || [],
        requireEmail: requireEmail,
        requirePhone: search.requirePhone,
        requireWebsite: search.requireWebsite,
        minRating: search.minRating,
        limit,
      });

      if (!gbResult.success || !gbResult.leads) {
        return { success: false, error: gbResult.error || "Erreur Google Business" };
      }

      const leads: EnrichedLead[] = gbResult.leads.map((lead) => ({
        ...lead,
        enrichmentSources: ["google-business-scraper"],
        dataAccuracy: calculateDataAccuracy(lead as EnrichedLead),
      }));

      return { success: true, leads: leads.slice(0, limit) };
    }

    // ── LinkedIn / Apollo Mode (par défaut) ──
    let leads: EnrichedLead[] = [];

    // Recherche via Apollo (si clé API disponible)
    const apolloEnabled = process.env.APOLLO_PLAN === "paid" && process.env.APOLLO_API_KEY;
    logger.info(`[Apollo] Clé présente: ${!!process.env.APOLLO_API_KEY}, plan payant: ${!!apolloEnabled}`);
    if ((provider === "apollo" || provider === "both") && apolloEnabled) {
      const apolloResult = await searchLeadsApollo({
        personTitles: search.jobTitles,
        industries: search.industries,
        locations: search.locations,
        companySizes: search.companySizes,
        seniorityLevels: search.seniorityLevels,
        companyNames: search.companyNames,
        keywords: search.keywords,
        perPage: Math.min(limit, 100),
      });

      logger.info(`[Apollo] Résultat`, { success: apolloResult.success, leads: apolloResult.leads?.length ?? 0, error: apolloResult.error });

      if (apolloResult.success && apolloResult.leads) {
        leads = [...leads, ...apolloResult.leads];
      }
    }

    // Fallback: Scraper maison via Google Search → LinkedIn si pas de leads Apollo
    if (leads.length === 0 && process.env.SERPER_API_KEY) {
      const scraperResult = await scrapeLeads({
        jobTitles: search.jobTitles,
        industries: search.industries,
        locations: search.locations,
        companySizes: search.companySizes,
        keywords: search.keywords,
        limit,
        requireEmail: requireEmail,
        requirePhone: search.requirePhone,
      });

      logger.info(`[Scraper] Résultat`, { success: scraperResult.success, leads: scraperResult.leads?.length ?? 0 });

      if (scraperResult.success && scraperResult.leads) {
        leads = [...leads, ...scraperResult.leads.map((lead) => ({
          ...lead,
          enrichmentSources: ["google-scraper"],
          dataAccuracy: calculateDataAccuracy(lead as EnrichedLead),
        }))];
      }
    }

    // Filtrer uniquement sur le téléphone et connections (jamais sur l'email avant enrichissement)
    // L'email sera filtré APRÈS l'enrichissement email-finder
    leads = leads.filter((lead) => {
      if (search.requirePhone && !lead.phone) return false;
      if (search.minConnections && (lead.linkedInConnections || 0) < search.minConnections) return false;
      return true;
    });

    logger.info(`[findQualifiedLeads] Avant enrichissement`, { leads: leads.length, requireEmail });

    // Vérification d'emails en cascade (Top 1%) ou basique
    if (requireEmail && enrichmentMode === "complete") {
      // Top 1%: Cascade verification (Hunter → NeverBounce → Kickbox)
      const verifiedLeads = await Promise.all(
        leads.map(async (lead) => {
          if (lead.email) {
            const verification = await verifyEmailCascade(lead.email, lead.company);
            if (verification.success && verification.result) {
              return {
                ...lead,
                emailVerified: verification.result.verified && verification.result.score >= minEmailScore,
                emailScore: verification.result.score,
              };
            }
          }
          return lead;
        })
      );

      leads = verifiedLeads.filter((lead) => lead.emailVerified && (lead.emailScore || 0) >= minEmailScore);
    } else if (requireEmail && process.env.HUNTER_API_KEY) {
      // Mode basique: Hunter seulement (enrichit les scores sans tuer les leads scrapés)
      const verifiedLeads = await Promise.all(
        leads.map(async (lead) => {
          if (lead.email) {
            const verification = await verifyEmailHunter(lead.email);
            if (verification.success && verification.verified !== undefined) {
              return {
                ...lead,
                emailVerified: verification.verified,
                emailScore: verification.score || lead.emailScore || 0,
              };
            }
          }
          return lead;
        })
      );
      // Garder tous les leads avec un email (pas de filtre sur le score en mode scraper)
      leads = verifiedLeads.filter((lead) => lead.email);
    }

    // Enrichissement multi-source si mode avancé/complet
    if ((enrichmentMode === "advanced" || enrichmentMode === "complete") && provider === "multi") {
      const enrichedLeads = await Promise.all(
        leads.map(async (lead) => {
          try {
            const enrichment = await enrichMultiSource({
              linkedInUrl: lead.linkedInUrl,
              email: lead.email,
              company: lead.company,
              name: lead.name,
              sources: ["all"],
            });

            if (enrichment.success && enrichment.lead) {
              return {
                ...lead,
                ...enrichment.lead,
                enrichmentSources: enrichment.sources || [],
                dataAccuracy: calculateDataAccuracy(enrichment.lead),
              };
            }
          } catch (error) {
            logger.error("Multi-source enrichment error", { error: String(error) });
          }
          return lead;
        })
      );

      leads = enrichedLeads;
    }

    // Lead scoring (Top 1%) si ICP criteria fourni
    if (icpCriteria) {
      const scoredLeads = await Promise.all(
        leads.map(async (lead) => {
          try {
            const leadScore = await calculateLeadScore(lead, icpCriteria);
            return {
              ...lead,
              leadScore,
            };
          } catch (error) {
            logger.error("Lead scoring error", { error: String(error) });
            return lead;
          }
        })
      );

      // Filtrer par score minimum si spécifié
      if (minLeadScore !== undefined) {
        leads = scoredLeads.filter((lead) => (lead.leadScore?.overallScore || 0) >= minLeadScore);
      } else {
        leads = scoredLeads;
      }

      // Trier par score décroissant (Top 1% = meilleurs leads en premier)
      leads.sort((a, b) => {
        const scoreA = a.leadScore?.overallScore || 0;
        const scoreB = b.leadScore?.overallScore || 0;
        return scoreB - scoreA;
      });
    }

    // Limiter les résultats (Top 1% = meilleurs leads en premier)
    leads = leads.slice(0, limit);

    // Enrichissement LinkedIn : seulement pour les leads sans jobTitle ou sans company (non-Apollo)
    const leadsNeedingLinkedIn = leads.filter((l) => l.linkedInUrl && (!l.jobTitle || !l.company || l.company === "Non spécifié"));
    if (leadsNeedingLinkedIn.length > 0) {
      logger.info(`[LinkedInEnricher] Enrichissement pour ${leadsNeedingLinkedIn.length} leads`);
      leads = await enrichLeadsFromLinkedIn(leads);
    } else {
      logger.info(`[LinkedInEnricher] Skippé (leads Apollo déjà enrichis)`);
    }

    // Enrichissement email maison : seulement pour les leads NON-Apollo sans email
    // (les leads Apollo sans email ont only a first name → recherches Google peu fiables)
    const leadsNeedingEmail = leads.filter((l) => !l.email && !l.enrichmentData?.apolloId);
    if (leadsNeedingEmail.length > 0) {
      logger.info(`[EmailFinder] Enrichissement email pour ${leadsNeedingEmail.length} leads (non-Apollo)`);
      leads = await enrichLeadsWithEmails(leads);
      logger.info(`[EmailFinder] Emails trouvés: ${leads.filter((l) => l.email).length}/${leads.length}`);
    } else {
      logger.info(`[EmailFinder] Skippé (tous les leads viennent d'Apollo)`);
    }

    // Filtre email APRÈS enrichissement (si l'utilisateur l'exige explicitement)
    if (requireEmail) {
      leads = leads.filter((l) => !!l.email);
      logger.info(`[findQualifiedLeads] Après filtre requireEmail`, { leads: leads.length });
    }

    return { success: true, leads };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 CALCULATE DATA ACCURACY - Calcul de la précision des données
// ═══════════════════════════════════════════════════════════════════════════

function calculateDataAccuracy(lead: EnrichedLead): number {
  const fields = [
    "name",
    "email",
    "phone",
    "company",
    "jobTitle",
    "location",
    "industry",
    "companySize",
    "revenue",
    "linkedInUrl",
    "linkedInConnections",
  ];

  let accuracy = 0;
  let maxAccuracy = fields.length * 10; // 10 points par champ

  fields.forEach((field) => {
    const value = (lead as any)[field];
    if (value !== undefined && value !== null && value !== "") {
      accuracy += 10;
    }
  });

  // Bonus si email vérifié (+10 points)
  if (lead.emailVerified) accuracy += 10;

  // Bonus si données enrichies (+10 points)
  if (lead.enrichmentData) accuracy += 10;

  return Math.min(100, Math.round((accuracy / (maxAccuracy + 20)) * 100));
}
