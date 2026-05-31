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

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1_000);

  // ── 1. CSO Agent prospects (flow historique) ──────────────────────────────
  const agentPending = await prisma.prospect.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: "NEW",
      lastInteractionAt: { gte: fourteenDaysAgo },
      linkedInUrl: { not: "" },
    },
    select: { id: true, name: true, linkedInUrl: true, enrichmentData: true },
    orderBy: { lastInteractionAt: "asc" },
    take: 50,
  });

  type PendingEntry = {
    prospectId: string; username: string; name: string;
    linkedInUrl: string; invitedAt: string; pendingMessage: string | null;
    source: "cso-agent" | "warm-sequence";
  };

  const agentResult: PendingEntry[] = agentPending
    .flatMap((p) => {
      const ed = (p.enrichmentData ?? {}) as Record<string, unknown>;
      if (!ed.invitedAt) return [];
      const m = p.linkedInUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
      if (!m) return [];
      return [{
        prospectId: p.id, username: m[1], name: p.name, linkedInUrl: p.linkedInUrl,
        invitedAt: ed.invitedAt as string,
        pendingMessage: (ed.pendingMessage as string) ?? null,
        source: "cso-agent" as const,
      }];
    });

  // ── 2. Warm lead sequences (CONNECTION_REQUEST SENT) ──────────────────────
  // Ces steps ont été envoyés par le daily cron, mais le check d'acceptation
  // ne les couvrait pas. On les ajoute ici pour déclencher onConnectionAccepted.
  const warmSteps = await prisma.sequenceStep.findMany({
    where: {
      linkedInAction: "CONNECTION_REQUEST",
      status: "SENT",
      sentAt: { gte: fourteenDaysAgo },
      sequence: {
        workspaceId: { in: workspaceIds },
        isActive: true,
      },
    },
    select: {
      sentAt: true,
      sequence: {
        select: {
          prospectId: true,
          prospect: {
            select: { id: true, name: true, linkedInUrl: true },
          },
          // Récupérer le contenu du step 2 (DM IA post-connexion)
          steps: {
            where: { linkedInAction: "POST_CONNECTION_MESSAGE" },
            select: { content: true },
            orderBy: { stepNumber: "asc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { sentAt: "asc" },
    take: 50,
  });

  const warmResult: PendingEntry[] = warmSteps.flatMap((s) => {
    const prospect = s.sequence.prospect;
    const m = prospect.linkedInUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
    if (!m) return [];
    return [{
      prospectId: prospect.id, username: m[1], name: prospect.name,
      linkedInUrl: prospect.linkedInUrl,
      invitedAt: s.sentAt?.toISOString() ?? new Date().toISOString(),
      pendingMessage: s.sequence.steps[0]?.content ?? null,
      source: "warm-sequence" as const,
    }];
  });

  // Dédupliquer par prospectId (CSO agent prioritaire)
  const seen = new Set(agentResult.map((r) => r.prospectId));
  const merged: PendingEntry[] = [
    ...agentResult,
    ...warmResult.filter((r) => !seen.has(r.prospectId)),
  ];

  return NextResponse.json({ pending: merged });
}
