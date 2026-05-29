import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function resolveWorkspaceId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const ext = await prisma.extensionToken.findFirst({
      where: { token },
      select: { workspaceId: true },
    });
    return ext?.workspaceId ?? null;
  }
  const session = await auth();
  if (!session?.user?.id) return null;
  const ws = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return ws?.id ?? null;
}

export async function GET(req: NextRequest) {
  const workspaceId = await resolveWorkspaceId(req);
  if (!workspaceId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const personas = await prisma.persona.findMany({
    where: { workspaceId, status: { in: ["ACTIVE", "RUNNING"] } },
    select: { name: true, raw: true },
    take: 3,
  });

  if (!personas.length) return NextResponse.json({ queries: [], workspaceId });

  // Construit des requêtes de recherche depuis les critères ICP de chaque persona
  const queries: string[] = [];
  for (const persona of personas) {
    const r = (persona.raw ?? {}) as Record<string, unknown>;
    const jobTitles = Array.isArray(r.jobTitles) ? (r.jobTitles as string[]) : [];
    const keywords = Array.isArray(r.keywords) ? (r.keywords as string[]) : [];
    const industry = (r.industry as string) ?? "";
    const locations = Array.isArray(r.locations) ? (r.locations as string[]) : [];

    // Une requête par job title principal, enrichie avec les keywords
    for (const title of jobTitles.slice(0, 2)) {
      const parts = [title];
      if (industry) parts.push(industry);
      if (keywords[0]) parts.push(keywords[0]);
      queries.push(parts.join(" "));
    }

    // Requête globale avec les keywords ICP
    if (keywords.length > 0 && industry) {
      queries.push(`${industry} ${keywords.slice(0, 2).join(" ")}`);
    }
  }

  // Localisation France par défaut si présente dans les personas
  const allLocations = personas.flatMap((p) => {
    const r = (p.raw ?? {}) as Record<string, unknown>;
    return Array.isArray(r.locations) ? (r.locations as string[]) : [];
  });
  const primaryLocation = allLocations[0] ?? "France";

  return NextResponse.json({
    queries: [...new Set(queries)].slice(0, 5),
    location: primaryLocation,
    workspaceId,
  });
}
