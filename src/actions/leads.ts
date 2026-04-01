"use server";

/**
 * 🔍 Find Qualified Leads - Recherche de Leads Qualifiés
 * 
 * Recherche et enrichissement de leads qualifiés:
 * - Recherche multi-critères (Apollo.io)
 * - Enrichissement de données (Clay.com)
 * - Vérification d'emails (Hunter.io)
 * - Import en masse
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findQualifiedLeads, enrichLeadClay, verifyEmailHunter } from "@/lib/prospection/enrichment";
import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 AUTH
// ═══════════════════════════════════════════════════════════════════════════

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorisé");
  }
  return session;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏢 GET USER WORKSPACE - Récupérer le workspace de l'utilisateur
// ═══════════════════════════════════════════════════════════════════════════

export async function getUserWorkspace(): Promise<{
  success: boolean;
  workspaceId?: string;
  error?: string;
}> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user!.id! },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (!workspace) {
      // Créer un workspace par défaut s'il n'existe pas
      const newWorkspace = await prisma.workspace.create({
        data: {
          name: "Mon Workspace",
          domainUrl: "",
          userId: session.user!.id!,
        },
      });
      return { success: true, workspaceId: newWorkspace.id };
    }

    return { success: true, workspaceId: workspace.id };
  } catch (error) {
    console.error("Get user workspace error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 SEARCH QUALIFIED LEADS - Rechercher des leads qualifiés
// ═══════════════════════════════════════════════════════════════════════════

const leadSearchSchema = z.object({
  jobTitles: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  companySizes: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  minConnections: z.number().optional(),
  requireEmail: z.boolean().default(false),
  requirePhone: z.boolean().default(false),
  limit: z.number().min(1).max(500).default(100),
  provider: z.enum(["apollo", "clay", "both"]).optional().default("apollo"),
  // Google Business mode
  searchMode: z.enum(["linkedin", "google_business"]).optional().default("linkedin"),
  minRating: z.number().min(1).max(5).optional(),
  requireWebsite: z.boolean().optional(),
});

export async function searchQualifiedLeads(
  workspaceId: string,
  search: z.input<typeof leadSearchSchema>
): Promise<{ success: boolean; leads?: any[]; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    // Valider les données
    const parsed = leadSearchSchema.safeParse(search);
    if (!parsed.success) {
      console.error("[Search] Validation échouée:", parsed.error.format());
      return { success: false, error: "Données invalides" };
    }

    console.log("[Search] Critères parsés:", JSON.stringify({
      searchMode: parsed.data.searchMode,
      requireEmail: parsed.data.requireEmail,
      requirePhone: parsed.data.requirePhone,
      keywords: parsed.data.keywords,
      locations: parsed.data.locations,
      jobTitles: parsed.data.jobTitles,
      limit: parsed.data.limit,
    }));

    // Rechercher les leads
    const result = await findQualifiedLeads({
      jobTitles: parsed.data.jobTitles,
      industries: parsed.data.industries,
      locations: parsed.data.locations,
      companySizes: parsed.data.companySizes,
      keywords: parsed.data.keywords,
      minConnections: parsed.data.minConnections,
      requireEmail: parsed.data.requireEmail,
      requirePhone: parsed.data.requirePhone,
      limit: parsed.data.limit,
      provider: parsed.data.provider,
      searchMode: parsed.data.searchMode,
      minRating: parsed.data.minRating,
      requireWebsite: parsed.data.requireWebsite,
    });

    console.log("[Search] findQualifiedLeads result:", JSON.stringify({
      success: result.success,
      leadsCount: result.leads?.length ?? 0,
      error: result.error,
    }));

    if (!result.success || !result.leads) {
      return { success: false, error: result.error || "Erreur de recherche" };
    }

    return { success: true, leads: result.leads };
  } catch (error) {
    console.error("Search qualified leads error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 💾 IMPORT LEADS - Importer des leads en masse
// ═══════════════════════════════════════════════════════════════════════════

export async function importLeads(
  workspaceId: string,
  leads: Array<{
    name: string;
    email?: string;
    phone?: string;
    linkedInUrl?: string;
    company: string;
    jobTitle?: string;
    location?: string;
    industry?: string;
  }>,
  listId?: string
): Promise<{ success: boolean; imported?: number; duplicates?: number; errors?: number; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    let imported = 0;
    let duplicates = 0;
    let errors = 0;
    const importedProspectIds: string[] = [];

    // Importer chaque lead
    for (const lead of leads) {
      try {
        // Vérifier si le lead existe deja (par email ou LinkedIn)
        const existing = await prisma.prospect.findFirst({
          where: {
            workspaceId,
            OR: [
              ...(lead.email ? [{ email: lead.email }] : []),
              ...(lead.linkedInUrl && lead.linkedInUrl.length > 0 ? [{ linkedInUrl: lead.linkedInUrl }] : []),
            ],
          },
        });

        if (existing) {
          // Mettre a jour le lead existant (merge)
          await prisma.prospect.update({
            where: { id: existing.id },
            data: {
              name: lead.name || existing.name,
              email: lead.email || existing.email,
              phone: lead.phone || existing.phone,
              linkedInUrl: lead.linkedInUrl || existing.linkedInUrl,
              company: lead.company || existing.company,
              jobTitle: lead.jobTitle || existing.jobTitle,
              location: lead.location || existing.location,
              industry: lead.industry || existing.industry,
              emailVerified: lead.email ? true : existing.emailVerified,
            },
          });
          importedProspectIds.push(existing.id);
          duplicates++;
        } else {
          // Creer un nouveau lead
          const created = await prisma.prospect.create({
            data: {
              name: lead.name,
              email: lead.email || null,
              phone: lead.phone || null,
              linkedInUrl: lead.linkedInUrl || "",
              company: lead.company,
              jobTitle: lead.jobTitle || null,
              location: lead.location || null,
              industry: lead.industry || null,
              emailVerified: lead.email ? true : false,
              workspaceId,
            },
          });
          importedProspectIds.push(created.id);
          imported++;
        }
      } catch (error: any) {
        // Gerer les violations de contrainte unique (P2002)
        if (error?.code === "P2002") {
          duplicates++;
        } else {
          console.error(`Error importing lead ${lead.name}:`, error);
          errors++;
        }
      }
    }

    // Ajouter à la liste si listId fourni
    if (listId && importedProspectIds.length > 0) {
      await prisma.prospectListEntry.createMany({
        data: importedProspectIds.map((prospectId) => ({
          prospectId,
          prospectListId: listId,
        })),
        skipDuplicates: true,
      });
    }

    return { success: true, imported, duplicates, errors };
  } catch (error) {
    console.error("Import leads error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 ENRICH LEAD - Enrichir un lead existant
// ═══════════════════════════════════════════════════════════════════════════

export async function enrichLead(
  workspaceId: string,
  prospectId: string,
  provider: "apollo" | "clay" | "hunter" = "clay"
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const session = await requireAuth();

    const prospect = await prisma.prospect.findFirst({
      where: {
        id: prospectId,
        workspaceId,
        workspace: { userId: session.user!.id! },
      },
    });

    if (!prospect) {
      return { success: false, error: "Prospect non trouvé" };
    }

    // Créer un enregistrement d'enrichissement
    const enrichment = await prisma.leadEnrichment.create({
      data: {
        prospectId,
        provider: provider.toUpperCase() as any,
        status: "PROCESSING",
        workspaceId,
      },
    });

    try {
      let enrichedData: any = {};

      // Enrichir selon le provider
      if (provider === "clay" && prospect.linkedInUrl) {
        const result = await enrichLeadClay(prospect.linkedInUrl, prospect.company);
        if (result.success && result.data) {
          enrichedData = result.data;

          // Mettre à jour le prospect
          await prisma.prospect.update({
            where: { id: prospectId },
            data: {
              email: result.data.email || prospect.email,
              emailVerified: result.data.emailVerified || prospect.emailVerified,
              phone: result.data.phone || prospect.phone,
              phoneVerified: result.data.phoneVerified || prospect.phoneVerified,
              location: result.data.location || prospect.location,
              industry: result.data.industry || prospect.industry,
              companySize: result.data.companySize || prospect.companySize,
              revenue: result.data.revenue || prospect.revenue,
              linkedInConnections: result.data.linkedInConnections || prospect.linkedInConnections,
              enrichmentData: result.data.enrichmentData as any,
            },
          });
        }
      }

      // Vérifier l'email avec Hunter si disponible
      if (enrichedData.email || prospect.email) {
        const emailToVerify = enrichedData.email || prospect.email;
        const verification = await verifyEmailHunter(emailToVerify, prospect.company);
        
        if (verification.success) {
          await prisma.prospect.update({
            where: { id: prospectId },
            data: {
              emailVerified: verification.verified || false,
            },
          });

          await prisma.leadEnrichment.update({
            where: { id: enrichment.id },
            data: {
              emailFound: !!emailToVerify,
              emailScore: verification.score || 0,
            },
          });
        }
      }

      // Mettre à jour l'enrichissement comme complété
      await prisma.leadEnrichment.update({
        where: { id: enrichment.id },
        data: {
          status: "COMPLETED",
          data: enrichedData,
          emailFound: !!(enrichedData.email || prospect.email),
          phoneFound: !!(enrichedData.phone || prospect.phone),
        },
      });

      return { success: true, data: enrichedData };
    } catch (error) {
      // Marquer comme failed
      await prisma.leadEnrichment.update({
        where: { id: enrichment.id },
        data: {
          status: "FAILED",
          error: String(error),
        },
      });

      throw error;
    }
  } catch (error) {
    console.error("Enrich lead error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 💾 SAVE SEARCH CRITERIA - Sauvegarder des critères de recherche
// ═══════════════════════════════════════════════════════════════════════════

export async function saveSearchCriteria(
  workspaceId: string,
  data: {
    name: string;
    jobTitles?: string[];
    industries?: string[];
    companySizes?: string[];
    locations?: string[];
    seniorityLevels?: string[];
    keywords?: string[];
    minConnections?: number;
    hasEmail?: boolean;
    results?: number;
  }
): Promise<{ success: boolean; data?: { id: string }; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    const criteria = await prisma.leadSearchCriteria.create({
      data: {
        workspaceId,
        name: data.name,
        jobTitles: data.jobTitles || [],
        industries: data.industries || [],
        companySizes: data.companySizes || [],
        locations: data.locations || [],
        seniorityLevels: data.seniorityLevels || [],
        keywords: data.keywords || [],
        minConnections: data.minConnections || null,
        hasEmail: data.hasEmail ?? true,
        results: data.results || 100,
      },
    });

    return { success: true, data: { id: criteria.id } };
  } catch (error) {
    console.error("Save search criteria error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🤖 QUALIFY PROSPECT SEARCH - Qualifier une recherche en langage naturel
// ═══════════════════════════════════════════════════════════════════════════

export interface QualifiedSearchCriteria {
  jobTitles: string[];
  industries: string[];
  locations: string[];
  keywords: string[];
  searchMode: "linkedin" | "google_business";
  requireEmail: boolean;
  requirePhone: boolean;
  limit: number;
  minRating?: number;
}

export async function qualifyProspectSearch(
  naturalLanguageQuery: string
): Promise<{
  success: boolean;
  criteria?: QualifiedSearchCriteria;
  summary?: string;
  error?: string;
}> {
  try {
    await requireAuth();

    const { getClaude } = await import("@/lib/ai/langchain");

    const systemPrompt = `Tu es un assistant de prospection commerciale B2B. L'utilisateur décrit sa cible en langage naturel. Analyse et extrais les critères de recherche structurés.

Réponds UNIQUEMENT avec un JSON valide dans ce format exact:
{
  "jobTitles": ["titre1", "titre2"],
  "industries": ["secteur1"],
  "locations": ["ville/region1"],
  "keywords": ["mot1", "mot2"],
  "searchMode": "linkedin" ou "google_business",
  "requireEmail": false,
  "requirePhone": false,
  "limit": 50,
  "minRating": null,
  "summary": "Résumé en 1 phrase de ce que tu as compris"
}

Règles de choix du searchMode:
- PRIORITÉ 1 — si la cible est un TYPE d'ÉTABLISSEMENT ou d'ORGANISATION (organisme de formation, restaurant, cabinet, agence, clinique, école, commerce...) → searchMode: "google_business" MÊME si l'utilisateur mentionne le rôle du décideur (gérant, directeur, fondateur...)
- PRIORITÉ 2 — si la cible est uniquement un profil de personne avec un titre précis SANS type d'organisation spécifique (ex: "CMO de startups", "DRH", "responsable marketing") → searchMode: "linkedin"
- En cas de doute : préfère "google_business"

Exemples:
- "gérants d'organismes de formation" → google_business (organisme de formation = établissement)
- "directeurs de restaurants étoilés à Lyon" → google_business (restaurant = établissement)
- "CMO de startups SaaS" → linkedin (startup SaaS = pas un type d'établissement spécifique)
- "fondateurs d'agences web" → google_business (agence web = établissement)

Autres règles:
- Pour mode google_business: keywords = type d'activité de l'établissement (ex: "organisme de formation", "agence web"), jobTitles = [] (inutile)
- Pour mode linkedin: génère des variantes de titres (FR + EN), keywords = domaine d'activité
- Pour les localisations: max 3-4 valeurs principales, PAS tous les codes de département
  - Île-de-France → ["Île-de-France", "Paris"]
  - Grand Paris → ["Paris", "Île-de-France"]
  - Lyon → ["Lyon", "Rhône"]
- limit par défaut: 50, max: 100
- minRating: null sauf si l'utilisateur mentionne une note ou qualité`;

    const claude = getClaude();
    const response = await claude.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(naturalLanguageQuery),
    ]);

    const text =
      typeof response.content === "string"
        ? response.content
        : response.content
            .map((c: any) => (typeof c === "object" && "text" in c ? c.text : ""))
            .join("");

    const cleaned = text.replace(/^```\w*\s*/m, "").replace(/```\s*$/m, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      success: true,
      criteria: {
        jobTitles: parsed.jobTitles || [],
        industries: parsed.industries || [],
        locations: parsed.locations || [],
        keywords: parsed.keywords || [],
        searchMode: parsed.searchMode || "linkedin",
        requireEmail: false, // Toujours false : on veut des leads même sans email
        requirePhone: false,
        limit: Math.min(parsed.limit || 50, 100),
        minRating: parsed.minRating ?? undefined,
      },
      summary: parsed.summary || "",
    };
  } catch (error) {
    console.error("Qualify prospect search error:", error);
    return { success: false, error: String(error) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✉️ GENERATE LEAD MESSAGE - Générer un message personnalisé pour un lead
// ═══════════════════════════════════════════════════════════════════════════

export async function generateLeadMessage(
  workspaceId: string,
  lead: {
    name: string;
    company: string;
    jobTitle?: string;
    linkedInUrl?: string;
    location?: string;
    industry?: string;
    enrichmentData?: Record<string, unknown>;
  },
  sequenceStep: 1 | 2 | 3 | 4 | 5 = 1
): Promise<{
  success: boolean;
  message?: string;
  connectionRequest?: string;
  personalizationScore?: number;
  recommendations?: string[];
  error?: string;
}> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
      select: { name: true, domainUrl: true, brandVoice: true },
    });

    if (!workspace) return { success: false, error: "Workspace non trouvé" };

    const brandVoice = (workspace.brandVoice ?? {}) as Record<string, unknown>;
    const ourCompany = workspace.name || (workspace.domainUrl?.replace(/^https?:\/\/(www\.)?/, "") ?? "notre entreprise");
    const ourOffer = (brandVoice.offer as string) || (brandVoice.description as string) || "notre solution";

    const { generatePersonalizedLinkedInMessage } = await import("@/lib/prospection/linkedin-outreach");

    const result = await generatePersonalizedLinkedInMessage({
      prospect: {
        name: lead.name,
        company: lead.company,
        jobTitle: lead.jobTitle,
        linkedInUrl: lead.linkedInUrl,
        location: lead.location,
        industry: lead.industry,
        emailVerified: false,
        phoneVerified: false,
        enrichmentData: {
          ...lead.enrichmentData,
          linkedInBio: lead.enrichmentData?.linkedInBio,
        },
      },
      sequenceStep,
      ourOffer,
      ourCompany,
    });

    return {
      success: true,
      message: result.content,
      connectionRequest: result.connectionRequest,
      personalizationScore: result.personalizationScore,
      recommendations: result.recommendations,
    };
  } catch (error) {
    console.error("generateLeadMessage error:", error);
    return { success: false, error: String(error) };
  }
}

export async function getSearchCriteria(
  workspaceId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const session = await requireAuth();

    const criteria = await prisma.leadSearchCriteria.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: criteria };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
