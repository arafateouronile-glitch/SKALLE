import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface LinkedInEnrichment {
  linkedInUrl: string;
  headline?: string | null;
  about?: string | null;
  experiences?: Array<{ title: string; company: string; description: string | null }>;
  capturedAt?: string;
}

export async function POST(req: NextRequest) {
  // Auth: Bearer token (extension) ou session cookie (web)
  const authHeader = req.headers.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const extToken = await prisma.extensionToken.findFirst({
      where: { token },
      select: { workspaceId: true },
    });
    if (extToken) {
      const ws = await prisma.workspace.findUnique({
        where: { id: extToken.workspaceId },
        select: { userId: true },
      });
      userId = ws?.userId ?? null;
    }
  } else {
    const session = await auth();
    userId = session?.user?.id ?? null;
  }

  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = (await req.json()) as LinkedInEnrichment;
  const { linkedInUrl, headline, about, experiences, capturedAt } = body;

  if (!linkedInUrl) {
    return NextResponse.json({ error: "linkedInUrl requis" }, { status: 400 });
  }

  // Extraire le username pour matcher les variantes d'URL (fr.linkedin.com, www.linkedin.com, trailing /)
  const usernameMatch = linkedInUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!usernameMatch) {
    return NextResponse.json({ error: "URL LinkedIn invalide" }, { status: 400 });
  }
  const username = usernameMatch[1];

  // Workspaces de l'utilisateur
  const workspaces = await prisma.workspace.findMany({
    where: { userId },
    select: { id: true },
  });
  const workspaceIds = workspaces.map((w) => w.id);

  if (!workspaceIds.length) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  // Trouver les prospects correspondants (tolérant aux variantes d'URL)
  const prospects = await prisma.prospect.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      linkedInUrl: { contains: `/in/${username}` },
    },
    select: { id: true, enrichmentData: true },
  });

  if (!prospects.length) {
    // Aucun prospect trouvé — pas d'erreur, le profil n'est peut-être pas encore importé
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const linkedInData = {
    headline: headline ?? null,
    about: about ?? null,
    experiences: (experiences ?? []).slice(0, 5),
    capturedAt: capturedAt ?? new Date().toISOString(),
    source: "chrome_extension",
  };

  // Mettre à jour chaque prospect individuellement pour merger enrichmentData
  let updated = 0;
  await Promise.all(
    prospects.map(async (p) => {
      const existing = (p.enrichmentData ?? {}) as Record<string, unknown>;
      await prisma.prospect.update({
        where: { id: p.id },
        data: {
          enrichmentData: { ...existing, linkedIn: linkedInData },
          // Mettre à jour aiSummary si on a la section About
          ...(about ? { aiSummary: about.slice(0, 500) } : {}),
        },
      });
      updated++;
    })
  );

  return NextResponse.json({ ok: true, updated });
}
