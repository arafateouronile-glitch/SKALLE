import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function resolveUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const ext = await prisma.extensionToken.findFirst({
      where: { token },
      select: { workspaceId: true },
    });
    if (ext) {
      const ws = await prisma.workspace.findUnique({
        where: { id: ext.workspaceId },
        select: { userId: true },
      });
      return ws?.userId ?? null;
    }
  }
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspaces = await prisma.workspace.findMany({
    where: { userId },
    select: { id: true },
  });
  const workspaceIds = workspaces.map((w) => w.id);
  if (!workspaceIds.length) return NextResponse.json({ decisions: [] });

  // Retourne les décisions APPROVED de type LinkedIn non encore exécutées
  const decisions = await prisma.agentDecision.findMany({
    where: {
      workspaceId: { in: workspaceIds },
      status: "APPROVED",
      actionType: { in: ["CSO_LAUNCH_LINKEDIN", "CSO_FOLLOWUP"] },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: 20,
    select: {
      id: true,
      actionType: true,
      actionData: true,
      priority: true,
      reasoning: true,
    },
  });

  return NextResponse.json({ decisions });
}
