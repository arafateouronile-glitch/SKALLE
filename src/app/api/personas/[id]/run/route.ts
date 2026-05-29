import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await params;
  const persona = await prisma.persona.findFirst({
    where: { id, workspace: { userId: session.user.id } },
    select: { id: true, workspaceId: true, status: true },
  });
  if (!persona) return NextResponse.json({ error: "Persona introuvable" }, { status: 404 });
  if (persona.status === "RUNNING") {
    return NextResponse.json({ error: "Pipeline déjà en cours" }, { status: 409 });
  }

  await prisma.persona.update({ where: { id }, data: { status: "RUNNING" } });

  await inngest.send({
    name: "persona/run",
    data: { personaId: id, workspaceId: persona.workspaceId, userId: session.user.id },
  });

  return NextResponse.json({ ok: true, status: "RUNNING" });
}
