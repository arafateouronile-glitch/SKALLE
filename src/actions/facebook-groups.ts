"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
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

/**
 * Liste les groupes Facebook importés du workspace
 */
export async function listFacebookGroupsAction(workspaceId: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const groups = await prisma.facebookGroup.findMany({
      where: { workspaceId },
      orderBy: { lastSyncedAt: "desc" },
      include: {
        _count: { select: { members: true } },
      },
    });

    return {
      success: true as const,
      data: groups.map((g) => ({
        id: g.id,
        facebookId: g.facebookId,
        name: g.name,
        url: g.url,
        memberCount: g._count.members,
        lastSyncedAt: g.lastSyncedAt?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
      })),
      error: null,
    };
  } catch (error) {
    console.error("listFacebookGroupsAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
      data: null,
    };
  }
}

/**
 * Récupère les membres d'un groupe
 */
export async function getGroupMembersAction(
  workspaceId: string,
  groupId: string,
  options?: { limit?: number; offset?: number; status?: string }
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const where = {
      workspaceId,
      facebookGroupId: groupId,
      type: "GROUP_MEMBER" as const,
      ...(options?.status && options.status !== "ALL"
        ? { status: options.status }
        : {}),
    };

    const [members, total] = await Promise.all([
      prisma.socialInteraction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
      }),
      prisma.socialInteraction.count({ where }),
    ]);

    return {
      success: true as const,
      data: { members, total },
      error: null,
    };
  } catch (error) {
    console.error("getGroupMembersAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
      data: null,
    };
  }
}

/**
 * Génère un token d'extension pour l'import de membres
 */
export async function generateExtensionTokenAction(workspaceId: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const token = `skl_ext_${randomBytes(24).toString("hex")}`;

    await prisma.extensionToken.create({
      data: {
        token,
        workspaceId,
        name: "Extension Chrome Groupes Facebook",
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

/**
 * Liste les tokens d'extension du workspace
 */
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

/**
 * Supprime un groupe et ses membres
 */
export async function deleteFacebookGroupAction(
  workspaceId: string,
  groupId: string
) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await prisma.facebookGroup.delete({
      where: {
        id: groupId,
        workspaceId,
      },
    });

    return { success: true as const, error: null };
  } catch (error) {
    console.error("deleteFacebookGroupAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Déclenche le traitement batch des DM froids pour les membres de groupes
 */
export async function triggerColdDMBatchAction(workspaceId: string) {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    await inngest.send({
      name: "facebook-groups/process-cold-dms",
      data: { workspaceId },
    });

    return {
      success: true as const,
      error: null,
    };
  } catch (error) {
    console.error("triggerColdDMBatchAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}
