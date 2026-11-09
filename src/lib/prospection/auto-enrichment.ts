/**
 * Auto-Enrichissement des Prospects — 3 providers en cascade
 *
 * 1. Serper      — gratuit, LinkedIn URL + emails publics (~20%)
 * 2. Dropcontact — provider payant principal (EU/FR), email pro + statut qualifié
 * 3. Apollo      — 275M contacts, no-op tant que sa clé n'est pas financée
 *
 * Point d'entrée unique utilisé par tous les canaux d'acquisition (import CSV,
 * warm leads LinkedIn, leads Apollo sans email, création manuelle/API) — cf.
 * `prospect/created` (event-driven) et `findUnenrichedProspects` (batch nocturne).
 * Reste hors de portée : Signals Radar / Local Radar, qui n'ont pas de nom de
 * personne dans leur donnée source (cf. `resolve-radar-decision-makers`, qui
 * résout un décideur nommé en amont pour les rendre éligibles à ce cascade).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchGoogle } from "@/lib/ai/serper";
import { enrichLeadContact } from "@/lib/services/sales/enrichment";
import { isPlaceholderCompany } from "@/lib/services/sales/signal-fusion";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Provider 1 : Serper ──────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function extractBestEmail(text: string, company: string): string | undefined {
  const matches = (text.match(EMAIL_RE) ?? []).map((m) => m.toLowerCase());
  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  const filtered = matches.filter(
    (m) =>
      !m.includes("example.") &&
      !m.startsWith("test@") &&
      !["gmail.com", "hotmail.com", "yahoo.", "outlook."].some((d) =>
        m.endsWith("@" + d)
      )
  );
  return filtered.sort((a, b) => {
    const aDom = (a.split("@")[1] ?? "").replace(/[^a-z0-9]/g, "");
    const bDom = (b.split("@")[1] ?? "").replace(/[^a-z0-9]/g, "");
    return (bDom.includes(slug) ? 1 : 0) - (aDom.includes(slug) ? 1 : 0);
  })[0];
}

async function enrichWithSerper(
  prospect: ProspectBasicInfo
): Promise<EnrichmentResult> {
  if (!process.env.SERPER_API_KEY)
    return { enriched: false, reason: "SERPER_API_KEY non configuré" };

  let linkedInUrl: string | undefined;
  let email: string | undefined;

  try {
    const liResults = await searchGoogle(
      `site:linkedin.com/in "${prospect.name}" "${prospect.company}"`,
      3
    );
    for (const r of liResults) {
      const url = (r as { link?: string }).link ?? "";
      if (url.includes("linkedin.com/in/")) {
        linkedInUrl = url.split("?")[0];
        break;
      }
    }

    const emailResults = await searchGoogle(
      `"${prospect.name}" "${prospect.company}" email contact`,
      3
    );
    for (const r of emailResults) {
      const text = `${(r as { title?: string }).title ?? ""} ${(r as { snippet?: string }).snippet ?? ""}`;
      const found = extractBestEmail(text, prospect.company);
      if (found) { email = found; break; }
    }
  } catch (err) {
    return { enriched: false, reason: `Serper error: ${err}` };
  }

  if (!linkedInUrl && !email)
    return { enriched: false, reason: "Aucun contact trouvé (Serper)" };

  return { enriched: true, provider: "serper", email, emailVerified: false, linkedInUrl };
}

// ─── Provider 2 : Dropcontact ────────────────────────────────────────────────

async function enrichWithDropcontact(
  prospect: ProspectBasicInfo
): Promise<EnrichmentResult> {
  // Dropcontact facture le crédit même sans résultat — filtrer avant l'appel les
  // entreprises garanties non-exploitables (placeholders "—", "LinkedIn", "N/A"…).
  if (isPlaceholderCompany(prospect.company))
    return { enriched: false, reason: "Nom d'entreprise non exploitable (placeholder)" };

  const nameParts = prospect.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ");
  if (!firstName || !lastName)
    return { enriched: false, reason: "Prénom et nom complets requis pour Dropcontact" };

  const result = await enrichLeadContact(firstName, lastName, prospect.company);
  if (!result.email || result.emailStatus === "NOT_FOUND")
    return { enriched: false, reason: "Dropcontact: email non disponible" };

  return {
    enriched: true,
    provider: "dropcontact",
    email: result.email,
    emailVerified: result.emailStatus === "VERIFIED",
    linkedInUrl: result.linkedInUrl ?? undefined,
    phone: result.phone ?? undefined,
  };
}

// ─── Provider 3 : Apollo.io ──────────────────────────────────────────────────

interface ApolloPersonResponse {
  person?: {
    email?: string;
    email_status?: "verified" | "unverified" | "likely_to_engage" | "unavailable";
    phone_numbers?: Array<{ sanitized_number?: string; type?: string }>;
    linkedin_url?: string;
    title?: string;
    city?: string;
    country?: string;
    organization?: {
      industry?: string;
      estimated_num_employees?: number;
    };
  };
}

async function enrichWithApollo(
  prospect: ProspectBasicInfo
): Promise<EnrichmentResult> {
  if (!process.env.APOLLO_API_KEY)
    return { enriched: false, reason: "APOLLO_API_KEY non configuré" };

  const nameParts = prospect.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") || undefined;
  if (!firstName)
    return { enriched: false, reason: "Prénom manquant pour Apollo" };

  try {
    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: {
        "X-Api-Key": process.env.APOLLO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName,
        organization_name: prospect.company,
        reveal_personal_emails: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return { enriched: false, reason: `Apollo HTTP ${res.status}` };

    const json = (await res.json()) as ApolloPersonResponse;
    const person = json.person;

    if (!person) return { enriched: false, reason: "Apollo: personne non trouvée" };
    if (!person.email) return { enriched: false, reason: "Apollo: email non disponible" };

    return {
      enriched: true,
      provider: "apollo",
      email: person.email,
      emailVerified: person.email_status === "verified",
      phone: person.phone_numbers?.[0]?.sanitized_number,
      linkedInUrl: person.linkedin_url ?? undefined,
      jobTitle: person.title ?? undefined,
      industry: person.organization?.industry,
      companySize: person.organization?.estimated_num_employees
        ? String(person.organization.estimated_num_employees)
        : undefined,
      location: person.city
        ? `${person.city}${person.country ? `, ${person.country}` : ""}`
        : undefined,
    };
  } catch (err) {
    return { enriched: false, reason: `Apollo error: ${err}` };
  }
}

// ─── Public interface ─────────────────────────────────────────────────────────

/**
 * Enrichit un prospect via Serper → Dropcontact → Apollo.
 * Ne lève jamais d'erreur non catchée.
 */
