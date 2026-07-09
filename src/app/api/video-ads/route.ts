import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/workspace";

export async function GET(request: Request) {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    const workspace = await getOrCreateWorkspace(session);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

    const jobs = await prisma.videoAdJob.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        errorMessage: true,
        script: true,
        ugcStyle: true,
        videoModel: true,
        voiceName: true,
        finalVideoUrl: true,
        compositeVideoUrl: true,
        captionedVideoUrl: true,
        creditsUsed: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ jobs });
  } catch (e) {
    console.error("[video-ads/list]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
