/**
 * POST /api/linkedin-sequences
 * Crée en bulk des OutreachSequence + SequenceSteps LinkedIn pour une liste de prospects.
 *
 * Body: {
 *   workspaceId: string
 *   prospectIds: string[]
 *   connectNote: string          // note de connexion (max 300 car)
 *   followUpMessage?: string     // message de suivi (optionnel)
 *   followUpDelayDays?: number   // délai avant le suivi (défaut: 2)
 * }
 *
 * GET /api/linkedin-sequences?workspaceId=xxx
 * Retourne le nombre de steps PENDING et les prospects déjà en queue.
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
  return {
    firstName: parts[0] ?? fullName,
    lastName: parts.slice(1).join(" ") ?? "",
  };
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

  // Prospects qui ont déjà un step PENDING LinkedIn
  const inQueue = await prisma.sequenceStep.findMany({
    where: {
      status: "PENDING",
      channel: "LINKEDIN",
      sequence: { workspaceId },
    },
    select: { sequence: { select: { prospectId: true } } },
    distinct: ["sequenceId"],
  });

  const inQueueProspectIds = new Set(inQueue.map((s) => s.sequence.prospectId));
  const pendingCount = inQueueProspectIds.size;

  return NextResponse.json({ pendingCount, inQueueProspectIds: [...inQueueProspectIds] });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    workspaceId: string;
    prospectIds: string[];
    connectNote: string;
    followUpMessage?: string;
    followUpDelayDays?: number;
  };

  const { workspaceId, prospectIds, connectNote, followUpMessage, followUpDelayDays = 2 } = body;

  if (!workspaceId || !prospectIds?.length || !connectNote?.trim()) {
    return NextResponse.json({ error: "workspaceId, prospectIds et connectNote requis" }, { status: 400 });
  }

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  // Charge les prospects demandés
  const prospects = await prisma.prospect.findMany({
    where: { id: { in: prospectIds }, workspaceId },
    select: { id: true, name: true, company: true, jobTitle: true, linkedInUrl: true },
  });

  // Prospects déjà en queue (ont un step PENDING LinkedIn) → skip
  const inQueue = await prisma.sequenceStep.findMany({
    where: {
      status: "PENDING",
      channel: "LINKEDIN",
      sequence: { workspaceId },
    },
    select: { sequence: { select: { prospectId: true } } },
  });
  const alreadyQueued = new Set(inQueue.map((s) => s.sequence.prospectId));

  let created = 0;
  let skipped = 0;

  const followUpScheduledAt = followUpMessage
    ? new Date(Date.now() + followUpDelayDays * 24 * 60 * 60 * 1_000)
    : null;

  for (const prospect of prospects) {
    if (alreadyQueued.has(prospect.id)) {
      skipped++;
      continue;
    }
    if (!prospect.linkedInUrl) {
      skipped++;
      continue;
    }

    const { firstName, lastName } = splitName(prospect.name);
    const vars = {
      name: prospect.name,
      firstName,
      lastName,
      company: prospect.company ?? "",
      jobTitle: prospect.jobTitle ?? "",
    };

    const note = interpolate(connectNote, vars).slice(0, 300);
    const followUp = followUpMessage ? interpolate(followUpMessage, vars) : null;

    // Crée la séquence + les steps dans une transaction
    await prisma.$transaction(async (tx) => {
      const sequence = await tx.outreachSequence.create({
        data: {
          prospectId: prospect.id,
          workspaceId,
          name: `LinkedIn — ${prospect.name}`,
          isActive: true,
        },
      });

      // Step 1 : demande de connexion (immédiate)
      await tx.sequenceStep.create({
        data: {
          sequenceId: sequence.id,
          stepNumber: 1,
          channel: "LINKEDIN",
          linkedInAction: "connect",
          content: note,
          status: "PENDING",
          scheduledAt: null,
        },
      });

      // Step 2 : message de suivi (planifié à J+followUpDelayDays)
      if (followUp && followUpScheduledAt) {
        await tx.sequenceStep.create({
          data: {
            sequenceId: sequence.id,
            stepNumber: 2,
            channel: "LINKEDIN",
            linkedInAction: "message",
            content: followUp,
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
