"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCsoROIDashboard, type CsoROIReport } from "@/lib/services/analytics/cso-roi-tracking";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const ws = await prisma.workspace.findFirst({ where: { id: workspaceId, userId } });
  if (!ws) throw new Error("Workspace non trouvé");
  return ws;
}

export async function getCsoRoiAction(
  workspaceId: string
): Promise<{ success: boolean; data?: CsoROIReport; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);
    const data = await getCsoROIDashboard(workspaceId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Erreur" };
  }
}
