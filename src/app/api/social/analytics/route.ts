/**
 * GET  /api/social/analytics  → données analytics 30j
 * POST /api/social/analytics  → sync depuis LinkedIn API
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPostAnalytics, syncWorkspacePostInsights } from "@/lib/services/social/post-analytics-sync";
import { getOrCreateWorkspace } from "@/lib/workspace";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await getOrCreateWorkspace(session);
  const data = await getPostAnalytics(workspace.id);
  return NextResponse.json(data);
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await getOrCreateWorkspace(session);
  const result = await syncWorkspacePostInsights(workspace.id);
  return NextResponse.json(result);
}
