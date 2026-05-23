import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateWorkspace } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const prospectId = searchParams.get("prospectId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace non trouvé" }, { status: 404 });
  }

  const where: Record<string, unknown> = { workspaceId };
  if (prospectId) where.prospectId = prospectId;

  const sequences = await prisma.outreachSequence.findMany({
    where,
    select: {
      id: true,
      name: true,
      isActive: true,
      prospectId: true,
      createdAt: true,
      prospect: {
        select: { id: true, name: true, email: true, company: true },
      },
      steps: {
        orderBy: { stepNumber: "asc" },
        select: {
          id: true,
          stepNumber: true,
          channel: true,
          subject: true,
          status: true,
          delayDays: true,
          sentAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ success: true, data: sequences });
}
