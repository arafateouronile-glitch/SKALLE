"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { BrandType } from "@prisma/client";

export async function updateSignature(
  workspaceId: string,
  signature: string
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
      data: { signature: signature.trim() || null },
    });

    return { success: true };
  } catch {
    return { success: false, error: "Erreur lors de la mise à jour" };
  }
}

export async function updateProfile(
  workspaceId: string,
  { userName, workspaceName }: { userName: string; workspaceName: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { success: false, error: "Non autorisé" };

    const ws = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
    });
    if (!ws) return { success: false, error: "Workspace non trouvé" };

    await Promise.all([
      prisma.user.update({
        where: { id: session.user.id },
        data: { name: userName.trim() || null },
      }),
      prisma.workspace.update({
        where: { id: workspaceId },
        data: { name: workspaceName.trim() },
      }),
    ]);

    return { success: true };
  } catch {
    return { success: false, error: "Erreur lors de la mise à jour" };
  }
}

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
