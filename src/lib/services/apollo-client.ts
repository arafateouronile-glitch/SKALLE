/**
 * Apollo.io API client — People Search + Person Enrichment
 *
 * Docs: https://apolloio.github.io/apollo-api-docs/
 * Auth: X-Api-Key header (API key from Apollo Settings → Integrations)
 */

import { prisma } from "@/lib/prisma";
import { decryptIfNeeded } from "@/lib/encryption";

const APOLLO_BASE = "https://api.apollo.io/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApolloPersonResult {
  id: string;
  apolloId: string;
  firstName: string;
  lastName: string;
  name: string;
  title: string | null;
  email: string | null;
  emailStatus: "verified" | "likely to engage" | "unavailable" | null;
  linkedInUrl: string | null;
  company: string | null;
  city: string | null;
  country: string | null;
}

export interface ApolloSearchFilters {
  personTitles?: string[];       // job titles
  personLocations?: string[];    // "France", "Paris, France"
  keywords?: string;             // free text keywords
  organizationIndustries?: string[]; // "Education", "Human Resources"
  emailStatus?: string[];        // ["verified", "likely to engage"]
  page?: number;
  perPage?: number;
}

export interface ApolloSearchResult {
  people: ApolloPersonResult[];
  totalEntries: number;
  totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapPerson(raw: Record<string, unknown>): ApolloPersonResult {
  const history = raw.employment_history as Record<string, unknown>[] | undefined;
  const org = (raw.organization ?? history?.[0] ?? {}) as Record<string, unknown>;
  return {
    id: (raw.id as string) ?? "",
    apolloId: (raw.id as string) ?? "",
    firstName: (raw.first_name as string) ?? "",
    lastName: (raw.last_name as string) ?? "",
    name: (raw.name as string) ?? [raw.first_name, raw.last_name].filter(Boolean).join(" "),
    title: (raw.title as string) ?? null,
    email: (raw.email as string) ?? null,
    emailStatus: (raw.email_status as ApolloPersonResult["emailStatus"]) ?? null,
    linkedInUrl: (raw.linkedin_url as string) ?? null,
    company: (org.name as string) ?? (raw.organization_name as string) ?? null,
    city: (raw.city as string) ?? null,
    country: (raw.country as string) ?? null,
  };
}

async function apolloPost(
  apiKey: string,
  path: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apollo API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

// ─── People Search ────────────────────────────────────────────────────────────

/**
 * Cherche des personnes sur Apollo selon des critères ICP.
 * Retourne uniquement les prospects avec email vérifié ou probable.
 */
export async function apolloPeopleSearch(
  apiKey: string,
  filters: ApolloSearchFilters
): Promise<ApolloSearchResult> {
  const body: Record<string, unknown> = {
    per_page: Math.min(filters.perPage ?? 25, 100),
    page: filters.page ?? 1,
  };

  if (filters.personTitles?.length) body.person_titles = filters.personTitles;
  if (filters.personLocations?.length) body.person_locations = filters.personLocations;
  if (filters.keywords) body.q_keywords = filters.keywords;
  if (filters.organizationIndustries?.length) body.organization_industry_tag_ids = filters.organizationIndustries;

  // Par défaut : seulement emails de qualité
  body.contact_email_status = filters.emailStatus ?? ["verified", "likely to engage"];

  const data = await apolloPost(apiKey, "/mixed_people/search", body);

  const rawPeople = (data.people as Record<string, unknown>[]) ?? [];
  const pagination = (data.pagination as Record<string, unknown>) ?? {};

  return {
    people: rawPeople.map(mapPerson),
    totalEntries: (pagination.total_entries as number) ?? rawPeople.length,
    totalPages: (pagination.total_pages as number) ?? 1,
  };
}

// ─── Person Enrichment ────────────────────────────────────────────────────────

/**
 * Enrichit un prospect avec son email depuis Apollo.
 * Stratégie : LinkedIn URL en premier, puis name + company en fallback.
 */
export async function apolloEnrichPerson(
  apiKey: string,
  params: {
    linkedInUrl?: string | null;
    firstName?: string;
    lastName?: string;
    company?: string;
    email?: string | null;
  }
): Promise<ApolloPersonResult | null> {
  const body: Record<string, unknown> = { reveal_personal_emails: false };

  if (params.linkedInUrl) {
    body.linkedin_url = params.linkedInUrl;
  } else if (params.firstName && params.lastName && params.company) {
    body.first_name = params.firstName;
    body.last_name = params.lastName;
    body.organization_name = params.company;
  } else if (params.email) {
    body.email = params.email;
  } else {
    return null;
  }

  try {
    const data = await apolloPost(apiKey, "/people/match", body);
    const raw = data.person as Record<string, unknown> | null;
    if (!raw) return null;
    return mapPerson(raw);
  } catch {
    return null;
  }
}

// ─── Account info (test + quotas) ─────────────────────────────────────────────

// ─── DB helper ────────────────────────────────────────────────────────────────

export async function getApolloApiKey(workspaceId: string): Promise<string | null> {
  const integration = await prisma.externalIntegration.findFirst({
    where: { workspaceId, provider: "apollo" },
    select: { encryptedApiKey: true },
  });
  if (!integration) return null;
  try {
    return decryptIfNeeded(integration.encryptedApiKey);
  } catch {
    return null;
  }
}

// ─── Account info (test + quotas) ─────────────────────────────────────────────

export async function apolloCheckAccount(apiKey: string): Promise<{
  ok: boolean;
  planTier?: string;
  emailCreditsUsed?: number;
  emailCreditsLimit?: number;
  error?: string;
}> {
  try {
    const res = await fetch(`${APOLLO_BASE}/auth/health`, {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as Record<string, unknown>;
    const user = (data.user ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      planTier: (user.plan_tier as string) ?? undefined,
      emailCreditsUsed: (user.email_credits_used as number) ?? undefined,
      emailCreditsLimit: (user.email_credits_limit as number) ?? undefined,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
