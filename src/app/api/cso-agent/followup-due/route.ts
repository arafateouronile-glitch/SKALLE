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

  // Prospects éligibles à une relance :
  // - CONTACTED (message envoyé, pas encore de réponse)
  // - lastInteractionAt >= 5 jours (délai minimum entre message et relance)
  // - Pas encore de relance envoyée (followupSent absent dans enrichmentData)
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1_000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);

  const prospects = await prisma.prospect.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: "CONTACTED",
      lastInteractionAt: {
        gte: thirtyDaysAgo,  // Pas trop vieux (30j max)
        lte: fiveDaysAgo,    // Au moins 5j depuis le dernier contact
      },
      linkedInUrl: { not: "" },
    },
    select: {
      id: true,
      name: true,
      linkedInUrl: true,
      jobTitle: true,
      company: true,
      enrichmentData: true,
      workspaceId: true,
    },
    take: 20,
  });

  const result = prospects
    .map((p) => {
      const ed = (p.enrichmentData ?? {}) as Record<string, unknown>;
      const li = (ed.linkedIn ?? {}) as Record<string, unknown>;

      // Ignorer si : relance déjà envoyée, ou si pas de messageSent
      if (ed.followupSent || !ed.messageSent) return null;

      const usernameMatch = p.linkedInUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
      if (!usernameMatch) return null;

      return {
        prospectId: p.id,
        username: usernameMatch[1],
        name: p.name,
        linkedInUrl: p.linkedInUrl,
        jobTitle: p.jobTitle,
        company: p.company,
        workspaceId: p.workspaceId,
        // Contexte du premier message pour générer un angle différent
        originalMessage: (ed.pendingMessage as string) ?? null,
        headline: (li.headline as string) ?? null,
        about: (li.about as string) ?? null,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ prospects: result });
}
