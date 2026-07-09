import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/workspace";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ avatarId: string }> }
) {
  try {
    const session = (await auth()) as Session | null;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }

    const workspace = await getOrCreateWorkspace(session);
    const { avatarId } = await params;

    const asset = await prisma.avatarAsset.findFirst({
      where: { id: avatarId, workspaceId: workspace.id },
    });

    if (!asset) {
      return NextResponse.json({ error: "Avatar introuvable." }, { status: 404 });
    }

    await prisma.avatarAsset.delete({ where: { id: asset.id } });

    return NextResponse.json({ deleted: true });
  } catch (e) {
    console.error("[video-ads/avatars DELETE]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
