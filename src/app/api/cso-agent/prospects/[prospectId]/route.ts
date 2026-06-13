import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { prospectId } = await params;

  const prospect = await prisma.prospect.findFirst({
    where: { id: prospectId, workspace: { userId: session.user.id } },
    select: {
      id: true,
      name: true,
      company: true,
      jobTitle: true,
      email: true,
      emailVerified: true,
      emailStatus: true,
      linkedInUrl: true,
      phone: true,
      location: true,
      industry: true,
      revenue: true,
      companySize: true,
      platform: true,
      score: true,
      temperature: true,
      status: true,
      source: true,
      aiSummary: true,
      suggestedHook: true,
      notes: true,
      enrichmentData: true,
      createdAt: true,
      updatedAt: true,
      lastInteractionAt: true,
      personaId: true,
      persona: { select: { name: true, raw: true } },
      interactions: {
        select: { id: true, channel: true, type: true, content: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      aiNotes: {
        select: { id: true, content: true, type: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      sequences: {
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true,
          steps: {
            select: {
              id: true,
              stepNumber: true,
              channel: true,
              linkedInAction: true,
              content: true,
              status: true,
              sentAt: true,
              scheduledAt: true,
              metadata: true,
              repliedAt: true,
              openedAt: true,
              error: true,
            },
            orderBy: { stepNumber: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

  return NextResponse.json({ prospect });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { prospectId } = await params;
  const body = (await req.json()) as {
    status?: string;
    notes?: string;
    temperature?: string;
  };

  const VALID_STATUSES = new Set([
    "NEW", "RESEARCHED", "MESSAGES_GENERATED", "CONTACTED",
    "RESPONDED", "MEETING_BOOKED", "CONVERTED", "REJECTED", "LOST",
  ]);

  if (body.status && !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  const prospect = await prisma.prospect.findFirst({
    where: { id: prospectId, workspace: { userId: session.user.id } },
    select: { id: true },
  });
  if (!prospect) return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });

  const updated = await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      ...(body.status ? { status: body.status as "NEW" | "CONTACTED" | "REPLIED" | "CONVERTED" | "REJECTED" | "RESEARCHED" | "MESSAGES_GENERATED" | "RESPONDED" | "MEETING_BOOKED" | "LOST" | "UNSUBSCRIBED" } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.temperature ? { temperature: body.temperature } : {}),
      lastInteractionAt: new Date(),
    },
    select: { id: true, status: true, notes: true, temperature: true },
  });

  return NextResponse.json({ prospect: updated });
}
