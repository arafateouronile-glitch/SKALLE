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

// GET /api/persons — list persons for current workspace
export async function GET() {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

    const workspace = await getOrCreateWorkspace(session);

    const persons = await prisma.person.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      include: {
        photos: { orderBy: { createdAt: "asc" } },
      },
    });

    // Refresh signed URLs for all photos
    const hydrated = await Promise.all(
      persons.map(async (p) => ({
        ...p,
        photos: await Promise.all(
          p.photos.map(async (ph) => ({
            ...ph,
            photoUrl: await getSignedUrl(ph.storagePath).catch(() => ph.photoUrl),
          }))
        ),
      }))
    );

    return NextResponse.json(hydrated);
  } catch (err) {
    console.error("[persons GET]", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

// POST /api/persons — create a new person
// Multipart: name (string) + photo (file, optional) + description (string, optional)
export async function POST(req: Request) {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

    const workspace = await getOrCreateWorkspace(session);
    const form = await req.formData();

    const name = (form.get("name") as string | null)?.trim();
    if (!name) return NextResponse.json({ error: "Le prénom est requis." }, { status: 400 });

    const file = form.get("photo") as File | null;
    let description = (form.get("description") as string | null)?.trim() ?? null;

    // Create person record first to get the ID
    const person = await prisma.person.create({
      data: { workspaceId: workspace.id, name, description },
    });

    if (file) {
      if (!IMAGE_TYPES.includes(file.type)) {
        await prisma.person.delete({ where: { id: person.id } });
        return NextResponse.json({ error: "Format d'image non supporté." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        await prisma.person.delete({ where: { id: person.id } });
        return NextResponse.json({ error: "Image trop lourde (max 10 Mo)." }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = imgExt(file.type);
      const storagePath = `persons/${workspace.id}/${person.id}/base.${ext}`;

      const publicUrl = await uploadToStorage(buffer, storagePath, file.type);

      // Extract appearance description from the photo (async, best-effort)
      let extractedDesc = description;
      if (!extractedDesc) {
        try {
          extractedDesc = await extractPersonDescription(publicUrl);
        } catch {
          // non-blocking
        }
      }

      const [photoRecord] = await Promise.all([
        prisma.personPhoto.create({
          data: {
            personId: person.id,
            storagePath,
            photoUrl: publicUrl,
            isBase: true,
            generatedWithAI: false,
          },
        }),
        prisma.person.update({
          where: { id: person.id },
          data: { description: extractedDesc ?? description },
        }),
      ]);

      const signedUrl = await getSignedUrl(storagePath).catch(() => photoRecord.photoUrl);

      return NextResponse.json({
        ...person,
        description: extractedDesc,
        photos: [{ ...photoRecord, photoUrl: signedUrl }],
      }, { status: 201 });
    }

    return NextResponse.json({ ...person, photos: [] }, { status: 201 });
  } catch (err) {
    console.error("[persons POST]", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
