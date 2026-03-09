/**
 * 🔍 Auto-Enrichissement des Prospects
 *
 * Interface unifiée Apollo.io + Hunter.io avec fallback gracieux.
 * Si aucune clé API n'est configurée, retourne { enriched: false } sans erreur.
 *
 * Variables d'environnement (optionnelles) :
 * - APOLLO_API_KEY : API Apollo.io
 * - HUNTER_API_KEY : API Hunter.io
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface ProspectBasicInfo {
  id: string;
  name: string;
  company: string;
  jobTitle?: string | null;
  email?: string | null;
  workspaceId: string;
}

export interface EnrichmentResult {
  enriched: boolean;
  provider?: string;
  reason?: string;
  email?: string;
  emailVerified?: boolean;
  phone?: string;
  jobTitle?: string;
  companySize?: string;
  industry?: string;
  linkedInUrl?: string;
  website?: string;
  linkedInConnections?: number;
  location?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. APOLLO.IO — Recherche B2B complète
// ═══════════════════════════════════════════════════════════════════════════

async function enrichWithApollo(prospect: ProspectBasicInfo): Promise<EnrichmentResult> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return { enriched: false, reason: "APOLLO_API_KEY non configuré" };

  try {
    // Recherche par nom + société
    const res = await fetch("https://api.apollo.io/v1/people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        name: prospect.name,
        organization_name: prospect.company,
        page: 1,
        per_page: 1,
        email_status: ["verified", "likely to engage"],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[Apollo] Erreur API ${res.status}:`, err);
      return { enriched: false, reason: `Apollo error ${res.status}` };
    }

    const data = await res.json();
    const person = data.people?.[0];

    if (!person) {
      return { enriched: false, reason: "Aucun résultat Apollo" };
    }

    return {
      enriched: true,
      provider: "apollo",
      email: person.email,
      emailVerified: person.email_status === "verified",
      phone: person.phone_numbers?.[0]?.raw_number,
      jobTitle: person.title,
      companySize: person.organization?.employee_count_range,
      industry: person.organization?.industry,
      linkedInUrl: person.linkedin_url,
      website: person.organization?.website_url,
      linkedInConnections: person.linkedin_connections,
      location: person.city ? `${person.city}, ${person.country}` : person.country,
    };
  } catch (err) {
    console.warn("[Apollo] Erreur réseau:", err);
    return { enriched: false, reason: "Apollo network error" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. HUNTER.IO — Recherche d'email par nom + société
// ═══════════════════════════════════════════════════════════════════════════

async function enrichWithHunter(prospect: ProspectBasicInfo): Promise<EnrichmentResult> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return { enriched: false, reason: "HUNTER_API_KEY non configuré" };

  try {
    const nameParts = prospect.name.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || nameParts[0];

    const params = new URLSearchParams({
      first_name: firstName,
      last_name: lastName,
      company: prospect.company,
      api_key: apiKey,
    });

    const res = await fetch(`https://api.hunter.io/v2/email-finder?${params.toString()}`);

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[Hunter] Erreur API ${res.status}:`, err);
      return { enriched: false, reason: `Hunter error ${res.status}` };
    }

    const data = await res.json();
    const email = data.data?.email;

    if (!email) {
      return { enriched: false, reason: "Aucun email trouvé par Hunter" };
    }

    return {
      enriched: true,
      provider: "hunter",
      email,
      emailVerified: (data.data?.score ?? 0) >= 80,
    };
  } catch (err) {
    console.warn("[Hunter] Erreur réseau:", err);
    return { enriched: false, reason: "Hunter network error" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. INTERFACE PUBLIQUE — Enrichissement avec fallback automatique
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enrichit un prospect en essayant Apollo d'abord, puis Hunter en fallback.
 * Ne génère jamais d'erreur non catchée — retourne { enriched: false } si tout échoue.
 */
export async function autoEnrichProspect(
  prospect: ProspectBasicInfo
): Promise<EnrichmentResult> {
  // Si le prospect a déjà un email vérifié, skip
  if (prospect.email) {
    return { enriched: false, reason: "Prospect déjà enrichi (email présent)" };
  }

  // Essayer Apollo en premier
  const apolloResult = await enrichWithApollo(prospect);
  if (apolloResult.enriched) {
    await saveEnrichmentResult(prospect, apolloResult);
    return apolloResult;
  }

  // Fallback Hunter
  const hunterResult = await enrichWithHunter(prospect);
  if (hunterResult.enriched) {
    await saveEnrichmentResult(prospect, hunterResult);
    return hunterResult;
  }

  // Aucun résultat
  return { enriched: false, reason: `Apollo: ${apolloResult.reason} | Hunter: ${hunterResult.reason}` };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. SAUVEGARDE EN BASE
// ═══════════════════════════════════════════════════════════════════════════

async function saveEnrichmentResult(
  prospect: ProspectBasicInfo,
  result: EnrichmentResult
): Promise<void> {
  try {
    // Mettre à jour le prospect avec les données enrichies
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        ...(result.email && { email: result.email }),
        ...(result.emailVerified !== undefined && { emailVerified: result.emailVerified }),
        ...(result.phone && { phone: result.phone }),
        ...(result.jobTitle && !prospect.jobTitle && { jobTitle: result.jobTitle }),
        ...(result.industry && { industry: result.industry }),
        ...(result.companySize && { companySize: result.companySize }),
        ...(result.linkedInUrl && { linkedInUrl: result.linkedInUrl }),
        ...(result.linkedInConnections && { linkedInConnections: result.linkedInConnections }),
        ...(result.location && { location: result.location }),
        enrichmentData: JSON.parse(
          JSON.stringify({
            provider: result.provider,
            website: result.website,
            enrichedAt: new Date().toISOString(),
          })
        ),
      },
    });

    // Enregistrer dans l'historique d'enrichissement
    await prisma.leadEnrichment.create({
      data: {
        prospectId: prospect.id,
        workspaceId: prospect.workspaceId,
        provider: result.provider === "apollo" ? "APOLLO" : "HUNTER",
        status: "COMPLETED",
        emailFound: !!result.email,
        phoneFound: !!result.phone,
        emailScore: result.emailVerified ? 95 : 60,
        data: JSON.parse(JSON.stringify(result)),
      },
    });
  } catch (err) {
    console.error("[AutoEnrich] Erreur sauvegarde:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. BATCH — Enrichir les prospects existants sans email
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Retourne les prospects non enrichis d'un workspace (sans email, sans enrichmentData).
 * Utilisé par le cron Inngest pour le batch nightly.
 */
export async function findUnenrichedProspects(
  workspaceId: string,
  limit = 10
): Promise<ProspectBasicInfo[]> {
  const prospects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      email: null,
      enrichmentData: { equals: Prisma.JsonNull },
    },
    take: limit,
    select: { id: true, name: true, company: true, jobTitle: true, email: true, workspaceId: true },
    orderBy: { createdAt: "desc" },
  });

  return prospects.map((p) => ({
    id: p.id,
    name: p.name,
    company: p.company,
    jobTitle: p.jobTitle,
    email: p.email,
    workspaceId,
  }));
}
