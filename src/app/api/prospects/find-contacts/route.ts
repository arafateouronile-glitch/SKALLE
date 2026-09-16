/**
 * GET  /api/prospects/find-contacts?company=xxx&workspaceId=xxx
 *   → Cherche les décideurs via Serper LinkedIn (instantané)
 *   → Retourne { contacts: FoundContact[] } sans emails
 *
 * POST /api/prospects/find-contacts  { action: "start-enrich", company, workspaceId }
 *   → Lance peakydev~leads-scraper-ppe pour la société → { runId }
 *
 * POST /api/prospects/find-contacts  { action: "collect-enrich", runId }
 *   → Poll le run Apify → { status: "running"|"done", contacts: FoundContact[] }
 *
 * POST /api/prospects/find-contacts  { action: "save", contacts, workspaceId }
 *   → Sauvegarde les contacts sélectionnés comme Prospect → { saved, skipped }
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  startApifyRun,
  getApifyRunStatus,
  fetchApifyRunItems,
} from "@/lib/services/social/viral-monitor";
import {
  searchLinkedIn,
  type FoundContact,
} from "@/lib/services/prospects/decision-maker-finder";

// Ré-exporté pour compat : `FindContactsDialog` importe ce type depuis cette route.
export type { FoundContact };

// ─── Peakydev output mapping ──────────────────────────────────────────────────

interface PeakyLead {
  personId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  position?: string;
  linkedinUrl?: string;
  seniority?: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  organizationName?: string;
}

function mapPeakyToContact(item: PeakyLead): FoundContact | null {
  if (!item.personId) return null;
  const name =
    item.fullName?.trim() ||
    [item.firstName, item.lastName].filter(Boolean).join(" ").trim();
  if (!name) return null;
  const email = item.email ? item.email.split(",")[0].trim() : undefined;
  return {
    name,
    jobTitle: item.position ?? "",
    linkedinUrl:
      item.linkedinUrl ??
      `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name)}`,
    email,
    snippet: [item.seniority, item.city, item.country].filter(Boolean).join(" · ") || undefined,
    source: "apify",
  };
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getWorkspace(workspaceId: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    select: { id: true },
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const company = req.nextUrl.searchParams.get("company");
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!company || !workspaceId)
    return NextResponse.json({ error: "company et workspaceId requis" }, { status: 400 });

  const ws = await getWorkspace(workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const contacts = await searchLinkedIn(company);
  return NextResponse.json({ contacts });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    action?: string;
    company?: string;
    workspaceId?: string;
    runId?: string;
    contacts?: FoundContact[];
  };

  // ── start-enrich: lance peakydev pour enrichir les emails ──────────────────
  if (body.action === "start-enrich") {
    if (!process.env.APIFY_API_TOKEN)
      return NextResponse.json({ error: "APIFY_API_TOKEN manquant" }, { status: 503 });
    if (!body.company)
      return NextResponse.json({ error: "company requis" }, { status: 400 });

    try {
      const runId = await startApifyRun("peakydev~leads-scraper-ppe", {
        companyNames: [body.company],
        maxLeads: 10,
      });
      return NextResponse.json({ ok: true, runId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Apify start failed: ${msg}` }, { status: 502 });
    }
  }

  // ── collect-enrich: poll le run, retourne les contacts enrichis ────────────
  if (body.action === "collect-enrich") {
    if (!body.runId)
      return NextResponse.json({ error: "runId requis" }, { status: 400 });

    const status = await getApifyRunStatus(body.runId).catch(() => "FAILED" as const);
    const done = status !== "RUNNING" && status !== "READY";

    if (!done) return NextResponse.json({ status: "running", runStatus: status });

    if (status !== "SUCCEEDED")
      return NextResponse.json({ status: "done", contacts: [], error: `Run ${status}` });

    const items = await fetchApifyRunItems<PeakyLead>(body.runId);
    const contacts = items
      .map(mapPeakyToContact)
      .filter((c): c is FoundContact => c !== null);

    return NextResponse.json({ status: "done", contacts });
  }

  // ── save: persiste les contacts sélectionnés comme prospects ──────────────
  if (!body.contacts || !body.workspaceId)
    return NextResponse.json({ error: "contacts et workspaceId requis" }, { status: 400 });

  const ws = await getWorkspace(body.workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  let saved = 0;
  let skipped = 0;

  for (const c of body.contacts) {
    try {
      const existing = await prisma.prospect.findFirst({
        where: { workspaceId: body.workspaceId, linkedInUrl: c.linkedinUrl },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }

      if (c.email) {
        const emailConflict = await prisma.prospect.findFirst({
          where: { workspaceId: body.workspaceId, email: c.email },
          select: { id: true },
        });
        if (emailConflict) { skipped++; continue; }
      }

      await prisma.prospect.create({
        data: {
          name: c.name,
          linkedInUrl: c.linkedinUrl,
          company: extractCompany(c.jobTitle, c.snippet ?? "") ?? c.name,
          jobTitle: c.jobTitle || null,
          email: c.email ?? null,
          emailVerified: !!c.email,
          workspaceId: body.workspaceId,
          source: "LINKEDIN",
          enrichmentData: {
            source: c.source === "apify" ? "peakydev-signal" : "serper-signal",
            snippet: c.snippet,
          },
        },
      });
      saved++;
    } catch { skipped++; }
  }

  return NextResponse.json({ saved, skipped });
}

function extractCompany(jobTitle: string, snippet: string): string | null {
  const parts = jobTitle.split(/[·|]/);
  if (parts.length > 1) return parts[parts.length - 1].trim();
  const match = snippet.match(/(?:chez|at|@)\s+([\w\s-]{2,40})/i);
  return match?.[1]?.trim() ?? null;
}
