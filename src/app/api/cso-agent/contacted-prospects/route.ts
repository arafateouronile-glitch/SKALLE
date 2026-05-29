import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function resolveWorkspaceIds(req: NextRequest): Promise<string[]> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const ext = await prisma.extensionToken.findFirst({
      where: { token },
      select: { workspaceId: true },
    });
    return ext ? [ext.workspaceId] : [];
  }
  const session = await auth();
  if (!session?.user?.id) return [];
  const workspaces = await prisma.workspace.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });
  return workspaces.map((w) => w.id);
}

export async function GET(req: NextRequest) {
  const workspaceIds = await resolveWorkspaceIds(req);
  if (!workspaceIds.length) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Prospects CONTACTED dans les 30 derniers jours (message post-connexion envoyé)
  // On vérifie s'ils ont répondu
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);

  const contacted = await prisma.prospect.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: "CONTACTED",
      lastInteractionAt: { gte: thirtyDaysAgo },
      linkedInUrl: { not: "" },
    },
    select: {
      id: true,
      name: true,
      linkedInUrl: true,
      enrichmentData: true,
    },
    orderBy: { lastInteractionAt: "desc" },
    take: 100,
  });

  const result = contacted
    .map((p) => {
      const ed = (p.enrichmentData ?? {}) as Record<string, unknown>;
      // Seulement ceux pour qui on a bien envoyé un message (messageSent flag)
      if (!ed.messageSent && !ed.acceptedAt) return null;

      const usernameMatch = p.linkedInUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
      if (!usernameMatch) return null;

      return {
        prospectId: p.id,
        username: usernameMatch[1],
        name: p.name,
        linkedInUrl: p.linkedInUrl,
        contactedAt: ed.acceptedAt as string ?? null,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ prospects: result });
}
