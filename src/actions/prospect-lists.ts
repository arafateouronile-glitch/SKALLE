"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non autorisé");
  }
  return session;
}

export async function createProspectList(
  workspaceId: string,
  name: string
): Promise<{ success: boolean; data?: { id: string; name: string }; error?: string }> {
  try {
    const session = await requireAuth();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user!.id! },
    });

    if (!workspace) {
      return { success: false, error: "Workspace non trouvé" };
    }

    const list = await prisma.prospectList.create({
      data: { name, workspaceId },
    });

    return { success: true, data: { id: list.id, name: list.name } };
  } catch (error) {
    console.error("Create prospect list error:", error);
    return { success: false, error: String(error) };
  }
}

export async function getProspectLists(
  workspaceId: string
): Promise<{
  success: boolean;
  data?: Array<{ id: string; name: string; createdAt: Date; _count: { prospects: number } }>;
  error?: string;
}> {
  try {
    const session = await requireAuth();

    const lists = await prisma.prospectList.findMany({
      where: {
        workspaceId,
        workspace: { userId: session.user!.id! },
      },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { prospects: true } },
      },
    });

    return { success: true, data: lists };
  } catch (error) {
    console.error("Get prospect lists error:", error);
    return { success: false, error: String(error) };
  }
}

export async function deleteProspectList(
  listId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAuth();

    const list = await prisma.prospectList.findFirst({
      where: { id: listId, workspace: { userId: session.user!.id! } },
    });

    if (!list) {
      return { success: false, error: "Liste non trouvée" };
    }

    await prisma.prospectList.delete({ where: { id: listId } });

    return { success: true };
  } catch (error) {
    console.error("Delete prospect list error:", error);
    return { success: false, error: String(error) };
  }
}
