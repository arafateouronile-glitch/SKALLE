import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const personas = await prisma.persona.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ personas });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json() as { workspaceId?: string; name?: string; raw?: unknown };
  const { workspaceId, name, raw } = body;

  if (!workspaceId || !name || !raw) {
    return NextResponse.json({ error: "workspaceId, name et raw requis" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const persona = await prisma.persona.create({
    data: { workspaceId, name, raw: raw as object },
  });

  await inngest.send({
    name: "persona/run",
    data: { personaId: persona.id, workspaceId, userId: session.user.id },
  });

  return NextResponse.json({ persona }, { status: 201 });
}
