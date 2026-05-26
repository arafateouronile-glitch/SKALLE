import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id } = await params;
  const { feedback } = await req.json() as { feedback?: string };

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const updated = await prisma.cMOProposal.updateMany({
    where: { id, workspaceId: workspace.id, status: "PENDING" },
    data: { status: "REJECTED", userFeedback: feedback ?? null },
  });

  if (updated.count === 0) return NextResponse.json({ error: "Introuvable ou déjà traité" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
