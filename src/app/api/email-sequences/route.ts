/**
 * POST /api/email-sequences
 * Crée en bulk des OutreachSequence + SequenceStep EMAIL pour une liste de prospects.
 *
 * Body: {
 *   workspaceId: string
 *   prospectIds: string[]
 *   subject: string
 *   content: string              // corps email (texte ou HTML)
 *   followUpSubject?: string
 *   followUpContent?: string
 *   followUpDelayDays?: number   // défaut 3
 * }
 *
 * GET /api/email-sequences?workspaceId=xxx
 * Retourne pendingCount + inQueueProspectIds
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function interpolate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{prénom\}\}/gi, vars.firstName ?? "")
    .replace(/\{\{prenom\}\}/gi, vars.firstName ?? "")
    .replace(/\{\{nom\}\}/gi, vars.lastName ?? "")
    .replace(/\{\{entreprise\}\}/gi, vars.company ?? "")
    .replace(/\{\{poste\}\}/gi, vars.jobTitle ?? "")
    .replace(/\{\{name\}\}/gi, vars.name ?? "")
    .trim();
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] ?? fullName, lastName: parts.slice(1).join(" ") };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const inQueue = await prisma.sequenceStep.findMany({
    where: { status: "PENDING", channel: "EMAIL", sequence: { workspaceId } },
    select: { sequence: { select: { prospectId: true } } },
    distinct: ["sequenceId"],
  });

  const inQueueProspectIds = [...new Set(inQueue.map((s) => s.sequence.prospectId))];
  return NextResponse.json({ pendingCount: inQueueProspectIds.length, inQueueProspectIds });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    workspaceId: string;
    prospectIds: string[];
    subject: string;
    content: string;
    followUpSubject?: string;
    followUpContent?: string;
    followUpDelayDays?: number;
  };

  const {
    workspaceId, prospectIds, subject, content,
    followUpSubject, followUpContent, followUpDelayDays = 3,
  } = body;

  if (!workspaceId || !prospectIds?.length || !subject?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "workspaceId, prospectIds, subject et content requis" }, { status: 400 });
  }

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const prospects = await prisma.prospect.findMany({
    where: { id: { in: prospectIds }, workspaceId },
    select: { id: true, name: true, company: true, jobTitle: true, email: true, emailStatus: true },
  });

  // Prospects déjà en queue EMAIL → skip
  const inQueue = await prisma.sequenceStep.findMany({
    where: { status: "PENDING", channel: "EMAIL", sequence: { workspaceId } },
    select: { sequence: { select: { prospectId: true } } },
  });
  const alreadyQueued = new Set(inQueue.map((s) => s.sequence.prospectId));

  const followUpScheduledAt = followUpContent
    ? new Date(Date.now() + followUpDelayDays * 24 * 60 * 60 * 1_000)
    : null;

  let created = 0;
  let skipped = 0;

  for (const prospect of prospects) {
    if (alreadyQueued.has(prospect.id)) { skipped++; continue; }
    if (!prospect.email) { skipped++; continue; }
    if (prospect.emailStatus === "unsubscribed" || prospect.emailStatus === "bounced") { skipped++; continue; }

    const { firstName, lastName } = splitName(prospect.name);
    const vars = {
      name: prospect.name, firstName, lastName,
      company: prospect.company ?? "",
      jobTitle: prospect.jobTitle ?? "",
    };

    await prisma.$transaction(async (tx) => {
      const sequence = await tx.outreachSequence.create({
        data: {
          prospectId: prospect.id,
          workspaceId,
          name: `Email — ${prospect.name}`,
          isActive: true,
        },
      });

      await tx.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: 1,
          channel: "EMAIL",
          subject: interpolate(subject, vars),
          content: interpolate(content, vars),
          status: "PENDING",
          scheduledAt: null,
        },
      });

      if (followUpContent && followUpScheduledAt) {
        await tx.sequenceStep.create({
          data: {
            sequenceId: sequence.id,
            stepNumber: 2,
            channel: "EMAIL",
            subject: interpolate(followUpSubject ?? `Re: ${subject}`, vars),
            content: interpolate(followUpContent, vars),
            status: "PENDING",
            scheduledAt: followUpScheduledAt,
          },
        });
      }
    });

    created++;
  }

  return NextResponse.json({ ok: true, created, skipped });
}
