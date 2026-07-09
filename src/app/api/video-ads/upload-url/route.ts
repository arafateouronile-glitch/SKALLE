import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { createSignedUploadUrl } from "@/lib/supabase-storage";

const VALID_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-m4v": "m4v",
};

export async function POST(request: Request) {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Stockage non configuré." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      jobId?: string;
      contentType?: string;
    };

    const contentType = body.contentType ?? "video/mp4";
    const ext = VALID_VIDEO_TYPES[contentType];
    if (!ext) {
      return NextResponse.json(
        { error: "Format vidéo non supporté (MP4, MOV, WebM)." },
        { status: 400 }
      );
    }

    const workspace = await getOrCreateWorkspace(session);

    // Get or create job
    let jobId = body.jobId ?? null;
    if (jobId) {
      const existing = await prisma.videoAdJob.findFirst({
        where: { id: jobId, workspaceId: workspace.id },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Job introuvable." }, { status: 404 });
      }
    } else {
      const job = await prisma.videoAdJob.create({
        data: { workspaceId: workspace.id, status: "UPLOADING" },
      });
      jobId = job.id;
    }

    const storagePath = `${workspace.id}/${jobId}/screen-recording.${ext}`;
    const { signedUrl } = await createSignedUploadUrl(storagePath);

    return NextResponse.json({ signedUrl, storagePath, jobId });
  } catch (e) {
    console.error("[video-ads/upload-url]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
