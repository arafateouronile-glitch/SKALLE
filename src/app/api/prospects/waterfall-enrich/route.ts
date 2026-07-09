/**
 * POST /api/prospects/waterfall-enrich
 *
 * Single prospect: { prospectId }
 * Batch:           { batch: true, limit?: number }
 *
 * Waterfall: Serper → Apollo → Hunter → Clearbit → AI pattern
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runWaterfall, runWaterfallBatch, saveWaterfallResult } from "@/lib/prospection/waterfall-enricher";

export const maxDuration = 55;

async function getWorkspaceId(userId: string): Promise<string | null> {
  const ws = await prisma.workspace.findFirst({ where: { userId }, select: { id: true } });
  return ws?.id ?? null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const body = await req.json() as { prospectId?: string; batch?: boolean; limit?: number };

  // ── Batch mode ──────────────────────────────────────────────────────────────
  if (body.batch) {
    const limit = Math.min(body.limit ?? 20, 50);
    const result = await runWaterfallBatch(workspaceId, limit);
    return NextResponse.json({ success: true, ...result });
  }

  // ── Single prospect ─────────────────────────────────────────────────────────
  const { prospectId } = body;
  if (!prospectId) return NextResponse.json({ error: "prospectId requis" }, { status: 400 });

  const prospect = await prisma.prospect.findFirst({
    where: { id: prospectId, workspaceId },
    select: { id: true, name: true, company: true, jobTitle: true, email: true, linkedInUrl: true, workspaceId: true },
  });
  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

  const result = await runWaterfall(prospect);
  await saveWaterfallResult(result);

  return NextResponse.json({
    success: result.success,
    email: result.email,
    emailVerified: result.emailVerified,
    emailScore: result.emailScore,
    providerThatFound: result.providerThatFound,
    providersAttempted: result.providersAttempted,
    reason: result.reason,
  });
}
