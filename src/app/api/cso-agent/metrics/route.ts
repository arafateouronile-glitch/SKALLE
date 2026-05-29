import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const period = searchParams.get("period") ?? "30d";

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });
  }

  // Vérifier accès
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1_000);

  // ── Funnel global ──────────────────────────────────────────────────────────

  const [allProspects, byStatus, byPersona, personas] = await Promise.all([
    // Total prospects touchés (invitation envoyée = lastInteractionAt défini)
    prisma.prospect.count({
      where: { workspaceId, lastInteractionAt: { not: null, gte: since } },
    }),
    // Par status
    prisma.prospect.groupBy({
      by: ["status"],
      where: { workspaceId, lastInteractionAt: { not: null, gte: since } },
      _count: { _all: true },
    }),
    // Par persona
    prisma.prospect.groupBy({
      by: ["personaId", "status"],
      where: { workspaceId, lastInteractionAt: { not: null, gte: since }, personaId: { not: null } },
      _count: { _all: true },
    }),
    // Noms des personas
    prisma.persona.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
    }),
  ]);

  function countStatus(statuses: string[]) {
    return byStatus
      .filter((s) => statuses.includes(s.status))
      .reduce((acc, s) => acc + s._count._all, 0);
  }

  const invitations = allProspects;
  const accepted = countStatus(["CONTACTED", "RESPONDED", "REPLIED", "MEETING_BOOKED", "CONVERTED"]);
  const responded = countStatus(["RESPONDED", "REPLIED", "MEETING_BOOKED", "CONVERTED"]);
  const meetings = countStatus(["MEETING_BOOKED", "CONVERTED"]);

  // ── Par persona ────────────────────────────────────────────────────────────

  const personaMap = new Map(personas.map((p) => [p.id, p.name]));
  const personaStats: Record<string, {
    personaId: string; personaName: string;
    invitations: number; accepted: number; responded: number; meetings: number;
  }> = {};

  for (const row of byPersona) {
    if (!row.personaId) continue;
    const pid = row.personaId;
    if (!personaStats[pid]) {
      personaStats[pid] = {
        personaId: pid,
        personaName: personaMap.get(pid) ?? "Inconnu",
        invitations: 0, accepted: 0, responded: 0, meetings: 0,
      };
    }
    const count = row._count._all;
    personaStats[pid].invitations += count;
    if (["CONTACTED", "RESPONDED", "REPLIED", "MEETING_BOOKED", "CONVERTED"].includes(row.status)) {
      personaStats[pid].accepted += count;
    }
    if (["RESPONDED", "REPLIED", "MEETING_BOOKED", "CONVERTED"].includes(row.status)) {
      personaStats[pid].responded += count;
    }
    if (["MEETING_BOOKED", "CONVERTED"].includes(row.status)) {
      personaStats[pid].meetings += count;
    }
  }

  // ── Tendance hebdomadaire (4 dernières semaines) ───────────────────────────

  const weeklyTrend: Array<{ week: string; invitations: number; accepted: number; responded: number }> = [];
  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1_000);
    const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1_000);

    const [wInv, wAcc, wResp] = await Promise.all([
      prisma.prospect.count({
        where: { workspaceId, lastInteractionAt: { gte: weekStart, lt: weekEnd, not: null } },
      }),
      prisma.prospect.count({
        where: {
          workspaceId,
          lastInteractionAt: { gte: weekStart, lt: weekEnd, not: null },
          status: { in: ["CONTACTED", "RESPONDED", "REPLIED", "MEETING_BOOKED", "CONVERTED"] },
        },
      }),
      prisma.prospect.count({
        where: {
          workspaceId,
          lastInteractionAt: { gte: weekStart, lt: weekEnd, not: null },
          status: { in: ["RESPONDED", "REPLIED", "MEETING_BOOKED", "CONVERTED"] },
        },
      }),
    ]);

    weeklyTrend.push({
      week: weekStart.toISOString().slice(0, 10),
      invitations: wInv,
      accepted: wAcc,
      responded: wResp,
    });
  }

  return NextResponse.json({
    period: days,
    funnel: { invitations, accepted, responded, meetings },
    rates: {
      acceptanceRate: invitations > 0 ? Math.round((accepted / invitations) * 100) : 0,
      responseRate: accepted > 0 ? Math.round((responded / accepted) * 100) : 0,
      meetingRate: responded > 0 ? Math.round((meetings / responded) * 100) : 0,
    },
    byPersona: Object.values(personaStats),
    weeklyTrend,
  });
}
