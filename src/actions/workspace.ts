"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { BrandType } from "@prisma/client";

export async function updateWorkspaceBrandType(
  workspaceId: string,
  brandType: BrandType
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Non autorisé" };

    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });
    if (!ws) return { success: false, error: "Workspace non trouvé" };

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { brandType },
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erreur" };
  }
}

export async function getWorkspaceBrandType(
  workspaceId: string
): Promise<BrandType | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { brandType: true },
  });
  return ws?.brandType ?? null;
}
