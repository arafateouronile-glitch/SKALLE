import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/workspace";
import { getSignedUrl } from "@/lib/supabase-storage";

// GET /api/persons/[personId] — single person with all photos
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params;
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

    const workspace = await getOrCreateWorkspace(session);

    const person = await prisma.person.findFirst({
      where: { id: personId, workspaceId: workspace.id },
      include: { photos: { orderBy: { createdAt: "asc" } } },
    });
    if (!person) return NextResponse.json({ error: "Personnage introuvable." }, { status: 404 });

    const photos = await Promise.all(
      person.photos.map(async (ph) => ({
        ...ph,
        photoUrl: await getSignedUrl(ph.storagePath).catch(() => ph.photoUrl),
      }))
    );

    return NextResponse.json({ ...person, photos });
  } catch (err) {
    console.error("[persons/[id] GET]", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

// DELETE /api/persons/[personId]
export async function DELETE(
  _req: Request,
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

    await prisma.person.delete({ where: { id: personId } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[persons/[id] DELETE]", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

// PATCH /api/persons/[personId] — update name or description
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ personId: string }> }
) {
  try {
    const { personId } = await params;
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

    const workspace = await getOrCreateWorkspace(session);
    const body = await req.json() as { name?: string; description?: string };

    const person = await prisma.person.findFirst({
      where: { id: personId, workspaceId: workspace.id },
    });
    if (!person) return NextResponse.json({ error: "Personnage introuvable." }, { status: 404 });

    const updated = await prisma.person.update({
      where: { id: personId },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[persons/[id] PATCH]", err);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
