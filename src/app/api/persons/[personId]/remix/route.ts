/**
 * POST /api/persons/[personId]/remix
 * Generates a new photo of the person in a specific UGC scene using
 * gpt-image-1 image-to-image edit (face/skin/hair preserved) with GPT-4o
 * Vision fallback for description extraction when no photo buffer is available.
 *
 * Body: { formatId: string }
 * Returns: PersonPhoto record with fresh signed URL
 */

import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { uploadToStorage, getSignedUrl } from "@/lib/supabase-storage";
import { UGC_FORMATS } from "@/lib/services/video/ugc-formats";
import { remixPersonIntoScene, extractPersonDescription } from "@/lib/services/video/person-remix";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params;
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

    const workspace = await getOrCreateWorkspace(session);
    const body = await req.json() as { formatId: string };

    if (!body.formatId) {
      return NextResponse.json({ error: "formatId requis." }, { status: 400 });
    }

    const format = UGC_FORMATS.find((f) => f.id === body.formatId);
    if (!format) {
      return NextResponse.json({ error: "Format UGC introuvable." }, { status: 400 });
    }

    let person = await prisma.person.findFirst({
      where: { id: personId, workspaceId: workspace.id },
      include: { photos: { orderBy: { createdAt: "asc" } } },
    });
    if (!person) return NextResponse.json({ error: "Personnage introuvable." }, { status: 404 });

    // If description is missing but a reference photo exists, extract it now
    if (!person.description) {
      const basePhoto = person.photos.find((p) => p.isBase) ?? person.photos[0];
      if (!basePhoto) {
        return NextResponse.json(
          { error: "Ajoutez une photo de référence pour générer dans une scène." },
          { status: 422 }
        );
      }
      const fetchUrl = await getSignedUrl(basePhoto.storagePath).catch(() => basePhoto.photoUrl);
      const description = await extractPersonDescription(fetchUrl);
      person = await prisma.person.update({
        where: { id: personId },
        data: { description },
        include: { photos: { orderBy: { createdAt: "asc" } } },
      });
    }

    // Fetch reference photo for image-to-image (preserves face/skin/hair)
    let referenceBuffer: Buffer | undefined;
    const refPhoto = person.photos.find((p) => p.isBase) ?? person.photos[0];
    if (refPhoto) {
      try {
        const refUrl = await getSignedUrl(refPhoto.storagePath).catch(() => refPhoto.photoUrl);
        const refResp = await fetch(refUrl);
        if (refResp.ok) referenceBuffer = Buffer.from(await refResp.arrayBuffer());
      } catch {
        // non-blocking: falls back to text-to-image
      }
    }

    const imageBuffer = await remixPersonIntoScene(
      { name: person.name, description: person.description! },
      format,
      referenceBuffer
    );

    const storagePath = `persons/${workspace.id}/${personId}/scene_${body.formatId}_${Date.now()}.png`;
    const publicUrl = await uploadToStorage(imageBuffer, storagePath, "image/png");

    const photo = await prisma.personPhoto.create({
      data: {
        personId,
        formatId: body.formatId,
        formatLabel: format.label,
        storagePath,
        photoUrl: publicUrl,
        isBase: false,
        generatedWithAI: true,
      },
    });

    const signedUrl = await getSignedUrl(storagePath).catch(() => photo.photoUrl);
    return NextResponse.json({ ...photo, photoUrl: signedUrl }, { status: 201 });
  } catch (err) {
    console.error("[persons/remix POST]", err);
    return NextResponse.json({ error: "Erreur lors de la génération." }, { status: 500 });
  }
}
