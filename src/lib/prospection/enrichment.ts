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
  keywords?: string[];
  page?: number;
  perPage?: number;
}

export async function searchLeadsApollo(
  params: ApolloSearchParams
): Promise<{ success: boolean; leads?: EnrichedLead[]; error?: string }> {
  if (!process.env.APOLLO_API_KEY) {
    return { success: false, error: "APOLLO_API_KEY non configurée" };
  }

  try {
    const response = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": process.env.APOLLO_API_KEY,
      },
      body: JSON.stringify({
        q_keywords: params.keywords?.join(" "),
        person_titles: params.personTitles,
        person_industries: params.industries,
        person_locations: params.locations,
        organization_num_employees_ranges: params.companySizes,
        page: params.page || 1,
        per_page: params.perPage || 25,
        // Pas de filtre sur email_status : on récupère tous les leads, Apollo enrichit les emails ensuite
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error(`[Apollo] Erreur HTTP ${response.status}`, { body: JSON.stringify(data).slice(0, 300) });
      return { success: false, error: `Apollo ${response.status}: ${data.message || data.error || JSON.stringify(data).slice(0, 100)}` };
    }

    const leads: EnrichedLead[] = (data.people || []).map((person: any) => ({
      name: `${person.first_name || ""} ${person.last_name || ""}`.trim(),
      email: person.email,
      emailVerified: person.email_status === "verified",
      emailScore: person.email_status === "verified" ? 95 : 0,
      phone: person.phone_numbers?.[0]?.raw_number,
      phoneVerified: person.phone_status === "verified",
      linkedInUrl: person.linkedin_url,
      company: person.organization?.name || "",
      jobTitle: person.title,
      location: person.city || person.state || person.country,
      industry: person.organization?.industry,
      companySize: person.organization?.estimated_num_employees,
      revenue: person.organization?.estimated_annual_revenue,
      linkedInConnections: person.linkedin_connections,
      enrichmentData: { ...person, emailSource: "apollo" },
    }));

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
    logger.info(`[Apollo] Clé présente: ${!!process.env.APOLLO_API_KEY}, provider: ${provider}`);
    if ((provider === "apollo" || provider === "both") && process.env.APOLLO_API_KEY) {
      const apolloResult = await searchLeadsApollo({
        personTitles: search.jobTitles,
        industries: search.industries,
        locations: search.locations,
        companySizes: search.companySizes,
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

    // Filtrer selon les critères
    // Les leads scrapés n'ont pas encore d'email vérifié — l'enrichissement se fait après
    const hasScrapedLeads = leads.some((l) => (l.enrichmentSources || []).includes("google-scraper"));
    leads = leads.filter((lead) => {
      if (requireEmail && !hasScrapedLeads) {
        // Seulement en mode Apollo pur : exiger un email vérifié
        if (!lead.emailVerified) return false;
      }
      if (search.requirePhone && !lead.phone) return false;
      if (search.minConnections && (lead.linkedInConnections || 0) < search.minConnections) {
        return false;
      }
      return true;
    });

    logger.info(`[findQualifiedLeads] Après filtrage`, { leads: leads.length, hasScrapedLeads, requireEmail });

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

    // Enrichissement LinkedIn : jobTitle, company, location, industry, connections
    const leadsWithLinkedIn = leads.filter((l) => l.linkedInUrl);
    if (leadsWithLinkedIn.length > 0) {
      logger.info(`[LinkedInEnricher] Enrichissement pour ${leadsWithLinkedIn.length} leads`);
      leads = await enrichLeadsFromLinkedIn(leads);
    }

    // Enrichissement email maison : cherche des vrais emails pour les leads sans email
    const leadsWithoutEmail = leads.filter((l) => !l.email);
    if (leadsWithoutEmail.length > 0) {
      logger.info(`[EmailFinder] Enrichissement email pour ${leadsWithoutEmail.length} leads`);
      leads = await enrichLeadsWithEmails(leads);
      logger.info(`[EmailFinder] Emails trouvés: ${leads.filter((l) => l.email).length}/${leads.length}`);
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
