import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addCredits } from "@/lib/credits";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    const { jobId } = await params;

    // Single query — ownership verified via nested workspace filter (avoids extra getOrCreateWorkspace round-trip)
    const job = await prisma.videoAdJob.findFirst({
      where: { id: jobId, workspace: { userId: session.user.id } },
      select: {
        id: true,
        status: true,
        errorMessage: true,
        script: true,
        animationPrompt: true,
        voiceName: true,
        ugcStyle: true,
        videoModel: true,
        finalVideoUrl: true,
        compositeVideoUrl: true,
        captionedVideoUrl: true,
        klingVideoUrl: true,
        screenRecordingStoragePath: true,
        creditsUsed: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (e) {
    console.error("[video-ads/status]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    const { jobId } = await params;

    const job = await prisma.videoAdJob.findFirst({
      where: { id: jobId, workspace: { userId: session.user.id } },
      select: { id: true, status: true, creditsUsed: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
    }

    // Refund credits if the job was still running when deleted
    const inProgress = ["TRANSCRIBING", "ANIMATING", "LIP_SYNCING", "COMPOSITING", "CAPTIONING"];
    if (inProgress.includes(job.status) && job.creditsUsed > 0) {
      await addCredits(session.user.id, job.creditsUsed, "refund").catch(() => {});
    }

    await prisma.videoAdJob.delete({ where: { id: job.id } });

    return NextResponse.json({ deleted: true });
  } catch (e) {
    console.error("[video-ads/delete]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
