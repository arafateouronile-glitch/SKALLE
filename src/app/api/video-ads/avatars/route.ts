import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function imgExt(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[contentType] ?? "jpg";
}

export async function GET() {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    const workspace = await getOrCreateWorkspace(session);

    const assets = await prisma.avatarAsset.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, name: true, storagePath: true, createdAt: true },
    });

    // Generate signed preview URLs (1 hour — just for display)
    const avatars = await Promise.all(
      assets.map(async (a) => {
        const previewUrl = await getSignedUrl(a.storagePath, 3600).catch(() => null);
        return { ...a, previewUrl };
      })
    );

    return NextResponse.json({ avatars });
  } catch (e) {
    console.error("[video-ads/avatars GET]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

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

    const workspace = await getOrCreateWorkspace(session);
    const formData = await request.formData();
    const file = formData.get("avatarFile") as File | null;
    const name = (formData.get("name") as string | null)?.trim() || "";

    if (!file) {
      return NextResponse.json({ error: "avatarFile requis." }, { status: 400 });
    }
    if (!IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Format non supporté (JPEG, PNG, WebP)." },
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image trop volumineuse (max 10 Mo)." }, { status: 400 });
    }

    const asset = await prisma.avatarAsset.create({
      data: { workspaceId: workspace.id, name, storagePath: "pending" },
    });

    const ext = imgExt(file.type);
    const path = `${workspace.id}/avatars/${asset.id}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadToStorage(buffer, path, file.type);

    await prisma.avatarAsset.update({
      where: { id: asset.id },
      data: { storagePath: path },
    });

    const previewUrl = await getSignedUrl(path, 3600).catch(() => null);

    return NextResponse.json({ avatar: { id: asset.id, name, storagePath: path, previewUrl, createdAt: asset.createdAt } });
  } catch (e) {
    console.error("[video-ads/avatars POST]", e);
    return NextResponse.json({ error: "Erreur lors de l'upload." }, { status: 500 });
  }
}
