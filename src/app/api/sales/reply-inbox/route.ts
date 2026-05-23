/**
 * GET /api/sales/reply-inbox
 * Retourne les dernières réponses détectées (ReplyDetection) pour le workspace,
 * enrichies avec le prospect et le message envoyé.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const replies = await prisma.replyDetection.findMany({
    where: {
      sequenceStep: {
        sequence: { workspaceId: workspace.id },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 50,
    include: {
      sequenceStep: {
        include: {
          sequence: {
            include: {
                      prospect: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  company: true,
                  linkedInUrl: true,
                  platform: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const inbox = replies.map((r) => {
    const prospect = r.sequenceStep?.sequence?.prospect;
    const sentBody = (r.sequenceStep as { body?: string })?.body ?? null;

    return {
      id: r.id,
      receivedAt: r.receivedAt,
      fromEmail: r.fromEmail,
      subject: r.subject,
      snippet: r.snippet,
      sentMessage: sentBody ?? null,
      prospect: prospect
        ? {
            id: prospect.id,
            name: prospect.name || prospect.email || "Prospect",
            email: prospect.email,
            company: prospect.company,
            linkedInUrl: prospect.linkedInUrl,
            platform: prospect.platform,
          }
        : null,
    };
  });

  return NextResponse.json(inbox);
}
