/**
 * POST /api/sequences/[id]/start
 * Lance une séquence en envoyant l'event Inngest "sequence/start".
 * Crée les steps manquants si la séquence n'en a pas encore.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { id: sequenceId } = await params;

  // Find workspace first for ownership check
  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const sequence = await prisma.outreachSequence.findFirst({
    where: { id: sequenceId, workspaceId: workspace.id },
    select: { id: true, isActive: true, prospectId: true, name: true },
  });
  if (!sequence) return NextResponse.json({ error: "Séquence introuvable" }, { status: 404 });

  const [steps, prospect] = await Promise.all([
    prisma.sequenceStep.findMany({
      where: { sequenceId },
      select: { id: true, status: true },
    }),
    prisma.prospect.findUnique({
      where: { id: sequence.prospectId },
      select: { name: true, email: true },
    }),
  ]);

  if (!prospect?.email) {
    return NextResponse.json({ error: "Prospect sans email — enrichissez d'abord le prospect" }, { status: 422 });
  }
  if (sequence.isActive && steps.some((s) => s.status === "PENDING")) {
    return NextResponse.json({ error: "Séquence déjà en cours" }, { status: 409 });
  }

  // Reset failed steps to PENDING
  const failedIds = steps.filter((s) => s.status === "FAILED").map((s) => s.id);
  if (failedIds.length > 0) {
    await prisma.sequenceStep.updateMany({
      where: { id: { in: failedIds } },
      data: { status: "PENDING", error: null },
    });
  }

  await inngest.send({ name: "sequence/start", data: { sequenceId } });

  return NextResponse.json({
    ok: true,
    sequenceId,
    prospectName: prospect.name,
    steps: steps.length,
  });
}
