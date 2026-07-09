import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, brandVoice: true },
  });

  return NextResponse.json({
    workspaceId: workspace?.id ?? null,
    workspaceName: workspace?.name ?? "",
    brandVoice: (workspace?.brandVoice ?? {}) as Record<string, unknown>,
  });
}

// Save manual edits (tone, individual text fields)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = (await req.json()) as {
    workspaceId: string;
    patch: Record<string, unknown>;
  };

  if (!body.workspaceId || !body.patch) {
    return NextResponse.json({ error: "workspaceId et patch requis" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: body.workspaceId, userId: session.user.id },
    select: { id: true, brandVoice: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });
  }

  const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { brandVoice: { ...bv, ...body.patch } as any },
  });

  return NextResponse.json({ ok: true });
}
