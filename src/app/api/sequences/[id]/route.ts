/**
 * PATCH /api/sequences/[id]   — pause / resume
 * DELETE /api/sequences/[id]  — supprimer
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id: sequenceId } = await params;
  const body = (await req.json()) as { isActive: boolean };

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const sequence = await prisma.outreachSequence.findFirst({
    where: { id: sequenceId, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!sequence) return NextResponse.json({ error: "Séquence introuvable" }, { status: 404 });

  await prisma.outreachSequence.update({
    where: { id: sequenceId },
    data: { isActive: body.isActive },
  });

  return NextResponse.json({ ok: true, isActive: body.isActive });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id: sequenceId } = await params;

  const ws = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const sequence = await prisma.outreachSequence.findFirst({
    where: { id: sequenceId, workspaceId: ws.id },
    select: { id: true },
  });
  if (!sequence) return NextResponse.json({ error: "Séquence introuvable" }, { status: 404 });

  await prisma.outreachSequence.delete({ where: { id: sequenceId } });
  return NextResponse.json({ ok: true });
}
