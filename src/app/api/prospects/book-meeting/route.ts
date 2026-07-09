/**
 * POST /api/prospects/book-meeting
 * Body: { prospectId, meetingDate?: string (ISO), value?: number }
 *
 * Marque un prospect comme MEETING_BOOKED, enregistre meetingBookedAt,
 * et crée une ProspectInteraction pour l'historique.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getWorkspaceId(userId: string): Promise<string | null> {
  const ws = await prisma.workspace.findFirst({ where: { userId }, select: { id: true } });
  return ws?.id ?? null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const body = await req.json() as {
    prospectId: string;
    meetingDate?: string;
    value?: number;
    note?: string;
  };

  if (!body.prospectId) {
    return NextResponse.json({ error: "prospectId requis" }, { status: 400 });
  }

  const prospect = await prisma.prospect.findFirst({
    where: { id: body.prospectId, workspaceId },
    select: { id: true, status: true },
  });
  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

  const meetingAt = body.meetingDate ? new Date(body.meetingDate) : new Date();

  await prisma.$transaction([
    prisma.prospect.update({
      where: { id: body.prospectId },
      data: {
        status: "MEETING_BOOKED",
        meetingBookedAt: meetingAt,
        lastInteractionAt: new Date(),
        ...(body.value !== undefined ? { value: body.value } : {}),
      },
    }),
    prisma.prospectInteraction.create({
      data: {
        prospectId: body.prospectId,
        channel: "MEETING",
        type: "MEETING_BOOKED",
        content: body.note ?? "Meeting booké",
        metadata: { meetingDate: meetingAt.toISOString(), value: body.value ?? null },
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
