/**
 * Waterfall Enricher — 5 providers en cascade
 *
 * Ordre : Serper (gratuit) → Apollo → Hunter email finder → Clearbit → AI pattern guesser
 * Court-circuit dès qu'un email vérifié est trouvé.
 */

import { prisma } from "@/lib/prisma";
import { searchGoogle } from "@/lib/ai/serper";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WaterfallInput {
  id: string;
  name: string;
  company: string;
  jobTitle?: string | null;
  email?: string | null;
  linkedInUrl?: string | null;
  workspaceId: string;
}

export interface ProviderResult {
  provider: string;
  found: boolean;
  email?: string;
  emailVerified?: boolean;
  emailScore?: number;
  phone?: string;
  jobTitle?: string;
  industry?: string;
  companySize?: string;
  location?: string;
  linkedInUrl?: string;
  reason?: string;
}

export interface WaterfallResult {
  success: boolean;
  prospectId: string;
  email?: string;
  emailVerified?: boolean;
  emailScore?: number;
  phone?: string;
  linkedInUrl?: string;
  jobTitle?: string;
  industry?: string;
  companySize?: string;
  location?: string;
  providersAttempted: string[];
  providerThatFound?: string;
  reason?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const FREE_DOMAINS = new Set(["gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "icloud.com", "proton.me"]);

function extractBestEmail(text: string, company: string): string | undefined {
  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  const matches = (text.match(EMAIL_RE) ?? [])
    .map((m) => m.toLowerCase())
    .filter((m) => !m.includes("example.") && !m.startsWith("test@") && !FREE_DOMAINS.has(m.split("@")[1] ?? ""));
  return matches.sort((a, b) => {
    const aD = (a.split("@")[1] ?? "").replace(/[^a-z0-9]/g, "");
    const bD = (b.split("@")[1] ?? "").replace(/[^a-z0-9]/g, "");
    return (bD.includes(slug) ? 1 : 0) - (aD.includes(slug) ? 1 : 0);
  })[0];
}

function companyDomain(company: string): string | undefined {
  const slug = company.toLowerCase().replace(/\s+(inc\.?|llc|ltd\.?|sas|srl|gmbh|bv|sa)$/i, "").trim().replace(/[^a-z0-9]/g, "");
  if (slug.length < 2) return undefined;
  return `${slug}.com`;
}

function nameParts(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

// ─── Provider 1 : Serper ──────────────────────────────────────────────────────

async function enrichWithSerper(p: WaterfallInput): Promise<ProviderResult> {
  if (!process.env.SERPER_API_KEY) return { provider: "serper", found: false, reason: "SERPER_API_KEY absent" };
  try {
    // 1a. LinkedIn URL
    let linkedInUrl: string | undefined;
    if (!p.linkedInUrl) {
      const liRes = await searchGoogle(`site:linkedin.com/in "${p.name}" "${p.company}"`, 3);
      for (const r of liRes) {
        const url = (r as { link?: string }).link ?? "";
        if (url.includes("linkedin.com/in/")) { linkedInUrl = url.split("?")[0]; break; }
      }
    } else {
      linkedInUrl = p.linkedInUrl;
    }

    // 1b. Email from web
    const emailRes = await searchGoogle(`"${p.name}" "${p.company}" email contact`, 3);
    let email: string | undefined;
    for (const r of emailRes) {
      const text = `${(r as { title?: string }).title ?? ""} ${(r as { snippet?: string }).snippet ?? ""}`;
      const found = extractBestEmail(text, p.company);
      if (found) { email = found; break; }
    }

    if (!email && !linkedInUrl) return { provider: "serper", found: false, reason: "Rien trouvé via Serper" };
    return { provider: "serper", found: !!email, email, linkedInUrl, emailVerified: false, emailScore: email ? 40 : 0 };
  } catch (err) {
    return { provider: "serper", found: false, reason: `Serper error: ${err}` };
  }
}

// ─── Provider 2 : Apollo ─────────────────────────────────────────────────────

interface ApolloPersonResponse {
  person?: {
    email?: string;
    email_status?: string;
    phone_numbers?: Array<{ sanitized_number?: string }>;
    linkedin_url?: string;
    title?: string;
    city?: string;
    country?: string;
    organization?: { industry?: string; estimated_num_employees?: number };
  };
}

async function enrichWithApollo(p: WaterfallInput): Promise<ProviderResult> {
  if (!process.env.APOLLO_API_KEY) return { provider: "apollo", found: false, reason: "APOLLO_API_KEY absent" };
  const { first, last } = nameParts(p.name);
  if (!first) return { provider: "apollo", found: false, reason: "Prénom manquant" };

  try {
    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: { "X-Api-Key": process.env.APOLLO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ first_name: first, last_name: last || undefined, organization_name: p.company, reveal_personal_emails: false }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { provider: "apollo", found: false, reason: `Apollo HTTP ${res.status}` };
    const json = (await res.json()) as ApolloPersonResponse;
    const person = json.person;
    if (!person?.email) return { provider: "apollo", found: false, reason: "Apollo: email non disponible" };

    const verified = person.email_status === "verified";
    return {
      provider: "apollo",
      found: true,
      email: person.email,
      emailVerified: verified,
      emailScore: verified ? 90 : 70,
      phone: person.phone_numbers?.[0]?.sanitized_number,
      linkedInUrl: person.linkedin_url ?? undefined,
      jobTitle: person.title ?? undefined,
      industry: person.organization?.industry,
      companySize: person.organization?.estimated_num_employees ? String(person.organization.estimated_num_employees) : undefined,
      location: person.city ? `${person.city}${person.country ? `, ${person.country}` : ""}` : undefined,
    };
  } catch (err) {
    return { provider: "apollo", found: false, reason: `Apollo error: ${err}` };
  }
}

// ─── Provider 3 : Hunter.io email finder ─────────────────────────────────────

interface HunterEmailFinderResponse {
  data?: {
    email?: string;
    score?: number;
    domain?: string;
    first_name?: string;
    last_name?: string;
    linkedin_url?: string;
  };
  errors?: { details: string }[];
}

async function enrichWithHunter(p: WaterfallInput): Promise<ProviderResult> {
  if (!process.env.HUNTER_API_KEY) return { provider: "hunter", found: false, reason: "HUNTER_API_KEY absent" };
  const { first, last } = nameParts(p.name);
  if (!first || !last) return { provider: "hunter", found: false, reason: "Nom complet requis pour Hunter" };

  const domain = companyDomain(p.company);
  if (!domain) return { provider: "hunter", found: false, reason: "Impossible de dériver le domaine" };

  try {
    const url = new URL("https://api.hunter.io/v2/email-finder");
    url.searchParams.set("domain", domain);
    url.searchParams.set("first_name", first);
    url.searchParams.set("last_name", last);
    url.searchParams.set("api_key", process.env.HUNTER_API_KEY);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { provider: "hunter", found: false, reason: `Hunter HTTP ${res.status}` };

    const json = (await res.json()) as HunterEmailFinderResponse;
    const data = json.data;
    if (!data?.email) return { provider: "hunter", found: false, reason: "Hunter: email non trouvé" };

    const score = data.score ?? 0;
    return {
      provider: "hunter",
      found: true,
      email: data.email,
      emailVerified: score >= 90,
      emailScore: score,
      linkedInUrl: data.linkedin_url ?? undefined,
    };
  } catch (err) {
    return { provider: "hunter", found: false, reason: `Hunter error: ${err}` };
  }
}

// ─── Provider 4 : Clearbit ───────────────────────────────────────────────────

interface ClearbitPersonResponse {
  id?: string;
  name?: { fullName?: string };
  email?: string;
  employment?: { title?: string; company?: string };
  geo?: { city?: string; country?: string };
  linkedin?: { handle?: string };
}

async function enrichWithClearbit(p: WaterfallInput): Promise<ProviderResult> {
  if (!process.env.CLEARBIT_API_KEY) return { provider: "clearbit", found: false, reason: "CLEARBIT_API_KEY absent" };

  // Clearbit needs email OR linkedin URL to look up a person
  const linkedIn = p.linkedInUrl;
  if (!linkedIn) return { provider: "clearbit", found: false, reason: "LinkedIn URL requis pour Clearbit" };

  try {
    const res = await fetch(
      `https://person.clearbit.com/v2/people/find?linkedin_url=${encodeURIComponent(linkedIn)}`,
      { headers: { Authorization: `Bearer ${process.env.CLEARBIT_API_KEY}` }, signal: AbortSignal.timeout(10_000) }
    );

    if (res.status === 404) return { provider: "clearbit", found: false, reason: "Clearbit: personne non trouvée" };
    if (!res.ok) return { provider: "clearbit", found: false, reason: `Clearbit HTTP ${res.status}` };

    const data = (await res.json()) as ClearbitPersonResponse;
    if (!data.email) return { provider: "clearbit", found: false, reason: "Clearbit: email non disponible" };

    return {
      provider: "clearbit",
      found: true,
      email: data.email,
      emailVerified: true,
      emailScore: 85,
      jobTitle: data.employment?.title ?? undefined,
      location: data.geo?.city ?? undefined,
    };
  } catch (err) {
    return { provider: "clearbit", found: false, reason: `Clearbit error: ${err}` };
  }
}

// ─── Provider 5 : AI email pattern guesser (fallback gratuit) ─────────────────

async function enrichWithPatternGuesser(p: WaterfallInput): Promise<ProviderResult> {
  const domain = companyDomain(p.company);
  if (!domain) return { provider: "pattern", found: false, reason: "Domaine indérivable" };

  const { first, last } = nameParts(p.name);
  if (!first || !last) return { provider: "pattern", found: false, reason: "Nom complet requis" };

  const f = first.toLowerCase().replace(/[^a-z]/g, "");
  const l = last.toLowerCase().replace(/[^a-z]/g, "");
  if (!f || !l) return { provider: "pattern", found: false, reason: "Caractères invalides dans le nom" };

  // Most common B2B email patterns
  const patterns = [
    `${f}.${l}@${domain}`,
    `${f}${l}@${domain}`,
    `${f[0]}.${l}@${domain}`,
    `${f[0]}${l}@${domain}`,
    `${f}@${domain}`,
  ];

  const guessed = patterns[0];

  return {
    provider: "pattern",
    found: true,
    email: guessed,
    emailVerified: false,
    emailScore: 25, // Low confidence
    reason: `Pattern guess: ${patterns.slice(0, 3).join(" | ")}`,
  };
}

// ─── Waterfall orchestrator ───────────────────────────────────────────────────

export async function runWaterfall(p: WaterfallInput): Promise<WaterfallResult> {
  const base: WaterfallResult = {
    success: false,
    prospectId: p.id,
    providersAttempted: [],
  };

  // Short-circuit: already has verified email
  if (p.email && p.email !== "" && !p.email.includes("@discovery.skalle")) {
    return { ...base, success: true, email: p.email, providerThatFound: "existing", providersAttempted: [] };
  }

  let partialLinkedInUrl = p.linkedInUrl ?? undefined;
  let bestResult: ProviderResult | null = null;

  const providers = [
    { name: "serper", fn: enrichWithSerper },
    { name: "apollo", fn: enrichWithApollo },
    { name: "hunter", fn: enrichWithHunter },
    { name: "clearbit", fn: enrichWithClearbit },
    { name: "pattern", fn: enrichWithPatternGuesser },
  ] as const;

  for (const { name, fn } of providers) {
    base.providersAttempted.push(name);
    const result = await fn({ ...p, linkedInUrl: partialLinkedInUrl });

    // Collect LinkedIn URL from any provider
    if (result.linkedInUrl && !partialLinkedInUrl) {
      partialLinkedInUrl = result.linkedInUrl;
    }

    if (!result.found) continue;

    // Keep best result (highest emailScore)
    if (!bestResult || (result.emailScore ?? 0) > (bestResult.emailScore ?? 0)) {
      bestResult = result;
    }

    // Stop waterfall if we have a verified email (score ≥ 70)
    if (result.email && (result.emailVerified || (result.emailScore ?? 0) >= 70)) {
      break;
    }
  }

  if (!bestResult || !bestResult.email) {
    return { ...base, reason: "Aucun email trouvé après tous les providers", linkedInUrl: partialLinkedInUrl };
  }

  return {
    success: true,
    prospectId: p.id,
    email: bestResult.email,
    emailVerified: bestResult.emailVerified ?? false,
    emailScore: bestResult.emailScore,
    phone: bestResult.phone,
    linkedInUrl: partialLinkedInUrl ?? bestResult.linkedInUrl,
    jobTitle: bestResult.jobTitle,
    industry: bestResult.industry,
    companySize: bestResult.companySize,
    location: bestResult.location,
    providersAttempted: base.providersAttempted,
    providerThatFound: bestResult.provider,
  };
}

// ─── Save to DB ───────────────────────────────────────────────────────────────

export async function saveWaterfallResult(result: WaterfallResult): Promise<void> {
  if (!result.success || !result.email) {
    // Still save LinkedIn URL if found
    if (result.linkedInUrl) {
      await prisma.prospect.update({
        where: { id: result.prospectId },
        data: { linkedInUrl: result.linkedInUrl },
      }).catch(() => null);
    }
    return;
  }

  const prospect = await prisma.prospect.findUnique({ where: { id: result.prospectId }, select: { jobTitle: true, workspaceId: true } });
  if (!prospect) return;

  await prisma.prospect.update({
    where: { id: result.prospectId },
    data: {
      email: result.email,
      emailVerified: result.emailVerified ?? false,
      ...(result.phone && { phone: result.phone }),
      ...(result.jobTitle && !prospect.jobTitle && { jobTitle: result.jobTitle }),
      ...(result.industry && { industry: result.industry }),
      ...(result.companySize && { companySize: result.companySize }),
      ...(result.linkedInUrl && { linkedInUrl: result.linkedInUrl }),
      ...(result.location && { location: result.location }),
      enrichmentData: {
        provider: result.providerThatFound,
        emailVerified: result.emailVerified,
        emailScore: result.emailScore,
        providersAttempted: result.providersAttempted,
        enrichedAt: new Date().toISOString(),
      },
    },
  });

  const providerEnum = ((): "APOLLO" | "HUNTER" | "CLEARBIT" | "APIFY" => {
    if (result.providerThatFound === "apollo") return "APOLLO";
    if (result.providerThatFound === "hunter") return "HUNTER";
    if (result.providerThatFound === "clearbit") return "CLEARBIT";
    return "APIFY"; // serper/pattern → APIFY as catch-all
  })();

  await prisma.leadEnrichment.upsert({
    where: { id: `${result.prospectId}-waterfall` },
    create: {
      id: `${result.prospectId}-waterfall`,
      prospectId: result.prospectId,
      workspaceId: prospect.workspaceId,
      provider: providerEnum,
      status: "COMPLETED",
      emailFound: true,
      phoneFound: !!result.phone,
      emailScore: result.emailScore ?? 0,
      data: JSON.parse(JSON.stringify(result)),
    },
    update: {
      provider: providerEnum,
      status: "COMPLETED",
      emailFound: true,
      phoneFound: !!result.phone,
      emailScore: result.emailScore ?? 0,
      data: JSON.parse(JSON.stringify(result)),
    },
  });
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

export async function runWaterfallBatch(
  workspaceId: string,
  limit = 20
): Promise<{ enriched: number; failed: number; total: number }> {
  const prospects = await prisma.prospect.findMany({
    where: {
      workspaceId,
      OR: [{ email: null }, { email: { contains: "@discovery.skalle" } }],
    },
    take: limit,
    orderBy: { score: "desc" },
    select: { id: true, name: true, company: true, jobTitle: true, email: true, linkedInUrl: true, workspaceId: true },
  });

  let enriched = 0;
  let failed = 0;

  for (const p of prospects) {
    try {
      const result = await runWaterfall(p);
      await saveWaterfallResult(result);
      if (result.success) enriched++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { enriched, failed, total: prospects.length };
}
