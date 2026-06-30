"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  });
  if (!workspace) throw new Error("Workspace non trouvé");
  return workspace;
}

export async function generateExtensionTokenAction(workspaceId: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const token = `skl_ext_${randomBytes(24).toString("hex")}`;

    await prisma.extensionToken.create({
      data: {
        token,
        workspaceId,
        name: "Extension Chrome SKALLE",
      },
    });

    return {
      success: true as const,
      data: { token },
      error: null,
    };
  } catch (error) {
    console.error("generateExtensionTokenAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
      data: null,
    };
  }
}

export async function listExtensionTokensAction(workspaceId: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const tokens = await prisma.extensionToken.findMany({
      where: { workspaceId },
      select: { id: true, name: true, createdAt: true },
    });

    return {
      success: true as const,
      data: tokens,
      error: null,
    };
  } catch (error) {
    console.error("listExtensionTokensAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
      data: null,
    };
  }
}
