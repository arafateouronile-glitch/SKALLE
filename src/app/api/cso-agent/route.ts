/**
 * GET  /api/cso-agent?workspaceId=xxx
 *   → { decisions: AgentDecision[], pendingCount }
 *
 * POST /api/cso-agent
 *   { workspaceId } → triggers manual analysis via Inngest
 *
 * PATCH /api/cso-agent
 *   { decisionId, workspaceId, action: "approve" | "reject" }
 *   → approve marks APPROVED (l'extension Chrome exécute + crée la séquence via /executed)
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

const CSO_ACTION_TYPES = [
  "CSO_LAUNCH_LINKEDIN",
  "CSO_LAUNCH_EMAIL",
  "CSO_FOLLOWUP",
  "CSO_STALE_REJECT",
];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const decisions = await prisma.agentDecision.findMany({
    where: {
      workspaceId,
      actionType: { in: CSO_ACTION_TYPES },
    },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  const pendingCount = decisions.filter((d) => d.status === "PENDING").length;
  const executedCount = decisions.filter((d) => d.status === "EXECUTED").length;

  const prospectsInPipeline = await prisma.prospect.count({
    where: {
      workspaceId,
      status: { in: ["NEW", "RESEARCHED", "MESSAGES_GENERATED", "CONTACTED"] },
    },
  });

  return NextResponse.json({ decisions, pendingCount, executedCount, prospectsInPipeline });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { workspaceId } = (await req.json()) as { workspaceId: string };
  if (!workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  await inngest.send({ name: "cso/agent.trigger", data: { workspaceId } });

  return NextResponse.json({ ok: true, message: "Analyse déclenchée" });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    decisionId: string;
    workspaceId: string;
    action: "approve" | "reject";
  };

  const { decisionId, workspaceId, action } = body;
  if (!decisionId || !workspaceId || !action) {
    return NextResponse.json({ error: "decisionId, workspaceId et action requis" }, { status: 400 });
  }

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const decision = await prisma.agentDecision.findFirst({
    where: { id: decisionId, workspaceId, status: "PENDING" },
  });
  if (!decision) return NextResponse.json({ error: "Décision introuvable ou déjà traitée" }, { status: 404 });

  if (action === "reject") {
    await prisma.agentDecision.update({
      where: { id: decisionId },
      data: { status: "REJECTED" },
    });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  // Approve: mark APPROVED — l'extension Chrome exécute l'action LinkedIn
  // et crée la séquence via /api/cso-agent/executed après confirmation
  await prisma.agentDecision.update({
    where: { id: decisionId },
    data: { status: "APPROVED" },
  });

  return NextResponse.json({ ok: true, status: "APPROVED" });
}
