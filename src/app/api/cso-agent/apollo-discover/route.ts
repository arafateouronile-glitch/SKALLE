/**
 * POST /api/cso-agent/apollo-discover
 *
 * Cherche des prospects sur Apollo selon les critères ICP d'un persona,
 * déduplique par email + LinkedIn URL, et crée les nouveaux en DB.
 *
 * Body: { workspaceId, personaId?, limit? }
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apolloPeopleSearch, getApolloApiKey } from "@/lib/services/apollo-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = (await req.json()) as {
    workspaceId: string;
    personaId?: string;
    limit?: number;
  };
  const { workspaceId, personaId, limit = 25 } = body;

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });
  }

  // Vérifier accès + clé Apollo
  const [workspace, apiKey] = await Promise.all([
    prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
      select: { id: true },
    }),
    getApolloApiKey(workspaceId),
  ]);

  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 403 });
  if (!apiKey) return NextResponse.json({ error: "Clé Apollo non configurée" }, { status: 422 });

  // Charger le persona (ou le premier actif)
  const persona = personaId
    ? await prisma.persona.findFirst({
        where: { id: personaId, workspaceId },
        select: { id: true, name: true, raw: true },
      })
    : await prisma.persona.findFirst({
        where: { workspaceId, status: { in: ["ACTIVE", "RUNNING"] } },
        select: { id: true, name: true, raw: true },
        orderBy: { createdAt: "asc" },
      });

  if (!persona) {
    return NextResponse.json({ error: "Aucun persona actif trouvé" }, { status: 404 });
  }

  const raw = (persona.raw ?? {}) as Record<string, unknown>;
  const jobTitles = (raw.jobTitles as string[]) ?? [];
  const locations = (raw.locations as string[]) ?? ["France"];
  const keywords = ((raw.keywords as string[]) ?? []).join(" ");
  const industry = (raw.industry as string) ?? undefined;

  // Construire les filtres Apollo depuis l'ICP du persona
  const results = await apolloPeopleSearch(apiKey, {
    personTitles: jobTitles.length > 0 ? jobTitles.slice(0, 5) : undefined,
    personLocations: locations,
    keywords: [keywords, industry].filter(Boolean).join(" ") || undefined,
    perPage: Math.min(limit, 50),
  });

  if (!results.people.length) {
    return NextResponse.json({ created: 0, skipped: 0, total: 0 });
  }

  // Dédupliquer avec la DB existante
  const emails = results.people.map((p) => p.email).filter(Boolean) as string[];
  const linkedInUrls = results.people.map((p) => p.linkedInUrl).filter(Boolean) as string[];

  const existing = await prisma.prospect.findMany({
    where: {
      workspaceId,
      OR: [
        emails.length > 0 ? { email: { in: emails } } : {},
        linkedInUrls.length > 0 ? { linkedInUrl: { in: linkedInUrls } } : {},
      ],
    },
    select: { email: true, linkedInUrl: true },
  });

  const existingEmails = new Set(existing.map((p) => p.email).filter(Boolean));
  const existingLinkedIn = new Set(existing.map((p) => p.linkedInUrl).filter(Boolean));

  const fresh = results.people.filter((p) => {
    if (p.email && existingEmails.has(p.email)) return false;
    if (p.linkedInUrl && existingLinkedIn.has(p.linkedInUrl)) return false;
    return p.name?.trim().length > 0;
  });

  if (!fresh.length) {
    return NextResponse.json({ created: 0, skipped: results.people.length, total: results.totalEntries });
  }

  // Créer les prospects en DB
  await prisma.prospect.createMany({
    data: fresh.map((p) => ({
      workspaceId,
      personaId: persona.id,
      name: p.name,
      company: p.company ?? "Apollo",
      jobTitle: p.title ?? null,
      email: p.email ?? `apollo+${p.apolloId}@discovery.skalle`,
      emailVerified: p.emailStatus === "verified",
      emailStatus: p.emailStatus ?? null,
      linkedInUrl: p.linkedInUrl ?? "",
      status: "NEW" as const,
      score: p.emailStatus === "verified" ? 70 : 50,
      enrichmentData: {
        apollo: {
          apolloId: p.apolloId,
          emailStatus: p.emailStatus,
          city: p.city,
          country: p.country,
          discoveredAt: new Date().toISOString(),
        },
      },
    })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    ok: true,
    created: fresh.length,
    skipped: results.people.length - fresh.length,
    total: results.totalEntries,
    personaName: persona.name,
  });
}
