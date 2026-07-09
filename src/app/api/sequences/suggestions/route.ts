/**
 * GET  /api/sequences/suggestions        → list pending suggestions
 * POST /api/sequences/suggestions        → trigger AI analysis
 * PATCH /api/sequences/suggestions       → approve | reject | apply a suggestion
 * DELETE /api/sequences/suggestions      → dismiss a suggestion
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runSequenceOptimizer, applySuggestion } from "@/lib/services/sales/sequence-optimizer";

export const maxDuration = 55;

async function getWorkspaceId(userId: string): Promise<string | null> {
  const ws = await prisma.workspace.findFirst({ where: { userId }, select: { id: true } });
  return ws?.id ?? null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "PENDING";

  const suggestions = await prisma.sequenceSuggestion.findMany({
    where: { workspaceId, status },
    include: {
      sequence: {
        select: {
          id: true,
          name: true,
          prospect: { select: { name: true, company: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, suggestions });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const result = await runSequenceOptimizer(workspaceId);
  return NextResponse.json({ success: true, ...result });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const body = await req.json() as {
    id: string;
    action: "approve" | "reject" | "apply";
  };

  if (!body.id || !body.action) {
    return NextResponse.json({ error: "id et action requis" }, { status: 400 });
  }

  if (body.action === "apply") {
    const result = await applySuggestion(body.id, workspaceId);
    return NextResponse.json(result);
  }

  const newStatus = body.action === "approve" ? "APPROVED" : "REJECTED";
  const updated = await prisma.sequenceSuggestion.updateMany({
    where: { id: body.id, workspaceId },
    data: { status: newStatus },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Suggestion introuvable" }, { status: 404 });
  }

  // Auto-apply if approved
  if (body.action === "approve") {
    const result = await applySuggestion(body.id, workspaceId);
    return NextResponse.json(result);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  await prisma.sequenceSuggestion.deleteMany({ where: { id, workspaceId } });
  return NextResponse.json({ success: true });
}