export async function autoEnrichProspect(
  prospect: ProspectBasicInfo
): Promise<EnrichmentResult> {
  if (prospect.email)
    return { enriched: false, reason: "Déjà enrichi (email présent)" };

  // 1. Serper — gratuit, LinkedIn URL + email public
  const serperResult = await enrichWithSerper(prospect);
  if (serperResult.enriched && serperResult.email) {
    await saveEnrichmentResult(prospect, serperResult);
    return serperResult;
  }
  const partialLinkedIn = serperResult.linkedInUrl;

  // 2. Dropcontact — provider payant principal (EU/FR)
  const dropcontactResult = await enrichWithDropcontact(prospect);
  if (dropcontactResult.enriched && dropcontactResult.email) {
    const merged = { ...dropcontactResult, linkedInUrl: dropcontactResult.linkedInUrl ?? partialLinkedIn };
    await saveEnrichmentResult(prospect, merged);
    return merged;
  }

  // 3. Apollo — no-op tant que sa clé n'est pas financée
  const apolloResult = await enrichWithApollo(prospect);
  if (apolloResult.enriched && apolloResult.email) {
    const merged = {
      ...apolloResult,
      linkedInUrl: apolloResult.linkedInUrl ?? partialLinkedIn ?? dropcontactResult.linkedInUrl,
    };
    await saveEnrichmentResult(prospect, merged);
    return merged;
  }

  // Sauvegarder LinkedIn URL même sans email
  const bestLinkedIn = partialLinkedIn ?? dropcontactResult.linkedInUrl;
  if (bestLinkedIn) {
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { linkedInUrl: bestLinkedIn },
    }).catch(() => null);
  }

  return {
    enriched: false,
    reason: [serperResult.reason, dropcontactResult.reason, apolloResult.reason]
      .filter(Boolean)
      .join(" | "),
    linkedInUrl: bestLinkedIn,
  };
}

// ─── Save to DB ───────────────────────────────────────────────────────────────

async function saveEnrichmentResult(
  prospect: ProspectBasicInfo,
  result: EnrichmentResult
): Promise<void> {
  try {
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
            emailVerified: result.emailVerified,
            enrichedAt: new Date().toISOString(),
          })
        ),
      },
    });

    await prisma.leadEnrichment.create({
      data: {
        prospectId: prospect.id,
        workspaceId: prospect.workspaceId,
        provider:
          result.provider === "apollo"
            ? "APOLLO"
            : result.provider === "dropcontact"
              ? "DROPCONTACT"
              : "APIFY",
        status: "COMPLETED",
        emailFound: !!result.email,
        phoneFound: !!result.phone,
        emailScore: result.emailVerified
          ? 95
          : result.provider === "apollo"
            ? 85
            : result.provider === "dropcontact"
              ? 75
              : 55,
        data: JSON.parse(JSON.stringify(result)),
      },
    });
  } catch (err) {
    console.error("[AutoEnrich] Erreur sauvegarde:", err);
  }
}

// ─── Batch ────────────────────────────────────────────────────────────────────

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
