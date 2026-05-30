import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processPendingBranches } from "@/lib/services/smart-sequence-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function resolveWorkspaceId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const ext = await prisma.extensionToken.findFirst({
      where: { token },
      select: { workspaceId: true },
    });
    return ext?.workspaceId ?? null;
  }
  const session = await auth();
  if (!session?.user?.id) return null;
  const ws = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return ws?.id ?? null;
}

// Déclenché toutes les 24h par l'alarm de l'extension (ou manuellement)
export async function GET(req: NextRequest) {
  const workspaceId = await resolveWorkspaceId(req);
  if (!workspaceId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const result = await processPendingBranches(workspaceId);
  return NextResponse.json({ ok: true, ...result });
}
