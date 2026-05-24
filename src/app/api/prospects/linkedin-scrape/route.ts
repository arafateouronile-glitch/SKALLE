/**
 * POST /api/prospects/linkedin-scrape
 * Lance peakydev~leads-scraper-ppe en async.
 * Retourne { runId } immédiatement, le frontend poll jusqu'à SUCCEEDED.
 *
 * POST /api/prospects/linkedin-scrape?collect=1  { runId }
 * Vérifie le statut et retourne les leads quand terminé.
 *
 * Output schema (peakydev~leads-scraper-ppe):
 *   personId, firstName, lastName, fullName, position, linkedinUrl, seniority,
 *   email (comma-separated), city, state, country,
 *   organizationName, organizationWebsite, organizationIndustry, organizationSize
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  startApifyRun,
  getApifyRunStatus,
  fetchApifyRunItems,
} from "@/lib/services/social/viral-monitor";
import type { QualifiedSearchCriteria } from "@/actions/leads";

interface QualifiedLead {
  name: string;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  linkedInUrl?: string;
  company: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  enrichmentData?: Record<string, unknown>;
}

interface PeakyLead {
  personId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  position?: string;
  linkedinUrl?: string;
  seniority?: string;
  functional?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  organizationName?: string;
  organizationWebsite?: string;
  organizationLinkedinUrl?: string;
  organizationIndustry?: string;
  organizationSize?: string;
  organizationFoundedYear?: number | null;
}

function mapToLead(item: PeakyLead): QualifiedLead | null {
  // Filter out actor status messages (no personId)
  if (!item.personId) return null;

  const name =
    item.fullName?.trim() ||
    [item.firstName, item.lastName].filter(Boolean).join(" ").trim();
  if (!name) return null;

  // Email can be comma-separated — take the first one
  const rawEmail = item.email?.trim();
  const email = rawEmail ? rawEmail.split(",")[0].trim() : undefined;

  const locationParts = [item.city, item.state, item.country].filter(Boolean);
  const location = locationParts.join(", ") || undefined;

  return {
    name,
    email,
    emailVerified: !!email,
    phone: item.phone,
    phoneVerified: false,
    linkedInUrl: item.linkedinUrl,
    company: item.organizationName ?? "",
    jobTitle: item.position,
    location,
    industry: item.organizationIndustry,
    enrichmentData: {
      source: "peakydev-linkedin",
      ...(item.seniority && { seniority: item.seniority }),
      ...(item.organizationWebsite && { websiteUrl: item.organizationWebsite }),
      ...(item.organizationSize && { companySize: item.organizationSize }),
      ...(item.organizationLinkedinUrl && { companyLinkedInUrl: item.organizationLinkedinUrl }),
    },
  };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json({ error: "APIFY_API_TOKEN manquant" }, { status: 503 });
  }

  if (req.nextUrl.searchParams.get("collect") === "1") {
    return handleCollect(req);
  }

  const criteria = (await req.json()) as QualifiedSearchCriteria;

  // Map seniorityLevels (Apollo format) → labels the actor understands
  const seniorityMap: Record<string, string> = {
    owner: "Owner",
    founder: "Founder",
    c_suite: "C-Suite",
    vp: "VP",
    head: "Head",
    director: "Director",
    manager: "Manager",
    senior: "Senior",
    entry: "Entry",
    intern: "Intern",
  };
  const seniority = (criteria.seniorityLevels ?? []).map((s) => seniorityMap[s] ?? s);

  const input: Record<string, unknown> = {
    jobTitles: criteria.jobTitles?.length ? criteria.jobTitles : undefined,
    locations: criteria.locations?.length ? criteria.locations : undefined,
    industries: criteria.industries?.length ? criteria.industries : undefined,
    keywords: criteria.keywords?.length ? criteria.keywords : undefined,
    seniority: seniority.length ? seniority : undefined,
    companyNames: criteria.companyNames?.length ? criteria.companyNames : undefined,
    maxLeads: Math.min(criteria.limit || 50, 100),
  };

  // Remove undefined keys
  for (const key of Object.keys(input)) {
    if (input[key] === undefined) delete input[key];
  }

  try {
    const runId = await startApifyRun("peakydev~leads-scraper-ppe", input);
    return NextResponse.json({ ok: true, runId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Apify start failed: ${msg}` }, { status: 502 });
  }
}

async function handleCollect(req: NextRequest) {
  const { runId } = (await req.json()) as { runId: string };

  const status = await getApifyRunStatus(runId).catch(() => "FAILED" as const);
  const done = status !== "RUNNING" && status !== "READY";

  if (!done) {
    return NextResponse.json({ status: "running", runStatus: status });
  }

  if (status !== "SUCCEEDED") {
    return NextResponse.json({ status: "done", leads: [], error: `Run ${status}` });
  }

  const items = await fetchApifyRunItems<PeakyLead>(runId);
  const leads = items.map(mapToLead).filter((l): l is QualifiedLead => l !== null);

  return NextResponse.json({ status: "done", leads });
}
