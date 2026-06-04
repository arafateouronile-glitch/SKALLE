/**
 * GET  /api/linkedin-automation?workspaceId=xxx
 *   → Retourne la config d'automation LinkedIn (sans liAt)
 *
 * POST /api/linkedin-automation  { workspaceId, liAt?, isActive?, dailyConnectLimit?, dailyMessageLimit? }
 *   → Crée ou met à jour la config
 *
 * POST /api/linkedin-automation?trigger=1  { workspaceId }
 *   → Déclenche un envoi manuel immédiat via Inngest
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

async function getWorkspace(workspaceId: string, userId: string) {
  return prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    select: { id: true },
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });

  const ws = await getWorkspace(workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const config = await prisma.linkedInAutomationConfig.findUnique({
    where: { workspaceId },
    select: {
      id: true,
      isActive: true,
      dailyConnectLimit: true,
      dailyMessageLimit: true,
      sendAt: true,
      connectActor: true,
      messageActor: true,
      lastRunAt: true,
      lastRunStats: true,
      warmupDay: true,
      warmupStartedAt: true,
      proxyCountry: true,
      sendWithoutNote: true,
      // liAt intentionnellement masqué — juste indique si configuré
      liAt: false,
    },
  });

  // Compter les steps en attente
  const pendingCount = await prisma.sequenceStep.count({
    where: {
      status: "PENDING",
      channel: "LINKEDIN",
      sequence: { workspaceId },
    },
  });

  const cookies = await prisma.linkedInAutomationConfig.findUnique({
    where: { workspaceId },
    select: { liAt: true, jsessionId: true },
  });
  const hasSession = !!cookies?.liAt;
  const hasJsessionId = !!cookies?.jsessionId;

  return NextResponse.json({ config, hasSession, hasJsessionId, pendingCount });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = (await req.json()) as {
    workspaceId: string;
    liAt?: string;
    jsessionId?: string;
    isActive?: boolean;
    dailyConnectLimit?: number;
    dailyMessageLimit?: number;
    sendAt?: string;
    proxyCountry?: string;
    sendWithoutNote?: boolean;
  };

  const ws = await getWorkspace(body.workspaceId, session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  // Trigger manuel
  if (req.nextUrl.searchParams.get("trigger") === "1") {
    const config = await prisma.linkedInAutomationConfig.findUnique({
      where: { workspaceId: body.workspaceId },
      select: { isActive: true, liAt: true },
    });
    if (!config?.liAt) return NextResponse.json({ error: "Session LinkedIn non configurée" }, { status: 400 });

    await inngest.send({
      name: "linkedin/outreach.trigger",
      data: { workspaceId: body.workspaceId },
    });
    return NextResponse.json({ ok: true, message: "Envoi déclenché" });
  }

  // Upsert config
  const data: Record<string, unknown> = {};
  if (body.liAt !== undefined) {
    data.liAt = body.liAt;
    // Nouveau cookie → reset warm-up pour repartir de zéro
    data.warmupDay = 0;
    data.warmupStartedAt = null;
    data.isActive = false;
  }
  if (body.jsessionId !== undefined) data.jsessionId = body.jsessionId || null;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.dailyConnectLimit !== undefined) data.dailyConnectLimit = Math.min(body.dailyConnectLimit, 40);
  if (body.dailyMessageLimit !== undefined) data.dailyMessageLimit = Math.min(body.dailyMessageLimit, 100);
  if (body.sendAt !== undefined) data.sendAt = body.sendAt;
  if (body.proxyCountry !== undefined) data.proxyCountry = body.proxyCountry.toUpperCase().slice(0, 2);
  if (body.sendWithoutNote !== undefined) data.sendWithoutNote = body.sendWithoutNote;

  const config = await prisma.linkedInAutomationConfig.upsert({
    where: { workspaceId: body.workspaceId },
    create: { workspaceId: body.workspaceId, liAt: body.liAt ?? "", ...data },
    update: data,
    select: {
      id: true,
      isActive: true,
      dailyConnectLimit: true,
      dailyMessageLimit: true,
      sendAt: true,
      lastRunAt: true,
      lastRunStats: true,
      warmupDay: true,
      warmupStartedAt: true,
      proxyCountry: true,
      sendWithoutNote: true,
    },
  });

  return NextResponse.json({ ok: true, config });
}
