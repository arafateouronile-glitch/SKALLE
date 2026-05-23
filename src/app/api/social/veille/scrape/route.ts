import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, brandVoice: true },
  });

  const bv = workspace?.brandVoice as Record<string, unknown> | null;
  const queries: string[] = [];
  if (bv?.niche && typeof bv.niche === "string") queries.push(bv.niche);
  if (Array.isArray(bv?.contentPillars)) queries.push(...(bv.contentPillars as string[]).slice(0, 4));

  await inngest.send({
    name: "viral-monitor/scrape.manual",
    data: { queries: queries.length > 0 ? queries : undefined, workspaceId: workspace?.id },
  });

  return NextResponse.json({ ok: true, message: "Scrape lancé en arrière-plan" });
}
