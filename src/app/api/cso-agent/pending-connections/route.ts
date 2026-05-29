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

  // Prospects en attente d'acceptation :
  // - status NEW (invitation envoyée mais pas encore acceptée)
  // - lastInteractionAt défini (preuve qu'une invitation a été envoyée)
  // - dans les 14 derniers jours (au-delà, on abandonne)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1_000);

  const pending = await prisma.prospect.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: "NEW",
      lastInteractionAt: { gte: fourteenDaysAgo },
      linkedInUrl: { not: "" },
    },
    select: {
      id: true,
      name: true,
      linkedInUrl: true,
      enrichmentData: true,
    },
    orderBy: { lastInteractionAt: "asc" },
    take: 50,
  });

  const result = pending
    .map((p) => {
      const ed = (p.enrichmentData ?? {}) as Record<string, unknown>;
      // Seulement les prospects pour lesquels on a stocké une invitation
      if (!ed.invitedAt) return null;

      const usernameMatch = p.linkedInUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
      if (!usernameMatch) return null;

      return {
        prospectId: p.id,
        username: usernameMatch[1],
        name: p.name,
        linkedInUrl: p.linkedInUrl,
        invitedAt: ed.invitedAt as string,
        pendingMessage: (ed.pendingMessage as string) ?? null,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ pending: result });
}
