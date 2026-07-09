import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { uploadToStorage } from "@/lib/supabase-storage";

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

function imgExt(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[contentType] ?? "jpg";
}

function vidExt(contentType: string): string {
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-m4v": "m4v",
  };
  return map[contentType] ?? "mp4";
}

export async function POST(request: Request) {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Stockage non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 503 }
      );
    }

    const workspace = await getOrCreateWorkspace(session);
    const formData = await request.formData();
    const jobIdRaw = formData.get("jobId") as string | null;
    const avatarFile = formData.get("avatarFile") as File | null;
    const screenRecordingFile = formData.get("screenRecordingFile") as File | null;
    const avatarAssetId = formData.get("avatarAssetId") as string | null;
    // Path of a file pre-uploaded directly to Supabase (bypasses Next.js body limit)
    const screenRecordingStoragePath = formData.get("screenRecordingStoragePath") as string | null;
    // Real selfie video base (Level 2 avatar quality — skips AI image2video)
    const baseVideoFile = formData.get("baseVideoFile") as File | null;
    // Person photo already stored in Supabase — reuse its storage path directly
    const personAvatarStoragePath = formData.get("personAvatarStoragePath") as string | null;

    // Validate: need at least one field
    if (!avatarFile && !screenRecordingFile && !avatarAssetId && !screenRecordingStoragePath && !baseVideoFile && !personAvatarStoragePath) {
      return NextResponse.json({ error: "avatarFile, avatarAssetId, screenRecordingFile, screenRecordingStoragePath, personAvatarStoragePath ou baseVideoFile requis." }, { status: 400 });
    }

    if (avatarFile) {
      if (!IMAGE_TYPES.includes(avatarFile.type)) {
        return NextResponse.json(
          { error: "Format avatar non supporté (JPEG, PNG, WebP)." },
          { status: 400 }
        );
      }
      if (avatarFile.size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "Image trop volumineuse (max 10 Mo)." },
          { status: 400 }
        );
      }
    }

    if (screenRecordingFile) {
      if (!VIDEO_TYPES.includes(screenRecordingFile.type)) {
        return NextResponse.json(
          { error: "Format vidéo non supporté (MP4, MOV, WebM)." },
          { status: 400 }
        );
      }
      if (screenRecordingFile.size > MAX_VIDEO_BYTES) {
        return NextResponse.json(
          { error: "Vidéo trop volumineuse (max 200 Mo)." },
          { status: 400 }
        );
      }
    }

    // Create or fetch job
    let job = jobIdRaw
      ? await prisma.videoAdJob.findFirst({
          where: { id: jobIdRaw, workspaceId: workspace.id },
        })
      : null;

    if (!job) {
      job = await prisma.videoAdJob.create({
        data: { workspaceId: workspace.id, status: "UPLOADING" },
      });
    } else {
      await prisma.videoAdJob.update({
        where: { id: job.id },
        data: { status: "UPLOADING" },
      });
    }

    const updates: Record<string, string> = {};

    // Reuse person photo — already stored in Supabase under persons/ bucket
    if (personAvatarStoragePath) {
      updates.avatarStoragePath = personAvatarStoragePath;
    }

    // Reuse saved avatar from library
    if (avatarAssetId) {
      const asset = await prisma.avatarAsset.findFirst({
        where: { id: avatarAssetId, workspaceId: workspace.id },
      });
      if (!asset) {
        return NextResponse.json({ error: "Avatar introuvable dans la bibliothèque." }, { status: 404 });
      }
      updates.avatarStoragePath = asset.storagePath;
    }

    // Upload avatar if provided
    if (avatarFile) {
      const ext = imgExt(avatarFile.type);
      const path = `${workspace.id}/${job.id}/avatar.${ext}`;
      const buffer = Buffer.from(await avatarFile.arrayBuffer());
      await uploadToStorage(buffer, path, avatarFile.type);
      updates.avatarStoragePath = path;
    }

    // Use pre-uploaded path (direct Supabase upload — bypasses Next.js body limit)
    if (screenRecordingStoragePath) {
      updates.screenRecordingStoragePath = screenRecordingStoragePath;
    }

    // Upload screen recording if provided via FormData (small files only)
    if (screenRecordingFile) {
      const ext = vidExt(screenRecordingFile.type);
      const path = `${workspace.id}/${job.id}/screen-recording.${ext}`;
      const buffer = Buffer.from(await screenRecordingFile.arrayBuffer());
      await uploadToStorage(buffer, path, screenRecordingFile.type);
      updates.screenRecordingStoragePath = path;
    }

    // Upload real selfie video base (Level 2 — skips AI image2video, direct Kling lip-sync)
    if (baseVideoFile) {
      if (!VIDEO_TYPES.includes(baseVideoFile.type)) {
        return NextResponse.json({ error: "Format vidéo non supporté (MP4, MOV, WebM)." }, { status: 400 });
      }
      if (baseVideoFile.size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ error: "Vidéo trop volumineuse (max 200 Mo)." }, { status: 400 });
      }
      const ext = vidExt(baseVideoFile.type);
      const path = `${workspace.id}/${job.id}/base-video.${ext}`;
      const buffer = Buffer.from(await baseVideoFile.arrayBuffer());
      await uploadToStorage(buffer, path, baseVideoFile.type);
      updates.baseVideoStoragePath = path;
    }

    await prisma.videoAdJob.update({
      where: { id: job.id },
      data: { ...updates, status: "PENDING" },
    });

    return NextResponse.json({ jobId: job.id });
  } catch (e) {
    console.error("[video-ads/upload]", e);
    return NextResponse.json({ error: "Erreur lors de l'upload." }, { status: 500 });
  }
}
