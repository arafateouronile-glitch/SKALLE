import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = (await req.json()) as {
    workspaceId: string;
    productFeatures: string[];
  };

  const { workspaceId, productFeatures } = body;
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true, brandVoice: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });
  }

  const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      brandVoice: {
        ...bv,
        productFeatures: (productFeatures ?? []).filter(
          (f) => typeof f === "string" && f.trim().length > 0
        ),
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    },
  });

  return NextResponse.json({ ok: true });
}
