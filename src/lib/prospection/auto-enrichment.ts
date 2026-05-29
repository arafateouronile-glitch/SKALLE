/**
 * Auto-Enrichissement des Prospects — 2 providers en cascade
 *
 * 1. Serper  — gratuit, LinkedIn URL + emails publics (~20%)
 * 2. Apollo  — 275M contacts, email + téléphone + LinkedIn (~90%)
 *
 * Coût moyen : ~$0.03–0.05 / prospect enrichi
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchGoogle } from "@/lib/ai/serper";

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

// ─── Provider 2 : Apollo.io ──────────────────────────────────────────────────

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
 * Enrichit un prospect via Serper → Apollo.
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

  // 2. Apollo — 275M contacts, synchrone
  const apolloResult = await enrichWithApollo(prospect);
  if (apolloResult.enriched && apolloResult.email) {
    const merged = { ...apolloResult, linkedInUrl: apolloResult.linkedInUrl ?? partialLinkedIn };
    await saveEnrichmentResult(prospect, merged);
    return merged;
  }

  // Sauvegarder LinkedIn URL même sans email
  if (partialLinkedIn) {
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { linkedInUrl: partialLinkedIn },
    }).catch(() => null);
  }

  return {
    enriched: false,
    reason: [serperResult.reason, apolloResult.reason].filter(Boolean).join(" | "),
    linkedInUrl: partialLinkedIn,
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
        provider: result.provider === "apollo" ? "APOLLO" : "APIFY",
        status: "COMPLETED",
        emailFound: !!result.email,
        phoneFound: !!result.phone,
        emailScore: result.emailVerified ? 95 : result.provider === "apollo" ? 85 : 55,
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
