import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";
import { extractPersonDescription } from "@/lib/services/video/person-remix";

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

function imgExt(ct: string) {
  return ({ "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[ct] ?? "jpg";
}

// POST /api/persons/[personId]/photos — add a photo manually (upload)
// Multipart: photo (File) + formatId? (string) + formatLabel? (string) + isBase? ("true")
export async function POST(
  req: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params;
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

    const workspace = await getOrCreateWorkspace(session);

    const person = await prisma.person.findFirst({
      where: { id: personId, workspaceId: workspace.id },
    });
    if (!person) return NextResponse.json({ error: "Personnage introuvable." }, { status: 404 });

    const form = await req.formData();
    const file = form.get("photo") as File | null;
    if (!file) return NextResponse.json({ error: "Photo requise." }, { status: 400 });

    if (!IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Format d'image non supporté." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image trop lourde (max 10 Mo)." }, { status: 400 });
    }

    const formatId = (form.get("formatId") as string | null) ?? null;
    const formatLabel = (form.get("formatLabel") as string | null) ?? null;
    const isBase = form.get("isBase") === "true";

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = imgExt(file.type);
    const slug = formatId ?? (isBase ? "base" : `manual_${Date.now()}`);
    const storagePath = `persons/${workspace.id}/${personId}/${slug}.${ext}`;

    const publicUrl = await uploadToStorage(buffer, storagePath, file.type);

    const photo = await prisma.personPhoto.create({
      data: {
        personId,
        formatId,
        formatLabel,
        storagePath,
        photoUrl: publicUrl,
        isBase,
        generatedWithAI: false,
      },
    });

    // When adding a base/reference photo, auto-extract appearance description
    // so remix generation is immediately available
    let extractedDescription: string | null = null;
    if (isBase && !person.description) {
      try {
        const fetchUrl = await getSignedUrl(storagePath).catch(() => publicUrl);
        extractedDescription = await extractPersonDescription(fetchUrl);
        await prisma.person.update({
          where: { id: personId },
          data: { description: extractedDescription },
        });
      } catch {
        // non-blocking — user can still upload/remix later
      }
    }

    const signedUrl = await getSignedUrl(storagePath).catch(() => photo.photoUrl);
    return NextResponse.json(
      { ...photo, photoUrl: signedUrl, personDescription: extractedDescription },
      { status: 201 }
    );
  } catch (err) {
    console.error("[persons/photos POST]", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

// DELETE /api/persons/[personId]/photos?photoId=xxx
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params;
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

    const workspace = await getOrCreateWorkspace(session);
    const { searchParams } = new URL(req.url);
    const photoId = searchParams.get("photoId");
    if (!photoId) return NextResponse.json({ error: "photoId requis." }, { status: 400 });

    const person = await prisma.person.findFirst({
      where: { id: personId, workspaceId: workspace.id },
    });
    if (!person) return NextResponse.json({ error: "Non autorisé." }, { status: 403 });

    await prisma.personPhoto.delete({ where: { id: photoId } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[persons/photos DELETE]", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
