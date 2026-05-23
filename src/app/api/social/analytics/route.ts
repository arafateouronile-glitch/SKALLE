/**
 * GET  /api/social/analytics       → données analytics 30j
 * POST /api/social/analytics/sync  → sync depuis LinkedIn API
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPostAnalytics, syncWorkspacePostInsights } from "@/lib/services/social/post-analytics-sync";

async function getWorkspace(userId: string) {
  return prisma.workspace.findFirst({
    where: { userId },
    select: { id: true },
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const workspace = await getWorkspace(session.user.id);
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const data = await getPostAnalytics(workspace.id);
  return NextResponse.json(data);
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const workspace = await getWorkspace(session.user.id);
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const result = await syncWorkspacePostInsights(workspace.id);
  return NextResponse.json(result);
}
