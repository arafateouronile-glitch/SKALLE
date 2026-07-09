import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addCredits } from "@/lib/credits";
import { getOrCreateWorkspace } from "@/lib/workspace";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    const { jobId } = await params;
    const workspace = await getOrCreateWorkspace(session);

    const job = await prisma.videoAdJob.findFirst({
      where: { id: jobId, workspaceId: workspace.id },
      select: { id: true, status: true, creditsUsed: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }

    if (job.status === "DONE" || job.status === "FAILED") {
      return NextResponse.json({ error: "Ce job est déjà terminé." }, { status: 400 });
    }

    await prisma.videoAdJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: "Annulé manuellement." },
    });

    if ((job.creditsUsed ?? 0) > 0) {
      await addCredits(session.user.id, job.creditsUsed!, "refund").catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[video-ads/cancel]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
