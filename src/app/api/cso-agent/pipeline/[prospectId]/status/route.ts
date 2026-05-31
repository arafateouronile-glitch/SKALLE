import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PIPELINE_COLUMNS } from "../../route";

const VALID_STATUSES = new Set([
  "NEW", "RESEARCHED", "MESSAGES_GENERATED", "CONTACTED",
  "RESPONDED", "MEETING_BOOKED", "CONVERTED", "REJECTED", "LOST",
]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { prospectId } = await params;
  const body = (await req.json()) as { status: string };
  const { status } = body;

  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  // Verify ownership
  const prospect = await prisma.prospect.findFirst({
    where: { id: prospectId, workspace: { userId: session.user.id } },
    select: { id: true, status: true },
  });
  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

  const updated = await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      status: status as "NEW" | "CONTACTED" | "REPLIED" | "CONVERTED" | "REJECTED" | "RESEARCHED" | "MESSAGES_GENERATED" | "RESPONDED" | "MEETING_BOOKED" | "LOST" | "UNSUBSCRIBED",
      lastInteractionAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      lastInteractionAt: true,
    },
  });

  // If moved to a pipeline column, log the interaction
  if (PIPELINE_COLUMNS.includes(status as (typeof PIPELINE_COLUMNS)[number])) {
    await prisma.prospectInteraction.create({
      data: {
        prospectId,
        channel: "INTERNAL",
        type: "STATUS_CHANGE",
        content: `Statut changé vers ${status} (pipeline Kanban)`,
      },
    }).catch(() => null); // non-blocking
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
