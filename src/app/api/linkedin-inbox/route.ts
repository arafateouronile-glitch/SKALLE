/**
 * GET  /api/linkedin-inbox?workspaceId=xxx&unreadOnly=true
 *   → Retourne les réponses LinkedIn détectées
 *
 * PATCH /api/linkedin-inbox  { replyId }
 *   → Marque une réponse comme lue
 *
 * POST /api/linkedin-inbox  { workspaceId }
 *   → Déclenche une vérification manuelle via Inngest
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

async function getWorkspaceId(userId: string): Promise<string | null> {
  const ws = await prisma.workspace.findFirst({
    where: { userId },
    select: { id: true },
  });
  return ws?.id ?? null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspaceId =
    req.nextUrl.searchParams.get("workspaceId") ?? (await getWorkspaceId(session.user.id));
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 400 });

  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";

  const replies = await prisma.linkedInReply.findMany({
    where: {
      workspaceId,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    include: {
      prospect: {
        select: {
          id: true,
          name: true,
          company: true,
          jobTitle: true,
          linkedInUrl: true,
          status: true,
        },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(replies);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { replyId } = (await req.json()) as { replyId: string };
  if (!replyId) return NextResponse.json({ error: "replyId requis" }, { status: 400 });

  await prisma.linkedInReply.update({
    where: { id: replyId },
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { workspaceId } = (await req.json()) as { workspaceId: string };
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!ws) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  await inngest.send({ name: "linkedin/replies.check", data: { workspaceId } });
  return NextResponse.json({ ok: true, message: "Vérification lancée" });
}
