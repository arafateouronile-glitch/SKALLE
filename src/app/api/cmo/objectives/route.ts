import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth().catch(() => null);
    if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const workspace = await prisma.workspace.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!workspace) return NextResponse.json({ objectives: [] });

    const objectives = await prisma.cMOObjective.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { proposals: true } } },
    });

    return NextResponse.json({ objectives });
  } catch (e) {
    console.error("[GET /api/cmo/objectives]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const body = await req.json() as {
    type: string;
    period: string;
    title: string;
    description?: string;
    target: { metric: string; value: number; unit: string };
    endDate?: string;
  };

  if (!body.type || !body.period || !body.title || !body.target) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const objective = await prisma.cMOObjective.create({
    data: {
      workspaceId: workspace.id,
      type: body.type,
      period: body.period,
      title: body.title,
      description: body.description,
      target: body.target as object,
      endDate: body.endDate ? new Date(body.endDate) : null,
    },
  });

  return NextResponse.json({ objective }, { status: 201 });
}
