import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function resolveWorkspaceIds(req: NextRequest): Promise<string[]> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const ext = await prisma.extensionToken.findFirst({
      where: { token },
      select: { workspaceId: true },
    });
    return ext ? [ext.workspaceId] : [];
  }
  const session = await auth();
  if (!session?.user?.id) return [];
  const workspaces = await prisma.workspace.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });
  return workspaces.map((w) => w.id);
}

export async function POST(req: NextRequest) {
  const workspaceIds = await resolveWorkspaceIds(req);
  if (!workspaceIds.length) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = (await req.json()) as {
    prospectId: string;
    messageSent: boolean;  // true si le message post-connexion a été envoyé
  };

  const { prospectId, messageSent } = body;
  if (!prospectId) {
    return NextResponse.json({ error: "prospectId requis" }, { status: 400 });
  }

  const prospect = await prisma.prospect.findFirst({
    where: { id: prospectId, workspaceId: { in: workspaceIds } },
    select: { id: true, enrichmentData: true },
  });

  if (!prospect) {
    return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
  }

  const ed = (prospect.enrichmentData ?? {}) as Record<string, unknown>;
  const now = new Date();

  // Mettre à jour le statut → CONTACTED
  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      status: "CONTACTED",
      lastInteractionAt: now,
      enrichmentData: {
        ...ed,
        acceptedAt: now.toISOString(),
        messageSent,
        // Garder pendingMessage pour référence
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    },
  });

  return NextResponse.json({ ok: true });
}
