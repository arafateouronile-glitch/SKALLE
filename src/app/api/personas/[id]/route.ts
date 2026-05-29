import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getPersonaForUser(id: string, userId: string) {
  return prisma.persona.findFirst({
    where: { id, workspace: { userId } },
    select: { id: true, workspaceId: true },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const persona = await getPersonaForUser(id, session.user.id);
  if (!persona) return NextResponse.json({ error: "Persona introuvable" }, { status: 404 });

  const body = await req.json() as { name?: string; raw?: unknown; status?: string };

  const updated = await prisma.persona.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.raw ? { raw: body.raw as object } : {}),
      ...(body.status ? { status: body.status as "DRAFT" | "ACTIVE" | "PAUSED" } : {}),
    },
  });

  return NextResponse.json({ persona: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const persona = await getPersonaForUser(id, session.user.id);
  if (!persona) return NextResponse.json({ error: "Persona introuvable" }, { status: 404 });

  await prisma.persona.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
