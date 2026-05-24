/**
 * GET  /api/prospects/find-contacts?company=xxx&workspaceId=xxx
 *   → Cherche les décideurs d'une entreprise via Serper (LinkedIn + email public)
 *   → Retourne { contacts: LinkedInContact[] }
 *
 * POST /api/prospects/find-contacts  { contacts, workspaceId, signalId? }
 *   → Sauvegarde les contacts sélectionnés comme Prospect dans le workspace
 *   → Retourne { saved, skipped }
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface FoundContact {
  name: string;
  jobTitle: string;
  linkedinUrl: string;
  email?: string;
  snippet?: string;
}

interface SerperResult {
  title: string;
  link: string;
  snippet?: string;
}

interface SerperResponse {
  organic?: SerperResult[];
}

function parseLinkedInResult(r: SerperResult): FoundContact | null {
  if (!r.link.includes("linkedin.com/in/")) return null;

  // Title format: "Prénom Nom - Titre - Entreprise | LinkedIn"
  const clean = r.title.replace(/\s*\|\s*LinkedIn.*$/i, "").replace(/\s*- LinkedIn$/, "");
  const parts = clean.split(/\s*[-–]\s*/);
  const name = parts[0]?.trim();
  if (!name || name.length < 2) return null;

  const jobTitle = parts.slice(1).join(" · ").trim();

  // Try to extract email from snippet (some pages expose it)
  const emailMatch = r.snippet?.match(/[\w.+-]+@[\w-]+\.\w{2,}/);

  return {
    name,
    jobTitle,
    linkedinUrl: r.link,
    email: emailMatch?.[0],
    snippet: r.snippet,
  };
}

async function searchLinkedIn(company: string): Promise<FoundContact[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const query = `site:linkedin.com/in "${company}" (directeur OR directrice OR CEO OR fondateur OR fondatrice OR CTO OR CMO OR "head of" OR président OR DG OR gérant)`;

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "fr", hl: "fr", num: 8 }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return [];
  const data: SerperResponse = await res.json();

  return (data.organic ?? [])
    .map(parseLinkedInResult)
    .filter((c): c is FoundContact => c !== null)
    .slice(0, 8);
}

async function searchEmails(company: string): Promise<Map<string, string>> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return new Map();

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: `"${company}" email contact "@" (directeur OR CEO OR fondateur)`,
      gl: "fr",
      hl: "fr",
      num: 5,
    }),
    signal: AbortSignal.timeout(6_000),
  });

  if (!res.ok) return new Map();
  const data: SerperResponse = await res.json();

  const map = new Map<string, string>();
  for (const r of data.organic ?? []) {
    const emails = (r.title + " " + (r.snippet ?? "")).match(/[\w.+-]+@[\w-]+\.\w{2,}/g) ?? [];
    for (const email of emails) {
      if (!email.includes("example") && !email.includes("@sentry")) {
        map.set(email.toLowerCase(), email);
      }
    }
  }
  return map;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const company = req.nextUrl.searchParams.get("company");
  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!company || !workspaceId) {
    return NextResponse.json({ error: "company et workspaceId requis" }, { status: 400 });
  }

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const [contacts, emailMap] = await Promise.all([
    searchLinkedIn(company),
    searchEmails(company),
  ]);

  // Merge emails found in the second search into contacts that don't already have one
  const enriched = contacts.map((c) => {
    if (c.email) return c;
    // Try to match by partial name
    for (const [, email] of emailMap) {
      const namePart = c.name.split(" ")[0]?.toLowerCase();
      if (namePart && email.toLowerCase().includes(namePart)) {
        return { ...c, email };
      }
    }
    return c;
  });

  return NextResponse.json({ contacts: enriched });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { contacts, workspaceId } = (await req.json()) as {
    contacts: FoundContact[];
    workspaceId: string;
  };

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  let saved = 0;
  let skipped = 0;

  for (const c of contacts) {
    try {
      // Upsert by linkedInUrl + workspaceId (no unique constraint on linkedInUrl alone)
      const existing = await prisma.prospect.findFirst({
        where: { workspaceId, linkedInUrl: c.linkedinUrl },
        select: { id: true },
      });

      if (existing) { skipped++; continue; }

      // email uniqueness: if email already exists in workspace, skip
      if (c.email) {
        const emailConflict = await prisma.prospect.findFirst({
          where: { workspaceId, email: c.email },
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
          workspaceId,
          source: "LINKEDIN",
          enrichmentData: { source: "signal-contact-finder", snippet: c.snippet },
        },
      });
      saved++;
    } catch {
      skipped++;
    }
  }

  return NextResponse.json({ saved, skipped });
}

function extractCompany(jobTitle: string, snippet: string): string | null {
  // jobTitle: "Directeur Marketing · TechCorp"
  const parts = jobTitle.split(/[·|]/);
  if (parts.length > 1) return parts[parts.length - 1].trim();
  // fallback: look in snippet
  const match = snippet.match(/(?:chez|at|@)\s+([\w\s-]{2,40})/i);
  return match?.[1]?.trim() ?? null;
}
